/**
 * How a launch prompt reaches an agent whose CLI takes one: on its command line, always, never
 * typed or pasted into a TUI that may not be ready for it.
 *
 * A POSIX host stages a long or multi-line typed line where it writes it (`startup-command-staging`),
 * so the prompt rides that line whole. A Windows host cannot stage, so a line it could not type as
 * it is (a control byte, or past cmd's line cap) carries a pointer to a host-written file instead,
 * as does a prompt too long for argv or one carrying a secret (`launch-prompt-file`).
 *
 * Temporary: a WSL session can do neither (the distro cannot read the Windows temp path), so a line
 * it could not type as it is leaves the prompt for its caller to paste once the agent is ready.
 */

import { carryInLaunchFile, planLaunchPrompt, type LaunchFile } from './launch-prompt-file'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import {
  agentPromptRidesLaunchCommand,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from './tui-agent-startup'
import { typedStartupLineFits, windowsTypedStartupLineFits } from './typed-startup-line'

type StartupPlanInputs = Omit<
  Parameters<typeof buildAgentStartupPlan>[0],
  'prompt' | 'allowEmptyPromptLaunch'
>

export type LaunchPromptStartupPlan = {
  plan: AgentStartupPlan | null
  /** Written by the execution host before it types the line naming it. */
  launchFile?: LaunchFile
  /** The plan starts the agent clean; only a WSL session leaves the prompt for its caller. */
  promptLeftForPaste?: true
}

export function planStartupWithLaunchPrompt(
  inputs: StartupPlanInputs,
  prompt: string,
  options: { sensitive?: boolean; wsl?: boolean } = {}
): LaunchPromptStartupPlan {
  const build = (text: string, launchFile?: LaunchFile): AgentStartupPlan | null =>
    buildAgentStartupPlan({
      ...inputs,
      prompt: text,
      allowEmptyPromptLaunch: true,
      ...(launchFile ? { launchFile } : {})
    })
  const text = prompt.trim()
  // An agent that takes its text only after start has no line to carry it; its caller pastes.
  if (!text || !agentPromptRidesLaunchCommand(inputs.agent)) {
    return { plan: build(text) }
  }
  if (options.wsl) {
    const typed = build(text)
    return typed && (readsPromptFromEnv(inputs) || typedStartupLineFits(typed.launchCommand))
      ? { plan: typed }
      : { plan: build(''), promptLeftForPaste: true }
  }
  const planned = planLaunchPrompt(text, options)
  const plan = build(planned.prompt, planned.launchFile)
  // The builder itself moves a Windows prompt with a line break into a launch file.
  const launchFile = plan?.launchFile ?? planned.launchFile
  if (launchFile) {
    return { plan, launchFile }
  }
  // Hermes refuses a prompt past its env budget (bytes, so CJK text reaches it under 16,384 chars).
  const hermesOverBudget = !plan && readsPromptFromEnv(inputs)
  if (
    !hermesOverBudget &&
    (!plan || !typesUnstaged(inputs) || windowsTypedStartupLineFits(plan.launchCommand))
  ) {
    return { plan }
  }
  const pointer = carryInLaunchFile(text, false)
  const pointed = build(pointer.prompt, pointer.launchFile)
  return { plan: pointed, launchFile: pointed?.launchFile ?? pointer.launchFile }
}

/** A local agent launched for a Linux runtime on a Windows host runs in WSL. */
export function launchRunsInLocalWsl(args: {
  hostPlatform: NodeJS.Platform
  launchPlatform: NodeJS.Platform
  isRemote: boolean
}): boolean {
  return args.hostPlatform === 'win32' && !args.isRemote && args.launchPlatform !== 'win32'
}

/** Whether the host types this line as built: only POSIX hosts stage, and Hermes' fixed line reads
 *  its prompt from the spawn env, so it never grows with the text. */
function typesUnstaged(inputs: StartupPlanInputs): boolean {
  return inputs.platform === 'win32' && !readsPromptFromEnv(inputs)
}

function readsPromptFromEnv(inputs: StartupPlanInputs): boolean {
  return TUI_AGENT_CONFIG[inputs.agent].promptInjectionMode === 'hermes-query'
}
