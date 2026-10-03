<!--
  设备管理面板：僵尸实体绑定清理向导
  所属模块：设置 - 入门与连接
  职责：扫描并批量解绑 HA 中已不存在的僵尸绑定。设备 OTA 请到 Home Assistant 中操作。
  依赖：fetchDevicesOverview / unbindZombieBindings（system API）、chrome.confirm 确认弹窗
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="devices"
    icon-key="cpu"
    accent="var(--module-accent-connection)"
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
      <!-- 僵尸绑定清理向导 -->
      <SettingsCard full static extra-class="devices-mgmt-card">
        <div class="devices-mgmt-card__head">
          <div class="devices-mgmt-card__title">
            <span class="devices-mgmt-card__icon">🧹</span>
            <div>
              <h3 class="devices-mgmt-card__name">{{ '僵尸绑定清理' }}</h3>
              <p class="devices-mgmt-card__hint">
                {{ 'HA 中已不存在、但仍被布局 / 房间 / 告警规则 / 寿命统计引用的实体绑定；解绑后可避免无效告警' }}
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
          v-if="!zombieBindings.length"
          icon="✅"
          title="未发现僵尸绑定"
          description="布局、房间、告警与寿命统计引用的实体在 Home Assistant 中均仍存在"
          tone="emerald"
          compact
        />

        <div v-else class="devices-mgmt-zombies">
          <div v-for="group in zombieGroups" :key="group.source" class="devices-mgmt-group">
            <div class="devices-mgmt-group__head">
              <span class="devices-mgmt-group__label">{{ groupLabel(group.source) }}</span>
              <span class="devices-mgmt-count">{{ group.items.length }} 条</span>
            </div>
            <div class="devices-mgmt-list">
              <label
                v-for="item in group.items"
                :key="`${item.source}:${item.refId}`"
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
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { useChromeStore } from '@/stores/chrome.store'
import { fetchDevicesOverview, unbindZombieBindings } from '@/services/api/system'

// 入参：当前激活的设置 Tab
defineProps({ activeTab: { type: String, default: 'devices' } })

const chrome = useChromeStore()

const loading = ref(false)
const unbinding = ref(false)
const loadError = ref('')
// 服务端返回的僵尸绑定列表（HA 中已不存在但仍被引用）
const zombieBindings = ref([])
// 已勾选的僵尸绑定键集合（source:refId）
const selectedKeys = ref([])
const unbindFeedback = ref('')

/** 来源分组中文标签 */
const SOURCE_LABELS = {
  layoutWidget: '布局 Widget',
  areaEntity: '房间绑定',
  alertRule: '告警规则',
  deviceLifespan: '寿命统计',
}

function groupLabel(source) {
  return SOURCE_LABELS[source] || source
}

/** 勾选键：source + refId 精确定位单条绑定 */
function selectionKey(item) {
  return `${item.source}:${item.refId}`
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
  const order = ['layoutWidget', 'areaEntity', 'alertRule', 'deviceLifespan']
  const map = new Map()
  for (const item of zombieBindings.value) {
    if (!map.has(item.source)) map.set(item.source, [])
    map.get(item.source).push(item)
  }
  return order
    .filter((s) => map.has(s))
    .map((s) => ({ source: s, items: map.get(s) }))
})

const selectedCount = computed(() => selectedKeys.value.length)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await fetchDevicesOverview()
    zombieBindings.value = data?.zombieBindings || []
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
    `将解绑 ${selectedCount.value} 条僵尸绑定：删除对应布局部件 / 房间绑定 / 告警规则 / 寿命统计记录。此操作不可撤销，确定继续？`,
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
  margin-bottom: var(--hos-space-6, 24px);
}

.devices-mgmt-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.08));
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
  font-size: var(--premium-fs-title);
  font-weight: 600;
  color: var(--hos-text-strong, #f4f4f5);
}

.devices-mgmt-card__hint {
  margin: 4px 0 0;
  font-size: var(--set-fs-micro, 12px);
  line-height: 1.5;
  color: var(--hos-text-dim, #a1a1aa);
}

.devices-mgmt-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.devices-mgmt-count {
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
  white-space: nowrap;
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
  border-bottom: var(--hos-hairline) solid var(--hos-border, rgba(255, 255, 255, 0.06));
}

.devices-mgmt-row:last-child {
  border-bottom: none;
}

.devices-mgmt-row--selectable {
  cursor: pointer;
  transition: background 0.15s ease;
}

.devices-mgmt-row--selectable:hover {
  background: rgba(var(--module-accent-connection-rgb, 52, 211, 153), 0.06);
}

.devices-mgmt-check {
  accent-color: var(--module-accent-connection, #34d399);
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
  font-size: var(--premium-fs-body-sm);
  font-weight: 500;
  color: var(--hos-text, #e4e4e7);
  word-break: break-all;
}

.devices-mgmt-row__meta {
  margin: 3px 0 0;
  font-size: var(--set-fs-micro, 12px);
  color: var(--hos-text-dim, #a1a1aa);
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
  font-size: var(--premium-fs-caption);
  font-weight: 600;
  color: var(--module-accent-connection, #34d399);
}

.settings-btn--sm {
  padding: 6px 12px;
  font-size: var(--set-fs-micro, 12px);
}
</style>
