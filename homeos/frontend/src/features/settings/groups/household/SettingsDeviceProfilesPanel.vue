<!--
  设备画像：媒体 / 空调 / 热水器的类型确认、别名、房间默认设备与人工确认审计。

  排版对齐设置中心其它面板：卡片 = SettingsCardIntro（图标球 + 眉标 + 标题 + 说明），
  工具条 = 分段筛选 + 开关 chip + 搜索框，列表 = 房间分组 + 单行「身份 / 状态 / 类型 / 操作」。
  空调形态无法从实体属性可靠推断，后端强制「必须人工确认」，这里就是那个确认入口。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="device-profiles"
    icon-key="device-profiles"
    accent="var(--hos-color-accent)"
    layout="single"
  >
    <template #actions>
      <button type="button" class="settings-btn-ghost" :disabled="refreshing" @click="refresh">
        <RefreshCw :class="['w-4 h-4', refreshing && 'animate-spin']" />
        {{ '按当前设备重建' }}
      </button>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load">
        <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <div v-if="error" class="settings-note-box settings-note-box--danger">{{ error }}</div>

    <SettingsCard full static extra-class="dp-card">
      <SettingsCardIntro
        :icon="SlidersHorizontal"
        eyebrow="类型确认"
        title="设备类型"
        :description="'「空调 / 热水器」必须手动确认：挂机 / 中央 / 地暖的调温参数不同，猜错会下发错误指令。确认后可加别名，之后说「打开客厅冷气」会直接命中它。'"
      >
        <template #actions>
          <button
            v-if="autoConfirmable.length"
            type="button"
            class="settings-btn-ghost settings-btn--sm"
            :disabled="batchSaving"
            :title="'规则已给出明确类型，确认后语音才会自动选中它们'"
            @click="confirmAllAuto"
          >
            <Wand2 :class="['w-4 h-4', batchSaving && 'animate-pulse']" />
            {{ batchSaving ? '确认中…' : `确认 ${autoConfirmable.length} 台` }}
          </button>
        </template>
      </SettingsCardIntro>

      <div class="dp-toolbar">
        <div class="dp-segments" role="group" :aria-label="'按设备类型筛选'">
          <button
            v-for="segment in domainSegments"
            :key="segment.key"
            type="button"
            class="dp-segment"
            :class="{ 'dp-segment--on': domainFilter === segment.key }"
            :aria-pressed="domainFilter === segment.key"
            @click="domainFilter = segment.key"
          >
            {{ segment.label }}
            <span class="dp-segment__count">{{ segment.count }}</span>
          </button>
        </div>

        <div class="dp-toolbar__right">
          <button
            type="button"
            class="dp-chip"
            :class="{ 'dp-chip--on': onlyPending }"
            :aria-pressed="onlyPending"
            @click="onlyPending = !onlyPending"
          >
            <Filter class="w-3.5 h-3.5" />
            {{ '只看待确认' }}
            <span class="dp-chip__count">{{ pendingCount }}</span>
          </button>
          <label class="dp-search">
            <Search class="dp-search__icon" />
            <input
              v-model="filterText"
              class="dp-search__input"
              type="search"
              autocomplete="off"
              :placeholder="'搜索名称 / 实体 ID / 别名'"
            />
          </label>
        </div>
      </div>

      <div class="dp-stats">
        <span class="dp-stat">
          <b>{{ profiles.length }}</b>
          {{ '台设备' }}
        </span>
        <span class="dp-stat dp-stat--ok">
          <b>{{ confirmedCount }}</b>
          {{ '已确认' }}
        </span>
        <span class="dp-stat" :class="{ 'dp-stat--warn': pendingCount }">
          <b>{{ pendingCount }}</b>
          {{ '待确认' }}
        </span>
        <span v-if="offlineCount" class="dp-stat dp-stat--off">
          <b>{{ offlineCount }}</b>
          {{ '不在线' }}
        </span>
      </div>

      <p v-if="offlineCount" class="dp-note">
        {{ `不在线的设备仍保留类型与别名，恢复上线后会自动重新可用；若已从 HA 删除，可到「设备管理」清理残留引用。` }}
      </p>

      <VEmptyState
        v-if="!groups.length && !loading"
        icon="🗂️"
        :title="filterText || onlyPending || domainFilter ? '没有符合条件的设备' : '还没有纳入画像的设备'"
        :description="
          filterText || onlyPending || domainFilter
            ? '换个关键字，或清掉「只看待确认」与类型筛选再看看。'
            : '点右上角「按当前设备重建」，把 HA 里的媒体 / 空调 / 热水器实体纳入画像。'
        "
        tone="neutral"
        compact
      />

      <div v-for="group in groups" :key="group.key" class="dp-group">
        <div class="dp-group__head">
          <span class="dp-group__title">{{ group.label }}</span>
          <span class="dp-group__count">{{ `${group.items.length} 台` }}</span>
          <RouterLink v-if="!group.key" :to="roomsLink" class="dp-group__link">
            {{ '去「房间配置」同步 HA 区域' }}
          </RouterLink>
        </div>

        <ul class="dp-list">
          <li
            v-for="item in group.items"
            :key="item.entityId"
            class="dp-row"
            :class="{ 'dp-row--off': !item.available }"
          >
            <div class="dp-row__main">
              <div class="dp-row__identity">
                <p class="dp-row__name" :title="item.entityId">{{ rowTitle(item) }}</p>
                <p class="dp-row__meta">
                  <span v-if="hasFriendlyName(item)" class="dp-row__id" :title="item.entityId">
                    {{ item.entityId }}
                  </span>
                  <span v-if="item.lastSeenAt">{{ `最近见到 ${relativeTime(item.lastSeenAt)}` }}</span>
                  <span v-else>{{ '尚未同步到状态' }}</span>
                </p>
              </div>

              <div class="dp-row__controls">
                <span class="dp-state" :class="stateTone(item)">
                  <span class="dp-state__dot" />
                  {{ stateLabel(item) }}
                </span>
                <HosSelect
                  variant="settings"
                  class="dp-kind"
                  :disabled="saving === item.entityId"
                  :model-value="item.kind"
                  @update:model-value="(value) => onKindChange(item, value)"
                >
                  <option v-for="kind in kindOptions(item)" :key="kind" :value="kind">
                    {{ KIND_LABELS[kind] }}
                  </option>
                </HosSelect>
                <span v-if="item.confirmed" class="dp-badge dp-badge--ok">{{ '已确认' }}</span>
                <span v-else-if="item.kind === 'unknown'" class="dp-badge dp-badge--warn">{{ '待确认' }}</span>
                <span v-else class="dp-badge" :title="evidenceLabel(item)">{{ `置信 ${item.confidence.toFixed(2)}` }}</span>
                <div class="dp-row__actions">
                  <button
                    v-if="!item.confirmed && item.kind !== 'unknown'"
                    type="button"
                    class="settings-btn-ghost settings-btn--sm"
                    :disabled="saving === item.entityId"
                    @click="confirm(item, item.kind)"
                  >
                    {{ '确认' }}
                  </button>
                  <button
                    v-if="item.confirmed"
                    type="button"
                    class="settings-btn-ghost settings-btn--sm"
                    :disabled="saving === item.entityId"
                    @click="unconfirm(item)"
                  >
                    {{ '撤销确认' }}
                  </button>
                </div>
              </div>
            </div>

            <div v-if="item.confirmed" class="dp-row__aliases">
              <span class="dp-row__alias-label">{{ '别名' }}</span>
              <span v-for="alias in item.aliases" :key="alias" class="dp-alias">
                {{ alias }}
                <button
                  type="button"
                  class="dp-alias__remove"
                  :aria-label="`删除别名 ${alias}`"
                  :disabled="saving === item.entityId"
                  @click="removeAlias(item, alias)"
                >
                  ×
                </button>
              </span>
              <button
                type="button"
                class="settings-btn-ghost settings-btn--sm"
                :disabled="saving === item.entityId || item.aliases.length >= MAX_ALIASES"
                @click="addAlias(item)"
              >
                <Plus class="w-3.5 h-3.5" />
                {{ '加别名' }}
              </button>
              <span v-if="!item.aliases.length" class="dp-row__alias-hint">
                {{ '还没设置别名；例如「大电视」「客厅冷气」，语音会用它找设备' }}
              </span>
              <span v-else class="dp-row__alias-count">{{ `${item.aliases.length} / ${MAX_ALIASES}` }}</span>
            </div>
            <div v-else class="dp-row__aliases dp-row__aliases--muted">
              <span class="dp-row__alias-hint">{{ '确认类型后才能设置别名（别名要绑到明确的设备类型上）' }}</span>
            </div>
          </li>
        </ul>
      </div>
    </SettingsCard>

    <DeviceProfilesDefaultsCard
      class="dp-card--spaced"
      :areas="areas"
      :ma-players="maPlayers"
      :profiles="profiles"
    />

    <DeviceProfilesAuditCard ref="auditCard" class="dp-card--spaced" :profiles="profiles" />
  </SettingsPageShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Filter, Plus, RefreshCw, Search, SlidersHorizontal, Wand2 } from '@lucide/vue'
import SettingsPageShell from '@/features/settings/components/shell/SettingsPageShell.vue'
import SettingsCard from '@/features/settings/components/shell/SettingsCard.vue'
import SettingsCardIntro from '@/features/settings/components/shell/SettingsCardIntro.vue'
import VEmptyState from '@/kernel/ui/primitives/VEmptyState.vue'
import DeviceProfilesAuditCard from './DeviceProfilesAuditCard.vue'
import DeviceProfilesDefaultsCard from './DeviceProfilesDefaultsCard.vue'
import HosSelect from '@/domain/entity/components/entity-select/HosSelect.vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { countOfflineDevices } from '@/domain/entity/model/utils/device-group'
import {
  clearDeviceProfileConfirmation,
  confirmDeviceProfile,
  confirmDeviceProfilesBatch,
  listDeviceProfiles,
  refreshDeviceProfiles,
  setDeviceProfileAliases,
} from '@/domain/api/device'
import { listHaAreas } from '@/domain/api/ha'
import { listMusicPlayers } from '@/domain/api/media'
import { AUDIT_LABELS, KIND_LABELS, kindTransition, relativeTime } from './device-profiles-display.util'
import { SETTINGS_ROUTES } from '@/kernel/utils/registry/settings-route.util'
import { getApiErrorMessage } from '@/kernel/utils/core'

defineProps({ activeTab: { type: String, default: 'device-profiles' } })

const MEDIA_KINDS = ['apple_tv', 'tv', 'speaker', 'receiver', 'unknown']
const CLIMATE_KINDS = ['ac_split', 'ac_central', 'boiler', 'floor_heating', 'water_heater', 'bath_heater', 'unknown']
const WATER_HEATER_KINDS = ['water_heater', 'unknown']
/** 房间默认设备只支持这三类：音箱走 MA 播放器，电视 / Apple TV 走实体 */
const MAX_ALIASES = 30
const DOMAIN_LABELS = { media_player: '媒体设备', climate: '空调 / 温控', water_heater: '热水器' }
const EVIDENCE_LABELS = {
  climate_requires_confirmation: '空调形态需人工确认',
  water_heater_requires_confirmation: '热水器形态需人工确认',
  unsupported_domain: '不支持该设备域',
  no_rule_matched: '没有匹配到规则',
  user_confirmed: '用户确认',
  entity_missing: '实体已不在 HA 中',
}
/** 分类依据前缀：`code:tail` 形式的证据码统一在这里翻译。 */
const EVIDENCE_PREFIX_LABELS = {
  climate_capabilities: '空调能力：',
  water_heater_modes: '热水器模式：',
  source_list: '来源列表含「',
  device_class: '设备类别：',
  name: '名称特征：',
}
const EVIDENCE_SUFFIX_LABELS = { source_list: '」' }

const roomsLink = SETTINGS_ROUTES.rooms('catalog')
const chrome = useChromeStore()
const entitiesStore = useEntitiesStore()
const auditCard = ref(null)
const loading = ref(false)
const refreshing = ref(false)
const saving = ref('')
const batchSaving = ref(false)
const error = ref('')
const profiles = ref([])
const areas = ref([])
const maPlayers = ref([])
const filterText = ref('')
const onlyPending = ref(false)
/** 域筛选：'' = 全部 */
const domainFilter = ref('')

/**
 * 不在线设备数。
 *
 * 按**设备**去重：一台热泵常同时暴露 `climate.*` 与 `water_heater.*` 两条画像实体，
 * 全部不可用时按实体数会写成「2 不在线」而其实只有一台机器。
 */
const offlineCount = computed(() =>
  countOfflineDevices(
    profiles.value.filter((item) => !item.available).map((item) => item.entityId),
    entitiesStore.entities,
  ),
)
const pendingCount = computed(() => profiles.value.filter((item) => !item.confirmed).length)
const confirmedCount = computed(() => profiles.value.filter((item) => item.confirmed).length)
/** 自动识别已经给出明确类型、只差用户点确认的设备（批量确认只碰这一批）。 */
const autoConfirmable = computed(() =>
  profiles.value.filter((item) => !item.confirmed && item.kind !== 'unknown' && item.available),
)
const defaultEntityOptions = computed(() =>
  profiles.value.filter(
    (item) => item.domain === 'media_player' && item.kind !== 'speaker' && item.kind !== 'receiver',
  ),
)

/** 类型筛选分段（带各自数量；数量为 0 的域不出现，避免空段占位）。 */
const domainSegments = computed(() => {
  const segments = [{ key: '', label: '全部', count: profiles.value.length }]
  for (const [key, label] of Object.entries(DOMAIN_LABELS)) {
    const count = profiles.value.filter((item) => item.domain === key).length
    if (count) segments.push({ key, label, count })
  }
  return segments
})

/** 搜索 + 类型 + 待确认筛选后的分组（按房间，未分配房间排最后）。 */
const groups = computed(() => {
  const needle = filterText.value.trim().toLowerCase()
  const visible = profiles.value.filter((item) => matchesFilter(item, needle))
  const buckets = new Map()
  for (const item of visible) {
    const key = item.areaId || ''
    if (!buckets.has(key)) buckets.set(key, { key, label: roomLabel(item) || '未分配房间', items: [] })
    buckets.get(key).items.push(item)
  }
  return [...buckets.values()].sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1
    return a.label.localeCompare(b.label, 'zh-Hans-CN')
  })
})

/** 单台设备是否落在当前筛选里（类型 + 待确认开关 + 关键字）。 */
function matchesFilter(item, needle) {
  if (domainFilter.value && item.domain !== domainFilter.value) return false
  if (onlyPending.value && item.confirmed) return false
  if (!needle) return true
  const haystack = [item.name, item.entityId, item.kind, KIND_LABELS[item.kind], ...(item.aliases || [])]
  return haystack.join(' ').toLowerCase().includes(needle)
}

function kindOptions(item) {
  if (item.domain === 'water_heater') return WATER_HEATER_KINDS
  return item.domain === 'climate' ? CLIMATE_KINDS : MEDIA_KINDS
}

function areaLabel(areaId) {
  return areas.value.find((item) => item.areaId === areaId)?.name || areaId
}

/** 画像行的房间名：优先后端随实体带回的 areaName，缺失时按 areaId 回查。 */
function roomLabel(item) {
  if (item.areaName) return item.areaName
  return item.areaId ? areaLabel(item.areaId) : ''
}

/** 有真实友好名（不等于实体 ID）时才在副标题里再显示实体 ID，避免同一串字重复两行。 */
function hasFriendlyName(item) {
  return Boolean(item.name) && item.name !== item.entityId
}

/** 行标题：没有友好名时去掉域前缀，比整串 `climate.xxx_air` 更像设备名。 */
function rowTitle(item) {
  if (hasFriendlyName(item)) return item.name
  const id = String(item.entityId || '')
  const dot = id.indexOf('.')
  return dot >= 0 ? id.slice(dot + 1) : id
}

/** 在线状态：离线优先（离线 + 待确认时先告诉用户「连不上」）。 */
function stateLabel(item) {
  if (!item.available) return '不在线'
  return item.state || '在线'
}

function stateTone(item) {
  if (!item.available) return 'dp-state--off'
  return item.state === 'off' ? 'dp-state--idle' : 'dp-state--on'
}

function nameOf(entityId) {
  const item = profiles.value.find((entry) => entry.entityId === entityId)
  return item ? rowTitle(item) : entityId
}

/** 把一条证据码翻成一句话；未知码原样显示，方便排查规则。 */
function evidenceCodeLabel(code) {
  const [head, tail] = String(code).split(':', 2)
  const prefix = EVIDENCE_PREFIX_LABELS[head]
  if (!prefix) return EVIDENCE_LABELS[code] || String(code)
  return `${prefix}${tail || '未知'}${EVIDENCE_SUFFIX_LABELS[head] || ''}`
}

/** 把分类依据翻成一句人话。 */
function evidenceLabel(item) {
  const codes = (item.evidence || []).map(evidenceCodeLabel)
  return codes.length ? `判定依据：${codes.join('；')}` : ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [profileRes, areaRes] = await Promise.all([
      listDeviceProfiles(),
      listHaAreas().catch(() => ({ data: { items: [] } })),
    ])
    profiles.value = profileRes.data?.items || []
    areas.value = areaRes.data?.items || []
    await loadPlayers()
  } catch (e) {
    error.value = getApiErrorMessage(e, '读取设备画像失败')
  } finally {
    loading.value = false
  }
}

/** MA 播放器列表：未配置 Music Assistant 时后端回 success=false，这里只当空列表用 */
async function loadPlayers() {
  try {
    const { data } = await listMusicPlayers()
    maPlayers.value = data?.items || []
  } catch {
    maPlayers.value = []
  }
}

async function refresh() {
  refreshing.value = true
  try {
    const { data } = await refreshDeviceProfiles()
    const stale = data.stale ? `，标记不可用 ${data.stale}` : ''
    chrome.notify(`画像已重建：新增 ${data.created}，更新 ${data.updated}，未变 ${data.unchanged}${stale}`, 'success')
    await load()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '重建失败'), 'error')
  } finally {
    refreshing.value = false
  }
}

/** 「未定」不是一次确认：选择它等价于撤销确认。 */
async function onKindChange(item, kind) {
  if (!kind) return
  if (kind === 'unknown') {
    if (item.confirmed) await unconfirm(item)
    return
  }
  await confirm(item, kind)
}

async function confirm(item, kind) {
  if (!kind) return
  if (kind === item.kind && item.confirmed) return
  saving.value = item.entityId
  try {
    await confirmDeviceProfile(item.entityId, kind, item.aliases?.length ? item.aliases : undefined)
    chrome.notify(`已设为「${KIND_LABELS[kind] || kind}」`, 'success')
    await load()
    await auditCard.value?.load?.()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '确认失败'), 'error')
  } finally {
    saving.value = ''
  }
}

/** 批量确认：按类型分组后走批量接口（一次请求确认多台，比逐台往返快得多）。
 *
 * 只处理「规则已给出明确类型且在线」的设备；服务端逐台复用单台确认的校验与审计，
 * 失败的单台会列在 `failed` 里（不阻断其余）。 */
/** 按 kind 分组（批量接口一次只接受一个 kind）。 */
function groupByKind(items) {
  const byKind = new Map()
  for (const item of items) {
    const bucket = byKind.get(item.kind)
    if (bucket) bucket.push(item)
    else byKind.set(item.kind, [item])
  }
  return byKind
}

/** 确认一个 kind 的一批设备，返回 `{ ok, failures }`（失败不抛出，交给调用方汇总）。 */
async function confirmKindBatch(kind, items) {
  try {
    const { data } = await confirmDeviceProfilesBatch(
      items.map((item) => item.entityId),
      kind,
    )
    const failures = (data.failed || []).map((failed) => {
      const name = items.find((item) => item.entityId === failed.entityId)?.name || failed.entityId
      return `${name}：${failed.message}`
    })
    return { ok: data.confirmed?.length || 0, failures }
  } catch (e) {
    return { ok: 0, failures: [`${KIND_LABELS[kind] || kind}：${getApiErrorMessage(e, '确认失败')}`] }
  }
}

/**
 * 批量确认：按类型分组后走批量接口（一次请求确认多台，比逐台往返快得多）。
 *
 * 只处理「规则已给出明确类型且在线」的设备；服务端逐台复用单台确认的校验与审计，
 * 失败的单台会列在 `failed` 里（不阻断其余）。 */
async function confirmAllAuto() {
  const targets = [...autoConfirmable.value]
  if (!targets.length) return
  batchSaving.value = true
  let ok = 0
  const failures = []
  try {
    for (const [kind, items] of groupByKind(targets)) {
      const result = await confirmKindBatch(kind, items)
      ok += result.ok
      failures.push(...result.failures)
    }
  } finally {
    batchSaving.value = false
  }
  for (const message of failures) chrome.notify(message, 'error')
  chrome.notify(`已确认 ${ok} / ${targets.length} 台`, ok === targets.length ? 'success' : 'warning')
  await load()
}

async function unconfirm(item) {
  const keep = await chrome.confirm(
    `撤销「${item.name}」的类型确认？类型会回到规则推断。已添加的别名默认保留。`,
    '撤销确认',
    { confirmText: '撤销' },
  )
  if (!keep) return
  saving.value = item.entityId
  try {
    await clearDeviceProfileConfirmation(item.entityId, true)
    await load()
    await auditCard.value?.load?.()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '撤销失败'), 'error')
  } finally {
    saving.value = ''
  }
}

/** 别名只走 /aliases：不再顺带重写确认状态。 */
async function saveAliases(item, aliases) {
  saving.value = item.entityId
  try {
    await setDeviceProfileAliases(item.entityId, aliases)
    await load()
    await auditCard.value?.load?.()
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '保存别名失败'), 'error')
  } finally {
    saving.value = ''
  }
}

async function addAlias(item) {
  const raw = await chrome.prompt('用户会怎么说这台设备？例如「客厅冷气」「大电视」', {
    title: `给「${item.name}」加别名`,
    placeholder: '2–60 个字',
    required: true,
  })
  if (raw === null) return
  const alias = String(raw).trim()
  if (alias.length < 2) {
    chrome.notify('别名至少 2 个字', 'warning')
    return
  }
  if (alias.length > 60) {
    chrome.notify('别名最多 60 个字', 'warning')
    return
  }
  const existing = item.aliases || []
  if (existing.some((entry) => entry.toLowerCase() === alias.toLowerCase())) {
    chrome.notify('这个别名已经有了', 'warning')
    return
  }
  if (existing.length >= MAX_ALIASES) {
    chrome.notify(`别名最多 ${MAX_ALIASES} 条`, 'warning')
    return
  }
  await saveAliases(item, [...existing, alias])
}

async function removeAlias(item, alias) {
  await saveAliases(
    item,
    (item.aliases || []).filter((entry) => entry !== alias),
  )
}

onMounted(load)
</script>

<style src="./styles/device-profiles.css"></style>
