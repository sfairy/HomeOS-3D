<!--
  安防「区域配置」面板。可关联 HA 房间、绑定传感器、从房间一键生成区域、
  保存配置（同步后端 + 镜像到布局待保存）。
-->
<template>
  <div class="sov-config">
    <div class="sov-config__toolbar">
      <p class="sov-config__hint">{{ '关联 HA 房间并绑定传感器，定义布防时的告警分组' }}</p>
      <div class="sov-config__actions">
        <button
          type="button"
          class="sec-dash-btn sec-dash-btn--ghost"
          :disabled="roomsLoading"
          @click="refreshRooms"
        >
          <RefreshCw :class="['w-3.5 h-3.5', roomsLoading && 'animate-spin']" />
          <span>{{ roomsLoading ? '同步中' : '刷新房间' }}</span>
        </button>
        <button
          type="button"
          class="sec-dash-btn sec-dash-btn--ghost-warn"
          :disabled="roomsLoading"
          @click="handleGenerateFromRooms"
        >
          <Sparkles class="w-3.5 h-3.5" />
          <span>{{ '从房间生成' }}</span>
        </button>
        <button type="button" class="sec-dash-btn sec-dash-btn--ghost" @click="handleAddZone">
          <Plus class="w-3.5 h-3.5" />
          <span>{{ '添加' }}</span>
        </button>
        <button
          type="button"
          class="sec-dash-btn sec-dash-btn--primary sov-zones__save"
          :disabled="saving"
          @click="saveZones"
        >
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </div>

    <p v-if="syncError" class="sov-config__msg sov-config__msg--err">{{ syncError }}</p>
    <p v-if="savedOk" class="sov-config__msg sov-config__msg--ok">{{ '区域配置已同步' }}</p>

    <SecurityZoneEditorList
      ref="editorRef"
      v-model="localZones"
      :editable="true"
      embedded
      fill-height
      :show-hint="false"
      :show-toolbar="false"
      :show-inline-add="false"
      :show-empty-actions="false"
      @request-generate="handleGenerateFromRooms"
      @request-add="handleAddZone"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { Plus, RefreshCw, Sparkles } from '@lucide/vue'
import SecurityZoneEditorList from '@/features/security/ZoneEditorList.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { postSecurityZones, prepareZonesForSave } from '@/shared/security/utils/zones-api.util'
import {
  getSecurityPanelZonesFromLayout,
  mirrorSecurityPanelZonesToLayout,
} from '@/shared/security/utils/panel-layout.util'
import { useSecurityZoneRooms } from '@/features/security/composables/useSecurityZoneRooms'

const props = defineProps({
  backendZones: { type: Array, default: () => [] },
  //: 后端 /status 是否已完成首次加载：加载完成后后端区域是唯一数据源，
  //: 不能再回退布局，否则删除最后一组区域后会被布局重新“复活”。
  backendReady: { type: Boolean, default: false },
  focusZoneId: { type: String, default: '' },
})

const emit = defineEmits(['saved'])

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
// 内嵌编辑器实例引用，用于调用 addZone / focusZoneById
const editorRef = ref(null)
// 本地编辑中的区域列表（保存后才同步到后端/布局）
const localZones = ref([])
// 保存中标记，控制按钮 disabled 与文案
const saving = ref(false)
// 保存错误文案，非空时显示错误提示
const syncError = ref('')
// 保存成功标记，用于显示成功提示
const savedOk = ref(false)

const {
  refreshRooms,
  roomsLoading,
  handleGenerateFromRooms: generateFromRooms,
} = useSecurityZoneRooms()

// 将任意原始区域对象归一化为带 id/name/zoneType/sensors/roomId 的标准结构
function normalizeZone(raw) {
  return {
    id: raw.id || `zone-${Date.now()}`,
    name: raw.name || '',
    zoneType: raw.zoneType || 'all',
    sensors: Array.isArray(raw.sensors) ? [...raw.sensors] : [],
    roomId: raw.roomId || '',
  }
}

// 合并后端 roomId：当本地缺少 roomId 但后端有时回填，避免覆盖用户已选房间
function mergeBackendRoomIds(zones) {
  const backendById = new Map((props.backendZones || []).map((z) => [z.id, z]))
  return zones.map((z) => {
    const norm = normalizeZone(z)
    const backend = backendById.get(norm.id)
    if (backend?.roomId && !norm.roomId) norm.roomId = backend.roomId
    return norm
  })
}

// 优先取后端区域（权威）；后端尚未加载完成时回退布局，仅用于首次 bootstrap。
function zonesFromLayout() {
  if (props.backendReady) {
    return mergeBackendRoomIds(props.backendZones || [])
  }
  const layoutZones = getSecurityPanelZonesFromLayout(layoutStore.layoutConfig)
  if (layoutZones.length) {
    return mergeBackendRoomIds(layoutZones)
  }
  return mergeBackendRoomIds(props.backendZones || [])
}

// 工具栏「添加」按钮：委托编辑器实例添加空白区域
function handleAddZone() {
  editorRef.value?.addZone()
}

// 工具栏「从房间生成」：调用 composable 用 HA 房间填充 localZones
function handleGenerateFromRooms() {
  generateFromRooms(localZones)
}

// 保存区域配置：成功后镜像到布局并通知用户
async function saveZones() {
  saving.value = true
  syncError.value = ''
  savedOk.value = false
  const payload = prepareZonesForSave(
    localZones.value.map((z) => ({
      id: z.id,
      name: z.name?.trim() || '未命名区域',
      zoneType: z.zoneType || 'all',
      sensors: z.sensors || [],
      roomId: z.roomId || undefined,
    })),
  )
  try {
    await postSecurityZones(payload)
    // 镜像到布局配置（标记待保存），便于用户后续整体保存布局
    const mirrored = mirrorSecurityPanelZonesToLayout(layoutStore, payload)
    savedOk.value = true
    chrome.notify(mirrored ? '安防区域已保存（布局已标记待保存）' : '安防区域已保存', 'success')
    emit('saved')
  } catch (e) {
    syncError.value = getApiErrorMessage(e, '保存失败')
  } finally {
    saving.value = false
  }
}

// 初始化：从布局或后端派生本地区域列表
onMounted(() => {
  localZones.value = zonesFromLayout()
})

// 后端首次加载完成时以后端为准重载：加载前用布局做 bootstrap，加载后
// 布局可能已过期（例如用户刚删掉最后一组区域）。
watch(
  () => props.backendReady,
  (isReady) => {
    if (isReady) localZones.value = zonesFromLayout()
  },
)

// 后端区域变化时同步 roomId：本地为空时整体重载，否则仅补齐缺失的 roomId
watch(
  () => props.backendZones,
  (backend) => {
    if (!localZones.value.length) {
      localZones.value = zonesFromLayout()
      return
    }
    if (!Array.isArray(backend) || !backend.length) return
    const byId = new Map(backend.map((z) => [z.id, z]))
    localZones.value = localZones.value.map((z) => {
      const row = byId.get(z.id)
      if (row?.roomId && !z.roomId) return { ...z, roomId: row.roomId }
      return z
    })
  },
  { deep: true },
)

// 父级指定聚焦区域时，转交给编辑器滚动定位
watch(
  () => props.focusZoneId,
  (id) => {
    if (id) focusZone(id)
  },
)

// 聚焦指定区域：委托编辑器实例完成滚动与高亮
function focusZone(zoneId) {
  editorRef.value?.focusZoneById(zoneId)
}

// 暴露本地区域与聚焦方法供父级调用
defineExpose({ layoutZones: localZones, focusZone })
</script>

<style scoped src="./styles/ZoneConfigPanel.css"></style>
