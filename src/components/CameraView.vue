<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useCamera } from '@/camera/useCamera'
import { useScanner } from '@/camera/useScanner'
import { useQueue } from '@/stores/queue'
import { useSettings } from '@/stores/settings'
import Icon from './Icon.vue'
import QuadOverlay from './QuadOverlay.vue'

const emit = defineEmits<{ openQueue: []; openSettings: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const camera = useCamera(video)
const scanner = useScanner(camera, video)
const queue = useQueue()
const settings = useSettings()
const started = ref(false)
const flashing = ref(false)

const hint = computed(() => {
  if (camera.error.value) return null
  if (scanner.modelError.value) return 'Detector failed to load — manual capture only'
  if (!scanner.modelReady.value) return 'Loading detector…'
  switch (scanner.state.value) {
    case 'capturing':
      return 'Capturing…'
    case 'captured':
      return settings.autoCapture ? 'Captured ✓ Place the next page' : 'Captured ✓'
    case 'holding':
      return settings.autoCapture ? 'Hold still…' : 'Tap to capture'
  }
  switch (scanner.failure.value) {
    case 'partial':
      return 'Fit the whole page in view'
    case 'too-small':
      return 'Move closer'
    case 'bad-angle':
    case 'too-skewed':
      return 'Hold the phone parallel to the page'
  }
  return scanner.state.value === 'tracking' ? 'Hold still' : 'Point at a document'
})

const lastThumb = computed(() => {
  for (let i = queue.items.length - 1; i >= 0; i--) if (queue.items[i]!.thumbUrl) return queue.items[i]!.thumbUrl
  return null
})

const errorText: Record<string, string> = {
  denied: 'Camera access was blocked. Allow camera access for this site in your browser settings, then try again.',
  'not-found': 'No camera was found on this device.',
  insecure: 'The camera only works over HTTPS.',
  unsupported: 'This browser does not support camera access.',
  failed: 'The camera could not be started. It may be in use by another app.',
}

async function begin(): Promise<void> {
  started.value = true
  void scanner.init()
  if (await camera.start()) scanner.start()
}

watch(scanner.flash, () => {
  flashing.value = true
  setTimeout(() => (flashing.value = false), 140)
})

// Pause detection while the tab is hidden; release the camera to save battery.
function onVisibility(): void {
  if (!started.value) return
  if (document.hidden) {
    scanner.stop()
    camera.stop()
  } else {
    void camera.start().then((ok) => ok && scanner.start())
  }
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibility)
  // If permission was already granted, start straight away (no extra tap).
  try {
    const p = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    if (p?.state === 'granted') await begin()
  } catch {
    /* permissions API unsupported (Safari < 16) */
  }
})
</script>

<template>
  <section class="camera">
    <video ref="video" class="feed" autoplay muted playsinline />
    <QuadOverlay
      v-if="camera.ready.value"
      :quad="scanner.quad.value"
      :width="scanner.frameSize.value.width"
      :height="scanner.frameSize.value.height"
      :state="scanner.state.value"
      :progress="scanner.progress.value"
    />
    <div class="flash" :class="{ on: flashing }" />

    <div v-if="!started || camera.error.value" class="intro">
      <div class="logo">
        <Icon name="crop" :size="40" />
      </div>
      <h1>docap</h1>
      <p v-if="!camera.error.value">Point your camera at a page. docap finds it, waits for it to hold still, then captures, crops and straightens it automatically. Keep feeding pages — every new page is picked up.</p>
      <p v-else class="error">{{ errorText[camera.error.value] }}</p>
      <button class="primary" @click="begin">
        <Icon name="camera" />
        {{ camera.error.value ? 'Try again' : 'Start scanning' }}
      </button>
      <p class="fine">Everything runs on your device. Nothing is uploaded.</p>
      <button v-if="queue.ready.length" class="link" @click="emit('openQueue')">View {{ queue.ready.length }} scanned page{{ queue.ready.length === 1 ? '' : 's' }}</button>
    </div>

    <header v-if="started && !camera.error.value" class="top">
      <button v-if="camera.torchSupported.value" class="round" :class="{ active: camera.torchOn.value }" aria-label="Torch" @click="camera.setTorch(!camera.torchOn.value)">
        <Icon name="torch" />
      </button>
      <span v-else class="spacer" />
      <transition name="fade" mode="out-in">
        <div v-if="hint" :key="hint" class="hint" :class="scanner.state.value" role="status">{{ hint }}</div>
      </transition>
      <button class="round" aria-label="Settings" @click="emit('openSettings')">
        <Icon name="settings" />
      </button>
    </header>

    <footer v-if="started && !camera.error.value" class="bottom">
      <button class="tray" :disabled="!queue.items.length" aria-label="Scanned pages" @click="emit('openQueue')">
        <img v-if="lastThumb" :src="lastThumb" alt="" />
        <Icon v-else name="pages" />
        <span v-if="queue.items.length" class="badge">{{ queue.items.length }}</span>
        <span v-if="queue.processing" class="spinner" />
      </button>

      <button class="shutter" :class="{ auto: settings.autoCapture }" aria-label="Capture" @click="scanner.shoot()">
        <svg viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" class="ring" />
          <circle cx="40" cy="40" r="36" class="ring-progress" :style="{ strokeDashoffset: 226.2 * (1 - scanner.progress.value) }" />
          <circle cx="40" cy="40" r="29" class="core" />
        </svg>
      </button>

      <button class="mode" :aria-pressed="settings.autoCapture" @click="settings.autoCapture = !settings.autoCapture">
        <span class="mode-label">{{ settings.autoCapture ? 'AUTO' : 'MANUAL' }}</span>
      </button>
    </footer>
  </section>
</template>

<style scoped>
.camera {
  position: fixed;
  inset: 0;
  background: #000;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
.feed {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease-out;
}
.flash.on {
  opacity: 0.55;
  transition: none;
}
.top {
  position: absolute;
  top: calc(var(--safe-top) + 12px);
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.spacer {
  width: 44px;
}
.hint {
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--panel);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  max-width: calc(100% - 120px);
}
.hint.captured {
  background: rgba(47, 179, 123, 0.92);
}
.round {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 0;
  display: grid;
  place-items: center;
  background: var(--panel);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.round.active {
  background: var(--warn);
  color: #000;
}
.bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 18px 26px calc(var(--safe-bottom) + 22px);
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent);
}
.tray {
  justify-self: start;
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.4);
  padding: 0;
  display: grid;
  place-items: center;
  overflow: visible;
}
.tray img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
.tray:disabled {
  opacity: 0.5;
}
.badge {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: var(--accent);
  color: #04130c;
  font-size: 13px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
.spinner {
  position: absolute;
  bottom: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.shutter {
  width: 80px;
  height: 80px;
  padding: 0;
  border: 0;
  background: none;
}
.shutter svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 5;
}
.ring-progress {
  fill: none;
  stroke: var(--accent);
  stroke-width: 5;
  stroke-dasharray: 226.2;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.1s linear;
}
.core {
  fill: #fff;
  transition: transform 0.1s;
  transform-origin: center;
}
.shutter:active .core {
  transform: scale(0.88);
}
.mode {
  justify-self: end;
  border: 0;
  background: var(--panel);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.mode[aria-pressed='true'] {
  color: var(--accent);
}
.intro {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px 28px calc(var(--safe-bottom) + 32px);
  background: radial-gradient(circle at 50% 30%, #17221d, var(--bg) 70%);
  text-align: center;
}
.logo {
  width: 76px;
  height: 76px;
  border-radius: 22px;
  display: grid;
  place-items: center;
  background: rgba(61, 220, 151, 0.12);
  color: var(--accent);
}
.intro h1 {
  margin: 0;
  font-size: 34px;
  letter-spacing: -0.02em;
}
.intro p {
  margin: 0;
  max-width: 34ch;
  color: var(--muted);
  line-height: 1.5;
}
.intro .error {
  color: var(--warn);
}
.intro .fine {
  font-size: 13px;
}
.primary {
  margin-top: 10px;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  border: 0;
  border-radius: 999px;
  padding: 15px 28px;
  font-size: 17px;
  font-weight: 700;
  background: var(--accent);
  color: #04130c;
}
.link {
  border: 0;
  background: none;
  color: var(--accent);
  font-weight: 600;
  padding: 8px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
