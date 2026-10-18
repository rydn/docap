import * as Comlink from 'comlink'
import type { PipelineApi } from './pipeline.worker'

/**
 * Two workers: one dedicated to live detection so the overlay never stalls, one for
 * capture processing (warp + enhance + encode can take ~1s on a phone).
 */
function spawn(): Comlink.Remote<PipelineApi> {
  const w = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module', name: 'docap-pipeline' })
  return Comlink.wrap<PipelineApi>(w)
}

let detector: Comlink.Remote<PipelineApi> | null = null
let processor: Comlink.Remote<PipelineApi> | null = null

export function detectorWorker(): Comlink.Remote<PipelineApi> {
  return (detector ??= spawn())
}

export function processorWorker(): Comlink.Remote<PipelineApi> {
  return (processor ??= spawn())
}

export { Comlink }
