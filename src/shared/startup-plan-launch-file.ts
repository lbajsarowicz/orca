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

/** Why: cmd and PowerShell have no bracketed paste, so a line break typed inside a prompt submits
 *  the line early and hands the rest to the shell as commands. */
export function windowsLineBreakLaunchFile(prompt: string, shell: AgentStartupShell) {
  return !isPosixStartupShell(shell) && /[\r\n]/.test(prompt)
    ? carryInLaunchFile(prompt, false)
    : null
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
