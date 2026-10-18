import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import type { EnhanceMode } from '@/pipeline/process'
import type { Quad } from '@/pipeline/types'

/** A scanned page as persisted in IndexedDB. */
export interface PageRecord {
  id: string
  createdAt: number
  page: Blob
  thumb: Blob
  still: Blob
  width: number
  height: number
  stillWidth: number
  stillHeight: number
  quad: Quad
  rotation: number
  enhance: EnhanceMode
}

/** In-memory view of a page: record plus object URLs, or a placeholder while processing. */
export interface QueueItem {
  id: string
  createdAt: number
  status: 'processing' | 'ready' | 'error'
  error?: string
  record?: PageRecord
  thumbUrl?: string
  selected: boolean
}

const INDEX_KEY = 'index'

let idbStore: UseStore | null = null
function store(): UseStore {
  return (idbStore ??= createStore('docap', 'pages'))
}

export const newId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const useQueue = defineStore('queue', () => {
  const items = ref<QueueItem[]>([])
  const loaded = ref(false)
  const persistError = shallowRef<string | null>(null)

  const ready = computed(() => items.value.filter((i) => i.status === 'ready'))
  const selected = computed(() => ready.value.filter((i) => i.selected))
  const processing = computed(() => items.value.some((i) => i.status === 'processing'))

  async function saveIndex(): Promise<void> {
    try {
      await set(INDEX_KEY, items.value.filter((i) => i.status === 'ready').map((i) => i.id), store())
      persistError.value = null
    } catch (e) {
      persistError.value = (e as Error).message
    }
  }

  async function load(): Promise<void> {
    if (loaded.value) return
    loaded.value = true
    try {
      const ids = ((await get(INDEX_KEY, store())) as string[] | undefined) ?? []
      const records = await Promise.all(ids.map((id) => get(id, store()) as Promise<PageRecord | undefined>))
      const restored = records
        .filter((r): r is PageRecord => !!r)
        .map<QueueItem>((r) => ({ id: r.id, createdAt: r.createdAt, status: 'ready', record: r, thumbUrl: URL.createObjectURL(r.thumb), selected: true }))
      items.value = [...restored, ...items.value]
    } catch (e) {
      persistError.value = (e as Error).message
    }
  }

  /** Adds a placeholder shown while the worker processes the capture. */
  function begin(): string {
    const id = newId()
    items.value.push({ id, createdAt: Date.now(), status: 'processing', selected: true })
    return id
  }

  async function complete(id: string, record: Omit<PageRecord, 'id' | 'createdAt'>): Promise<void> {
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    const full: PageRecord = { ...record, id, createdAt: item.createdAt }
    item.record = full
    item.thumbUrl = URL.createObjectURL(full.thumb)
    item.status = 'ready'
    try {
      await set(id, full, store())
      await saveIndex()
    } catch (e) {
      persistError.value = (e as Error).message
    }
  }

  function fail(id: string, message: string): void {
    const item = items.value.find((i) => i.id === id)
    if (!item) return
    item.status = 'error'
    item.error = message
    setTimeout(() => remove(id), 4000)
  }

  async function update(id: string, patch: Partial<PageRecord>): Promise<void> {
    const item = items.value.find((i) => i.id === id)
    if (!item?.record) return
    if (patch.thumb && item.thumbUrl) URL.revokeObjectURL(item.thumbUrl)
    item.record = { ...item.record, ...patch }
    if (patch.thumb) item.thumbUrl = URL.createObjectURL(patch.thumb)
    await set(id, item.record, store())
  }

  async function remove(id: string): Promise<void> {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx < 0) return
    const [item] = items.value.splice(idx, 1)
    if (item?.thumbUrl) URL.revokeObjectURL(item.thumbUrl)
    await del(id, store()).catch(() => undefined)
    await saveIndex()
  }

  async function removeMany(ids: string[]): Promise<void> {
    for (const id of ids) await remove(id)
  }

  function move(id: string, delta: number): void {
    const i = items.value.findIndex((x) => x.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= items.value.length) return
    const [it] = items.value.splice(i, 1)
    items.value.splice(j, 0, it!)
    void saveIndex()
  }

  function selectAll(on: boolean): void {
    for (const i of items.value) i.selected = on
  }

  return { items, ready, selected, processing, loaded, persistError, load, begin, complete, fail, update, remove, removeMany, move, selectAll }
})
