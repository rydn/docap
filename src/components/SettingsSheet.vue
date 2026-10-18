<script setup lang="ts">
import type { EnhanceMode } from '@/pipeline/process'
import { useSettings } from '@/stores/settings'
import Icon from './Icon.vue'

const emit = defineEmits<{ close: [] }>()
const settings = useSettings()

const modes: { id: EnhanceMode; label: string; desc: string }[] = [
  { id: 'color', label: 'Color', desc: 'White paper, shadows removed' },
  { id: 'gray', label: 'Grayscale', desc: 'Clean, small files' },
  { id: 'bw', label: 'Black & white', desc: 'Crisp text, like a fax' },
  { id: 'original', label: 'Original', desc: 'Cropped only, no filter' },
]
const version = __APP_VERSION__
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="panel" role="dialog" aria-label="Settings">
      <header>
        <h2>Settings</h2>
        <button class="icon" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
      </header>

      <h3>Default filter</h3>
      <div class="modes">
        <label v-for="m in modes" :key="m.id" :class="{ on: settings.enhance === m.id }">
          <input v-model="settings.enhance" type="radio" name="mode" :value="m.id" />
          <strong>{{ m.label }}</strong>
          <span>{{ m.desc }}</span>
        </label>
      </div>

      <h3>Capture</h3>
      <label class="row">
        <span>
          <strong>Auto-capture</strong>
          <small>Shoot when the page holds still; skip pages already captured</small>
        </span>
        <input v-model="settings.autoCapture" type="checkbox" role="switch" />
      </label>
      <label class="row">
        <span>
          <strong>Full-resolution photo</strong>
          <small>Use the camera's photo mode when the browser supports it</small>
        </span>
        <input v-model="settings.highResStill" type="checkbox" role="switch" />
      </label>
      <label class="row">
        <span>
          <strong>Snap to paper sizes</strong>
          <small>Exact A4 / Letter / Legal / ID-card proportions when close</small>
        </span>
        <input v-model="settings.snapPaper" type="checkbox" role="switch" />
      </label>
      <label class="row">
        <span>
          <strong>Shutter sound</strong>
        </span>
        <input v-model="settings.sound" type="checkbox" role="switch" />
      </label>
      <p class="fine">docap {{ version }} · runs entirely on your device</p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.panel {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  background: #14181d;
  border-radius: 18px 18px 0 0;
  padding: 8px 18px calc(var(--safe-bottom) + 18px);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h2 {
  margin: 0;
  font-size: 19px;
}
h3 {
  margin: 18px 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.icon {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  display: grid;
  place-items: center;
}
.modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.modes label {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}
.modes label.on {
  border-color: var(--accent);
  background: rgba(61, 220, 151, 0.08);
}
.modes input {
  position: absolute;
  opacity: 0;
}
.modes span {
  font-size: 13px;
  color: var(--muted);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.row span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row small {
  color: var(--muted);
}
.row input {
  width: 22px;
  height: 22px;
  accent-color: var(--accent);
  flex-shrink: 0;
}
.fine {
  margin: 18px 0 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
</style>
