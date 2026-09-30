import { describe, expect, it } from 'vitest'
import { buildLaunchFilePointer } from './launch-prompt-file'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from './tui-agent-startup'
import type { AgentStartupShell } from './tui-agent-startup-shell'

function plan(prompt: string, shell: AgentStartupShell) {
  return buildAgentStartupPlan({
    agent: 'claude',
    prompt,
    cmdOverrides: {},
    platform: shell === 'posix' ? 'darwin' : 'win32',
    shell
  })
}

describe('a prompt a Windows shell would damage on the launch line', () => {
  // Measured on Windows PowerShell 5.1: `fix the "foo bar" bug` reached the agent as two arguments.
  it('moves a PowerShell prompt holding `"` into a launch file', () => {
    const prompt = 'fix the "foo bar" bug'
    const startup = plan(prompt, 'powershell')
    expect(startup?.launchFile?.content).toBe(prompt)
    expect(startup?.launchCommand).not.toContain('"')
  })

  it('keeps `"` on the line for cmd and POSIX, whose quoting carries it', () => {
    expect(plan('fix the "foo bar" bug', 'cmd')?.launchFile).toBeUndefined()
    expect(plan('fix the "foo bar" bug', 'posix')?.launchFile).toBeUndefined()
  })

  it('leaves a PowerShell draft holding `"` for the paste instead of prefilling it', () => {
    expect(
      buildAgentDraftLaunchPlan({
        agent: 'claude',
        draft: 'say "hi"',
        cmdOverrides: {},
        platform: 'win32',
        shell: 'powershell'
      })
    ).toBeNull()
  })

  it('points at the file with no double quote in the sentence', () => {
    const path = 'C:\\Users\\John Smith\\AppData\\Local\\Temp\\orca-launch-file-a1\\task-context.md'
    expect(buildLaunchFilePointer(path)).toBe(
      `The full task is in the file \`${path}\`. Read it and complete the task it describes.`
    )
  })

  it('launches clean and leaves the prompt for the paste when the host writes no launch file', () => {
    const startup = buildAgentStartupPlan({
      agent: 'claude',
      prompt: 'fix the build\nthen run the tests',
      cmdOverrides: {},
      platform: 'win32',
      shell: 'powershell',
      hostWritesLaunchFile: false
    })
    expect(startup?.launchFile).toBeUndefined()
    expect(startup?.launchCommand).toBe('claude')
    expect(startup?.followupPrompt).toBe('fix the build\nthen run the tests')
  })
})
