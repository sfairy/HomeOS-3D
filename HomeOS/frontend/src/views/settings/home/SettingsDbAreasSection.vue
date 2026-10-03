<!--
组件：SettingsDbAreasSection.vue
所属模块：frontend / src / views / settings / home
职责：竖屏房间（DB Area）区段。CRUD 本地房间目录、从 HA 区域导入、关联 HA 区域、
      绑定设备实体、按房间名自动推荐背景图。与 HA「房间目录」并行，管家优先读此处的设备绑定。
关键依赖：
  - SettingsCard / SettingsSectionHead / ApiQueryState：卡片、头部与加载态
  - EntityMultiSelect：设备实体多选
  - RoomReferenceBadges：引用范围徽章
  - fetchDbAreas / createDbArea / updateDbArea / deleteDbArea / importAreasFromHa：DB Area API
  - resolveRoomBackgroundUrl：按名称推荐背景图
  - useChromeStore：notify / confirm
  - useSystemConfig：读取 envSensorMap 判断是否绑环境传感器
数据来源：fetchDbAreas() 列表 + fetchAreasList() HA 区域 + systemConfigRef.envSensorMap
-->
<template>
  <div class="settings-hub-section settings-hub-section--fit">
    <SettingsCard full static extra-class="rooms-db-areas-card">
      <SettingsSectionHead
        title="竖屏房间（DB Area）"
        eyebrow="移动端 / 管家"
        description="与 HA「房间目录」并行：管家优先读此处的设备绑定；可关联 HA 区域以回退实体。"
        bordered
      />

      <div class="rooms-db-areas__toolbar">
        <button
          type="button"
          class="settings-btn-ghost text-xs"
          :disabled="loading || importing || saving"
          @click="load"
        >
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
        <button
          type="button"
          class="settings-btn-primary text-xs"
          :disabled="loading || importing || saving"
          @click="importFromHa"
        >
          {{ importing ? '导入中…' : '从 HA 导入' }}
        </button>
        <button
          type="button"
          class="settings-btn-primary text-xs"
          :disabled="loading || importing || saving"
          @click="openCreate"
        >
          {{ '新建房间' }}
        </button>
      </div>

      <ApiQueryState
        :loading="loading && !areas.length"
        :error="error"
        error-title="竖屏房间加载失败"
        tone="violet"
        @retry="load"
      >
        <p v-if="!areas.length && !editorOpen" class="rooms-db-areas__hint">
          暂无竖屏房间。可点「从 HA 导入」或「新建房间」。
        </p>

        <ul v-else-if="areas.length" class="rooms-db-areas__list">
          <li v-for="area in areas" :key="area.id" class="rooms-db-areas__item">
            <span class="rooms-db-areas__icon" aria-hidden="true">{{ area.icon || '🏠' }}</span>
            <div class="min-w-0 rooms-db-areas__body">
              <p class="rooms-db-areas__name">
                {{ area.name }}
                <RoomReferenceBadges :badges="badgesForArea(area)" />
              </p>
              <p class="rooms-db-areas__meta">
                {{ aliveCountForArea(area) }} 设备
                <template v-if="area.haAreaId"> · HA: {{ area.haAreaId }}</template>
                <template v-else> · 未关联 HA</template>
                <template v-if="area.backgroundUrl"> · 有背景</template>
              </p>
            </div>
            <div class="rooms-db-areas__actions">
              <button
                type="button"
                class="settings-btn-ghost text-xs"
                :disabled="saving"
                @click="openEdit(area)"
              >
                {{ '编辑' }}
              </button>
              <button
                type="button"
                class="settings-btn-ghost text-xs rooms-db-areas__del"
                :disabled="saving"
                @click="removeArea(area)"
              >
                {{ '删除' }}
              </button>
            </div>
          </li>
        </ul>
      </ApiQueryState>

      <form v-if="editorOpen" class="rooms-db-areas__editor" @submit.prevent="saveArea">
        <p class="rooms-db-areas__editor-title">{{ editingId ? '编辑房间' : '新建房间' }}</p>
        <label class="rooms-db-areas__field">
          {{ '名称' }}
          <input
            v-model="form.name"
            class="settings-field"
            type="text"
            maxlength="40"
            required
            @blur="suggestBackgroundFromName"
          />
        </label>
        <div class="rooms-db-areas__field">
          {{ '图标' }}
          <div class="rooms-db-areas__icons">
            <button
              v-for="ic in ICON_PRESETS"
              :key="ic"
              type="button"
              class="rooms-db-areas__icon-btn"
              :class="{ 'rooms-db-areas__icon-btn--on': form.icon === ic }"
              @click="form.icon = ic"
            >
              {{ ic }}
            </button>
          </div>
        </div>
        <label class="rooms-db-areas__field">
          {{ '背景图 URL（可选）' }}
          <input
            v-model="form.backgroundUrl"
            class="settings-field"
            type="text"
            placeholder="/room_images/… 或自定义 URL"
          />
        </label>
        <label class="rooms-db-areas__field">
          {{ '关联 HA 区域（可选）' }}
          <select v-model="form.haAreaId" class="settings-field" @change="suggestBackgroundFromName">
            <option value="">不关联</option>
            <option v-for="ha in haAreas" :key="ha.id" :value="ha.id">
              {{ ha.name }} ({{ ha.id }})
            </option>
          </select>
        </label>
        <div class="rooms-db-areas__field">
          {{ '绑定设备' }}
          <EntityMultiSelect
            v-model="form.entityIds"
            :allowed-domains="[]"
            placeholder="搜索并选择实体（可多选）"
          />
          <div v-if="formGhostIds.length" class="rooms-db-areas__ghost">
            <p>
              检测到 {{ formGhostIds.length }} 个幽灵实体（HA 中已删除或不可用）：
              {{ formGhostIds.join('、') }}
            </p>
            <button
              type="button"
              class="settings-btn-ghost text-xs rooms-db-areas__del"
              @click="clearFormGhosts"
            >
              {{ '一键清除非法实体' }}
            </button>
          </div>
        </div>
        <div class="rooms-db-areas__editor-actions">
          <button type="button" class="settings-btn-ghost text-xs" @click="closeEditor">
            {{ '取消' }}
          </button>
          <button type="submit" class="settings-btn-primary text-xs" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>

      <p class="rooms-db-areas__foot">
        「从 HA 导入」会按房间名自动匹配
        <code>/room_images/*</code> 默认背景。管家在有 DB 房间时优先使用本目录。
      </p>
    </SettingsCard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import { resolveRoomBackgroundUrl } from '@homeos/shared'
import { notifyError } from '@/services/notify'
import { fetchAreasList } from '@/services/api/entities'
import {
  type AreaRow,
  createDbArea,
  deleteDbArea,
  fetchDbAreas,
  importAreasFromHa,
  updateDbArea,
  updateDbAreaEntities,
} from '@/services/api/areas'
import { useChromeStore } from '@/stores/chrome.store'
import { systemConfigRef, useSystemConfig } from '@/composables/config/system-config-core.internals'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import RoomReferenceBadges from '@/views/settings/home/RoomReferenceBadges.vue'
import {
  buildRoomReferenceBadges,
  roomHasEnvSensors,
} from '@/utils/settings/room-reference-badges.util'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  countAliveEntities,
  filterGhostEntityIds,
} from '@/utils/entity/entity-alive.util'

// HA 区域选项
interface HaAreaOption {
  id: string
  name: string
}

// 房间图标预设
const ICON_PRESETS = ['🏠', '🛋', '🛏', '🍳', '🚿', '📚', '🌿', '🚪', '🏢', '💡']

const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
const { load: loadSystemConfig } = useSystemConfig()
// DB Area 列表与 HA 区域列表
const areas = ref<AreaRow[]>([])
const haAreas = ref<HaAreaOption[]>([])
// 加载/导入/保存状态与错误信息
const loading = ref(false)
const importing = ref(false)
const saving = ref(false)
const error = ref('')
// 编辑器开关与当前编辑房间 id
const editorOpen = ref(false)
const editingId = ref<string | null>(null)
// 编辑表单：名称/图标/背景图/HA 区域/绑定实体
const form = reactive({
  name: '',
  icon: '🏠',
  backgroundUrl: '',
  haAreaId: '',
  entityIds: [] as string[],
})

// 环境传感器映射：haAreaId → 传感器字段
const envSensorMap = computed(
  () => (systemConfigRef.value?.envSensorMap || {}) as Record<string, Record<string, unknown>>,
)

// 计算房间的引用范围徽章：环境（已绑传感器）/ 竖屏（始终）/ 管家（已绑实体）
function badgesForArea(area: AreaRow) {
  const haId = String(area.haAreaId || '').trim()
  const envEntry = haId ? envSensorMap.value[haId] : undefined
  const hasEnv = roomHasEnvSensors(envEntry)
  const entityCount = countAliveEntities(area.entities, entitiesStore.entities)
  return buildRoomReferenceBadges({
    hasEnv,
    hasMobileArea: true,
    hasAgentArea: entityCount > 0,
  })
}

/** 编辑表单中的幽灵实体 ID */
const formGhostIds = computed(() =>
  filterGhostEntityIds(form.entityIds, entitiesStore.entities),
)

function aliveCountForArea(area: AreaRow): number {
  return countAliveEntities(area.entities, entitiesStore.entities)
}

/** 一键清除编辑表单中的幽灵实体 */
function clearFormGhosts() {
  const ghosts = new Set(formGhostIds.value)
  if (!ghosts.size) return
  form.entityIds = form.entityIds.filter((id) => !ghosts.has(id))
  chrome.notify(`已清除 ${ghosts.size} 个失效实体`, 'success')
}

// 加载 DB Area 列表
async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data } = await fetchDbAreas()
    areas.value = Array.isArray(data) ? data : []
  } catch (e: unknown) {
    error.value = '加载竖屏房间失败'
    notifyError(e, '加载竖屏房间失败')
  } finally {
    loading.value = false
  }
}

// 加载 HA 区域列表（用于关联下拉，失败静默回退空数组）
async function loadHaAreas() {
  try {
    const { data } = await fetchAreasList<HaAreaOption[]>()
    haAreas.value = Array.isArray(data) ? data : []
  } catch {
    haAreas.value = []
  }
}

// 从 HA 导入房间：按名称自动匹配并补链实体
async function importFromHa() {
  importing.value = true
  error.value = ''
  try {
    const { data } = await importAreasFromHa({ seedEntities: true })
    chrome.notify(
      `导入完成：新建 ${data?.created ?? 0}，补链 ${data?.linked ?? 0}，共 ${data?.total ?? 0}`,
      'success',
    )
    await load()
  } catch (e: unknown) {
    notifyError(e, '从 HA 导入失败')
  } finally {
    importing.value = false
  }
}

// 按房间名/HA 区域 id 推荐背景图（用户未填时才推荐）
function suggestBackgroundFromName() {
  if (form.backgroundUrl.trim()) return
  const suggested =
    resolveRoomBackgroundUrl(form.name) || resolveRoomBackgroundUrl(form.haAreaId)
  if (suggested) form.backgroundUrl = suggested
}

// 打开新建房间编辑器：重置表单
function openCreate() {
  editingId.value = null
  form.name = ''
  form.icon = '🏠'
  form.backgroundUrl = ''
  form.haAreaId = ''
  form.entityIds = []
  editorOpen.value = true
}

// 打开编辑现有房间：回填表单（含背景图自动推荐）
function openEdit(area: AreaRow) {
  editingId.value = area.id
  form.name = area.name
  form.icon = area.icon || '🏠'
  form.backgroundUrl =
    area.backgroundUrl ||
    resolveRoomBackgroundUrl(area.name) ||
    resolveRoomBackgroundUrl(area.haAreaId || '') ||
    ''
  form.haAreaId = area.haAreaId || ''
  form.entityIds = (area.entities || []).map((e) => e.entityId)
  editorOpen.value = true
}

// 关闭编辑器
function closeEditor() {
  editorOpen.value = false
}

// 保存房间：校验名称后区分新建/更新；保存后刷新列表
async function saveArea() {
  const name = form.name.trim()
  if (!name) {
    chrome.notify('请输入房间名称', 'warning')
    return
  }
  const payload = {
    name,
    icon: form.icon,
    backgroundUrl: form.backgroundUrl.trim() || null,
    haAreaId: form.haAreaId.trim() || null,
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateDbArea(editingId.value, payload)
      await updateDbAreaEntities(editingId.value, form.entityIds)
      chrome.notify('房间已更新', 'success')
    } else {
      await createDbArea({
        ...payload,
        entityIds: form.entityIds,
      })
      chrome.notify('房间已创建', 'success')
    }
    editorOpen.value = false
    await load()
  } catch (e: unknown) {
    notifyError(e, editingId.value ? '更新房间失败' : '创建房间失败')
  } finally {
    saving.value = false
  }
}

// 删除房间：二次确认后调用 API，成功后关闭编辑器（若正在编辑该房间）并刷新
async function removeArea(area: AreaRow) {
  const ok = await chrome.confirm(`删除房间「${area.name}」？`, '删除房间', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await deleteDbArea(area.id)
    chrome.notify('房间已删除', 'success')
    if (editingId.value === area.id) closeEditor()
    await load()
  } catch (e: unknown) {
    notifyError(e, '删除房间失败')
  }
}

// 挂载时并行加载 DB Area、HA 区域、系统配置
onMounted(() => {
  void load()
  void loadHaAreas()
  void loadSystemConfig().catch(() => null)
})

// 暴露刷新方法与房间数（供父级调用）
defineExpose({ load, areaCount: () => areas.value.length })
</script>

<style scoped>
.rooms-db-areas__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 14px;
}

.rooms-db-areas__hint,
.rooms-db-areas__err,
.rooms-db-areas__foot {
  margin: 0;
  font-size: var(--premium-fs-caption);
  line-height: 1.45;
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}

.rooms-db-areas__err {
  color: var(--set-danger, #f87171);
}

.rooms-db-areas__list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rooms-db-areas__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid var(--premium-border, rgba(255, 255, 255, 0.1));
  background: rgba(0, 0, 0, 0.18);
}

.rooms-db-areas__body {
  flex: 1;
}

.rooms-db-areas__icon {
  font-size: 1.25rem;
  line-height: 1;
}

.rooms-db-areas__name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
  color: var(--set-text-primary);
}

.rooms-db-areas__meta {
  margin: 2px 0 0;
  font-size: var(--set-fs-micro, 12px);
  color: var(--set-text-tertiary, rgba(255, 255, 255, 0.4));
}

.rooms-db-areas__actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}

.rooms-db-areas__del {
  color: var(--set-danger, #f87171);
}

.rooms-db-areas__editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0 0 14px;
  padding: 14px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid var(--premium-border, rgba(255, 255, 255, 0.12));
  background: rgba(0, 0, 0, 0.22);
}

.rooms-db-areas__editor-title {
  margin: 0;
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
  color: var(--set-text-primary);
}

.rooms-db-areas__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--set-fs-micro, 12px);
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.55));
}

.rooms-db-areas__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rooms-db-areas__icon-btn {
  width: var(--touch-min, 44px);
  height: var(--touch-min, 44px);
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid var(--premium-border, rgba(255, 255, 255, 0.12));
  background: rgba(255, 255, 255, 0.04);
  font-size: 1.1rem;
  cursor: pointer;
}

.rooms-db-areas__icon-btn--on {
  border-color: var(--accent, #0a84ff);
  background: rgba(10, 132, 255, 0.18);
}

.rooms-db-areas__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.rooms-db-areas__foot code {
  font-size: 0.9em;
}

.rooms-db-areas__ghost {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline) solid color-mix(in srgb, var(--set-danger, #f87171) 45%, transparent);
  background: color-mix(in srgb, var(--set-danger, #f87171) 12%, transparent);
  font-size: var(--set-fs-micro, 12px);
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.7));
}

.rooms-db-areas__ghost p {
  margin: 0;
  word-break: break-all;
}
</style>
