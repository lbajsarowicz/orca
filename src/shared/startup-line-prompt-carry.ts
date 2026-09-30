/**
 * The launch-prompt plan for callers that route WSL and sensitive prompts: the decision itself (line,
 * launch file, or paste) is the builder's (`carryLaunchPrompt`), so every launch path shares it.
 *
 * Temporary: a WSL session can neither stage a long line nor read a launch file (the distro cannot
 * read the Windows temp path), so a line it could not type leaves the prompt for its caller to paste
 * once the agent is ready.
 */

import type { LaunchFile } from './launch-prompt-file'
import {
  agentPromptRidesLaunchCommand,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from './tui-agent-startup'
import { isWslShellName } from './local-windows-terminal-runtime'

type StartupPlanInputs = Omit<
  Parameters<typeof buildAgentStartupPlan>[0],
  'prompt' | 'allowEmptyPromptLaunch'
>

export type LaunchPromptStartupPlan = {
  plan: AgentStartupPlan | null
  /** Written by the execution host before it types the line naming it. */
  launchFile?: LaunchFile
  /** The plan starts the agent clean; the caller pastes the prompt once the agent is ready. */
  promptLeftForPaste?: true
}

export function planStartupWithLaunchPrompt(
  inputs: StartupPlanInputs,
  prompt: string,
  options: { sensitive?: boolean; wsl?: boolean } = {}
): LaunchPromptStartupPlan {
  const plan = buildAgentStartupPlan({
    ...inputs,
    prompt,
    allowEmptyPromptLaunch: true,
    ...(options.sensitive ? { sensitive: true } : {}),
    ...(options.wsl ? { launchRunsInWsl: true } : {})
  })
  // A stdin-after-start agent's followupPrompt is its normal paste, not a prompt the line refused.
  const leftForPaste = Boolean(plan?.followupPrompt) && agentPromptRidesLaunchCommand(inputs.agent)
  return {
    plan,
    ...(plan?.launchFile ? { launchFile: plan.launchFile } : {}),
    ...(leftForPaste ? { promptLeftForPaste: true as const } : {})
  }
}

/** A local agent launched for a Linux runtime, or into a WSL shell, on a Windows host runs in WSL. */
export function launchRunsInLocalWsl(args: {
  hostPlatform: NodeJS.Platform
  launchPlatform: NodeJS.Platform
  isRemote: boolean
  /** The shell this PTY will be when the caller picked one; the write sites refuse a WSL one. */
  shellOverride?: string
}): boolean {
  return (
    args.hostPlatform === 'win32' &&
    !args.isRemote &&
    (args.launchPlatform !== 'win32' || isWslShellName(args.shellOverride))
  )
}

/** For a launch path that cannot paste after the agent starts, when the line refused the prompt. */
export const WSL_PROMPT_TOO_LONG_TO_TYPE_MESSAGE =
  'This prompt is too long to type into a WSL shell at launch. Start the agent, then send the prompt.'
