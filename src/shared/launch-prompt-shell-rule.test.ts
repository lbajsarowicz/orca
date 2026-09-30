import { describe, expect, it } from 'vitest'
import { shouldStageStartupCommand } from './startup-command-staging'
import { buildAgentStartupPlan } from './tui-agent-startup'

// Every character a shell layer between Orca and the agent has been seen to read specially.
const HOSTILE = [...`"'%!^&|<>\\$\`();,`, ' ', '\n', '\t', 'é', '漢', '🙂', ...'abcPATH']

/** Deterministic, so a failure names a prompt CI reproduces. */
function prompts(seed: number, count: number, maxLength: number): string[] {
  let state = seed
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: count }, () =>
    Array.from(
      { length: 1 + Math.floor(next() * maxLength) },
      () => HOSTILE[Math.floor(next() * HOSTILE.length)]
    ).join('')
  )
}

const controlByte = (text: string): boolean => [...text].some((c) => c < ' ' || c === '\x7f')

/** The closed rule, written from the shell layers rather than from the code under test. */
function ridesTheLine(prompt: string, shell: 'cmd' | 'powershell'): boolean {
  if (controlByte(prompt)) {
    return false
  }
  return (
    shell === 'cmd' || (!prompt.includes('"') && !/%[^%]+%/.test(prompt) && !prompt.endsWith('\\'))
  )
}

describe('the Windows launch-prompt rule', () => {
  it.each(['cmd', 'powershell'] as const)(
    'puts a prompt on a %s line exactly when the closed rule allows it',
    (shell) => {
      for (const raw of prompts(shell === 'cmd' ? 1 : 2, 3000, 40)) {
        const prompt = raw.trim()
        if (!prompt) {
          continue
        }
        const plan = buildAgentStartupPlan({
          agent: 'claude',
          prompt: raw,
          cmdOverrides: {},
          platform: 'win32',
          shell
        })
        expect({ prompt, file: plan?.launchFile !== undefined }).toEqual({
          prompt,
          file: !ridesTheLine(prompt, shell)
        })
      }
    }
  )

  it("sends a cmd line past cmd's 8,191-character cap to a launch file", () => {
    for (const prompt of prompts(3, 20, 40).map((p) => p.replace(/[\r\n\t]/g, 'x'))) {
      const long = `${prompt.trim()}${'y'.repeat(8_200)}`
      const plan = buildAgentStartupPlan({
        agent: 'claude',
        prompt: long,
        cmdOverrides: {},
        platform: 'win32',
        shell: 'cmd'
      })
      expect(plan?.launchFile?.content).toBe(long.trim())
    }
  })
})

describe('an Orca launch line in a shell outside the verified set', () => {
  it.each(['/bin/tcsh', '/usr/bin/nu', '/usr/bin/xonsh', '/usr/bin/elvish', undefined])(
    'is always staged in %s, whatever its length or content',
    (shellPath) => {
      for (const prompt of prompts(4, 500, 40)) {
        const plan = buildAgentStartupPlan({
          agent: 'claude',
          prompt,
          cmdOverrides: {},
          platform: 'linux'
        })
        expect(
          shouldStageStartupCommand({
            command: plan!.launchCommand,
            shellPath,
            platform: 'linux',
            orcaBuiltLine: true
          })
        ).toBe(true)
      }
    }
  )
})
