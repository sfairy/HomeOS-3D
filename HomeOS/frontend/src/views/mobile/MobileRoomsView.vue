<!--
组件：MobileRoomsView.vue
所属模块：frontend / src / views
职责：移动端「房间」页——沉浸式房间页（壁纸 Hero 横滑 + 设备分类卡片纵向滚动），
      并完整保留房间 CRUD、实体绑定、HA 区域关联、背景图实景、排序与幽灵实体清理。
数据来源：
  - 房间列表来自 fetchDbAreas / createDbArea / updateDbArea / deleteDbArea / sortDbAreas；
  - HA 区域候选来自 fetchAreasList；
  - 实体显示名经 getEntityDisplayName 解析；
  - 背景图由 resolveRoomBackgroundUrl + AssetPickerModal 提供；
  - 温湿度与开灯统计由 utils/room/room-metrics.util 派生。
关键交互：
  - 上半区横向 scroll-snap 切房间（与下半区纵向滚动物理隔离）；
  - 分类卡片点击打开该类设备列表（底部 sheet），设备行点击进实体控制；
  - 右上「管理」入口：新建 / 编辑 / 房间排序 / 设备排序 / 删除（danger 二次确认）；
  - 路由 areaId 双向同步：外部 deep link 定位 slide，滑动后回写 query。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileRoomsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
 *  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端 Rooms 沉浸式房间页：Area CRUD / 实体绑定 / HA 关联 / 壁纸 Hero 微景观。
 *
 * 布局结构（height:100% 的 flex 列）：
 * - 上半区 横向 snap 视口（overflow-x:auto + overflow-y:hidden + contain:layout paint）；
 * - 下半区 纵向滚动面板（flex:1 / min-height:0 / touch-action:pan-y，不挂任何 touch 监听）。
 * 两侧通过「滚动轴 + 手势方向」天然解耦；页面根节点用负外边距中和 MobileLayout
 * 的 16px 内边距，使壁纸满幅。
 */
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Blinds,
  ChevronRight,
  Droplets,
  Fan,
  Lightbulb,
  Music,
  Pencil,
  Plug,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sun,
  Thermometer,
  Trash2,
  X,
} from '@lucide/vue'
import { ROOM_BACKGROUND_PRESETS, resolveRoomBackgroundUrl } from '@homeos/shared'
import { entityDomainColor, entityDomainLabel } from '@/constants/entity-domain-meta'
import { notifyError } from '@/services/notify'
import { useChromeStore } from '@/stores/chrome.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import { fetchAreasList } from '@/services/api/entities'
import {
  type AreaRow,
  createDbArea,
  deleteDbArea,
  fetchDbAreas,
  sortDbAreas,
  updateDbArea,
  updateDbAreaEntities,
} from '@/services/api/areas'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import {
  countAliveEntities,
  filterGhostEntityIds,
  isEntityAlive,
} from '@/utils/entity/entity-alive.util'
import {
  type RoomCategoryKey,
  type RoomMetricNumber,
  type RoomMetricsLookup,
  buildRoomCategories,
  isRoomEntityActive,
  readRoomHumidity,
  readRoomLightStats,
  readRoomTemperature,
} from '@/utils/room/room-metrics.util'

// 房间背景图素材选择弹层：异步加载避免首屏阻塞
const AssetPickerModal = defineAsyncComponent(
  () => import('@/components/common/AssetPickerModal.vue'),
)

/** HA 区域候选项：用于编辑表单的「关联 HA 区域」下拉。 */
interface HaAreaOption {
  id: string
  name: string
}

/** 设备列表行（分类 sheet 用） */
interface RoomDeviceRow {
  entityId: string
  name: string
  state: string
  domain: string
  active: boolean
}

// 房间图标预设：编辑表单中可点的快捷图标集合
const ICON_PRESETS = ['🏠', '🛋', '🛏', '🍳', '🚿', '📚', '🌿', '🚪', '🏢', '💡']

// 分类卡片图标：与 DeviceGroupModal 的域图标映射保持一致
const CATEGORY_ICONS: Record<RoomCategoryKey, unknown> = {
  lights: Sun,
  climate: Thermometer,
  media: Music,
  switch: Plug,
  cover: Blinds,
  other: Fan,
}

// 分类卡片图标配色：复用全站域语义色
const CATEGORY_COLORS: Record<RoomCategoryKey, string> = {
  lights: entityDomainColor('light'),
  climate: entityDomainColor('climate'),
  media: entityDomainColor('media_player'),
  switch: entityDomainColor('switch'),
  cover: entityDomainColor('cover'),
  other: entityDomainColor('remote'),
}

const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const router = useRouter()

const areas = ref<AreaRow[]>([])
const haAreas = ref<HaAreaOption[]>([])
const loading = ref(true)
const saving = ref(false)
const entitySortSaving = ref(false)

// 当前激活房间（上下两区共用同一份状态）
const activeIndex = ref(0)
// 记录「期望激活的房间 ID」，房间列表增删 / 重排后据此重新定位
const pinnedAreaId = ref('')
const slideDir = ref<'slide-next' | 'slide-prev'>('slide-next')
const heroViewportRef = ref<HTMLElement | null>(null)
/** 下半区纵向滚动容器（切房间时需要把滚动位置归零） */
const panelRef = ref<HTMLElement | null>(null)

// 浮层开关：管理入口 / 编辑表单 / 房间排序 / 设备排序 / 分类设备列表
const manageOpen = ref(false)
const editorOpen = ref(false)
const roomSortOpen = ref(false)
const entitySortOpen = ref(false)
const categoryKey = ref<RoomCategoryKey | null>(null)
const editingId = ref<string | null>(null)
const roomImagePickerOpen = ref(false)

// 房间排序草稿（保存前仅本地调整，点保存才落库）
const roomSortDraft = ref<string[]>([])
// 设备排序草稿
const entitySortDraft = ref<Array<{ entityId: string; name: string }>>([])

// 编辑表单：与房间字段一一对应，entityIds 为绑定实体 ID 列表
const form = reactive({
  name: '',
  icon: '🏠',
  backgroundUrl: '',
  haAreaId: '',
  entityIds: [] as string[],
})

// 横滑进行中标记：程序化滚动期间忽略 scroll 事件回写，避免 query 抖动
let scrollGuard = false
let scrollGuardTimer: ReturnType<typeof setTimeout> | null = null
// 上次横滑视口宽度：仅在宽度真正变化（横竖屏切换）时重新对齐，避免移动端
// 地址栏收放触发的高频 resize 反复挂起 scroll 回写
let lastViewportWidth = 0

/** 注入式实体查询口：读取动作本身建立细粒度响应式依赖（每房间实体量很小）。 */
const metricsLookup: RoomMetricsLookup = {
  get entities() {
    return entitiesStore.entities
  },
  getEntity: (entityId: string) => entitiesStore.getEntity(entityId),
  getEntityRevision: (entityId: string) => entitiesStore.getEntityRevision(entityId),
}

const activeArea = computed<AreaRow | null>(() => areas.value[activeIndex.value] || null)
const activeAreaId = computed(() => activeArea.value?.id || '')

/** 房间温湿度 / 开灯统计：按房间 id 一次性派生，避免模板内重复计算。 */
const roomMetrics = computed(() => {
  const statsMap = layoutStore.layoutConfig.mobileRoomStats
  const map: Record<
    string,
    { temp: RoomMetricNumber | null; humidity: string | null; lights: { on: number; total: number } }
  > = {}
  for (const area of areas.value) {
    const stats = statsMap?.[area.id]
    map[area.id] = {
      temp: readRoomTemperature(area.entities, stats, metricsLookup),
      humidity: readRoomHumidity(area.entities, stats, metricsLookup),
      lights: readRoomLightStats(area.entities, metricsLookup),
    }
  }
  return map
})

/** 当前房间存活设备行（幽灵不计入） */
const activeDevices = computed<RoomDeviceRow[]>(() => {
  const rows = activeArea.value?.entities || []
  const list: RoomDeviceRow[] = []
  for (const row of rows) {
    const entityId = String(row?.entityId || '').trim()
    if (!entityId) continue
    entitiesStore.getEntityRevision(entityId)
    if (!isEntityAlive(entityId, entitiesStore.entities)) continue
    const entity = entitiesStore.getEntity(entityId)
    const domain = entityId.split('.')[0]
    list.push({
      entityId,
      name: getEntityDisplayName(entityId, entity),
      state: entity?.state ?? '—',
      domain,
      active: isRoomEntityActive(entity, domain),
    })
  }
  return list
})

/** 当前房间分类卡片数据（count === 0 的分类不渲染） */
const activeCategories = computed(() =>
  buildRoomCategories(activeArea.value?.entities, metricsLookup),
)

/** 分类 sheet 对应的数据 */
const activeCategory = computed(
  () => activeCategories.value.find((cat) => cat.key === categoryKey.value) || null,
)

/** 分类 sheet 的设备列表 */
const activeCategoryDevices = computed<RoomDeviceRow[]>(() => {
  const cat = activeCategory.value
  if (!cat) return []
  const idSet = new Set(cat.entityIds)
  return activeDevices.value.filter((row) => idSet.has(row.entityId))
})

/** 编辑表单中已绑定但 HA/本地状态已失效的幽灵实体 */
const formGhostIds = computed(() =>
  filterGhostEntityIds(form.entityIds, entitiesStore.entities),
)

/** 编辑表单中绑定实体总数（用于排序列表） */
const formEntityCount = computed(() => form.entityIds.length)

/** 列表存活设备数 */
function aliveCountForArea(area: AreaRow): number {
  return countAliveEntities(area.entities, entitiesStore.entities)
}

/** Hero 背景：房间自定义 → 名称哈希 → HA 区域哈希（复用既有回退链） */
function heroBg(area: AreaRow): string {
  return (
    area.backgroundUrl ||
    resolveRoomBackgroundUrl(area.name) ||
    resolveRoomBackgroundUrl(area.haAreaId || '') ||
    ''
  )
}

/**
 * Hero 背景的 `:style` 绑定。
 *
 * 必须给 `url()` 加引号并转义：未加引号的 `url(...)` 一旦遇到空格或右括号
 * （例如自定义壁纸 `https://host/room 1.jpg`）就会被 CSS 解析器整条丢弃，
 * 表现为「壁纸静默不显示」且没有任何报错。
 * @param area 房间行
 * @returns 内联样式对象；无壁纸时为 undefined
 */
function heroBgStyle(area: AreaRow): Record<string, string> | undefined {
  const url = heroBg(area)
  if (!url) return undefined
  const escaped = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return { backgroundImage: `url("${escaped}")` }
}

/** 一键清除编辑表单中的幽灵实体（仅本地；保存时写入 DB） */
function clearFormGhosts() {
  const ghosts = new Set(formGhostIds.value)
  if (!ghosts.size) return
  form.entityIds = form.entityIds.filter((id) => !ghosts.has(id))
  chrome.notify(`已清除 ${ghosts.size} 个失效实体`, 'success')
}

// ── 横滑 / 路由同步 ──────────────────────────────────────────────

/** 房间 id → 下标 */
function indexOfAreaId(areaId: string): number {
  return areas.value.findIndex((a) => a.id === areaId)
}

/** 立即（或平滑）把横滑视口滚到指定下标 */
function scrollHeroTo(index: number, smooth = false) {
  const el = heroViewportRef.value
  const target = Math.max(0, Math.min(index, areas.value.length - 1))
  if (!el) return
  const width = el.clientWidth || window.innerWidth
  if (!width) return
  el.scrollTo({ left: target * width, behavior: smooth ? 'smooth' : 'auto' })
}

/** 程序化滚动期间挂起 scroll 回写，避免中间态反复改写 query */
function withScrollGuard(run: () => void) {
  scrollGuard = true
  if (scrollGuardTimer) clearTimeout(scrollGuardTimer)
  run()
  scrollGuardTimer = setTimeout(() => {
    scrollGuard = false
    scrollGuardTimer = null
  }, 420)
}

/** 把当前激活房间写回路由 query（等值守卫，避免 watch 回环） */
function syncRouteToIndex(index: number) {
  const areaId = areas.value[index]?.id || ''
  if (!areaId) return
  if (String(route.query.areaId || '') === areaId) return
  void router.replace({ query: { ...route.query, areaId } })
}

/** 切换激活房间 */
function setActiveIndex(index: number, opts: { scroll?: boolean; smooth?: boolean } = {}) {
  if (!areas.value.length) return
  const next = Math.max(0, Math.min(index, areas.value.length - 1))
  const prev = activeIndex.value
  if (next !== prev) slideDir.value = next > prev ? 'slide-next' : 'slide-prev'
  activeIndex.value = next
  pinnedAreaId.value = areas.value[next]?.id || ''
  syncRouteToIndex(next)
  if (opts.scroll) void nextTick(() => withScrollGuard(() => scrollHeroTo(next, !!opts.smooth)))
}

/** 房间列表变化后重新定位：优先保持 pinnedAreaId，其次尊重路由 query */
function ensureActiveIndex() {
  if (!areas.value.length) {
    activeIndex.value = 0
    pinnedAreaId.value = ''
    return
  }
  const wanted = pinnedAreaId.value || String(route.query.areaId || '').trim()
  const hit = wanted ? indexOfAreaId(wanted) : -1
  const next = hit >= 0 ? hit : Math.max(0, Math.min(activeIndex.value, areas.value.length - 1))
  activeIndex.value = next
  pinnedAreaId.value = areas.value[next]?.id || ''
  const el = heroViewportRef.value
  if (el) void nextTick(() => withScrollGuard(() => scrollHeroTo(next)))
}

/** 横滑 scroll 事件：按视口宽度取整得到当前房间 */
function onHeroScroll() {
  if (scrollGuard) return
  const el = heroViewportRef.value
  if (!el || !areas.value.length) return
  const width = el.clientWidth || window.innerWidth
  if (!width) return
  const next = Math.round(el.scrollLeft / width)
  if (next < 0 || next >= areas.value.length) return
  if (next === activeIndex.value) return
  setActiveIndex(next)
}

/** 点击分页点：平滑滚动到目标房间 */
function goToArea(index: number) {
  setActiveIndex(index, { scroll: true, smooth: true })
}

/** 视口尺寸变化（横竖屏切换）后重新对齐当前 slide */
function realignHero() {
  if (!areas.value.length) return
  const el = heroViewportRef.value
  if (!el) return
  const width = el.clientWidth || 0
  if (!width || width === lastViewportWidth) return
  lastViewportWidth = width
  withScrollGuard(() => scrollHeroTo(activeIndex.value))
}

// ── 数据加载 ────────────────────────────────────────────────────

/** 加载房间列表；加载后按 pinned / query 重新定位激活房间 */
async function load() {
  loading.value = true
  try {
    const { data } = await fetchDbAreas()
    areas.value = Array.isArray(data) ? data : []
    void nextTick(() => ensureActiveIndex())
  } catch (e: unknown) {
    notifyError(e, '加载房间失败')
  } finally {
    loading.value = false
  }
}

/** 加载 HA 区域候选列表：失败时静默置空，不阻断主流程。 */
async function loadHaAreas() {
  try {
    const { data } = await fetchAreasList<HaAreaOption[]>()
    haAreas.value = Array.isArray(data) ? data : []
  } catch {
    haAreas.value = []
  }
}

// ── 管理入口 ────────────────────────────────────────────────────

/** 根据名称/HA 区域自动推荐背景图：仅在用户未手动填入时生效。 */
function suggestBackgroundFromName() {
  if (form.backgroundUrl.trim()) return
  const suggested =
    resolveRoomBackgroundUrl(form.name) || resolveRoomBackgroundUrl(form.haAreaId)
  if (suggested) form.backgroundUrl = suggested
}

/** 打开新建表单：重置所有字段到默认值。 */
function openCreate() {
  editingId.value = null
  form.name = ''
  form.icon = '🏠'
  form.backgroundUrl = ''
  form.haAreaId = ''
  form.entityIds = []
  editorOpen.value = true
}

/** 打开编辑表单：用现有房间数据回填表单，背景图按回退链解析。 */
function openEdit(area: AreaRow) {
  editingId.value = area.id
  form.name = area.name
  form.icon = area.icon || '🏠'
  form.backgroundUrl = heroBg(area)
  form.haAreaId = area.haAreaId || ''
  form.entityIds = (area.entities || []).map((e) => e.entityId)
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
}

/** 从管理入口新建房间 */
function openCreateFromManage() {
  manageOpen.value = false
  openCreate()
}

/** 从管理入口编辑当前房间 */
function openEditFromManage() {
  const area = activeArea.value
  manageOpen.value = false
  if (area) openEdit(area)
}

/** 从管理入口打开房间排序（草稿 = 当前顺序） */
function openRoomSort() {
  manageOpen.value = false
  roomSortDraft.value = areas.value.map((a) => a.id)
  roomSortOpen.value = true
}

/** 从管理入口打开设备排序（草稿 = 当前房间存活设备） */
function openEntitySort() {
  manageOpen.value = false
  entitySortDraft.value = activeDevices.value.map((row) => ({
    entityId: row.entityId,
    name: row.name,
  }))
  entitySortOpen.value = true
}

/** 从管理入口删除当前房间 */
function openRemove() {
  const area = activeArea.value
  manageOpen.value = false
  if (area) void removeArea(area)
}

/** 打开分类设备列表（底部 sheet） */
function openCategory(key: RoomCategoryKey) {
  categoryKey.value = key
}

function closeCategory() {
  categoryKey.value = null
}

/** 打开实体控制弹层（并收起分类 sheet） */
function openEntity(entityId: string) {
  if (!entityId) return
  categoryKey.value = null
  chrome.openEntityControl(entityId)
}

// ── 保存 / 删除 / 排序 ──────────────────────────────────────────

/** 保存房间：新建/更新走不同接口，均同步绑定实体列表；成功后重载列表。 */
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
      pinnedAreaId.value = editingId.value
      chrome.notify('房间已更新', 'success')
    } else {
      const created = await createDbArea({
        ...payload,
        entityIds: form.entityIds,
      })
      const newId = String(
        (created as { data?: { id?: string } })?.data?.id || '',
      ).trim()
      if (newId) pinnedAreaId.value = newId
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

/** 删除房间：二次确认后调接口，成功后重载列表。 */
async function removeArea(area: AreaRow) {
  const ok = await chrome.confirm(`删除房间「${area.name}」及其设备绑定？`, '删除房间', {
    type: 'danger',
    confirmText: '删除',
  })
  if (!ok) return
  try {
    await deleteDbArea(area.id)
    if (pinnedAreaId.value === area.id) pinnedAreaId.value = ''
    chrome.notify('房间已删除', 'success')
    await load()
  } catch (e: unknown) {
    notifyError(e, '删除房间失败')
  }
}

/** 房间排序草稿内上/下移 */
function moveRoomInDraft(index: number, dir: -1 | 1) {
  const to = index + dir
  if (to < 0 || to >= roomSortDraft.value.length) return
  const next = [...roomSortDraft.value]
  const [item] = next.splice(index, 1)
  next.splice(to, 0, item)
  roomSortDraft.value = next
}

/** 保存房间顺序：乐观更新本地顺序，失败时重新 load 回滚到服务端真实状态。 */
async function saveRoomOrder() {
  const ids = roomSortDraft.value.slice()
  if (!ids.length) return
  const prev = areas.value
  const byId = new Map(prev.map((area) => [area.id, area]))
  const next = ids.map((id) => byId.get(id)).filter((area): area is AreaRow => Boolean(area))
  roomSortOpen.value = false
  if (next.length === prev.length) areas.value = next
  try {
    await sortDbAreas(ids)
    chrome.notify('房间顺序已保存', 'success')
  } catch (e: unknown) {
    notifyError(e, '保存排序失败')
    areas.value = prev
    await load()
  }
}

/** 设备排序草稿内上/下移 */
function moveEntityInDraft(index: number, dir: -1 | 1) {
  const to = index + dir
  if (to < 0 || to >= entitySortDraft.value.length) return
  const next = [...entitySortDraft.value]
  const [item] = next.splice(index, 1)
  next.splice(to, 0, item)
  entitySortDraft.value = next
}

/**
 * 保存设备顺序：仅对存活设备重排，幽灵绑定保持在末尾；
 * 乐观更新后调接口持久化，失败时重新 load 回滚。
 */
async function saveEntityOrder() {
  const area = activeArea.value
  if (!area) return
  const ghostIds = (area.entities || [])
    .map((e) => e.entityId)
    .filter((id) => !isEntityAlive(id, entitiesStore.entities))
  const orderedIds = [...entitySortDraft.value.map((e) => e.entityId), ...ghostIds]
  const ordered = orderedIds.map((entityId, i) => ({ entityId, sortOrder: i }))
  const listIdx = areas.value.findIndex((a) => a.id === area.id)
  if (listIdx >= 0) areas.value[listIdx] = { ...areas.value[listIdx], entities: ordered }
  entitySortOpen.value = false
  entitySortSaving.value = true
  try {
    await updateDbAreaEntities(area.id, orderedIds)
    chrome.notify('设备顺序已保存', 'success')
  } catch (e: unknown) {
    notifyError(e, '保存设备顺序失败')
    await load()
  } finally {
    entitySortSaving.value = false
  }
}

/** 编辑表单内实体排序：仅调整本地 form.entityIds 顺序，提交时才持久化。 */
function moveEntityInForm(index: number, dir: -1 | 1) {
  const next = index + dir
  if (next < 0 || next >= form.entityIds.length) return
  const ids = [...form.entityIds]
  const [item] = ids.splice(index, 1)
  ids.splice(next, 0, item)
  form.entityIds = ids
}

/** 从素材库选中背景图后回调：自动填入表单并关闭弹层。 */
function onSelectRoomImage(url: string) {
  form.backgroundUrl = url
  roomImagePickerOpen.value = false
  chrome.notify('路径已自动填入', 'success')
}

// 挂载时并行加载房间列表与 HA 区域候选
onMounted(() => {
  void load()
  void loadHaAreas()
  window.addEventListener('resize', realignHero)
})

onUnmounted(() => {
  window.removeEventListener('resize', realignHero)
  if (scrollGuardTimer) clearTimeout(scrollGuardTimer)
})

// 房间列表增删 / 排序后重新定位激活房间
watch(
  () => areas.value.map((a) => a.id).join('|'),
  () => ensureActiveIndex(),
)

// 外部路由 areaId 变化（deep link / 浏览器前进后退）时定位对应 slide
watch(
  () => route.query.areaId,
  (val) => {
    const areaId = String(val || '').trim()
    if (!areaId) return
    const index = indexOfAreaId(areaId)
    if (index < 0 || index === activeIndex.value) return
    setActiveIndex(index, { scroll: true })
  },
)
// 切房间后把下半区滚动位置归零：面板容器本身不随 pane 一起重建，
// 否则「8 张卡片的房间滚到底 → 滑到只有 2 张卡片的房间」会带着旧偏移渲染
watch(activeAreaId, () => {
  const panel = panelRef.value
  if (panel) panel.scrollTop = 0
})
</script>

<template>
  <div class="m-rooms" style="--m-accent-rgb: 249, 115, 22">
    <p v-if="loading && !areas.length" class="m-page__hint m-rooms__loading">加载中…</p>

    <!-- 空态：无房间 -->
    <div v-else-if="!areas.length" class="m-rooms__empty">
      <div class="m-rooms__empty-icon" aria-hidden="true">🚪</div>
      <p class="m-rooms__empty-text">还没有房间</p>
      <button type="button" class="m-rooms__empty-btn" @click="openCreate">新建房间</button>
    </div>

    <template v-else>
      <!-- 上半区：壁纸 Hero 横滑 -->
      <div
        ref="heroViewportRef"
        class="m-rooms__viewport no-scrollbar"
        @scroll.passive="onHeroScroll"
      >
        <section v-for="area in areas" :key="area.id" class="m-rooms__slide">
          <div class="m-room-hero">
            <span class="m-room-hero__bg" :style="heroBgStyle(area)" />
            <span class="m-room-hero__scrim" />

            <div
              v-if="(roomMetrics[area.id]?.lights.total || 0) > 0"
              class="m-room-hero__pill"
              :class="{ 'm-room-hero__pill--on': (roomMetrics[area.id]?.lights.on || 0) > 0 }"
            >
              <Lightbulb :size="14" aria-hidden="true" />
              <span>{{ roomMetrics[area.id]?.lights.on || 0 }}</span>
            </div>

            <div class="m-room-hero__footer">
              <span class="m-room-hero__name">{{ area.name }}</span>
              <div
                v-if="roomMetrics[area.id]?.humidity || roomMetrics[area.id]?.temp"
                class="m-room-hero__metrics"
              >
                <div v-if="roomMetrics[area.id]?.humidity" class="m-room-hero__humidity">
                  <Droplets :size="16" aria-hidden="true" />
                  <span>{{ roomMetrics[area.id]?.humidity }}</span>
                </div>
                <div v-if="roomMetrics[area.id]?.temp" class="m-room-hero__temp">
                  <span class="m-room-hero__temp-value">
                    {{ roomMetrics[area.id]?.temp?.value }}
                  </span>
                  <span class="m-room-hero__temp-unit">{{ roomMetrics[area.id]?.temp?.unit }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 分页点：多房间时才显示 -->
      <div v-if="areas.length > 1" class="m-rooms__dots">
        <button
          v-for="(area, index) in areas"
          :key="area.id"
          type="button"
          class="m-rooms__dot"
          :class="{ 'm-rooms__dot--on': index === activeIndex }"
          :aria-label="`切换到 ${area.name}`"
          @click="goToArea(index)"
        />
      </div>

      <!-- 下半区：分类卡片纵向滚动 -->
          <div ref="panelRef" class="m-rooms__panel no-scrollbar">
        <Transition :name="slideDir" mode="out-in">
          <div :key="activeAreaId || 'empty'" class="m-rooms__pane">
            <div v-if="activeCategories.length" class="m-rooms__grid">
              <button
                v-for="cat in activeCategories"
                :key="cat.key"
                type="button"
                class="m-room-cat"
                :class="cat.isActive ? 'm-room-cat--on' : 'm-room-cat--off'"
                @click="openCategory(cat.key)"
              >
                <span class="m-room-cat__inner">
                  <span class="m-room-cat__head">
                    <span class="m-room-cat__count">{{ cat.count }} 设备</span>
                    <span class="m-room-cat__name">{{ cat.label }}</span>
                  </span>
                  <span class="m-room-cat__foot">
                    <component
                      :is="CATEGORY_ICONS[cat.key]"
                      :size="38"
                      class="m-room-cat__icon"
                      :style="{ color: CATEGORY_COLORS[cat.key] }"
                      aria-hidden="true"
                    />
                  </span>
                </span>
              </button>
            </div>
            <div v-else class="m-rooms__pane-empty">
              <p class="m-page__hint">
                {{ activeArea ? '该房间还没有绑定设备' : '请选择房间' }}
              </p>
              <button
                v-if="activeArea"
                type="button"
                class="m-page__btn m-page__btn--ghost"
                @click="openEdit(activeArea)"
              >
                绑定设备
              </button>
            </div>
          </div>
        </Transition>
      </div>

      <!-- 管理入口：固定右上（避开刘海） -->
      <button
        type="button"
        class="m-rooms__manage-btn"
        aria-label="房间管理"
        @click="manageOpen = true"
      >
        <Settings2 :size="17" aria-hidden="true" />
      </button>
    </template>

    <!-- 管理 sheet -->
    <div v-if="manageOpen" class="m-page__sheet" @click.self="manageOpen = false">
      <div class="m-page__sheet-panel">
        <h2>{{ activeArea?.name || '房间管理' }}</h2>
        <p v-if="activeArea" class="m-page__hint">
          共 {{ aliveCountForArea(activeArea) }} 个可用设备 ·
          {{ (activeArea.entities || []).length - aliveCountForArea(activeArea) }} 个失效绑定
        </p>
        <button type="button" class="m-room-manage__row m-room-manage__row--accent" @click="openCreateFromManage">
          <span class="m-room-manage__icon"><Plus :size="16" aria-hidden="true" /></span>
          <span>新建房间</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="m-room-manage__row"
          :disabled="!activeArea"
          @click="openEditFromManage"
        >
          <span class="m-room-manage__icon"><Pencil :size="15" aria-hidden="true" /></span>
          <span>编辑房间</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button type="button" class="m-room-manage__row" @click="openRoomSort">
          <span class="m-room-manage__icon"><ArrowLeftRight :size="15" aria-hidden="true" /></span>
          <span>房间排序</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="m-room-manage__row"
          :disabled="!activeDevices.length"
          @click="openEntitySort"
        >
          <span class="m-room-manage__icon">
            <SlidersHorizontal :size="15" aria-hidden="true" />
          </span>
          <span>设备排序{{ entitySortSaving ? '（保存中…）' : '' }}</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="m-room-manage__row m-room-manage__row--danger"
          :disabled="!activeArea"
          @click="openRemove"
        >
          <span class="m-room-manage__icon"><Trash2 :size="15" aria-hidden="true" /></span>
          <span>删除房间</span>
          <ChevronRight :size="16" aria-hidden="true" />
        </button>
        <div class="m-page__btn-row" style="justify-content: flex-end">
          <button type="button" class="m-page__btn m-page__btn--ghost" @click="manageOpen = false">
            关闭
          </button>
        </div>
      </div>
    </div>

    <!-- 房间排序 sheet -->
    <div v-if="roomSortOpen" class="m-page__sheet" @click.self="roomSortOpen = false">
      <div class="m-page__sheet-panel m-page__sheet-panel--tall">
        <h2>房间排序</h2>
        <p class="m-page__hint">用 ↑ / ↓ 调整房间在横滑中的先后顺序</p>
        <ul class="m-room-entity-order">
          <li v-for="(id, index) in roomSortDraft" :key="id" class="m-room-entity-order__row">
            <span class="m-room-entity-order__id">{{ areas.find((a) => a.id === id)?.name || id }}</span>
            <button
              type="button"
              class="m-page__btn m-page__btn--ghost"
              :disabled="index === 0"
              :aria-label="'上移'"
              @click="moveRoomInDraft(index, -1)"
            >
              <ArrowUp :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="m-page__btn m-page__btn--ghost"
              :disabled="index >= roomSortDraft.length - 1"
              :aria-label="'下移'"
              @click="moveRoomInDraft(index, 1)"
            >
              <ArrowDown :size="15" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="m-page__btn-row" style="justify-content: flex-end">
          <button type="button" class="m-page__btn m-page__btn--ghost" @click="roomSortOpen = false">
            取消
          </button>
          <button type="button" class="m-page__btn m-page__btn--primary" @click="saveRoomOrder">
            保存顺序
          </button>
        </div>
      </div>
    </div>

    <!-- 设备排序 sheet -->
    <div v-if="entitySortOpen" class="m-page__sheet" @click.self="entitySortOpen = false">
      <div class="m-page__sheet-panel m-page__sheet-panel--tall">
        <h2>{{ activeArea?.name || '' }} · 设备排序</h2>
        <p class="m-page__hint">仅对存活设备排序，失效绑定会自动留在末尾</p>
        <ul class="m-room-entity-order">
          <li
            v-for="(row, index) in entitySortDraft"
            :key="row.entityId"
            class="m-room-entity-order__row"
          >
            <span class="m-room-entity-order__id">{{ row.name }}</span>
            <button
              type="button"
              class="m-page__btn m-page__btn--ghost"
              :disabled="index === 0"
              :aria-label="`上移 ${row.name}`"
              @click="moveEntityInDraft(index, -1)"
            >
              <ArrowUp :size="15" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="m-page__btn m-page__btn--ghost"
              :disabled="index >= entitySortDraft.length - 1"
              :aria-label="`下移 ${row.name}`"
              @click="moveEntityInDraft(index, 1)"
            >
              <ArrowDown :size="15" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <div class="m-page__btn-row" style="justify-content: flex-end">
          <button
            type="button"
            class="m-page__btn m-page__btn--ghost"
            @click="entitySortOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="m-page__btn m-page__btn--primary"
            :disabled="entitySortSaving"
            @click="saveEntityOrder"
          >
            {{ entitySortSaving ? '保存中…' : '保存顺序' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 分类设备列表 sheet -->
    <div v-if="activeCategory" class="m-page__sheet" @click.self="closeCategory">
      <div class="m-page__sheet-panel m-page__sheet-panel--tall">
        <div class="m-room-cat-sheet__head">
          <h2>
            {{ activeArea?.name || '' }} · {{ activeCategory.label }}
            <span class="m-room-cat-sheet__count">{{ activeCategory.count }}</span>
          </h2>
          <button type="button" class="m-page__btn m-page__btn--ghost" aria-label="关闭" @click="closeCategory">
            <X :size="16" aria-hidden="true" />
          </button>
        </div>
        <ul class="m-room-cat-sheet__list">
          <li v-for="row in activeCategoryDevices" :key="row.entityId">
            <button type="button" class="m-room-dev-row" @click="openEntity(row.entityId)">
              <span class="m-room-dev-row__name">{{ row.name }}</span>
              <span
                class="m-room-dev-row__state"
                :class="{ 'm-room-dev-row__state--on': row.active }"
                :style="{ color: row.active ? entityDomainColor(row.domain) : undefined }"
              >
                {{ row.state }}
              </span>
              <ChevronRight :size="15" aria-hidden="true" class="m-room-dev-row__chev" />
            </button>
          </li>
        </ul>
        <p class="m-page__hint">
          共 {{ activeCategory.count }} 个设备 · 覆盖 {{ [...new Set(activeCategoryDevices.map((d) => entityDomainLabel(d.domain)))].join(' / ') || '—' }}
        </p>
      </div>
    </div>

    <!-- 编辑 / 新建 -->
    <div v-if="editorOpen" class="m-page__sheet" @click.self="closeEditor">
      <form class="m-page__sheet-panel m-page__sheet-panel--tall" @submit.prevent="saveArea">
        <h2>{{ editingId ? '编辑房间' : '新建房间' }}</h2>
        <label class="m-page__field">
          名称
          <input
            v-model="form.name"
            class="settings-field"
            type="text"
            maxlength="40"
            required
            @blur="suggestBackgroundFromName"
          />
        </label>
        <div class="m-page__field">
          图标
          <div class="m-page__icons">
            <button
              v-for="ic in ICON_PRESETS"
              :key="ic"
              type="button"
              class="m-page__icon-btn"
              :class="{ 'm-page__icon-btn--on': form.icon === ic }"
              @click="form.icon = ic"
            >
              {{ ic }}
            </button>
          </div>
        </div>
        <div class="m-page__field">
          背景图
          <div class="m-room-bg-presets">
            <button
              v-for="preset in ROOM_BACKGROUND_PRESETS"
              :key="preset.id"
              type="button"
              class="m-room-bg-presets__btn"
              :class="{ 'm-room-bg-presets__btn--on': form.backgroundUrl === preset.path }"
              :title="preset.label"
              :style="{ backgroundImage: `url(${preset.path})` }"
              @click="form.backgroundUrl = preset.path"
            >
              <span>{{ preset.label }}</span>
            </button>
          </div>
          <div class="relative">
            <input
              v-model="form.backgroundUrl"
              class="settings-field"
              type="text"
              style="padding-right: 2.5rem"
              placeholder="/room_images/… 或自定义 URL"
            />
            <button
              type="button"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center m-page__btn m-page__btn--ghost rounded-md"
              title="从房间图素材库拾取"
              aria-label="从房间图素材库拾取"
              @click="roomImagePickerOpen = true"
            >
              <Search class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <label class="m-page__field">
          关联 HA 区域（可选）
          <select v-model="form.haAreaId" class="settings-field" @change="suggestBackgroundFromName">
            <option value="">不关联</option>
            <option v-for="ha in haAreas" :key="ha.id" :value="ha.id">
              {{ ha.name }} ({{ ha.id }})
            </option>
          </select>
        </label>
        <div class="m-page__field">
          绑定设备
          <EntityMultiSelect
            v-model="form.entityIds"
            :allowed-domains="[]"
            placeholder="搜索并选择实体（可多选）"
            wrapper-class="m-room-ems"
          />
          <div v-if="formGhostIds.length" class="m-page__hint m-room-ghost-banner">
            <p>
              检测到 {{ formGhostIds.length }} 个幽灵实体（HA 中已删除或不可用）：
              {{ formGhostIds.join('、') }}
            </p>
            <button type="button" class="m-page__btn m-page__btn--danger" @click="clearFormGhosts">
              一键清除非法实体
            </button>
          </div>
          <ul v-if="formEntityCount" class="m-room-entity-order">
            <li v-for="(eid, index) in form.entityIds" :key="eid" class="m-room-entity-order__row">
              <span class="m-room-entity-order__id">{{ eid }}</span>
              <button
                type="button"
                class="m-page__btn m-page__btn--ghost"
                :disabled="index === 0"
                :aria-label="`上移 ${eid}`"
                @click="moveEntityInForm(index, -1)"
              >
                <ArrowUp :size="15" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="m-page__btn m-page__btn--ghost"
                :disabled="index >= formEntityCount - 1"
                :aria-label="`下移 ${eid}`"
                @click="moveEntityInForm(index, 1)"
              >
                <ArrowDown :size="15" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>
        <div class="m-page__btn-row" style="justify-content: flex-end">
          <button type="button" class="m-page__btn m-page__btn--ghost" @click="closeEditor">
            取消
          </button>
          <button type="submit" class="m-page__btn m-page__btn--primary" :disabled="saving">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </div>
  </div>

  <AssetPickerModal
    :is-open="roomImagePickerOpen"
    type="room_image"
    @close="roomImagePickerOpen = false"
    @select="onSelectRoomImage"
  />
</template>
