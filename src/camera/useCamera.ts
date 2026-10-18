import { onBeforeUnmount, ref, shallowRef, type Ref } from 'vue'

export type CameraError = 'denied' | 'not-found' | 'insecure' | 'unsupported' | 'failed'

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean
}

/** Minimal typing for ImageCapture (Chromium only; Safari/Firefox lack it). */
interface ImageCaptureLike {
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>
  getPhotoCapabilities(): Promise<{ imageWidth?: { max: number }; imageHeight?: { max: number } }>
}
declare const ImageCapture: { new (track: MediaStreamTrack): ImageCaptureLike } | undefined

/**
 * Rear camera at the highest resolution the device offers for video. Frames for
 * detection are downscaled on a canvas; stills use ImageCapture.takePhoto (full sensor
 * resolution) where available, otherwise the current video frame.
 */
export function useCamera(video: Ref<HTMLVideoElement | null>) {
  const stream = shallowRef<MediaStream | null>(null)
  const error = ref<CameraError | null>(null)
  const ready = ref(false)
  const torchSupported = ref(false)
  const torchOn = ref(false)
  const videoSize = ref({ width: 0, height: 0 })
  let imageCapture: ImageCaptureLike | null = null
  let frameCanvas: HTMLCanvasElement | null = null

  async function start(): Promise<boolean> {
    error.value = null
    if (!window.isSecureContext) {
      error.value = 'insecure'
      return false
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'unsupported'
      return false
    }
    try {
      stream.value = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
      })
    } catch (e) {
      const name = (e as DOMException).name
      error.value = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'not-found' : 'failed'
      return false
    }
    const track = stream.value.getVideoTracks()[0]!
    try {
      // Continuous autofocus where the browser exposes it (Chrome Android).
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
    } catch {
      /* not supported */
    }
    const caps = (track.getCapabilities?.() ?? {}) as TorchCapabilities
    torchSupported.value = !!caps.torch
    imageCapture = typeof ImageCapture !== 'undefined' ? new ImageCapture(track) : null

    const el = video.value!
    el.srcObject = stream.value
    el.muted = true
    el.playsInline = true
    await el.play()
    await new Promise<void>((res) => (el.videoWidth ? res() : el.addEventListener('loadedmetadata', () => res(), { once: true })))
    videoSize.value = { width: el.videoWidth, height: el.videoHeight }
    el.addEventListener('resize', () => (videoSize.value = { width: el.videoWidth, height: el.videoHeight }))
    ready.value = true
    return true
  }

  function stop(): void {
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
    ready.value = false
    torchOn.value = false
  }

  async function setTorch(on: boolean): Promise<void> {
    const track = stream.value?.getVideoTracks()[0]
    if (!track || !torchSupported.value) return
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      torchOn.value = on
    } catch {
      torchSupported.value = false
    }
  }

  /** Current frame downscaled to fit maxSide, as a transferable bitmap. */
  async function grabFrame(maxSide: number): Promise<ImageBitmap | null> {
    const el = video.value
    if (!el || !el.videoWidth) return null
    const s = Math.min(1, maxSide / Math.max(el.videoWidth, el.videoHeight))
    const w = Math.round(el.videoWidth * s)
    const h = Math.round(el.videoHeight * s)
    frameCanvas ??= document.createElement('canvas')
    if (frameCanvas.width !== w || frameCanvas.height !== h) {
      frameCanvas.width = w
      frameCanvas.height = h
    }
    const ctx = frameCanvas.getContext('2d', { willReadFrequently: false })!
    ctx.drawImage(el, 0, 0, w, h)
    return createImageBitmap(frameCanvas)
  }

  /**
   * Full-resolution still. Prefers takePhoto (sensor resolution, Chromium) when it is
   * meaningfully larger than the video; falls back to the live frame.
   */
  async function takeStill(preferPhoto: boolean): Promise<ImageBitmap> {
    const el = video.value!
    if (preferPhoto && imageCapture) {
      try {
        const blob = await imageCapture.takePhoto()
        const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
        if (bmp.width * bmp.height > el.videoWidth * el.videoHeight * 1.2) return bmp
        bmp.close()
      } catch {
        /* fall through to video frame */
      }
    }
    return createImageBitmap(el)
  }

  onBeforeUnmount(stop)

  return { stream, error, ready, torchSupported, torchOn, videoSize, start, stop, setTorch, grabFrame, takeStill, hasImageCapture: () => !!imageCapture }
}
