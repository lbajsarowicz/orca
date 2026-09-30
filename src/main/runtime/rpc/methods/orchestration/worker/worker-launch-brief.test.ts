import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LaunchFile } from '../../../../../../shared/launch-prompt-file'
import { hashDispatchCapability } from '../../../../orchestration/db/dispatch-capability-hash'
import { createOrchestrationWorkerReleaseHarness } from './worker-release.test-support'

function capabilityIn(content: string): string {
  const capability = /dcap_[A-Za-z0-9_-]{43}/.exec(content)?.[0]
  if (!capability) {
    throw new Error('the brief carries no dispatch capability')
  }
  return capability
}

describe('worker-start with the brief on the launch command line', () => {
  const h = createOrchestrationWorkerReleaseHarness()

  afterEach(() => h.cleanup())

  it('puts the brief in a sensitive launch file on the spawn and pastes nothing', async () => {
    h.setup()
    const { dispatchId } = await h.startWorker({ agent: 'codex' })

    expect(h.runtime.createTerminal).toHaveBeenCalledWith(
      'id:repo::worktree',
      expect.objectContaining({
        startupAgent: 'codex',
        preAllocatedHandle: 'term_worker',
        startupPrompt: expect.stringMatching(/^The full task is in the file "orca-launch-file-/),
        launchFile: expect.objectContaining({ sensitive: true })
      })
    )
    const launchFile = vi.mocked(h.runtime.createTerminal).mock.calls[0][1]?.launchFile
    expect(launchFile?.content).toContain('release fixture task')
    expect(launchFile?.content).toContain(dispatchId)
    // Why: the capability rides only in the file, never on a command line or in history.
    expect(vi.mocked(h.runtime.createTerminal).mock.calls[0][1]?.startupPrompt).not.toContain(
      'dcap_'
    )
    expect(h.runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
    expect(h.runtime.waitForTerminal).toHaveBeenCalledWith(
      'term_worker',
      expect.objectContaining({ condition: 'tui-idle', signal: expect.any(AbortSignal) })
    )
  })

  it('binds exactly the capability the brief carries, and only after the spawn', async () => {
    h.setup()
    let boundAtSpawn: unknown = 'unset'
    let launchFile: LaunchFile | undefined
    vi.mocked(h.runtime.createTerminal).mockImplementation(async (_selector, options) => {
      launchFile = options?.launchFile
      boundAtSpawn = h.db.db
        .prepare('SELECT id FROM dispatch_contexts WHERE capability_hash = ?')
        .get(hashDispatchCapability(capabilityIn(launchFile?.content ?? '')))
      return { handle: 'term_worker', worktreeId: 'repo::worktree', title: 'worker' }
    })

    const { dispatchId } = await h.startWorker({ agent: 'codex' })

    expect(boundAtSpawn).toBeUndefined()
    expect(
      h.db.db
        .prepare('SELECT id FROM dispatch_contexts WHERE capability_hash = ?')
        .get(hashDispatchCapability(capabilityIn(launchFile?.content ?? '')))
    ).toEqual({ id: dispatchId })
  })

  it('reads a turn the launch observation did not see as unknown, not ready', async () => {
    h.setup()
    vi.mocked(h.runtime.observeTerminalLaunchTurnStart).mockResolvedValue('unobserved')
    const task = h.db.createTask({ spec: 'unobserved launch', runId: h.activeRunId })

    const receipt = await h.call('orchestration.workerStart', {
      task: task.id,
      from: 'term_coord',
      agent: 'codex'
    })
    expect(receipt).toMatchObject({ state: 'outcome_unknown', turnStart: 'unobserved' })
    // Why: the brief rode the command line; there is no composer to hold it, nor a 30 s paste window.
    expect(receipt).toMatchObject({
      lastError: expect.stringContaining("rode codex's launch command line")
    })
    expect(receipt).not.toMatchObject({ lastError: expect.stringMatching(/composer|up to 30s/) })
  })

  describe('an agent with no prompt hook', () => {
    const blockedWait = {
      handle: 'term_worker',
      condition: 'tui-idle' as const,
      satisfied: false,
      status: 'running' as const,
      exitCode: null,
      blockedReason: 'agent-trust-workspace' as const
    }

    function startGemini(spec: string) {
      vi.mocked(h.runtime.observeTerminalLaunchTurnStart).mockResolvedValue('unsupported')
      const task = h.db.createTask({ spec, runId: h.activeRunId })
      return h.call('orchestration.workerStart', {
        task: task.id,
        from: 'term_coord',
        agent: 'gemini'
      })
    }

    it('is ready only once its launch readiness wait says so', async () => {
      h.setup()
      await expect(startGemini('ready gemini')).resolves.toMatchObject({
        state: 'ready',
        turnStart: 'unsupported'
      })
      expect(h.runtime.waitForTerminal).toHaveBeenCalledWith(
        'term_worker',
        expect.objectContaining({ condition: 'tui-idle', launchReadiness: true })
      )
    })

    it('is not ready while a trust dialog holds it', async () => {
      h.setup()
      vi.mocked(h.runtime.waitForTerminal).mockResolvedValue(blockedWait)
      await expect(startGemini('trust-blocked gemini')).resolves.toMatchObject({
        state: 'outcome_unknown',
        stage: 'turn_start_blocked',
        lastError: expect.stringContaining('Agent startup blocked: agent-trust-workspace')
      })
    })

    it('stays unknown when it never shows readiness', async () => {
      h.setup()
      vi.mocked(h.runtime.waitForTerminal).mockRejectedValue(new Error('timeout'))
      await expect(startGemini('silent gemini')).resolves.toMatchObject({
        state: 'outcome_unknown',
        turnStart: 'unobserved',
        lastError: expect.stringContaining('reports no turn start')
      })
    })
  })

  it('still reports a dialog that paints after the agent first looked ready', async () => {
    h.setup()
    vi.mocked(h.runtime.observeTerminalLaunchTurnStart).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('unobserved'), 1_500))
    )
    vi.mocked(h.runtime.waitForTerminal)
      .mockResolvedValueOnce({
        handle: 'term_worker',
        condition: 'tui-idle',
        satisfied: true,
        status: 'running',
        exitCode: null
      })
      .mockResolvedValue({
        handle: 'term_worker',
        condition: 'tui-idle',
        satisfied: false,
        status: 'running',
        exitCode: null,
        blockedReason: 'codex-update-prompt'
      })
    const task = h.db.createTask({ spec: 'late dialog', runId: h.activeRunId })

    await expect(
      h.call('orchestration.workerStart', { task: task.id, from: 'term_coord', agent: 'codex' })
    ).resolves.toMatchObject({
      state: 'outcome_unknown',
      stage: 'turn_start_blocked',
      lastError: expect.stringContaining('codex-update-prompt')
    })
    expect(h.runtime.waitForTerminal).toHaveBeenLastCalledWith(
      'term_worker',
      expect.objectContaining({ launchReadiness: true })
    )
  })

  it('reports a start blocked on a startup dialog as unknown, keeping the capability bound', async () => {
    h.setup()
    vi.mocked(h.runtime.observeTerminalLaunchTurnStart).mockReturnValue(new Promise(() => {}))
    vi.mocked(h.runtime.waitForTerminal).mockResolvedValue({
      handle: 'term_worker',
      condition: 'tui-idle',
      satisfied: false,
      status: 'running',
      exitCode: null,
      blockedReason: 'codex-update-prompt'
    })
    const task = h.db.createTask({ spec: 'blocked launch', runId: h.activeRunId })

    await expect(
      h.call('orchestration.workerStart', { task: task.id, from: 'term_coord', agent: 'codex' })
    ).resolves.toMatchObject({
      state: 'outcome_unknown',
      stage: 'turn_start_blocked',
      lastError: expect.stringContaining('Agent startup blocked: codex-update-prompt')
    })
    expect(
      h.db.db
        .prepare('SELECT capability_hash FROM dispatch_contexts WHERE task_id = ?')
        .get(task.id)
    ).toEqual({ capability_hash: expect.any(String) })
  })

  it('keeps the paste for an agent that takes its prompt only after start', async () => {
    h.setup()
    vi.spyOn(h.runtime, 'waitForFreshWorkerComposer').mockResolvedValue(undefined)
    await h.startWorker({ agent: 'zcode' })

    expect(vi.mocked(h.runtime.createTerminal).mock.calls[0][1]).not.toHaveProperty('launchFile')
    expect(h.runtime.sendTerminalAgentPrompt).toHaveBeenCalledTimes(1)
  })
})
