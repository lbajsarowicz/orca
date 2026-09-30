/** How a startup plan carries a launch file: which prompts move into one, and what the line adds. */
import {
  MAX_INLINE_LAUNCH_PROMPT_CHARS,
  carryInLaunchFile,
  launchFileDirectoryPlaceholder,
  type LaunchFile
} from './launch-prompt-file'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import {
  isPosixStartupShell,
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import { windowsTypedStartupLineFits, wslTypedStartupLineFits } from './typed-startup-line'
import {
  quotePowerShellNativeArgument,
  withLegacyNativeArgumentPassing
} from './powershell-native-argument'
import type { TuiAgent } from './tui-agent'

/**
 * Whether a Windows shell would damage `prompt` typed as one quoted argument. cmd and PowerShell have
 * no bracketed paste, so a line break submits the line early and hands the rest to the shell as
 * commands. PowerShell 5.1 turns a trailing backslash plus the quote it adds into a literal `"`, and
 * 7.x's legacy mode doubles it instead, so no one spelling survives both (measured).
 */
export function windowsShellDamagesPrompt(prompt: string, shell: AgentStartupShell): boolean {
  if (isPosixStartupShell(shell)) {
    return false
  }
  return /[\r\n]/.test(prompt) || (shell === 'powershell' && prompt.endsWith('\\'))
}

/**
 * How a prompt is quoted on a launch line, and what the line needs around it. PowerShell passes an
 * inner `"` unescaped in its legacy mode (5.1 always, 7.x through a `.cmd` shim), splitting the
 * prompt; escaped for argv and run under legacy passing, it arrives whole in both.
 */
export function promptOnLaunchLine(
  prompt: string,
  shell: AgentStartupShell
): { quoted: string; line: (line: string) => string } {
  return shell === 'powershell' && prompt.includes('"')
    ? { quoted: quotePowerShellNativeArgument(prompt), line: withLegacyNativeArgumentPassing }
    : { quoted: quoteStartupArg(prompt, shell), line: (line) => line }
}

/** Why a prefill draft could not be launched, in the user's words, when the Windows shell is why. */
export function windowsDraftRefusal(draft: string, shell: AgentStartupShell): string | null {
  return windowsShellDamagesPrompt(draft.trim(), shell)
    ? "The host's Windows shell would break this draft on the agent's command line (it has a line " +
        'break, or ends in a backslash on PowerShell), so the agent was not started. Start it ' +
        'without the draft and paste the draft once it opens.'
    : null
}

type CarriedPlanArgs = {
  agent: TuiAgent
  prompt: string
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  allowEmptyPromptLaunch?: boolean
  launchFile?: LaunchFile
  hostWritesLaunchFile?: boolean
  sensitive?: boolean
  launchRunsInWsl?: boolean
}

/**
 * Where a launch prompt rides, decided once for every launch path: on the line, which a POSIX host
 * stages when it is long or multi-line; in a launch file named by a pointer when the prompt is past
 * the argv ceiling, sensitive, damaged by a Windows shell, or past cmd's line cap; or, where no
 * launch file can be written (a paired host, a WSL session), left in `followupPrompt` for the paste
 * after ready. A WSL line also pastes past what its canonical-mode buffer keeps.
 */
export function carryLaunchPrompt<
  A extends CarriedPlanArgs,
  P extends { launchCommand: string; followupPrompt: string | null }
>(args: A, buildOnLine: (args: A) => P | null): P | null {
  const text = args.prompt.trim()
  const mode = TUI_AGENT_CONFIG[args.agent].promptInjectionMode
  if (!text || args.launchFile || mode === 'stdin-after-start') {
    return buildOnLine(args)
  }
  const readsEnv = mode === 'hermes-query'
  const pasteAfterReady = (): P | null => {
    const clean = buildOnLine({ ...args, prompt: '', allowEmptyPromptLaunch: true })
    return clean && { ...clean, followupPrompt: text }
  }
  const viaLaunchFile = (): P | null => {
    if (args.hostWritesLaunchFile === false || args.launchRunsInWsl) {
      return pasteAfterReady()
    }
    const pointer = carryInLaunchFile(text, args.sensitive === true)
    return buildOnLine({ ...args, prompt: pointer.prompt, launchFile: pointer.launchFile })
  }
  const shell = resolveStartupShell(args.platform, args.shell)
  if (
    args.sensitive === true ||
    text.length > MAX_INLINE_LAUNCH_PROMPT_CHARS ||
    (!readsEnv && windowsShellDamagesPrompt(text, shell))
  ) {
    return viaLaunchFile()
  }
  const onLine = buildOnLine(args)
  if (!onLine || readsEnv) {
    // Hermes reads its prompt from the env and refuses one past that budget, counted in bytes.
    return !onLine && readsEnv ? viaLaunchFile() : onLine
  }
  if (args.launchRunsInWsl) {
    return wslTypedStartupLineFits(onLine.launchCommand) ? onLine : pasteAfterReady()
  }
  return args.platform === 'win32' && !windowsTypedStartupLineFits(onLine.launchCommand)
    ? viaLaunchFile()
    : onLine
}

/** The host writes the path inside this line's quoting, so the file carries which one it is. */
export function launchFileProps(launchFile: LaunchFile | undefined, shell: AgentStartupShell) {
  return launchFile ? { launchFile: { ...launchFile, quoting: shell } } : {}
}

/** The host puts the launch file's private directory where the placeholder is, like its path. */
export function launchFileDirectoryGrant(
  agent: TuiAgent,
  launchFile: LaunchFile | undefined,
  shell: AgentStartupShell
): string {
  const flag = TUI_AGENT_CONFIG[agent].launchFileDirectoryFlag
  if (!launchFile || !flag) {
    return ''
  }
  return ` ${quoteStartupArg(`${flag}=${launchFileDirectoryPlaceholder(launchFile.placeholder)}`, shell)}`
}
