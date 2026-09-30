/** How a startup plan carries a launch file: which prompts move into one, and what the line adds. */
import {
  carryInLaunchFile,
  launchFileDirectoryPlaceholder,
  type LaunchFile
} from './launch-prompt-file'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import {
  isPosixStartupShell,
  quoteStartupArg,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import type { TuiAgent } from './tui-agent'

/**
 * Whether a Windows shell would damage `prompt` typed as one quoted argument. cmd and PowerShell have
 * no bracketed paste, so a line break submits the line early and hands the rest to the shell as
 * commands. PowerShell's legacy native-argument passing (5.1 always, 7.x calling a `.cmd` shim)
 * leaves an inner `"` unescaped, so the agent gets the prompt split into several arguments.
 */
export function windowsShellDamagesPrompt(prompt: string, shell: AgentStartupShell): boolean {
  if (isPosixStartupShell(shell)) {
    return false
  }
  return /[\r\n]/.test(prompt) || (shell === 'powershell' && prompt.includes('"'))
}

/** Why a prefill draft could not be launched, in the user's words, when the Windows shell is why. */
export function windowsDraftRefusal(draft: string, shell: AgentStartupShell): string | null {
  return windowsShellDamagesPrompt(draft.trim(), shell)
    ? "The host's Windows shell would break this draft on the agent's command line (it has a line " +
        'break or a double quote), so the agent was not started. Start it without the draft and ' +
        'paste the draft once it opens.'
    : null
}

export function windowsPromptLaunchFile(prompt: string, shell: AgentStartupShell) {
  return windowsShellDamagesPrompt(prompt, shell) ? carryInLaunchFile(prompt, false) : null
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
