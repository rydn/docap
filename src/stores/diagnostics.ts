import { reactive } from 'vue'

/** Live pipeline stats, shown in Settings so performance can be checked on a real phone. */
export const diagnostics = reactive({
  backend: '',
  loadMs: 0,
  detectMs: 0,
  fps: 0,
  frame: '',
  video: '',
  lastCaptureMs: 0,
})
