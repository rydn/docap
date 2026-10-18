<script setup lang="ts">
import { computed, ref } from 'vue'
import { exportPages } from '@/export/zip'
import { useQueue } from '@/stores/queue'
import Icon from './Icon.vue'

const emit = defineEmits<{ close: []; edit: [id: string] }>()
const queue = useQueue()
const busy = ref(false)
const message = ref<string | null>(null)
const confirmDelete = ref(false)

const count = computed(() => queue.selected.length)
const allSelected = computed(() => queue.ready.length > 0 && count.value === queue.ready.length)

async function download(): Promise<void> {
  busy.value = true
  message.value = null
  try {
    const name = await exportPages(queue.selected.map((i) => ({ page: i.record!.page, createdAt: i.record!.createdAt })))
    message.value = `Saved ${name}`
  } catch (e) {
    message.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function removeSelected(): Promise<void> {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    setTimeout(() => (confirmDelete.value = false), 3000)
    return
  }
  confirmDelete.value = false
  await queue.removeMany(queue.selected.map((i) => i.id))
  if (!queue.items.length) emit('close')
}
</script>

<template>
  <div class="sheet" role="dialog" aria-label="Scanned pages">
    <header>
      <button class="icon" aria-label="Back to camera" @click="emit('close')"><Icon name="close" /></button>
      <h2>{{ queue.items.length }} page{{ queue.items.length === 1 ? '' : 's' }}</h2>
      <button class="text" :disabled="!queue.ready.length" @click="queue.selectAll(!allSelected)">{{ allSelected ? 'Select none' : 'Select all' }}</button>
    </header>

    <p v-if="queue.persistError" class="warn">Pages could not be saved to this device's storage ({{ queue.persistError }}). Download them before closing the tab.</p>

    <ol v-if="queue.items.length" class="grid">
      <li v-for="(item, i) in queue.items" :key="item.id" :class="[item.status, { selected: item.selected }]">
        <button class="thumb" :disabled="item.status !== 'ready'" :aria-label="`Edit page ${i + 1}`" @click="emit('edit', item.id)">
          <img v-if="item.thumbUrl" :src="item.thumbUrl" alt="" />
          <span v-else-if="item.status === 'processing'" class="spinner" />
          <span v-else class="err">{{ item.error ?? 'Failed' }}</span>
        </button>
        <span class="num">{{ i + 1 }}</span>
        <label v-if="item.status === 'ready'" class="check" :aria-label="`Select page ${i + 1}`">
          <input v-model="item.selected" type="checkbox" />
          <span><Icon name="check" :size="14" /></span>
        </label>
        <div v-if="item.status === 'ready'" class="order">
          <button :disabled="i === 0" aria-label="Move earlier" @click="queue.move(item.id, -1)"><Icon name="left" :size="16" /></button>
          <button :disabled="i === queue.items.length - 1" aria-label="Move later" @click="queue.move(item.id, 1)"><Icon name="right" :size="16" /></button>
        </div>
      </li>
    </ol>
    <p v-else class="empty">No pages yet. Point the camera at a document.</p>

    <footer>
      <p v-if="message" class="msg" role="status">{{ message }}</p>
      <div class="actions">
        <button class="danger" :disabled="!count" @click="removeSelected">
          <Icon name="trash" />
          {{ confirmDelete ? `Delete ${count}?` : 'Delete' }}
        </button>
        <button class="primary" :disabled="!count || busy" @click="download">
          <Icon name="download" />
          {{ busy ? 'Preparing…' : count > 1 ? `Download ZIP (${count})` : count === 1 ? 'Download page' : 'Download' }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  z-index: 10;
}
header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(var(--safe-top) + 10px) 12px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
h2 {
  flex: 1;
  margin: 0;
  font-size: 18px;
}
.icon {
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  display: grid;
  place-items: center;
}
.text {
  border: 0;
  background: none;
  color: var(--accent);
  font-weight: 600;
  padding: 10px;
}
.text:disabled {
  opacity: 0.4;
}
.warn {
  margin: 10px 16px 0;
  color: var(--warn);
  font-size: 14px;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 16px;
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 18px 14px;
  align-content: start;
}
li {
  position: relative;
}
.thumb {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  border: 2px solid transparent;
  background: #1a1e24;
  padding: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
}
li.selected .thumb {
  border-color: var(--accent);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #111;
}
.err {
  color: var(--danger);
  font-size: 13px;
  padding: 8px;
}
.num {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 6px;
  padding: 2px 7px;
}
.check {
  position: absolute;
  top: 6px;
  right: 6px;
}
.check input {
  position: absolute;
  opacity: 0;
  inset: 0;
}
.check span {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 2px solid #fff;
  background: rgba(0, 0, 0, 0.45);
  color: transparent;
}
.check input:checked + span {
  background: var(--accent);
  border-color: var(--accent);
  color: #04130c;
}
.check input:focus-visible + span {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.order {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: flex;
  gap: 4px;
}
.order button {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 0;
  background: rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
}
.order button:disabled {
  opacity: 0.3;
}
.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--muted);
}
footer {
  padding: 12px 16px calc(var(--safe-bottom) + 14px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.msg {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--muted);
  text-align: center;
}
.actions {
  display: flex;
  gap: 10px;
}
.actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 12px;
  padding: 14px 16px;
  font-weight: 700;
  font-size: 16px;
}
.actions button:disabled {
  opacity: 0.4;
}
.primary {
  flex: 1;
  background: var(--accent);
  color: #04130c;
}
.danger {
  background: rgba(255, 92, 92, 0.15);
  color: var(--danger);
}
</style>
