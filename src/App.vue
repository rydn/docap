<script setup lang="ts">
import { onMounted, ref } from 'vue'
import CameraView from './components/CameraView.vue'
import PageEditor from './components/PageEditor.vue'
import QueueSheet from './components/QueueSheet.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import { useQueue } from './stores/queue'

const queue = useQueue()
const showQueue = ref(false)
const showSettings = ref(false)
const editing = ref<string | null>(null)

onMounted(() => void queue.load())
</script>

<template>
  <CameraView @open-queue="showQueue = true" @open-settings="showSettings = true" />
  <transition name="slide">
    <QueueSheet v-if="showQueue" @close="showQueue = false" @edit="editing = $event" />
  </transition>
  <PageEditor v-if="editing" :id="editing" @close="editing = null" />
  <SettingsSheet v-if="showSettings" @close="showSettings = false" />
</template>

<style>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateY(100%);
}
</style>
