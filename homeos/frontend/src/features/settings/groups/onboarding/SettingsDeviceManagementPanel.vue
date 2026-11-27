<!--
  设备管理面板：僵尸实体绑定清理向导
  扫描并批量解绑 HA 中已不存在的僵尸绑定。设备 OTA 请到 Home Assistant 中操作。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="devices"
    icon-key="cpu"
    accent="var(--hos-color-accent)"
    layout="single"
    page-class="devices-mgmt-hub"
  >
    <template #actions>
      <button type="button" class="settings-btn-accent" :disabled="loading" @click="load">
        <RefreshCw :class="['w-5 h-5', loading && 'animate-spin']" />
        {{ '刷新' }}
      </button>
    </template>

    <div v-if="loadError" class="settings-premium-empty settings-premium-empty--amber">
      <AlertCircle class="settings-premium-empty__icon" />
      <p class="settings-premium-empty__title">{{ '设备数据加载失败' }}</p>
      <p class="settings-premium-empty__desc">{{ loadError }}</p>
      <div class="settings-premium-empty__actions">
        <button type="button" class="settings-premium-empty__btn settings-premium-empty__btn--accent" :disabled="loading" @click="load">
          <RefreshCw :class="['w-3.5 h-3.5', loading && 'animate-spin']" />
          {{ '重试' }}
        </button>
      </div>
    </div>

    <template v-else>
      <SettingsCard full static extra-class="devices-mgmt-card">
        <div class="devices-mgmt-card__head">
          <div class="devices-mgmt-card__title">
            <span class="devices-mgmt-card__icon">🧹</span>
            <div>
              <h3 class="devices-mgmt-card__name">{{ '僵尸绑定清理' }}</h3>
              <p class="devices-mgmt-card__hint">
                {{ 'HA 中已不存在、但仍被布局部件 / 房间环境映射 / 统计传感器 / HA 配置 / 告警规则引用的实体绑定；解绑后可避免无效告警' }}
              </p>
            </div>
          </div>
          <div class="devices-mgmt-card__actions">
            <button
              v-if="zombieGroups.length"
              type="button"
              class="settings-btn-ghost settings-btn--sm"
              :disabled="unbinding"
              @click="toggleSelectAll"
            >
              <CheckSquare :class="['w-4 h-4']" />
              {{ selectedCount === zombieBindings.length && selectedCount > 0 ? '取消全选' : '全选' }}
            </button>
            <button
              type="button"
              class="settings-btn-accent settings-btn--sm"
              :disabled="selectedCount === 0 || unbinding"
              @click="confirmUnbind"
            >
              <Trash2 :class="['w-4 h-4', unbinding && 'animate-spin']" />
              {{ unbinding ? '解绑中…' : `解绑选中 (${selectedCount})` }}
            </button>
          </div>
        </div>

        <VEmptyState
          v-if="!zombieBindings.length && scanStatus === 'skipped'"
          icon="⚠️"
          title="HA 尚未同步，本次未检查"
          :description="`${scanInfo?.reason || 'Home Assistant 连接不可用'}。连接恢复后点「刷新」重新扫描。`"
          tone="amber"
          compact
        />

        <VEmptyState
          v-else-if="!zombieBindings.length && scanStatus === 'partial'"
          icon="⚠️"
          title="未发现僵尸绑定（结果可能不完整）"
          :description="`${scanInfo?.reason || '本次只对照了本地状态库'}；共检查 ${checkedCount} 处引用。`"
          tone="amber"
          compact
        />

        <VEmptyState
          v-else-if="!zombieBindings.length"
          icon="✅"
          title="未发现僵尸绑定"
          :description="healthyDescription"
          tone="emerald"
          compact
        />

        <p v-if="scanStatus === 'partial' && zombieBindings.length" class="devices-mgmt-warning">
          {{ scanInfo?.reason || '本次只对照了本地状态库' }}；共检查 {{ checkedCount }} 处引用，请核对后再解绑。
        </p>

        <div v-if="zombieBindings.length" class="devices-mgmt-zombies">
          <div v-for="group in zombieGroups" :key="group.source" class="devices-mgmt-group">
            <div class="devices-mgmt-group__head">
              <span class="devices-mgmt-group__label">{{ groupLabel(group.source) }}</span>
              <span class="devices-mgmt-count">{{ group.items.length }} 条</span>
            </div>
            <div class="devices-mgmt-list">
              <label
                v-for="item in group.items"
                :key="`${item.source}:${item.refId}:${item.entityId}`"
                class="devices-mgmt-row devices-mgmt-row--selectable"
              >
                <input v-model="selectedKeys" type="checkbox" :value="selectionKey(item)" class="devices-mgmt-check" />
                <div class="devices-mgmt-row__main">
                  <p class="devices-mgmt-row__title">{{ zombieTitle(item) }}</p>
                  <p class="devices-mgmt-row__meta">{{ item.location }}</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </SettingsCard>
    </template>
  </SettingsPageShell>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, AlertCircle, CheckSquare, Trash2 } from '@lucide/vue'
import SettingsPageShell from '@/features/settings/components/shell/SettingsPageShell.vue'
import SettingsCard from '@/features/settings/components/shell/SettingsCard.vue'
import VEmptyState from '@/kernel/ui/primitives/VEmptyState.vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { fetchDevicesOverview, unbindZombieBindings } from '@/kernel/http/index'

defineProps({ activeTab: { type: String, default: 'devices' } })

const chrome = useChromeStore()

const loading = ref(false)
const unbinding = ref(false)
const loadError = ref('')
// 服务端返回的僵尸绑定列表（HA 中已不存在但仍被引用）
const zombieBindings = ref([])
// 本次扫描状态：skipped / partial 都不能当成「没有僵尸」
const scanInfo = ref(null)
// 已勾选的僵尸绑定键集合（source:refId:entityId）
const selectedKeys = ref([])
const unbindFeedback = ref('')

/** 来源分组中文标签 */
const SOURCE_LABELS = {
  layoutWidget: '布局部件',
  room: '房间映射',
  stats: '统计传感器',
  haConfig: 'HA 配置',
  alertRule: '告警规则',
}

function groupLabel(source) {
  return SOURCE_LABELS[source] || source
}

const scanStatus = computed(() => scanInfo.value?.status || 'ok')
const checkedCount = computed(() =>
  Object.values(scanInfo.value?.scanned || {}).reduce((sum, count) => sum + (Number(count) || 0), 0),
)
const healthyDescription = computed(() => {
  if (!scanInfo.value) return '布局、房间与告警引用的实体在 Home Assistant 中均仍存在'
  if (!checkedCount.value) return '当前没有需要检查的实体引用'
  return `已检查 ${checkedCount.value} 处引用（布局部件 / 房间映射 / 统计 / HA 配置 / 告警规则），引用实体在 Home Assistant 中均仍存在`
})

/** 勾选键：source + refId + entityId 精确定位单条绑定（同一部件可绑多个实体） */
function selectionKey(item) {
  return `${item.source}:${item.refId}:${item.entityId}`
}

/** 列表主标题：实体名(实体ID)；无中文友好名时只显示实体 ID */
function zombieTitle(item) {
  const id = String(item?.entityId || '')
  const name = String(item?.entityName || '').trim()
  if (!id) return ''
  if (!name || name === id) return id
  const dot = id.indexOf('.')
  const objectId = dot >= 0 ? id.slice(dot + 1) : id
  if (name === objectId) return id
  return `${name}(${id})`
}

/** 按来源分组（固定顺序） */
const zombieGroups = computed(() => {
  const order = ['layoutWidget', 'room', 'stats', 'haConfig', 'alertRule']
  const map = new Map()
  for (const item of zombieBindings.value) {
    if (!map.has(item.source)) map.set(item.source, [])
    map.get(item.source).push(item)
  }
  return order.filter((s) => map.has(s)).map((s) => ({ source: s, items: map.get(s) }))
})

const selectedCount = computed(() => selectedKeys.value.length)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await fetchDevicesOverview()
    zombieBindings.value = data?.zombieBindings || []
    scanInfo.value = data?.scan || null
    // 解绑后重新加载时清空旧勾选与反馈
    selectedKeys.value = []
    unbindFeedback.value = ''
  } catch (err) {
    loadError.value = err?.message || '请稍后重试'
  } finally {
    loading.value = false
  }
}

function toggleSelectAll() {
  if (selectedKeys.value.length === zombieBindings.value.length && zombieBindings.value.length > 0) {
    selectedKeys.value = []
  } else {
    selectedKeys.value = zombieBindings.value.map(selectionKey)
  }
}

/** 确认并批量解绑选中项 */
async function confirmUnbind() {
  const confirmed = await chrome.confirm(
    `将解绑 ${selectedCount.value} 条僵尸绑定：删除对应布局部件、清空房间映射 / 统计与 HA 配置绑定、删除告警规则。此操作不可撤销，确定继续？`,
    '解绑僵尸绑定',
    { confirmText: '确认解绑', type: 'danger' },
  )
  if (!confirmed) return

  const selectedSet = new Set(selectedKeys.value)
  const selected = zombieBindings.value.filter((it) => selectedSet.has(selectionKey(it)))
  unbinding.value = true
  try {
    const { data } = await unbindZombieBindings(selected)
    const parts = []
    if (data?.unbound) parts.push(`成功 ${data.unbound} 条`)
    if (data?.skipped) parts.push(`已跳过 ${data.skipped} 条`)
    if (data?.failed) parts.push(`失败 ${data.failed} 条`)
    const feedback = parts.length ? `解绑完成：${parts.join('，')}` : '未处理任何绑定'
    await load()
    unbindFeedback.value = feedback
  } catch (err) {
    await load()
    unbindFeedback.value = `解绑失败：${err?.message || '请稍后重试'}`
  } finally {
    unbinding.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.devices-mgmt-card {
  margin-bottom: var(--hos-space-2xl);
}

.devices-mgmt-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: var(--hos-hairline) solid var(--hos-line-2);
}

.devices-mgmt-card__title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.devices-mgmt-card__icon {
  font-size: 22px;
  line-height: 1;
}

.devices-mgmt-card__name {
  margin: 0;
  font-size: var(--hos-fs-6);
  font-weight: 600;
  color: var(--hos-fg-1);
}

.devices-mgmt-card__hint {
  margin: 4px 0 0;
  font-size: var(--set-fs-micro, 12px);
  line-height: 1.5;
  color: var(--hos-fg-2);
}

.devices-mgmt-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.devices-mgmt-count {
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-fg-2);
  white-space: nowrap;
}

.devices-mgmt-warning {
  margin: 8px 20px 4px;
  padding: 8px 12px;
  border-radius: var(--hos-radius-sm, 8px);
  background: rgba(245, 158, 11, 0.12);
  border: var(--hos-hairline) solid rgba(245, 158, 11, 0.35);
  font-size: var(--set-fs-micro, 12px);
  line-height: 1.5;
  color: var(--hos-fg-2);
}

.devices-mgmt-list {
  display: flex;
  flex-direction: column;
}

.devices-mgmt-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: var(--hos-hairline) solid var(--hos-line-1);
}

.devices-mgmt-row:last-child {
  border-bottom: none;
}

.devices-mgmt-row--selectable {
  cursor: pointer;
  transition: background 0.15s ease;
}

.devices-mgmt-row--selectable:hover {
  background: rgba(var(--hos-color-accent-rgb), 0.06);
}

.devices-mgmt-check {
  accent-color: var(--hos-color-accent);
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.devices-mgmt-row__main {
  flex: 1;
  min-width: 0;
}

.devices-mgmt-row__title {
  margin: 0;
  font-size: var(--hos-fs-4);
  font-weight: 500;
  color: var(--hos-fg-body);
  word-break: break-all;
}

.devices-mgmt-row__meta {
  margin: 3px 0 0;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-fg-2);
  word-break: break-all;
}

.devices-mgmt-zombies {
  padding: 4px 0;
}

.devices-mgmt-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 6px;
}

.devices-mgmt-group__label {
  font-size: var(--hos-fs-3);
  font-weight: 600;
  color: var(--hos-color-accent);
}

/* .settings-btn--sm 已收敛到 features/settings/shared/styles/settings-forms.css */
</style>
