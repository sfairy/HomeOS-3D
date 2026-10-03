/**
 * @file HomeModePresenceBadge.vue
 * @module common/home-mode
 * @description 家居模式切换器的「人员在场徽章」组件。
 *   负责展示家庭成员的在家/离家状态摘要，并在点击后展开人员详情气泡。
 *   依赖 useHomeModeSwitcher 组合式函数提供的人员首字母与色调工具函数。
 * @dependencies @lucide/vue（图标），@/composables/home/useHomeModeSwitcher（人员工具函数）
 */
<script setup>
/**
 * 导入依赖：
 * - Home/MapPin/Users：@lucide/vue 提供的图标组件，分别用于「在家」「离家」「人员」语义展示
 * - memberInitial/memberTone：从 useHomeModeSwitcher 复用的人员头像首字母与色调计算函数
 */
import { Home, MapPin, Users } from '@lucide/vue'
import { memberInitial, memberTone } from '@/composables/home/useHomeModeSwitcher'

/**
 * 组件 props 定义
 * @property {boolean} showPresenceBadge - 是否展示人员在场徽标（已配置人员时为 true）
 * @property {boolean} showPresenceEmpty - 是否展示「人员未配置」空态徽标
 * @property {Object|null} presenceHome - 在家状态聚合对象，含 anyoneHome 等字段
 * @property {string} presenceSummary - 徽标上展示的概要文案（如「2 人在家」）
 * @property {boolean} presenceTipOpen - 人员详情气泡是否展开
 * @property {Array} presenceMembers - 人员列表，每项含 id/name/atHome 字段
 * @property {number} presenceAtHomeCount - 当前在家人数
 * @property {boolean} modeMenuOpen - 模式下拉菜单是否打开（用于避免与气泡浮层叠加）
 */
defineProps({
  showPresenceBadge: { type: Boolean, required: true },
  showPresenceEmpty: { type: Boolean, required: true },
  presenceHome: { type: [Object, null], default: null },
  presenceSummary: { type: String, required: true },
  presenceTipOpen: { type: Boolean, required: true },
  presenceMembers: { type: Array, required: true },
  presenceAtHomeCount: { type: Number, required: true },
  modeMenuOpen: { type: Boolean, required: true },
})

/**
 * 组件事件定义
 * @event toggle - 切换人员详情气泡的展开/收起状态
 */
const emit = defineEmits(['toggle'])
</script>

<template>
  <!-- 仅在需要展示徽标或空态时渲染外层容器 -->
  <div v-if="showPresenceBadge || showPresenceEmpty" class="home-mode-switcher__presence-wrap">
    <!-- 有人员配置：展示在家/离家状态徽标，支持键盘 enter/space 触发以保证可访问性 -->
    <span
      v-if="showPresenceBadge"
      class="home-mode-switcher__presence"
      :class="{
        'home-mode-switcher__presence--away': !presenceHome?.anyoneHome,
        'home-mode-switcher__presence--tip-open': presenceTipOpen,
      }"
      role="button"
      tabindex="0"
      :aria-expanded="presenceTipOpen"
      :aria-describedby="presenceTipOpen ? 'home-mode-presence-tip' : undefined"
      @click.stop="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <Users class="w-3 h-3 shrink-0" />
      <span class="home-mode-switcher__presence-text">{{ presenceSummary }}</span>
    </span>
    <!-- 无人员配置：展示「人员未配置」空态徽标，交互行为与上方一致 -->
    <span
      v-else
      class="home-mode-switcher__presence home-mode-switcher__presence--away"
      role="button"
      tabindex="0"
      :aria-expanded="presenceTipOpen"
      :aria-describedby="presenceTipOpen ? 'home-mode-presence-tip' : undefined"
      @click.stop="emit('toggle')"
      @keydown.enter.prevent="emit('toggle')"
      @keydown.space.prevent="emit('toggle')"
    >
      <Users class="w-3 h-3 shrink-0" />
      <span class="home-mode-switcher__presence-text">{{ '人员未配置' }}</span>
    </span>
    <!-- 人员详情气泡：仅当气泡展开且模式下拉菜单未打开时显示，避免两层浮层重叠 -->
    <Transition name="presence-pop">
      <div
        v-if="presenceTipOpen && !modeMenuOpen"
        id="home-mode-presence-tip"
        :class="[
          'home-mode-switcher__presence-pop',
          showPresenceBadge && presenceHome?.anyoneHome && 'home-mode-switcher__presence-pop--home',
          showPresenceBadge &&
            !presenceHome?.anyoneHome &&
            'home-mode-switcher__presence-pop--away',
        ]"
        role="tooltip"
        @click.stop
      >
        <!-- 有人员数据：展示汇总头部 + 人员列表 -->
        <template v-if="showPresenceBadge && presenceMembers.length">
          <div class="presence-pop-head">
            <!-- 状态指示球：在家用 Home 图标，离家用 MapPin 图标 -->
            <div
              :class="[
                'presence-pop-head__orb',
                presenceHome?.anyoneHome
                  ? 'presence-pop-head__orb--home'
                  : 'presence-pop-head__orb--away',
              ]"
            >
              <Home v-if="presenceHome?.anyoneHome" class="w-3.5 h-3.5" />
              <MapPin v-else class="w-3.5 h-3.5" />
            </div>
            <div class="presence-pop-head__meta">
              <span class="presence-pop-head__title">{{ presenceSummary }}</span>
              <span class="presence-pop-head__sub">
                {{ presenceAtHomeCount }}/{{ presenceMembers.length }} {{ '在家' }}
              </span>
            </div>
          </div>
          <!-- 人员列表：根据索引取色调，根据 atHome 区分在家/离家样式 -->
          <ul class="presence-pop-list">
            <li
              v-for="(member, idx) in presenceMembers"
              :key="member.id"
              :class="[
                'presence-pop-row',
                `presence-pop-row--tone-${memberTone(idx)}`,
                member.atHome && 'presence-pop-row--at-home',
              ]"
            >
              <span
                class="presence-pop-row__avatar"
                :class="
                  member.atHome
                    ? 'presence-pop-row__avatar--home'
                    : 'presence-pop-row__avatar--away'
                "
              >
                {{ memberInitial(member.name) }}
              </span>
              <span class="presence-pop-row__name">{{ member.name }}</span>
              <span
                class="presence-pop-row__st"
                :class="member.atHome ? 'presence-pop-row__st--home' : 'presence-pop-row__st--away'"
              >
                <span class="presence-pop-row__dot" />
                {{ member.atHome ? '在家' : '离家' }}
              </span>
            </li>
          </ul>
        </template>
        <!-- 无人员数据：展示空态引导，指引用户前往全屋联动配置 -->
        <div v-else class="home-mode-switcher__presence-pop-empty">
          <Users class="w-4 h-4 shrink-0 opacity-50" />
          <span>{{ '请在设置→全屋联动配置人员' }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>