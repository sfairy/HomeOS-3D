<!--
  组件文件：SetupWizardPresencePanel.vue
  所属模块：frontend/src/views/settings/connect/setup-wizard
  组件职责：初始化向导「安防步」内嵌的人员在家判定面板子组件。顶部显示当前在家人数
    （全员在家/全员离家/X 人在家）与刷新按钮；中部分两列显示在家人员和离家人员
    （头像配色 + 姓名 + 最后在线时间），下方两个大开关：自动布防（全员离家切换为安防
    布防模式）与自动升级（有人回家自动撤防），右上角提供跳转到安防联动页的外链按钮。
  主要 props / emits：
    - props presenceMembers：人员对象数组
    - props presenceLoading / presenceLoaded：加载状态与是否加载过
    - props presenceAutoMode：是否自动跟踪模式
    - props presenceAtHomeCount：当前在家人数（用于配色）
    - props autoArmEnabled / autoUpgradeEnabled：两个开关状态
    - props presenceFlagSaving：开关保存加载态
    - props loadPresence / toggleAutoArm / toggleAutoUpgrade / memberInitial /
      memberTone：回调函数
  依赖关系：引用 SETTINGS_ROUTES.securityModes('linkage') 跳转安防联动页；
    RouterLink 组件；纯 UI + 回调驱动，无独立 API 调用。
  注意事项：presenceMembers 为空时显示「暂无人员」占位；人员最后在线时间通过内部
    Date.parse 计算（刚刚/X 分钟前/X 小时前/X 天前），异常时间字符串不显示。
-->
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/SetupWizardPresencePanel 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Users, RefreshCw, Loader2, ExternalLink, ChevronRight } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  presenceMembers: { type: Array, default: () => [] },
  presenceLoading: { type: Boolean, default: false },
  presenceLoaded: { type: Boolean, default: false },
  presenceAutoMode: { type: Boolean, default: true },
  presenceSummary: { type: String, default: '' },
  presenceAtHomeCount: { type: Number, default: 0 },
  autoArmEnabled: { type: Boolean, default: false },
  autoUpgradeEnabled: { type: Boolean, default: false },
  presenceFlagSaving: { type: Boolean, default: false },
  loadPresence: { type: Function, required: true },
  toggleAutoArm: { type: Function, required: true },
  toggleAutoUpgrade: { type: Function, required: true },
  memberInitial: { type: Function, required: true },
  memberTone: { type: Function, required: true },
})

const hasMembers = computed(() => props.presenceMembers.length > 0)

const homeMembers = computed(() =>
  props.presenceMembers.map((m, idx) => ({ m, idx })).filter(({ m }) => m.atHome),
)

const awayMembers = computed(() =>
  props.presenceMembers.map((m, idx) => ({ m, idx })).filter(({ m }) => !m.atHome),
)

const homeHeadline = computed(() => {
  const n = props.presenceAtHomeCount
  const total = props.presenceMembers.length
  if (!total) return '暂无人员'
  if (n <= 0) return '全员离家'
  if (n === total) return '全员在家'
  return `${n} 人在家`
})

const showSplitRoster = computed(
  () => homeMembers.value.length > 0 && awayMembers.value.length > 0,
)

function memberName(m) {
  return String(m?.name || m?.id || '未知')
}

function memberLastSeen(m) {
  const raw = m?.lastSeen
  if (!raw || typeof raw !== 'string') return ''
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
</script>

<template>
  <section
    :class="[
      'sw-presence',
      presenceAtHomeCount > 0 ? 'sw-presence--occupied' : 'sw-presence--vacant',
      autoArmEnabled && 'sw-presence--armed',
    ]"
  >
    <div class="sw-presence__glow" aria-hidden="true" />

    <header class="sw-presence__head">
      <div class="sw-presence__brand">
        <span class="sw-presence__eyebrow">{{ '在家状态' }}</span>
        <h4 class="sw-presence__title">{{ '人员在家判定' }}</h4>
      </div>
      <div class="sw-presence__head-actions">
        <RouterLink :to="SETTINGS_ROUTES.securityModes('linkage')" class="sw-presence__ghost-btn">
          {{ '管理人员' }}
        </RouterLink>
        <button
          type="button"
          class="sw-presence__icon-btn"
          :disabled="presenceLoading"
          :aria-label="presenceLoading ? '刷新中' : '刷新人员状态'"
          @click="loadPresence"
        >
          <RefreshCw :class="['w-3.5 h-3.5', presenceLoading && 'animate-spin']" />
        </button>
      </div>
    </header>

    <div v-if="presenceLoading && !presenceLoaded" class="sw-presence__loading">
      <Loader2 class="sw-presence__loading-icon animate-spin" />
      <p>{{ '同步人员状态…' }}</p>
    </div>

    <template v-else>
      <div v-if="hasMembers" class="sw-presence__body">
        <div class="sw-presence__hero">
          <div class="sw-presence__hero-main">
            <div class="sw-presence__stack" aria-hidden="true">
              <span
                v-for="{ m, idx } in (homeMembers.length ? homeMembers : awayMembers).slice(0, 4)"
                :key="m.id || idx"
                :class="['sw-presence__stack-av', `sw-presence__stack-av--${memberTone(idx)}`]"
                :style="{ zIndex: 10 - idx }"
              >
                {{ memberInitial(memberName(m)) }}
              </span>
            </div>
            <div class="sw-presence__hero-copy">
              <p class="sw-presence__hero-kicker">{{ homeHeadline }}</p>
              <p class="sw-presence__hero-sub">
                {{ `${presenceAtHomeCount} / ${presenceMembers.length} 位成员` }}
                <span class="sw-presence__dot">·</span>
                {{ autoArmEnabled ? '自动布防已开' : '自动布防未开' }}
              </p>
            </div>
          </div>
          <div class="sw-presence__stats">
            <div class="sw-presence__stat sw-presence__stat--home">
              <span class="sw-presence__stat-n">{{ homeMembers.length }}</span>
              <span class="sw-presence__stat-l">{{ '在家' }}</span>
            </div>
            <div class="sw-presence__stat">
              <span class="sw-presence__stat-n">{{ awayMembers.length }}</span>
              <span class="sw-presence__stat-l">{{ '离家' }}</span>
            </div>
          </div>
        </div>

        <div
          class="sw-presence__roster"
          :class="showSplitRoster && 'sw-presence__roster--split'"
        >
          <div v-if="homeMembers.length" class="sw-presence__lane">
            <div class="sw-presence__lane-label">
              <span class="sw-presence__lane-mark sw-presence__lane-mark--home" />
              {{ '在家' }}
              <span class="sw-presence__lane-n">{{ homeMembers.length }}</span>
            </div>
            <ul class="sw-presence__grid">
              <li
                v-for="{ m, idx } in homeMembers"
                :key="m.id || idx"
                :class="['sw-presence__cell', 'sw-presence__cell--home', `sw-presence__cell--${memberTone(idx)}`]"
              >
                <span class="sw-presence__cell-av">{{ memberInitial(memberName(m)) }}</span>
                <span class="sw-presence__cell-text">
                  <span class="sw-presence__cell-name">{{ memberName(m) }}</span>
                  <span v-if="memberLastSeen(m)" class="sw-presence__cell-meta">{{
                    memberLastSeen(m)
                  }}</span>
                </span>
                <span class="sw-presence__cell-tag">{{ '在家' }}</span>
              </li>
            </ul>
          </div>

          <div v-if="awayMembers.length" class="sw-presence__lane">
            <div class="sw-presence__lane-label">
              <span class="sw-presence__lane-mark sw-presence__lane-mark--away" />
              {{ '离家' }}
              <span class="sw-presence__lane-n">{{ awayMembers.length }}</span>
            </div>
            <ul class="sw-presence__grid">
              <li
                v-for="{ m, idx } in awayMembers"
                :key="m.id || idx"
                :class="['sw-presence__cell', 'sw-presence__cell--away', `sw-presence__cell--${memberTone(idx)}`]"
              >
                <span class="sw-presence__cell-av">{{ memberInitial(memberName(m)) }}</span>
                <span class="sw-presence__cell-text">
                  <span class="sw-presence__cell-name">{{ memberName(m) }}</span>
                  <span v-if="memberLastSeen(m)" class="sw-presence__cell-meta">{{
                    memberLastSeen(m)
                  }}</span>
                </span>
                <span class="sw-presence__cell-tag">{{ '离家' }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else-if="presenceLoaded" class="sw-presence__empty">
        <div class="sw-presence__empty-orb">
          <Users class="w-5 h-5" />
        </div>
        <p class="sw-presence__empty-title">
          {{ presenceAutoMode ? '尚未同步人员' : '暂无状态数据' }}
        </p>
        <p class="sw-presence__empty-text">
          {{
            presenceAutoMode
              ? '在 HA 配置 person / device_tracker，或自定义判定人员。'
              : '请检查实体 ID 与 HA 同步状态。'
          }}
        </p>
        <RouterLink :to="SETTINGS_ROUTES.securityModes('linkage')" class="sw-presence__empty-cta">
          {{ '去配置' }}
          <ChevronRight class="w-3.5 h-3.5" />
        </RouterLink>
      </div>

      <div class="sw-presence__panel">
        <button
          type="button"
          class="sw-presence__toggle"
          :disabled="presenceFlagSaving || !presenceLoaded"
          :aria-pressed="autoArmEnabled"
          @click="toggleAutoArm"
        >
          <span class="sw-presence__toggle-copy">
            <span class="sw-presence__toggle-title">{{ '全员离家自动布防' }}</span>
            <span class="sw-presence__toggle-desc">{{ '撤防状态下全员离开 → 离家布防' }}</span>
          </span>
          <span
            class="sw-presence__switch"
            :class="autoArmEnabled && 'sw-presence__switch--on'"
            role="presentation"
          >
            <span class="sw-presence__switch-knob" />
          </span>
        </button>

        <button
          type="button"
          class="sw-presence__toggle"
          :disabled="presenceFlagSaving || !presenceLoaded"
          :aria-pressed="autoUpgradeEnabled"
          @click="toggleAutoUpgrade"
        >
          <span class="sw-presence__toggle-copy">
            <span class="sw-presence__toggle-title">{{ '居家 / 夜间升级离家' }}</span>
            <span class="sw-presence__toggle-desc">{{ '已布防时全员离开 → 升级为离家' }}</span>
          </span>
          <span
            class="sw-presence__switch"
            :class="autoUpgradeEnabled && 'sw-presence__switch--on'"
            role="presentation"
          >
            <span class="sw-presence__switch-knob" />
          </span>
        </button>

        <div class="sw-presence__footer-links">
          <RouterLink :to="SETTINGS_ROUTES.params('security')" class="sw-presence__footer-link">
            <span>{{ '离家确认等待（高级参数）' }}</span>
            <ExternalLink class="w-3 h-3 opacity-70" />
          </RouterLink>
          <RouterLink :to="SETTINGS_ROUTES.securityModes('linkage')" class="sw-presence__footer-link">
            <span>{{ '首人到家等联动开关' }}</span>
            <ExternalLink class="w-3 h-3 opacity-70" />
          </RouterLink>
        </div>
      </div>
    </template>
  </section>
</template>
<style src="./styles/setup-wizard.css"></style>
