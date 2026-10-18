import { signatureSimilarity } from './signature'
import { StabilityGate, type StabilityOptions } from './tracker'
import type { Quad } from './types'

export type CaptureState =
  /** No document in view. */
  | 'searching'
  /** Document seen, but moving or not yet stable. */
  | 'tracking'
  /** Stable; progress counts up to the shot. */
  | 'holding'
  /** Shot requested; waiting for the capture to finish. */
  | 'capturing'
  /** This page was just captured; waiting for a new page or the page to go away. */
  | 'captured'

export interface AutoCaptureOptions extends StabilityOptions {
  /** Signature similarity above which a page counts as the one just captured. */
  duplicateSimilarity: number
  /** Consecutive frames of a different page needed to re-arm without removal. */
  newPageFrames: number
  /** No-document time after which capture re-arms. */
  rearmMissingMs: number
  /** Minimum detection score to start holding. */
  minScore: number
  /** Fire only when sharpness is at least this fraction of the best seen while holding. */
  sharpnessRatio: number
}

export const DEFAULT_AUTOCAPTURE: AutoCaptureOptions = {
  maxDrift: 0.015,
  holdMs: 650,
  gapMs: 180,
  duplicateSimilarity: 0.82,
  newPageFrames: 3,
  rearmMissingMs: 500,
  minScore: 0.45,
  sharpnessRatio: 0.7,
}

export interface FrameObservation {
  t: number
  quad: Quad | null
  score: number
  sharpness: number
  signature: Float32Array | null
  diag: number
}

export interface AutoCaptureUpdate {
  state: CaptureState
  progress: number
  fire: boolean
}

/**
 * Decides when to take the picture. A shot fires once the document has held still for
 * `holdMs` with a confident detection and the frame is near the sharpest seen while
 * holding. After a shot it will not fire again for the same page: it re-arms when the
 * page leaves the view or a visibly different page has been seen for a few frames —
 * so you can feed pages one after another without touching the phone.
 */
export class AutoCapture {
  private gate: StabilityGate
  private o: AutoCaptureOptions
  private state: CaptureState = 'searching'
  private lastSignature: Float32Array | null = null
  private lastSeen = -Infinity
  private differentFrames = 0
  private bestSharpness = 0

  constructor(options: Partial<AutoCaptureOptions> = {}) {
    this.o = { ...DEFAULT_AUTOCAPTURE, ...options }
    this.gate = new StabilityGate(this.o)
  }

  get current(): CaptureState {
    return this.state
  }

  update(f: FrameObservation): AutoCaptureUpdate {
    if (f.quad) this.lastSeen = f.t

    if (this.state === 'capturing') return { state: this.state, progress: 1, fire: false }

    if (this.state === 'captured') {
      if (!f.quad) {
        if (f.t - this.lastSeen >= this.o.rearmMissingMs) this.rearm()
        return { state: this.state, progress: 0, fire: false }
      }
      const same = !!f.signature && !!this.lastSignature && signatureSimilarity(f.signature, this.lastSignature) >= this.o.duplicateSimilarity
      this.differentFrames = same || !f.signature ? 0 : this.differentFrames + 1
      if (this.differentFrames < this.o.newPageFrames) return { state: this.state, progress: 0, fire: false }
      this.rearm()
    }

    const quad = f.quad && f.score >= this.o.minScore ? f.quad : null
    const progress = this.gate.update(quad, f.t, f.diag)
    if (!quad) {
      if (progress === 0) {
        this.state = f.t - this.lastSeen > this.o.gapMs ? 'searching' : 'tracking'
        this.bestSharpness = 0
      }
      return { state: this.state, progress, fire: false }
    }
    if (progress === 0 || progress < 0.05) this.bestSharpness = 0
    this.bestSharpness = Math.max(this.bestSharpness, f.sharpness)
    this.state = progress > 0 ? 'holding' : 'tracking'
    if (progress >= 1 && f.sharpness >= this.o.sharpnessRatio * this.bestSharpness) {
      this.state = 'capturing'
      return { state: this.state, progress: 1, fire: true }
    }
    return { state: this.state, progress, fire: false }
  }

  /** Call when the shot has been taken (manual or automatic). */
  captured(signature: Float32Array | null): void {
    this.lastSignature = signature
    this.differentFrames = 0
    this.state = 'captured'
    this.gate.reset()
  }

  /** Call if a requested shot failed, to try again. */
  failed(): void {
    this.state = 'tracking'
    this.gate.reset()
  }

  rearm(): void {
    this.state = 'searching'
    this.differentFrames = 0
    this.bestSharpness = 0
    this.gate.reset()
  }
}
