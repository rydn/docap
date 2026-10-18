<script setup lang="ts">
import { computed } from 'vue'
import type { CaptureState } from '@/pipeline/autocapture'
import type { Quad } from '@/pipeline/types'

const props = defineProps<{
  quad: Quad | null
  width: number
  height: number
  state: CaptureState
  progress: number
}>()

// Quad corners are pixel-edge coordinates of the analysis frame; the viewBox spans the
// frame exactly, and `slice` reproduces object-fit: cover on the video underneath.
const points = computed(() => props.quad?.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(' ') ?? '')
const perimeter = computed(() => {
  const q = props.quad
  if (!q) return 0
  let s = 0
  for (let i = 0; i < 4; i++) s += Math.hypot(q[(i + 1) % 4]!.x - q[i]!.x, q[(i + 1) % 4]!.y - q[i]!.y)
  return s
})
const stroke = computed(() => Math.max(2, Math.hypot(props.width, props.height) / 260))
const tone = computed(() => (props.state === 'captured' ? 'done' : props.state === 'holding' || props.state === 'capturing' ? 'hold' : 'track'))
</script>

<template>
  <svg class="overlay" :viewBox="`0 0 ${width || 1} ${height || 1}`" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g v-if="quad" :class="['quad', tone]">
      <polygon class="fill" :points="points" />
      <polygon class="edge" :points="points" :stroke-width="stroke" />
      <polygon
        class="progress"
        :points="points"
        :stroke-width="stroke * 1.6"
        :stroke-dasharray="perimeter"
        :stroke-dashoffset="perimeter * (1 - progress)"
      />
      <circle v-for="(p, i) in quad" :key="i" class="corner" :cx="p.x + 0.5" :cy="p.y + 0.5" :r="stroke * 2.2" />
    </g>
  </svg>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.quad polygon,
.quad circle {
  transition: fill 0.2s, stroke 0.2s;
}
.fill {
  fill: rgba(61, 220, 151, 0.14);
}
.edge {
  fill: none;
  stroke: rgba(255, 255, 255, 0.9);
  stroke-linejoin: round;
}
.progress {
  fill: none;
  stroke: var(--accent);
  stroke-linejoin: round;
  stroke-linecap: round;
}
.corner {
  fill: #fff;
}
.track .fill {
  fill: rgba(255, 255, 255, 0.1);
}
.hold .edge {
  stroke: var(--accent);
}
.done .fill {
  fill: rgba(61, 220, 151, 0.16);
}
.done .edge,
.done .progress {
  stroke: var(--accent);
}
.done .corner {
  fill: var(--accent);
}
</style>
