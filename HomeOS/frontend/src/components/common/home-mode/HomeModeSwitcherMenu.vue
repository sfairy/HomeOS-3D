<!--
  组件文件：HomeModeSwitcherMenu.vue
  所属模块：frontend/src/components/common/home-mode
  组件职责：家庭模式切换下拉菜单内容组件（配合 HomeModeSwitcherTrigger 调用方 Teleport 渲染）。
    加载态展示骨架；列表渲染各 modes 项 + 图标 + 当前激活对勾；激活模式存在且 canControl() 时展示
    「退出当前模式」Power 按钮；下方展示最近触发日志 4 条（modeName + 原因）；访客提示
    「访客仅可查看」；无模式时展示「暂无模式」占位；末尾 RouterLink 跳转设置页管理模式入口。
  主要 props / emits：
    - props.open / menuPlacement / menuStyle / teleportTarget / teleportDisabled：Teleport 渲染与定位；
      props.loading / modes / activeMode：模式数据；
      props.canControl()：权限判定函数；props.modeContext：上下文含 triggerLogs 与 calendarAway；
      props.registerMenuRef(el)：将菜单根节点回填给父级（用于 click-outside 关闭）。
    - emits：select-mode(mode)（点击某个模式）；toggle-off（点击退出当前模式）。
  依赖关系：@lucide/vue Home/Power/Check；vue-router RouterLink；resolveHomeModeIcon 图标解析；
    SETTINGS_ROUTES 设置页路径常量。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 HomeModeSwitcherMenu 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * HomeModeSwitcherMenu - 家庭模式切换菜单组件（内部实现说明）
 * 功能特性：
 * - 展示可用的家庭模式列表
 * - 显示当前激活模式
 * - 显示最近触发日志
 * - 支持退出当前模式
 * - 支持访客模式（仅查看）
 * - 跳转到设置页面管理模式
 */
import { Home, Power, Check } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { resolveHomeModeIcon } from '@/utils/home/mode-icon.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  open: { type: Boolean, required: true },
  /** 菜单弹出方向 top/bottom */
  menuPlacement: { type: String, required: true },
  /** Teleport fixed 定位样式 */
  menuStyle: { type: Object, required: true },
  teleportTarget: { type: [String, Object], required: true },
  teleportDisabled: { type: Boolean, default: false },
  /** 是否加载中 */
  loading: { type: Boolean, required: true },
  /** 可用模式列表 */
  modes: { type: Array, required: true },
  /** 当前激活的模式 */
  activeMode: { type: [Object, null], default: null },
  /** 是否有权限控制模式 */
  canControl: { type: Function, required: true },
  /** 模式上下文（含触发日志等） */
  modeContext: { type: Object, required: true },
  /** 菜单 DOM 注册回调 */
  registerMenuRef: { type: Function, required: true },
})

/** 组件事件：select-mode（选择模式）、toggle-off（退出当前模式） */
const emit = defineEmits(['select-mode', 'toggle-off'])
</script>

<template>
  <!-- HomeModeSwitcherMenu 家庭模式切换菜单：展示模式列表、触发日志 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="dropdown">
      <div
        v-if="open"
        :ref="registerMenuRef"
        :class="[
          'home-mode-switcher__menu',
          menuPlacement === 'top' && 'home-mode-switcher__menu--top',
        ]"
        :style="menuStyle"
      >
        <!-- 加载状态 -->
        <div v-if="loading" class="home-mode-switcher__empty">{{ '加载中…' }}</div>
        <template v-else>
          <!-- 模式切换区域标题 -->
          <div v-if="modes.length" class="home-mode-switcher__section-label">{{ '切换模式' }}</div>
          <button
            v-for="m in modes"
            :key="m.id"
            type="button"
            class="home-mode-switcher__item"
            :class="{ 'home-mode-switcher__item--active': activeMode?.id === m.id }"
            @click="emit('select-mode', m)"
          >
            <component
              :is="resolveHomeModeIcon(m.icon, Home)"
              class="w-3.5 h-3.5 shrink-0 opacity-80"
            />
            <span class="home-mode-switcher__item-label">{{ m.name }}</span>
            <Check
              v-if="activeMode?.id === m.id"
              class="home-mode-switcher__item-check"
              aria-hidden="true"
            />
          </button>
          <button
            v-if="activeMode && canControl()"
            type="button"
            class="home-mode-switcher__item home-mode-switcher__item--off"
            @click="emit('toggle-off')"
          >
            <Power class="w-3.5 h-3.5" />
            <span>{{ '退出当前模式' }}</span>
          </button>
          <!-- 最近触发日志区域 -->
          <div v-if="modeContext.triggerLogs?.length" class="home-mode-switcher__logs">
            <div class="home-mode-switcher__logs-title">{{ '最近触发' }}</div>
            <div
              v-for="log in modeContext.triggerLogs.slice(0, 4)"
              :key="log.id"
              class="home-mode-switcher__log-item"
            >
              <span :class="log.success === false ? 'hmsm-dot-fail' : 'hmsm-dot-home'">●</span>
              <span class="truncate">{{ log.modeName }}</span>
              <span class="home-mode-switcher__log-reason">{{ log.reason }}</span>
            </div>
          </div>
          <!-- 访客模式提示 -->
          <div v-if="!canControl()" class="home-mode-switcher__hint">{{ '访客仅可查看' }}</div>
          <div v-else-if="modes.length === 0" class="home-mode-switcher__empty">
            <Home class="w-4 h-4 inline opacity-50" />
            {{ '暂无模式' }}
          </div>
          <RouterLink
            :to="SETTINGS_ROUTES.homeMode()"
            class="home-mode-switcher__settings-link"
            @click.stop
          >
            {{ '管理家庭模式 →' }}
          </RouterLink>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 作用域语义色类（替代 Tailwind 颜色工具类） ── */
.hmsm-dot-home {
  color: var(--set-success, #6ee7b7);
}
.hmsm-dot-fail {
  color: var(--set-danger, #fda4af);
}
</style>
