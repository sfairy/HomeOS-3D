<!--
  组件文件：HomeModeSwitcher.vue
  所属模块：frontend/src/components/common
  组件职责：家庭模式总装切换器组件。根据 useHomeModeSwitcher 组合式函数产出的状态装配三个子组件：
    HomeModePresenceBadge（左侧：在场人员徽标 + 在家/离家统计，点击展开在场详情 Tip）；
    当 modeContext.calendarAway 为真时最左侧额外展示「外出」标签；
    HomeModeSwitcherTrigger（中部：当前激活模式标签 + 图标 + 加载/动作态指示，readonly 时灰化，
      点击切换菜单开关）；HomeModeSwitcherMenu（Teleport 渲染的下拉菜单，含模式列表/退出/
      最近触发日志/设置跳转）。
  无 props / emits（完全由 composable 管理状态）：
    - 核心状态由 useHomeModeSwitcher 提供：rootRef/menuRef/open/menuPlacement/menuStyle/
      menuTeleportTarget/menuTeleportDisabled/modes/activeMode/loading/acting/canControl/label/
      modeIcon/presenceHome/modeContext/presenceMembers/showPresenceBadge/showPresenceEmpty/
      presenceSummary/presenceAtHomeCount/presenceTipOpen；
    - 事件方法：selectMode/toggleOff/togglePresenceTip/toggleMenuOpen 直接绑定到子组件。
  依赖关系：composable useHomeModeSwitcher（所有状态与行为统一封装）；
    子组件：HomeModePresenceBadge/HomeModeSwitcherTrigger/HomeModeSwitcherMenu；
    样式：switcher-base.css + presence.css + trigger.css + menu.css 四模块分别加载。
-->
<script setup>
/**
 * @file HomeModeSwitcher.vue（内部实现说明）
 * @module common/HomeModeSwitcher
 * @description 在家/离家模式切换器
 *  职责：
 *    - 通过 useHomeModeSwitcher 组合式函数管理模式列表、当前模式、在场人员等状态；
 *    - 渲染 PresenceBadge（在场人员徽标）、Trigger（触发器）、Menu（下拉菜单）三个子组件；
 *    - 日历标记外出时在左侧展示「外出」标签。
 *  依赖：home-mode 子目录下的子组件与 useHomeModeSwitcher composable，以及对应样式。
 */
import { useHomeModeSwitcher } from '@/composables/home/useHomeModeSwitcher'
import HomeModePresenceBadge from '@/components/common/home-mode/HomeModePresenceBadge.vue'
import HomeModeSwitcherTrigger from '@/components/common/home-mode/HomeModeSwitcherTrigger.vue'
import HomeModeSwitcherMenu from '@/components/common/home-mode/HomeModeSwitcherMenu.vue'
import './home-mode/switcher-base.css'
import './home-mode/presence.css'
import './home-mode/trigger.css'
import './home-mode/menu.css'

// 模式切换核心状态与方法，由组合式函数统一管理
const {
  rootRef,
  menuRef,
  open,
  showAwayButton,
  showHomeMode,
  menuPlacement,
  menuStyle,
  menuTeleportTarget,
  menuTeleportDisabled,
  modes,
  activeMode,
  loading,
  acting,
  canControl,
  label,
  modeIcon,
  presenceHome,
  modeContext,
  presenceMembers,
  showPresenceBadge,
  showPresenceEmpty,
  presenceSummary,
  presenceAtHomeCount,
  presenceTipOpen,
  selectMode,
  toggleOff,
  togglePresenceTip,
  toggleMenuOpen,
} = useHomeModeSwitcher()

/**
 * 注册下拉菜单 DOM 引用
 * 通过函数式 ref 将子组件内部的菜单根节点绑定到 menuRef，供外部点击外部关闭等逻辑使用
 * @param {HTMLElement|null} el
 */
function registerMenuRef(el) {
  menuRef.value = el
}
</script>

<template>
  <div ref="rootRef" class="home-mode-switcher">
    <!-- 日历标记外出中：左侧展示「外出」标签 -->
    <span
      v-if="modeContext.calendarAway"
      class="home-mode-switcher__away"
      :title="'日历标记外出中'"
    >
      {{ '外出' }}
    </span>
    <!-- 在场人员徽标 -->
    <HomeModePresenceBadge
      v-if="showAwayButton"
      :show-presence-badge="showPresenceBadge"
      :show-presence-empty="showPresenceEmpty"
      :presence-home="presenceHome"
      :presence-summary="presenceSummary"
      :presence-tip-open="presenceTipOpen"
      :presence-members="presenceMembers"
      :presence-at-home-count="presenceAtHomeCount"
      :mode-menu-open="open"
      @toggle="togglePresenceTip"
    />
    <!-- 模式切换触发器 -->
    <HomeModeSwitcherTrigger
      v-if="showHomeMode"
      :active-mode="activeMode"
      :loading="loading"
      :acting="acting"
      :readonly="!canControl()"
      :label="label"
      :mode-icon="modeIcon"
      @toggle="toggleMenuOpen"
    />
    <!-- 模式选择下拉菜单 -->
    <HomeModeSwitcherMenu
      v-if="showHomeMode"
      :open="open"
      :menu-placement="menuPlacement"
      :menu-style="menuStyle"
      :teleport-target="menuTeleportTarget"
      :teleport-disabled="menuTeleportDisabled"
      :loading="loading"
      :modes="modes"
      :active-mode="activeMode"
      :can-control="canControl"
      :mode-context="modeContext"
      :register-menu-ref="registerMenuRef"
      @select-mode="selectMode"
      @toggle-off="toggleOff"
    />
  </div>
</template>
