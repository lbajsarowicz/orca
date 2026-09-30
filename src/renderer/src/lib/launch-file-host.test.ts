import { afterEach, describe, expect, it, vi } from 'vitest'
import { launchHostWritesLaunchFile } from './launch-file-host'
import { buildQuickComposerStartup } from '@/hooks/composer-state/quick-startup-plan'

describe('whether a launch host writes its launch file', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is true for this machine and false for a paired host or a web client', () => {
    expect(launchHostWritesLaunchFile({ activeRuntimeEnvironmentId: null })).toBe(true)
    expect(launchHostWritesLaunchFile({ activeRuntimeEnvironmentId: 'env-1' })).toBe(false)
    vi.stubGlobal('window', { __ORCA_WEB_CLIENT__: true })
    expect(launchHostWritesLaunchFile({ activeRuntimeEnvironmentId: null })).toBe(false)
  })
})

describe('the quick composer on a paired host', () => {
  it('sends no pointer to a paired host and leaves the prompt for the renderer to paste', () => {
    const startup = buildQuickComposerStartup({
      agent: 'claude',
      prompt: 'fix the build\nthen run the tests',
      draftPrompt: null,
      settings: null,
      repoConnectionId: null,
      platform: 'win32',
      shell: 'powershell',
      isRemote: false,
      hostWritesLaunchFile: false,
      launchRunsInWsl: false,
      telemetrySource: 'sidebar'
    })
    expect(startup.backendStartup).toBeUndefined()
    expect(startup.startupPlan?.launchFile).toBeUndefined()
    expect(startup.startupPlan?.followupPrompt).toBe('fix the build\nthen run the tests')
  })
})

describe('a new-tab launch into WSL', () => {
  // Why: the default auto-submit typed the full line, which a WSL shell stalls on past 4 KB.
  it('pastes a prompt the WSL line cannot carry, whatever the delivery', async () => {
    const { planLaunchAgentStartupPrompt } = await import('./launch-agent-startup-prompt-plan')
    const prompt = 'b'.repeat(5_000)
    const planned = planLaunchAgentStartupPrompt({
      base: { agent: 'claude', cmdOverrides: {}, platform: 'linux' },
      prompt,
      promptDelivery: 'auto-submit',
      isFollowupPath: false,
      launchesOnPairedHost: false,
      launchesInLocalWsl: true
    })
    expect(planned.pasteDraftAfterLaunch).toBe(prompt)
    expect(planned.submitPastedPrompt).toBe(true)
    expect(planned.startupPlan?.launchCommand).toBe('claude')
  })
})
