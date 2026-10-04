<!--
组件：SecurityZoneConfigPanel.vue
所属模块：frontend / src / views / security
职责：安防「区域配置」面板。管理员可关联 HA 房间、绑定传感器、从房间一键生成区域、
      保存配置（同步后端 + 镜像到布局待保存）；非管理员只读查看。
关键依赖：
  - SecurityZoneEditorList：内嵌的区域编辑器
  - useSecurityZoneRooms：HA 房间同步与一键生成
  - postSecurityZones / prepareZonesForSave：保存到后端
  - mirrorSecurityPanelZonesToLayout：将后端区域镜像到布局配置
  - useChromeStore / useLayoutStore / useAuthStore：通知、布局、权限
数据来源：layoutStore 布局配置 + 后端 backendZones，本地编辑缓存于 localZones
-->
<template>
  <div class="sov-config">
    <div v-if="authStore.role === 'admin'" class="sov-config__toolbar">
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
    <p v-else class="sov-config__hint sov-config__hint--readonly">
      {{ '当前为只读视图，区域配置需管理员在安防总览中编辑' }}
    </p>

    <p v-if="syncError" class="sov-config__msg sov-config__msg--err">{{ syncError }}</p>
    <p v-if="savedOk" class="sov-config__msg sov-config__msg--ok">{{ '区域配置已同步' }}</p>

    <SecurityZoneEditorList
      ref="editorRef"
      v-model="localZones"
      :editable="authStore.role === 'admin'"
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
import SecurityZoneEditorList from '@/views/security/ZoneEditorList.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { postSecurityZones, prepareZonesForSave } from '@/utils/security/zones-api.util'
import {
  getSecurityPanelZonesFromLayout,
  mirrorSecurityPanelZonesToLayout,
} from '@/utils/security/panel-layout.util'
import { useSecurityZoneRooms } from '@/composables/security/useSecurityZoneRooms'

// 入参：后端区域列表、需聚焦的区域 ID
const props = defineProps({
  backendZones: { type: Array, default: () => [] },
  focusZoneId: { type: String, default: '' },
})

// 对外事件：保存成功后通知父级（通常触发刷新）
const emit = defineEmits(['saved'])

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const authStore = useAuthStore()
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

// 优先从布局配置派生区域；布局缺失时回退到后端区域
function zonesFromLayout() {
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

// 保存区域配置：仅管理员可执行；成功后镜像到布局并通知用户
async function saveZones() {
  if (authStore.role !== 'admin') return
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
