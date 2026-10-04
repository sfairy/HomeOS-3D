<!--
  组件文件：EventLogRecordFilterSection.vue
  所属模块：frontend/src/views/settings/connect/connection
  组件职责：系统连接大类下的事件日志记录过滤配置面板，控制 HomeOS 要持久化到 PG 的
    HA 事件实体范围与域名白/黑名单。顶部为开/关大开关，中部为 allow_domains /
    block_domains 两档模式切换、域名快速预设、多选实体屏蔽，并展示近期记录数量
    与性能洞察推荐卡。
  主要 props / emits：无 props / emits（独立 Section 级，使用 composable 自给自足）。
  依赖关系：引用 useEventLogRecordFilter composable 获取 enabled/mode/blockEntityIds/
    entityDomains/summaryParts/saving/feedback/load/save/toggleEnabled/toggleDomain/
    applyPreset 等全部响应式状态与方法；useRecommendInsight 渲染推荐卡。
  注意事项：allow_domains 模式仅会保存勾选的域名（白名单），block_domains 模式为
    黑名单排除；调整后需点击底部保存按钮才会持久化到后端。
-->
<script setup>
/**
 * 职责：渲染 views/EventLogRecordFilterSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed, onMounted } from 'vue'
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldOff,
  Ban,
  ListFilter,
  Save,
} from '@lucide/vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import { useRecommendInsight } from '@/composables/recommend/useRecommendInsight'
import { formatCount, hoursLabel } from '@/utils/events/events-display.util'
import { useEventLogRecordFilter } from '@/composables/settings/connect/event-log-record-filter.util'

const {
  enabled,
  mode,
  blockEntityIds,
  entityDomains,
  domainPresets,
  extraDomains,
  activeDomains,
  summaryParts,
  recordInsight,
  perfInsight,
  statsLoading,
  statsHours,
  eventStats,
  saving,
  feedback,
  load,
  loadStats,
  save,
  toggleEnabled,
  toggleDomain,
  applyPreset,
  selectAllPresetDomains,
  clearDomains,
  applyRecommendations,
  applyRecordBanner,
  applyRecordChip,
  handlePerfBanner,
} = useEventLogRecordFilter()

const recordMeta = computed(() =>
  eventStats.value
    ? `近 ${hoursLabel(statsHours.value)} · ${formatCount(eventStats.value.total)} 条记录`
    : '',
)

const { cardProps: recordCardProps } = useRecommendInsight({
  loading: statsLoading,
  insight: recordInsight,
  meta: recordMeta,
  visible: computed(() => statsLoading.value || Boolean(eventStats.value)),
})

const { cardProps: perfCardProps } = useRecommendInsight({
  loading: statsLoading,
  insight: perfInsight,
  visible: computed(() => statsLoading.value || Boolean(eventStats.value)),
})

onMounted(() => {
  void load().then(() => loadStats())
})

function applyQuickPreset() {
  if (mode.value === 'allow_domains') {
    applyPreset(['light', 'switch', 'climate', 'cover', 'fan'])
    return
  }
  applyPreset(['sensor', 'binary_sensor'])
}
</script>

<template>
  <section class="el-record-filter">
    <div
      class="el-record-filter__toggle"
      :class="enabled ? 'el-record-filter__toggle--on' : 'el-record-filter__toggle--off'"
    >
      <div class="el-record-filter__toggle-main">
        <div
          class="el-record-filter__icon"
          :class="enabled ? 'el-record-filter__icon--on' : 'el-record-filter__icon--off'"
        >
          <FileText class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="el-record-filter__title">{{ '启用事件记录筛选' }}</p>
          <p class="el-record-filter__desc">
            {{ '控制哪些实体的状态变更写入 EventLog。不影响实时状态同步与 WebSocket 推送。' }}
          </p>
        </div>
      </div>
      <button
        type="button"
        class="toggle-btn"
        :class="{ on: enabled }"
        :disabled="saving"
        :aria-label="'启用事件记录筛选'"
        @click="toggleEnabled"
      >
        <div class="toggle-dot" :class="{ on: enabled }" />
      </button>
    </div>

    <div class="el-record-filter__insights">
      <RecommendInsightCard
        v-bind="recordCardProps"
        loading-text="正在分析 EventLog 高频记录…"
        apply-label="一键应用推荐"
        @refresh="loadStats"
        @apply="applyRecommendations"
        @banner-action="applyRecordBanner"
        @chip-click="applyRecordChip"
      />

      <RecommendInsightCard
        v-bind="perfCardProps"
        loading-text="正在分析 EventLog 性能…"
        @refresh="loadStats"
        @banner-action="handlePerfBanner"
      />
    </div>

    <div v-if="enabled" class="el-record-filter__body">
      <div v-if="summaryParts.length" class="el-record-filter__summary">
        <span
          v-for="(part, idx) in summaryParts"
          :key="part"
          class="el-record-filter__summary-item"
        >
          <span v-if="idx > 0" class="el-record-filter__summary-sep">·</span>
          {{ part }}
        </span>
      </div>

      <div class="el-record-filter__mode">
        <span class="el-record-filter__label">{{ '筛选模式' }}</span>
        <div class="el-record-filter__mode-segments">
          <button
            type="button"
            class="el-record-filter__mode-seg"
            :class="{ 'el-record-filter__mode-seg--active': mode === 'block' }"
            @click="mode = 'block'"
          >
            <Ban class="el-record-filter__mode-seg-icon" />
            <span class="el-record-filter__mode-seg-title">{{ '排除指定域' }}</span>
            <span class="el-record-filter__mode-seg-desc">{{ '默认记录，屏蔽噪声域' }}</span>
          </button>
          <button
            type="button"
            class="el-record-filter__mode-seg"
            :class="{ 'el-record-filter__mode-seg--active': mode === 'allow_domains' }"
            @click="mode = 'allow_domains'"
          >
            <ListFilter class="el-record-filter__mode-seg-icon" />
            <span class="el-record-filter__mode-seg-title">{{ '仅记录指定域' }}</span>
            <span class="el-record-filter__mode-seg-desc">{{ '白名单模式，更严格' }}</span>
          </button>
        </div>
      </div>

      <div class="el-record-filter__card">
        <header class="el-record-filter__card-head">
          <div class="el-record-filter__card-meta">
            <span class="el-record-filter__label">
              {{ mode === 'allow_domains' ? '允许记录的域' : '排除的域' }}
            </span>
            <p class="el-record-filter__card-desc">
              {{
                mode === 'allow_domains'
                  ? '仅选中域的状态变更会写入 EventLog；留空则不写入任何记录。'
                  : '选中域的状态变更不会写入 EventLog，可与下方实体排除组合使用。'
              }}
            </p>
          </div>
          <span v-if="activeDomains.length" class="el-record-filter__badge">
            {{ activeDomains.length }}
          </span>
        </header>

        <div class="el-record-filter__toolbar">
          <button
            type="button"
            class="el-record-filter__tool-btn el-record-filter__tool-btn--accent"
            @click="applyQuickPreset"
          >
            {{ mode === 'allow_domains' ? '+ 控制类' : '+ 传感器类' }}
          </button>
          <button type="button" class="el-record-filter__tool-btn" @click="selectAllPresetDomains">
            {{ '全选' }}
          </button>
          <button
            type="button"
            class="el-record-filter__tool-btn"
            :disabled="!activeDomains.length"
            @click="clearDomains"
          >
            {{ '清空' }}
          </button>
        </div>

        <div class="el-record-filter__domain-chips">
          <button
            v-for="item in domainPresets"
            :key="item.key"
            type="button"
            class="el-record-filter__domain-chip"
            :class="{ 'el-record-filter__domain-chip--active': activeDomains.includes(item.key) }"
            @click="toggleDomain(item.key)"
          >
            {{ item.label }}
          </button>
        </div>

        <div v-if="extraDomains.length" class="el-record-filter__extra">
          <span class="el-record-filter__extra-label">{{ '其他域' }}</span>
          <div class="el-record-filter__domain-chips el-record-filter__domain-chips--extra">
            <button
              v-for="domain in extraDomains"
              :key="domain"
              type="button"
              class="el-record-filter__domain-chip el-record-filter__domain-chip--muted"
              :class="{ 'el-record-filter__domain-chip--active': activeDomains.includes(domain) }"
              @click="toggleDomain(domain)"
            >
              {{ domain }}
            </button>
          </div>
        </div>
      </div>

      <div class="el-record-filter__card el-record-filter__card--entity">
        <header class="el-record-filter__card-head">
          <div class="el-record-filter__entity-head">
            <div class="el-record-filter__entity-icon">
              <ShieldOff class="w-4 h-4" />
            </div>
            <div class="min-w-0">
              <span class="el-record-filter__label">{{ '排除的实体' }}</span>
              <p class="el-record-filter__card-desc">
                {{ '无论域筛选如何，选中的 entity_id 均不会写入 EventLog。' }}
              </p>
            </div>
          </div>
          <span v-if="blockEntityIds.length" class="el-record-filter__badge">
            {{ blockEntityIds.length }}
          </span>
        </header>

        <EntityMultiSelect
          v-model="blockEntityIds"
          wrapper-class="el-record-filter__multiselect"
          :allowed-domains="entityDomains"
          :placeholder="'点击搜索并选择要排除的实体'"
        />
      </div>

      <footer class="el-record-filter__footer">
        <button type="button" class="el-record-filter__save-btn" :disabled="saving" @click="save">
          <Loader2 v-if="saving" class="el-record-filter__save-icon animate-spin" />
          <Save v-else class="el-record-filter__save-icon" />
          {{ saving ? '保存中…' : '保存筛选规则' }}
        </button>
        <p
          v-if="feedback"
          :class="[
            'el-record-filter__feedback',
            feedback.ok
              ? 'el-record-filter__feedback--ok'
              : feedback.ok === false
                ? 'el-record-filter__feedback--err'
                : 'el-record-filter__feedback--warn',
          ]"
        >
          <Loader2 v-if="feedback.ok === undefined" class="w-3.5 h-3.5 animate-spin shrink-0" />
          <CheckCircle2 v-else-if="feedback.ok" class="w-3.5 h-3.5 shrink-0" />
          <AlertCircle v-else class="w-3.5 h-3.5 shrink-0" />
          <span>{{ feedback.message }}</span>
        </p>
      </footer>
    </div>

    <footer v-else class="el-record-filter__footer el-record-filter__footer--disabled">
      <button type="button" class="el-record-filter__save-btn" :disabled="saving" @click="save">
        <Loader2 v-if="saving" class="el-record-filter__save-icon animate-spin" />
        <Save v-else class="el-record-filter__save-icon" />
        {{ saving ? '保存中…' : '保存筛选规则' }}
      </button>
      <p
        v-if="feedback"
        :class="[
          'el-record-filter__feedback',
          feedback.ok
            ? 'el-record-filter__feedback--ok'
            : feedback.ok === false
              ? 'el-record-filter__feedback--err'
              : 'el-record-filter__feedback--warn',
        ]"
      >
        <Loader2 v-if="feedback.ok === undefined" class="w-3.5 h-3.5 animate-spin shrink-0" />
        <CheckCircle2 v-else-if="feedback.ok" class="w-3.5 h-3.5 shrink-0" />
        <AlertCircle v-else class="w-3.5 h-3.5 shrink-0" />
        <span>{{ feedback.message }}</span>
      </p>
    </footer>
  </section>
</template>
<style src="./styles/connection.css"></style>
