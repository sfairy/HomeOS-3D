<!--
  房间内实体顺序：HA 实体注册表没有顺序字段，这里写入本地覆盖（`ha_area_entity_order`）。
  只影响本项目的列表与语音候选顺序，不回写 HA。
-->
<template>
  <SettingsCard full static extra-class="rooms-entity-order-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <p class="font-semibold">{{ '房间内实体顺序' }}</p>
        <p class="text-xs opacity-60">
          {{ 'HA 实体没有顺序字段；这里只改本项目的展示顺序，不影响 HA。' }}
        </p>
      </div>
      <HosSelect
        variant="settings"
        class="w-44"
        :model-value="selectedAreaId"
        @update:model-value="(value) => selectArea(String(value))"
      >
        <option value="">{{ '选择房间' }}</option>
        <option v-for="room in rooms" :key="room.areaId" :value="room.areaId">{{ room.name }}</option>
      </HosSelect>
    </div>

    <div v-if="error" class="settings-note-box settings-note-box--danger mt-2">{{ error }}</div>

    <div v-if="selectedAreaId" class="mt-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs opacity-60">{{ `${items.length} 个实体` }}</span>
        <button type="button" class="settings-btn-ghost" :disabled="loading" @click="load">
          {{ loading ? '加载中…' : '重新加载' }}
        </button>
      </div>
      <ul v-if="items.length" class="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
        <li
          v-for="(item, index) in items"
          :key="item.id"
          class="flex items-center justify-between gap-2 rounded border border-white/10 px-2 py-1 text-sm"
        >
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <span class="flex gap-1">
            <button
              type="button"
              class="settings-btn-ghost"
              :disabled="index === 0 || saving"
              @click="move(index, -1)"
            >
              {{ '上移' }}
            </button>
            <button
              type="button"
              class="settings-btn-ghost"
              :disabled="index === items.length - 1 || saving"
              @click="move(index, 1)"
            >
              {{ '下移' }}
            </button>
          </span>
        </li>
      </ul>
      <p v-else-if="!loading" class="mt-2 text-sm opacity-70">{{ '该房间还没有实体。' }}</p>
    </div>
  </SettingsCard>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import SettingsCard from '@/features/settings/shell/SettingsCard.vue'
import HosSelect from '@/domain/entity/entity-select/HosSelect.vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { fetchEntities } from '@/domain/api/entities'
import { listHaAreas, sortHaAreaEntities } from '@/domain/api/ha'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { getEntityDisplayName } from '@/domain/entity/derived'

const chrome = useChromeStore()
const rooms = ref([])
const selectedAreaId = ref('')
const items = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')

async function loadRooms() {
  try {
    const { data } = await listHaAreas()
    rooms.value = data?.items || []
  } catch {
    rooms.value = []
  }
}

async function selectArea(areaId) {
  selectedAreaId.value = areaId
  items.value = []
  if (areaId) await load()
}

async function load() {
  if (!selectedAreaId.value) return
  loading.value = true
  error.value = ''
  try {
    // limit=0 表示全量：房间内实体通常几十个，一次取完才能整体排序。
    const { data } = await fetchEntities({ area: selectedAreaId.value, limit: 0 })
    const rows = Array.isArray(data?.entities) ? data.entities : []
    items.value = rows.map((entity) => {
      const id = String(entity.entity_id || '')
      return { id, label: getEntityDisplayName(id, entity) }
    })
  } catch (e) {
    error.value = getApiErrorMessage(e, '读取房间实体失败')
  } finally {
    loading.value = false
  }
}

async function move(index, delta) {
  const target = index + delta
  if (target < 0 || target >= items.value.length || saving.value) return
  const list = [...items.value]
  const [moved] = list.splice(index, 1)
  list.splice(target, 0, moved)
  items.value = list
  saving.value = true
  try {
    await sortHaAreaEntities(
      selectedAreaId.value,
      list.map((item) => item.id),
    )
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '保存顺序失败'), 'error')
    await load()
  } finally {
    saving.value = false
  }
}

onMounted(loadRooms)
</script>
