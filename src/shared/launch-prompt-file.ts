/**
 * A launch prompt too long for a command line, or carrying a secret, rides in a
 * file the execution host writes; the command line carries only a sentence
 * pointing at it.
 */

import type { AgentStartupShell } from './tui-agent-startup-shell'

/** Keeps agent argv comfortably below the lowest practical OS command-line limit. */
export const MAX_INLINE_LAUNCH_PROMPT_CHARS = 16_384

/** Content the host that owns the PTY writes to a private file before anything names it. */
export type LaunchFile = {
  /** Stands in for the file's path in the command and env until the host substitutes it. */
  placeholder: string
  content: string
  /** Set by the caller that minted a secret in `content`; keeps it out of argv and shell history. */
  sensitive: boolean
  /** How the launch line quoted the placeholder, set where the line is built; the host writes the
   *  path inside that quoting. Absent, the host accepts only a path every quoting carries as is. */
  quoting?: AgentStartupShell
}

const LAUNCH_LINE_QUOTINGS: readonly AgentStartupShell[] = ['posix', 'powershell', 'cmd']

const PLACEHOLDER_PATTERN = /^orca-launch-file-[0-9a-f]{32}$/

export function buildLaunchFilePointer(path: string): string {
  return `The full task is in the file "${path}". Read it and complete the task it describes.`
}

/**
 * The prompt a launch line carries, and the file behind it when the prompt is too
 * long or sensitive. The pointer names a placeholder the execution host replaces.
 */
export function planLaunchPrompt(
  prompt: string,
  options: { sensitive?: boolean } = {}
): { prompt: string; launchFile?: LaunchFile } {
  const sensitive = options.sensitive === true
  return sensitive || prompt.length > MAX_INLINE_LAUNCH_PROMPT_CHARS
    ? carryInLaunchFile(prompt, sensitive)
    : { prompt }
}

export function carryInLaunchFile(
  content: string,
  sensitive: boolean
): { prompt: string; launchFile: LaunchFile } {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const placeholder = `orca-launch-file-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  return {
    prompt: buildLaunchFilePointer(placeholder),
    launchFile: { placeholder, content, sensitive }
  }
}

/** Validates a launch file received over a wire; the placeholder must be one Orca minted. */
export function parseLaunchFile(value: unknown): LaunchFile | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('placeholder' in value) ||
    !('content' in value) ||
    !('sensitive' in value)
  ) {
    return undefined
  }
  const { placeholder, content, sensitive } = value
  const quoting = 'quoting' in value ? value.quoting : undefined
  const knownQuoting = LAUNCH_LINE_QUOTINGS.find((candidate) => candidate === quoting)
  if (
    typeof placeholder !== 'string' ||
    !PLACEHOLDER_PATTERN.test(placeholder) ||
    typeof content !== 'string' ||
    typeof sensitive !== 'boolean' ||
    (quoting !== undefined && knownQuoting === undefined)
  ) {
    return undefined
  }
  return { placeholder, content, sensitive, ...(knownQuoting ? { quoting: knownQuoting } : {}) }
}
