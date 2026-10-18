<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { EnhanceMode } from '@/pipeline/process'
import type { Point, Quad } from '@/pipeline/types'
import { useQueue } from '@/stores/queue'
import { useSettings } from '@/stores/settings'
import { processorWorker } from '@/worker/client'
import Icon from './Icon.vue'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ close: [] }>()
const queue = useQueue()
const settings = useSettings()

const item = computed(() => queue.items.find((i) => i.id === props.id))
const record = item.value!.record!
const stillUrl = URL.createObjectURL(record.still)
const pageUrl = ref(URL.createObjectURL(record.page))
onBeforeUnmount(() => {
  URL.revokeObjectURL(stillUrl)
  URL.revokeObjectURL(pageUrl.value)
})

const view = ref<'page' | 'crop'>('page')
const quad = ref<Quad>(record.quad.map((p) => ({ ...p })) as Quad)
const rotation = ref(record.rotation)
const mode = ref<EnhanceMode>(record.enhance)
const saving = ref(false)
const error = ref<string | null>(null)
const dirty = computed(
  () => rotation.value !== record.rotation || mode.value !== record.enhance || quad.value.some((p, i) => p.x !== record.quad[i]!.x || p.y !== record.quad[i]!.y),
)

const svg = ref<SVGSVGElement | null>(null)
const dragging = ref<number | null>(null)
const loupe = ref<{ x: number; y: number; px: number; py: number } | null>(null)
const W = record.stillWidth
const H = record.stillHeight
// Frame the page with generous margin (fixed while editing so handles don't jump).
const frame = (() => {
  const xs = record.quad.map((p) => p.x)
  const ys = record.quad.map((p) => p.y)
  const m = 0.3 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const x0 = Math.max(0, Math.min(...xs) - m)
  const y0 = Math.max(0, Math.min(...ys) - m)
  return { x: x0, y: y0, w: Math.min(W, Math.max(...xs) + m) - x0, h: Math.min(H, Math.max(...ys) + m) - y0 }
})()
const handleR = computed(() => Math.max(frame.w, frame.h) / 40)

function toImage(e: PointerEvent): Point {
  const pt = svg.value!.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const p = pt.matrixTransform(svg.value!.getScreenCTM()!.inverse())
  return { x: Math.min(W - 0.5, Math.max(-0.5, p.x)), y: Math.min(H - 0.5, Math.max(-0.5, p.y)) }
}

function down(i: number, e: PointerEvent): void {
  dragging.value = i
  ;(e.target as Element).setPointerCapture(e.pointerId)
  move(e)
}
function move(e: PointerEvent): void {
  if (dragging.value === null) return
  const p = toImage(e)
  const q = [...quad.value] as Quad
  q[dragging.value] = p
  quad.value = q
  const rect = svg.value!.getBoundingClientRect()
  loupe.value = { x: e.clientX - rect.left, y: e.clientY - rect.top, px: (p.x + 0.5) / W, py: (p.y + 0.5) / H }
}
function up(): void {
  dragging.value = null
  loupe.value = null
}

const points = computed(() => quad.value.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' '))
const loupeStyle = computed(() => {
  const l = loupe.value
  if (!l || !svg.value) return {}
  const rect = svg.value.getBoundingClientRect()
  // Screen pixels per image pixel for the framed (meet) view, magnified 3x in the loupe.
  const s = Math.min(rect.width / frame.w, rect.height / frame.h) * 3
  const iw = W * s
  const ih = H * s
  return {
    left: `${l.x}px`,
    top: `${l.y - 90}px`,
    backgroundImage: `url(${stillUrl})`,
    backgroundSize: `${iw}px ${ih}px`,
    backgroundPosition: `${55 - l.px * iw}px ${55 - l.py * ih}px`,
  }
})

async function save(): Promise<void> {
  if (!dirty.value) return emit('close')
  saving.value = true
  error.value = null
  try {
    const out = await processorWorker().reprocess({
      still: record.still,
      quad: quad.value.map((p) => ({ ...p })) as Quad,
      rotation: rotation.value,
      options: { enhance: mode.value, snapPaper: settings.snapPaper },
    })
    await queue.update(props.id, {
      page: out.page,
      thumb: out.thumb,
      width: out.width,
      height: out.height,
      quad: quad.value.map((p) => ({ ...p })) as Quad,
      rotation: rotation.value,
      enhance: mode.value,
    })
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  await queue.remove(props.id)
  emit('close')
}

const modes: { id: EnhanceMode; label: string }[] = [
  { id: 'color', label: 'Color' },
  { id: 'gray', label: 'Gray' },
  { id: 'bw', label: 'B&W' },
  { id: 'original', label: 'Original' },
]
</script>

<template>
  <div class="editor" role="dialog" aria-label="Edit page">
    <header>
      <button class="icon" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
      <div class="seg">
        <button :class="{ on: view === 'page' }" @click="view = 'page'">Page</button>
        <button :class="{ on: view === 'crop' }" @click="view = 'crop'">Adjust crop</button>
      </div>
      <button class="icon danger" aria-label="Delete page" @click="remove"><Icon name="trash" /></button>
    </header>

    <div class="stage">
      <img v-if="view === 'page'" class="page" :src="pageUrl" :style="{ transform: `rotate(${(rotation - record.rotation) * 90}deg)` }" alt="Scanned page" />
      <svg v-else ref="svg" class="crop" :viewBox="`${frame.x} ${frame.y} ${frame.w} ${frame.h}`" preserveAspectRatio="xMidYMid meet" @pointermove="move" @pointerup="up" @pointercancel="up">
        <image :href="stillUrl" x="0" y="0" :width="W" :height="H" />
        <path class="shade" :d="`M0 0H${W}V${H}H0Z M${points.replaceAll(' ', ' L')}Z`" fill-rule="evenodd" />
        <polygon class="outline" :points="points" :stroke-width="handleR / 5" />
        <circle
          v-for="(p, i) in quad"
          :key="i"
          class="handle"
          :class="{ active: dragging === i }"
          :cx="p.x + 0.5"
          :cy="p.y + 0.5"
          :r="handleR"
          :stroke-width="handleR / 4"
          @pointerdown.prevent="down(i, $event)"
        />
      </svg>
      <div v-if="loupe" class="loupe" :style="loupeStyle"><span /></div>
    </div>

    <footer>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="tools">
        <button class="icon" aria-label="Rotate left" @click="rotation = (rotation + 3) % 4"><Icon name="rotateL" /></button>
        <div class="chips">
          <button v-for="m in modes" :key="m.id" :class="{ on: mode === m.id }" @click="mode = m.id">{{ m.label }}</button>
        </div>
        <button class="icon" aria-label="Rotate right" @click="rotation = (rotation + 1) % 4"><Icon name="rotateR" /></button>
      </div>
      <button class="primary" :disabled="saving" @click="save">{{ saving ? 'Applying…' : dirty ? 'Apply' : 'Done' }}</button>
    </footer>
  </div>
</template>

<style scoped>
.editor {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: #000;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: calc(var(--safe-top) + 8px) 8px 8px;
}
.icon {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
}
.danger {
  color: var(--danger);
}
.seg {
  display: flex;
  background: #1a1e24;
  border-radius: 10px;
  padding: 3px;
}
.seg button {
  border: 0;
  background: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-weight: 600;
  color: var(--muted);
}
.seg button.on {
  background: #2b313a;
  color: var(--fg);
}
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 10px;
  touch-action: none;
}
.page {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.2s;
  box-shadow: 0 6px 30px rgba(0, 0, 0, 0.6);
}
.crop {
  width: 100%;
  height: 100%;
}
.shade {
  fill: rgba(0, 0, 0, 0.5);
}
.outline {
  fill: none;
  stroke: var(--accent);
}
.handle {
  fill: rgba(61, 220, 151, 0.25);
  stroke: #fff;
  cursor: grab;
}
.handle.active {
  fill: rgba(61, 220, 151, 0.6);
}
.loupe {
  position: absolute;
  width: 110px;
  height: 110px;
  margin-left: -55px;
  margin-top: -55px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  background-repeat: no-repeat;
  pointer-events: none;
}
.loupe span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  border: 2px solid var(--accent);
}
footer {
  padding: 10px 14px calc(var(--safe-bottom) + 14px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg);
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 14px;
}
.tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chips {
  display: flex;
  gap: 6px;
}
.chips button {
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: none;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
}
.chips button.on {
  background: var(--fg);
  color: #000;
  border-color: var(--fg);
}
.primary {
  border: 0;
  border-radius: 12px;
  padding: 14px;
  font-weight: 700;
  font-size: 16px;
  background: var(--accent);
  color: #04130c;
}
.primary:disabled {
  opacity: 0.6;
}
</style>
