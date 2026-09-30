import { describe, expect, it } from 'vitest'
import { buildLaunchFilePointer, isLaunchFilePointer } from './launch-prompt-file'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from './tui-agent-startup'
import type { AgentStartupShell } from './tui-agent-startup-shell'
import { windowsDraftRefusal } from './startup-plan-launch-file'

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
  // The exact lines the Windows lane measured byte-exact on PowerShell 5.1 and pwsh 7.6, through
  // node.exe, an npm .ps1 shim and an npm .cmd shim (ps-quoting-matrix.md, form F-B).
  const legacy = (arg: string): string =>
    `& { $PSNativeCommandArgumentPassing='Legacy'; claude '${arg}' }`
  it.each([
    ['P1', 'fix the "foo bar" bug', legacy('fix the \\"foo bar\\" bug')],
    ['P2', '"leading quote" then text', legacy('\\"leading quote\\" then text')],
    ['P3', 'trailing "quote"', legacy('trailing \\"quote\\"')],
    ['P4', 'a \\"backslash-quote\\" b', legacy('a \\\\\\"backslash-quote\\\\\\" b')]
  ])(
    'types %s inline under legacy argument passing, with each quote escaped',
    (_, prompt, line) => {
      const startup = plan(prompt, 'powershell')
      expect(startup?.launchFile).toBeUndefined()
      expect(startup?.launchCommand).toBe(line)
    }
  )

  // Measured form F-A: a pointer to a spaced path passed in every PowerShell and target.
  it('types P6, the backtick pointer, as a plain literal', () => {
    const prompt = 'The full task is in the file `C:\\Users\\John Smith\\t.md`. Read it.'
    expect(plan(prompt, 'powershell')?.launchCommand).toBe(`claude '${prompt}'`)
  })

  // P5 and `see C:\dir\`: 5.1 turns the trailing backslash into `"`, 7.x's legacy mode doubles it.
  it.each([
    ['P5', 'back\\slash\\\\ "q" end\\'],
    ['a bare path', 'see C:\\dir\\']
  ])('moves %s, which ends in a backslash, into a launch file', (_, prompt) => {
    const startup = plan(prompt, 'powershell')
    expect(startup?.launchFile?.content).toBe(prompt)
    expect(startup?.launchCommand).not.toContain('see C:')
  })

  it('keeps `"` on the line for cmd and POSIX, whose quoting carries it', () => {
    expect(plan('fix the "foo bar" bug', 'cmd')?.launchFile).toBeUndefined()
    expect(plan('fix the "foo bar" bug', 'posix')?.launchFile).toBeUndefined()
  })

  it('prefills a PowerShell draft holding `"` the same way, and pastes one ending in `\\`', () => {
    const draft = (text: string) =>
      buildAgentDraftLaunchPlan({
        agent: 'claude',
        draft: text,
        cmdOverrides: {},
        platform: 'win32',
        shell: 'powershell'
      })
    expect(draft('say "hi"')?.launchCommand).toBe(
      `& { $PSNativeCommandArgumentPassing='Legacy'; claude --prefill 'say \\"hi\\"' }`
    )
    expect(draft('see C:\\dir\\')).toBeNull()
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

  it('tells its own pointer apart from a prompt that merely mentions one', () => {
    expect(isLaunchFilePointer(buildLaunchFilePointer('C:\\Temp\\a b\\task-context.md'))).toBe(true)
    expect(isLaunchFilePointer('The full task is in the file `x`. Read it and do it.')).toBe(false)
    expect(isLaunchFilePointer('fix the build')).toBe(false)
  })

  it('says in plain words why a Windows shell draft was not launched', () => {
    expect(windowsDraftRefusal('line one\nline two', 'powershell')).toMatch(
      /Windows shell would break this draft.*agent was not started/
    )
    expect(windowsDraftRefusal('say "hi"', 'cmd')).toBeNull()
    expect(windowsDraftRefusal('line one\nline two', 'posix')).toBeNull()
  })
})
