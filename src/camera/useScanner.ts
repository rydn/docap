import { onBeforeUnmount, ref, shallowRef, type Ref } from 'vue'
import { AutoCapture, type CaptureState } from '@/pipeline/autocapture'
import type { DetectFailure } from '@/pipeline/detect'
import { QuadSmoother } from '@/pipeline/tracker'
import type { Quad } from '@/pipeline/types'
import { diagnostics } from '@/stores/diagnostics'
import { useQueue } from '@/stores/queue'
import { useSettings } from '@/stores/settings'
import { detectorWorker, processorWorker, Comlink } from '@/worker/client'
import type { FrameAnalysis } from '@/worker/types'
import type { useCamera } from './useCamera'

/** Long side of frames sent for detection. */
const FRAME_SIDE = 720

export interface ScannerStats {
  fps: number
  detectMs: number
  backend: string
  loadMs: number
}

/**
 * Runs the live loop: grabs frames, detects in a worker (one frame in flight at a time),
 * smooths the outline for display, and drives auto-capture. Captures are processed in a
 * second worker so detection keeps running while pages are being flattened.
 */
export function useScanner(camera: ReturnType<typeof useCamera>, video: Ref<HTMLVideoElement | null>) {
  const queue = useQueue()
  const settings = useSettings()

  /** Smoothed quad for display, in analysis-frame coordinates. */
  const quad = shallowRef<Quad | null>(null)
  const frameSize = ref({ width: 0, height: 0 })
  const state = ref<CaptureState>('searching')
  const progress = ref(0)
  const failure = ref<DetectFailure | null>(null)
  const modelReady = ref(false)
  const modelError = ref<string | null>(null)
  const flash = ref(0)
  const stats = ref<ScannerStats>({ fps: 0, detectMs: 0, backend: '', loadMs: 0 })

  const smoother = new QuadSmoother()
  const auto = new AutoCapture()
  let running = false
  let busy = false
  let last: FrameAnalysis | null = null
  let lastSeenAt = 0
  let frames = 0
  let fpsT0 = performance.now()
  let rafHandle = 0
  let stillInFlight = false

  async function init(): Promise<void> {
    try {
      // Live detection gets most threads; capture processing is off the critical path.
      const [d] = await Promise.all([detectorWorker().init(4), processorWorker().init(2)])
      stats.value = { ...stats.value, backend: d.backend, loadMs: d.loadMs }
      diagnostics.backend = d.backend
      diagnostics.loadMs = d.loadMs
      modelReady.value = true
    } catch (e) {
      modelError.value = (e as Error).message
    }
  }

  function scheduleNext(): void {
    if (!running) return
    const v = video.value
    if (v && 'requestVideoFrameCallback' in v) v.requestVideoFrameCallback(() => void tick())
    else rafHandle = requestAnimationFrame(() => void tick())
  }

  async function tick(): Promise<void> {
    if (!running) return
    if (busy || !modelReady.value || !camera.ready.value) return scheduleNext()
    busy = true
    try {
      const bmp = await camera.grabFrame(FRAME_SIDE)
      if (!bmp) return
      const t = performance.now()
      const res = await detectorWorker().detect(Comlink.transfer(bmp, [bmp]))
      handle(res, t)
    } catch (e) {
      console.warn('detect failed', e)
    } finally {
      busy = false
      scheduleNext()
    }
  }

  function handle(res: FrameAnalysis, t: number): void {
    last = res
    frameSize.value = { width: res.width, height: res.height }
    const diag = Math.hypot(res.width, res.height)
    failure.value = res.failure
    if (res.detection) {
      lastSeenAt = t
      quad.value = smoother.smooth(res.detection.quad, t, diag)
    } else if (t - lastSeenAt > 250) {
      quad.value = null
      smoother.reset()
    }
    frames++
    if (t - fpsT0 > 1000) {
      stats.value = { ...stats.value, fps: Math.round((frames * 1000) / (t - fpsT0)), detectMs: res.ms }
      diagnostics.fps = stats.value.fps
      diagnostics.detectMs = res.ms
      diagnostics.frame = `${res.width}×${res.height}`
      frames = 0
      fpsT0 = t
    }
    const u = auto.update({
      t,
      quad: res.detection?.quad ?? null,
      score: res.detection?.score ?? 0,
      sharpness: res.sharpness,
      signature: res.signature,
      diag,
    })
    state.value = u.state
    progress.value = settings.autoCapture ? u.progress : 0
    if (u.fire) {
      if (settings.autoCapture) void shoot(res)
      else auto.failed()
    }
  }

  /** Takes the picture now (auto or the shutter button). */
  async function shoot(from: FrameAnalysis | null = last): Promise<void> {
    if (stillInFlight) return
    stillInFlight = true
    state.value = 'capturing'
    flash.value++
    feedback()
    const signature = from?.signature ?? null
    const hint = from?.detection
      ? (from.detection.quad.map((p) => ({ x: (p.x + 0.5) / from.width, y: (p.y + 0.5) / from.height })) as Quad)
      : null
    const hintAspect = from ? from.width / from.height : 1
    const id = queue.begin()
    let still: ImageBitmap
    try {
      still = await camera.takeStill(settings.highResStill)
    } catch (e) {
      queue.fail(id, (e as Error).message)
      auto.failed()
      stillInFlight = false
      return
    }
    stillInFlight = false
    // Detection can continue as soon as the still is in hand.
    auto.captured(signature)
    state.value = 'captured'
    try {
      const out = await processorWorker().capture(
        Comlink.transfer({ still, hint, hintAspect, options: { enhance: settings.enhance, snapPaper: settings.snapPaper } }, [still]),
      )
      diagnostics.lastCaptureMs = out.ms
      await queue.complete(id, {
        page: out.page,
        thumb: out.thumb,
        still: out.still,
        width: out.width,
        height: out.height,
        stillWidth: out.stillWidth,
        stillHeight: out.stillHeight,
        quad: out.quad,
        rotation: 0,
        enhance: settings.enhance,
      })
    } catch (e) {
      queue.fail(id, (e as Error).message)
    }
  }

  let audio: AudioContext | null = null
  function feedback(): void {
    navigator.vibrate?.(35)
    if (!settings.sound) return
    try {
      audio ??= new AudioContext()
      const t = audio.currentTime
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.type = 'triangle'
      o.frequency.setValueAtTime(1400, t)
      o.frequency.exponentialRampToValueAtTime(500, t + 0.08)
      g.gain.setValueAtTime(0.15, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      o.connect(g).connect(audio.destination)
      o.start(t)
      o.stop(t + 0.11)
    } catch {
      /* audio unavailable */
    }
  }

  function start(): void {
    if (running) return
    running = true
    scheduleNext()
  }

  function stop(): void {
    running = false
    cancelAnimationFrame(rafHandle)
  }

  /** Forget the last captured page so the same page can be captured again. */
  function rearm(): void {
    auto.rearm()
  }

  onBeforeUnmount(stop)

  return { quad, frameSize, state, progress, failure, modelReady, modelError, flash, stats, init, start, stop, shoot, rearm }
}
