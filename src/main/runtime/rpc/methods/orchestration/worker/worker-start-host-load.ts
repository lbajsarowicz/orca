import { collectHostLoad } from '../../../../../memory/host-memory'
import {
  HOST_LOAD_EXCEEDED_CODE,
  HOST_LOAD_EXCEEDED_NEXT_STEPS,
  evaluateHostLoadGate,
  hostLoadExceededMessage,
  type HostLoadSample
} from '../../../../../../shared/host-load-gate'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

/**
 * Refuses a worker-start whose `--max-load` is above the current per-core load of this host.
 * Runs before any Task or Dispatch row exists, so a refusal leaves nothing to clean up.
 */
export function assertHostLoadPermitsWorkerStart(
  params: { maxLoad?: number; on?: string },
  sampleHostLoad: () => HostLoadSample = collectHostLoad
): void {
  if (params.maxLoad === undefined) {
    return
  }
  // Why: the execution host owns its own load, and this runtime cannot read a connected server's.
  if (params.on) {
    throw new OrchestrationError(
      'invalid_argument',
      '--max-load gates workers on the Run home only; it cannot combine with --on.'
    )
  }
  const verdict = evaluateHostLoadGate(sampleHostLoad(), params.maxLoad)
  if (!verdict.exceeded) {
    return
  }
  throw new OrchestrationError(HOST_LOAD_EXCEEDED_CODE, hostLoadExceededMessage(verdict), {
    effectsApplied: false,
    cpuCoreCount: verdict.cpuCoreCount,
    loadAverage1m: verdict.loadAverage1m,
    loadRatio: verdict.loadRatio,
    maxLoad: verdict.maxLoad,
    nextSteps: [...HOST_LOAD_EXCEEDED_NEXT_STEPS]
  })
}
