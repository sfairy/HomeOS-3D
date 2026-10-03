<!--
  @file DeviceEntityReferencesPanel.vue
  @module 设备详情/功能引用面板
  @description 设备详情页的「功能引用」子面板：扫描自动化、场景、脚本、家庭模式、告警、布局绑定等配置中
               对该实体的引用，支持按引用类型筛选、跳转与（有权限时）移除引用。
               数据由 useDeviceEntityReferences 组合式函数提供，组件负责展示与筛选交互。
  @dependencies vue（computed/ref/watch）、@lucide/vue、useDeviceEntityReferences、
                entity-references 类型与标签常量（ENTITY_REFERENCE_KIND_LABELS 等）。
-->
<template>
  <div class="device-detail-tab device-refs-tab">
    <div
      v-if="!loading && total > 0"
      class="dev-metric-grid device-detail-tab__metrics device-detail-tab__metrics--3"
    >
      <div class="dev-metric">
        <div class="dev-metric__icon"><Link2 class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ total }}</div>
          <div class="dev-metric__label">{{ '引用总数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><Layers class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ kindGroupCount }}</div>
          <div class="dev-metric__label">{{ '涉及功能' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><Workflow class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ orchestratorCount }}</div>
          <div class="dev-metric__label">{{ '联动编排' }}</div>
        </div>
      </div>
    </div>

    <div
      class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-detail-tab__card device-refs-panel"
    >
      <div class="dev-card__header">
        <div class="dev-card__title-row">
          <Link2 class="w-4 h-4 der-icon-info" />
          <span class="dev-card__title">{{ '功能引用' }}</span>
          <span v-if="total > 0" class="device-refs-panel__count">{{ total }} 处</span>
        </div>
        <div class="device-refs-panel__actions">
          <button
            type="button"
            class="dev-btn-refresh"
            :disabled="loading"
            :aria-label="'刷新'"
            :title="'刷新'"
            @click="refresh()"
          >
            <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
          </button>
        </div>
      </div>

      <p class="device-refs-panel__hint">
        {{
          canUnlink
            ? '扫描自动化、场景、脚本、家庭模式、告警、布局绑定等配置中对该实体的引用；可一键移除'
            : '扫描自动化、场景、脚本、家庭模式、告警、布局绑定等配置中对该实体的引用'
        }}
      </p>

      <!-- 加载中：扫描引用动画 -->
      <div v-if="loading && !items.length" class="dev-state-block device-detail-tab__fallback">
        <RefreshCw class="w-4 h-4 animate-spin" />
        <span>{{ '扫描引用中…' }}</span>
      </div>

      <div
        v-else-if="error"
        class="dev-state-block dev-state-block--error device-detail-tab__fallback"
      >
        <AlertCircle class="w-4 h-4" />
        <span>{{ error }}</span>
        <button type="button" class="dev-range__btn" @click="refresh()">{{ '重试' }}</button>
      </div>

      <!-- 空数据：无引用提示 -->
      <div v-else-if="!items.length" class="dev-state-block device-detail-tab__fallback">
        <Link2 class="w-4 h-4 opacity-40" />
        <span>{{ '暂无功能引用该实体' }}</span>
      </div>

      <!-- 引用主体：类型筛选按钮 + 引用列表 -->
      <div v-else class="device-refs-panel__body">
        <!-- 类型筛选：全部 + 各引用类型按钮，显示对应计数 -->
        <div class="device-refs-panel__filters">
          <button
            type="button"
            :class="['dev-range__btn', !kindFilter && 'dev-range__btn--active']"
            @click="kindFilter = ''"
          >
            {{ '全部' }}
            <span class="device-refs-panel__filter-count">{{ total }}</span>
          </button>
          <button
            v-for="kind in presentKinds"
            :key="kind"
            type="button"
            :class="['dev-range__btn', kindFilter === kind && 'dev-range__btn--active']"
            @click="kindFilter = kind"
          >
            {{ ENTITY_REFERENCE_KIND_LABELS[kind] }}
            <span class="device-refs-panel__filter-count">{{ counts[kind] || 0 }}</span>
          </button>
        </div>

        <!-- 引用列表：每项含类型标签、名称、详情、角色、启用状态与跳转/移除操作 -->
        <ul class="device-refs-panel__list">
          <li v-for="item in filteredItems" :key="`${item.kind}:${item.id}:${item.role}`">
            <div class="device-refs-panel__row">
              <component
                :is="item.path ? 'router-link' : 'div'"
                :to="item.path || undefined"
                class="device-refs-panel__link"
              >
                <div class="device-refs-panel__main">
                  <span class="device-refs-panel__kind">{{
                    ENTITY_REFERENCE_KIND_LABELS[item.kind] || item.kind
                  }}</span>
                  <span class="device-refs-panel__name">{{ item.name }}</span>
                  <span
                    v-if="item.detail"
                    class="device-refs-panel__detail"
                    :title="item.detail"
                    >{{ item.detail }}</span
                  >
                </div>
                <div class="device-refs-panel__meta">
                  <span class="device-refs-panel__role">{{
                    ENTITY_REFERENCE_ROLE_LABELS[item.role] || item.role
                  }}</span>
                  <span
                    v-if="item.enabled === false"
                    class="device-refs-panel__badge device-refs-panel__badge--off"
                    >{{ '已禁用' }}</span
                  >
                  <span
                    v-else-if="item.enabled === true"
                    class="device-refs-panel__badge device-refs-panel__badge--on"
                    >{{ '启用' }}</span
                  >
                  <ChevronRight v-if="item.path" class="w-3.5 h-3.5 device-refs-panel__chevron" />
                </div>
              </component>

              <button
                v-if="canUnlink"
                type="button"
                class="device-refs-panel__unlink"
                :disabled="!!unlinkingId || !canUnlinkItem(item)"
                :title="canUnlinkItem(item) ? '移除引用' : unlinkDisabledReason(item)"
                :aria-label="canUnlinkItem(item) ? '移除引用' : unlinkDisabledReason(item)"
                @click.stop.prevent="canUnlinkItem(item) && unlink(item)"
              >
                <Loader2
                  v-if="unlinkingId === `${item.kind}:${item.id}`"
                  class="w-3.5 h-3.5 animate-spin"
                />
                <Trash2 v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertCircle,
  ChevronRight,
  Layers,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
  Workflow,
} from '@lucide/vue'
import { useDeviceEntityReferences } from '@/composables/device/useDeviceEntityReferences'
import {
  ENTITY_REFERENCE_KIND_LABELS,
  ENTITY_REFERENCE_KIND_ORDER,
  ENTITY_REFERENCE_ROLE_LABELS,
  type EntityReferenceKind,
} from '@/types/entity-references'

// 组件属性：entityId 必填，visible 控制是否加载引用数据。
const props = withDefaults(
  defineProps<{
    entityId: string
    visible?: boolean
  }>(),
  { visible: true },
)

// 计算属性：entityId 响应式引用，变化时组合式函数自动重新扫描。
const entityIdRef = computed(() => props.entityId)
// 计算属性：visible 默认 true。
const visibleRef = computed(() => props.visible !== false)
// 当前激活的类型筛选，空字符串表示全部。
const kindFilter = ref<EntityReferenceKind | ''>('')

const { canUnlink, canUnlinkItem, unlinkDisabledReason, loading, unlinkingId, error, total, items, counts, refresh, unlink } =
  useDeviceEntityReferences(entityIdRef, visibleRef)

/**
 * 监听 entityId 变化：切换实体时重置类型筛选，避免残留无效筛选态。
 */
watch(entityIdRef, () => {
  kindFilter.value = ''
})

/**
 * 计算属性：当前引用中实际存在的类型，按预设顺序排列，用于渲染筛选按钮。
 */
const presentKinds = computed(() =>
  ENTITY_REFERENCE_KIND_ORDER.filter((kind) => (counts.value[kind] || 0) > 0),
)

// 计算属性：涉及的功能类型数，用于指标卡。
const kindGroupCount = computed(() => presentKinds.value.length)

/**
 * 计算属性：联动编排数 = automation + scene + script + template + home_mode 计数之和。
 */
const orchestratorCount = computed(
  () =>
    (counts.value.automation || 0) +
    (counts.value.scene || 0) +
    (counts.value.script || 0) +
    (counts.value.template || 0) +
    (counts.value.home_mode || 0),
)

/**
 * 计算属性：按当前类型筛选后的引用列表；kindFilter 为空时返回全部。
 */
const filteredItems = computed(() => {
  if (!kindFilter.value) return items.value
  return items.value.filter((item) => item.kind === kindFilter.value)
})
</script>

<style scoped src="./styles/DeviceEntityReferencesPanel.css"></style>
