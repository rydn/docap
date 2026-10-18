import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { EnhanceMode } from '@/pipeline/process'

const KEY = 'docap:settings'

interface Persisted {
  autoCapture: boolean
  enhance: EnhanceMode
  highResStill: boolean
  snapPaper: boolean
  sound: boolean
}

const DEFAULTS: Persisted = { autoCapture: true, enhance: 'color', highResStill: true, snapPaper: true, sound: true }

function load(): Persisted {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const useSettings = defineStore('settings', () => {
  const initial = load()
  const autoCapture = ref(initial.autoCapture)
  const enhance = ref<EnhanceMode>(initial.enhance)
  const highResStill = ref(initial.highResStill)
  const snapPaper = ref(initial.snapPaper)
  const sound = ref(initial.sound)

  watch([autoCapture, enhance, highResStill, snapPaper, sound], () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ autoCapture: autoCapture.value, enhance: enhance.value, highResStill: highResStill.value, snapPaper: snapPaper.value, sound: sound.value }),
      )
    } catch {
      /* storage unavailable (private mode) */
    }
  })

  return { autoCapture, enhance, highResStill, snapPaper, sound }
})
