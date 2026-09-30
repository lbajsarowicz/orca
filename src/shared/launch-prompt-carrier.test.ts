import { describe, expect, it } from 'vitest'
import { buildAgentStartupPlan } from './tui-agent-startup'

const base = { agent: 'claude' as const, cmdOverrides: {} }

describe('the one launch-prompt decision every launch path builds through', () => {
  // Why: the composer, phone quick commands and background sessions call the builder directly.
  it('points a single-line prompt past cmd’s line cap at a launch file', () => {
    const prompt = 'y'.repeat(9_000)
    const plan = buildAgentStartupPlan({ ...base, prompt, platform: 'win32', shell: 'cmd' })
    expect(plan?.launchFile?.content).toBe(prompt)
    expect(plan?.launchCommand.length).toBeLessThan(8_191)
  })

  it('points a prompt past the argv ceiling at a launch file on a POSIX host too', () => {
    const prompt = 'z'.repeat(20_000)
    expect(buildAgentStartupPlan({ ...base, prompt, platform: 'linux' })?.launchFile?.content).toBe(
      prompt
    )
  })

  it('keeps a sensitive prompt off the line however short it is', () => {
    const plan = buildAgentStartupPlan({
      ...base,
      prompt: 'token dcap_secret',
      platform: 'linux',
      sensitive: true
    })
    expect(plan?.launchFile).toMatchObject({ content: 'token dcap_secret', sensitive: true })
    expect(plan?.launchCommand).not.toContain('dcap_secret')
  })

  describe('in a WSL session, which can neither stage a line nor read a launch file', () => {
    const wsl = { ...base, platform: 'linux' as const, launchRunsInWsl: true }

    it('types a line its canonical-mode buffer keeps', () => {
      const prompt = 'a'.repeat(3_000)
      const plan = buildAgentStartupPlan({ ...wsl, prompt })
      expect(plan?.launchCommand).toContain(prompt)
      expect(plan?.followupPrompt).toBeNull()
    })

    // Measured: a 5,023-byte line lost its closing quote and stalled at a continuation prompt.
    it.each([
      ['a 5,023-byte line', 'b'.repeat(5_000)],
      ['a multi-line prompt', 'one\ntwo'],
      ['a prompt past the argv ceiling', 'c'.repeat(20_000)]
    ])('launches clean and leaves %s for the paste', (_, prompt) => {
      const plan = buildAgentStartupPlan({ ...wsl, prompt })
      expect(plan?.launchFile).toBeUndefined()
      expect(plan?.launchCommand).toBe('claude')
      expect(plan?.followupPrompt).toBe(prompt)
    })
  })
})
