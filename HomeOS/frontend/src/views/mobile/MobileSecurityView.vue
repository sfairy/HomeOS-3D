<!--
组件：MobileSecurityView.vue
所属模块：frontend / src / views
职责：移动端「安防」页——布防状态展示 + 模式切换（撤防/居家/离家/夜间）+
      已布防区域列表。
数据来源：
  - 布防状态/区域来自 useSecurityPanelStatus（currentMode/zones/loading/error）；
  - 可选模式来自 layoutStore.layoutConfig.securityModes；
  - 用户角色来自 useAuthStore（仅管理员可切换）。
关键交互：
  - 模式按钮点击触发 handleArm：非管理员/无区域时 toast 拦截；
  - 布防/撤防为危险操作，二次确认后执行；
  - 状态大字与按钮按布防模式配色（撤防绿/居家琥珀/离家红/夜间紫）。
-->
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/MobileSecurityView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
/**
 * 移动端「安防」页：布防状态与模式切换。
 */
import { computed, ref } from 'vue'
import { Home, Moon, Shield, ShieldCheck, ShieldOff } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import { executeSecurityPanelArm } from '@/utils/security/panel-arm.util'
import { resolveSecurityModeLabel } from '@/utils/security/security-mode-label.util'

const chrome = useChromeStore()
const layoutStore = useLayoutStore()
const authStore = useAuthStore()
const { currentMode, zones, loading, ready, error, refresh, patchModeFromSocket } =
  useSecurityPanelStatus()

const isAdmin = computed(() => authStore.role === 'admin')
const acting = ref(false)

// 可选模式列表：来自 layout 配置，由用户在设置中自定义
const securityModes = computed(() => layoutStore.layoutConfig?.securityModes || [])

// 当前模式中文标签：撤防/居家/离家/夜间
const modeLabel = computed(() =>
  resolveSecurityModeLabel(currentMode.value, securityModes.value),
)

// 模式图标映射：支持配置中指定 Shield/ShieldOff/Home/Moon
const iconMap = { Shield, ShieldOff, Home, Moon }

// 模式按钮列表：撤防恒在首位，其余按配置 securityModes 顺序追加
const armActions = computed(() => {
  const disarmed = { mode: 'disarmed', label: '撤防', icon: ShieldOff }
  const modes = (securityModes.value as Array<{ key: string; name: string; icon?: string }>).map(
    (m) => ({
      mode: m.key,
      label: m.name,
      icon: iconMap[m.icon as keyof typeof iconMap] || Shield,
    }),
  )
  return [disarmed, ...modes]
})

// 已布防区域：zones 中 armed=true 的子集
const armedZones = computed(() => zones.value.filter((z: { armed?: boolean }) => z.armed))

/** 状态大字配色：与布防模式一致（撤防绿 / 居家琥珀 / 离家红 / 夜间紫） */
const stateToneClass = computed(() => {
  switch (currentMode.value) {
    case 'disarmed':
      return 'm-sec-state--disarmed'
    case 'armed_home':
      return 'm-sec-state--home'
    case 'armed_away':
      return 'm-sec-state--away'
    case 'armed_night':
      return 'm-sec-state--night'
    default:
      return ''
  }
})

/** 按钮按模式取类名（armed_away -> m-sec-action--armed-away） */
function armModeClass(mode: string): string {
  return `m-sec-action--${mode.replace(/_/g, '-')}`
}

/**
 * 切换布防模式：管理员校验 → 区域校验 → 二次确认 → 调用 executeSecurityPanelArm。
 * 失败/未生效/跳过分别走不同 toast 反馈；执行后强制刷新状态。
 * @param mode 目标模式 key（disarmed / armed_home / armed_away / armed_night）
 */
async function handleArm(mode: string) {
  if (acting.value) return
  if (!isAdmin.value) {
    chrome.notify('仅管理员可切换安防模式', 'warning')
    return
  }
  if (mode !== 'disarmed' && zones.value.length === 0) {
    chrome.notify('请先配置安防区域', 'warning')
    return
  }
  // 二次确认：布防/撤防为危险操作，需用户确认后执行
  const isDisarm = mode === 'disarmed'
  const modeName = securityModes.value.find(
    (m: { key: string; name: string }) => m.key === mode,
  )?.name
  const ok = await chrome.confirm(
    isDisarm ? '确定撤防？撤防后监控将关闭' : `确定布防${modeName || mode}？布防期间将联动安防设备`,
    isDisarm ? '撤防确认' : '布防确认',
    { type: 'danger', confirmText: isDisarm ? '确认撤防' : '确认布防' },
  )
  if (!ok) return
  acting.value = true
  try {
    // zoneIds 传空数组表示布防全部区域（见 panel-arm.util 回退逻辑）
    const data = await executeSecurityPanelArm(mode, [], zones.value, patchModeFromSocket)
    if (data?.success === false) {
      const failed = data?.actions?.failed ?? 0
      chrome.notify(
        failed > 0 ? `布防未生效：${failed} 条联动失败` : '安防模式切换未生效',
        'error',
      )
      return
    }
    if (data?.skipped) {
      chrome.notify('当前已是该状态，跳过重复联动', 'info')
    } else {
      chrome.notify('安防模式已切换', 'success')
    }
    await refresh(true)
  } catch {
    chrome.notify('安防模式切换失败', 'error')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div class="m-page" style="--m-accent-rgb: 248, 113, 113">
    <header class="m-page__header">
      <p class="m-page__eyebrow">安防</p>
      <h1 class="m-page__title">安防</h1>
      <p class="m-page__sub">布防状态与模式切换</p>
    </header>

    <section class="m-page__card">
      <p class="m-page__card-label">当前状态</p>
      <p v-if="loading" class="m-sec-state m-sec-state--mute">加载中…</p>
      <p v-else-if="error" class="m-sec-state m-sec-state--error">{{ error }}</p>
      <p v-else class="m-sec-state" :class="stateToneClass">{{ modeLabel }}</p>
      <p v-if="ready && isAdmin" class="m-page__hint">
        当前为「{{ modeLabel }}」模式，点击下方按钮可切换布防状态。
      </p>
    </section>

    <section class="m-page__card">
      <p class="m-page__card-label">切换模式</p>
      <div class="m-sec-actions">
        <button
          v-for="action in armActions"
          :key="action.mode"
          type="button"
          class="m-sec-action"
          :class="[
            armModeClass(action.mode),
            { 'm-sec-action--active': currentMode === action.mode },
          ]"
          :disabled="acting || !isAdmin"
          @click="handleArm(action.mode)"
        >
          <component :is="action.icon" class="m-sec-action__icon" />
          <span class="m-sec-action__label">{{ action.label }}</span>
        </button>
      </div>
      <p v-if="!isAdmin" class="m-page__hint">仅管理员可切换安防模式</p>
    </section>

    <section class="m-page__card">
      <p class="m-page__card-label">已布防区域</p>
      <ul v-if="armedZones.length" class="m-page__list">
        <li v-for="zone in armedZones" :key="zone.id" class="m-page__list-item">
          <ShieldCheck class="m-sec-zone-icon" />
          <span class="m-page__list-name">{{ zone.name }}</span>
        </li>
      </ul>
      <p v-else-if="!zones.length && currentMode !== 'disarmed'" class="m-page__hint">
        尚未配置安防区域
      </p>
      <p v-else class="m-page__hint">当前无已布防区域</p>
    </section>

    <p v-if="acting" class="m-sec-foot">切换中…</p>
  </div>
</template>

<style scoped>
/* 状态大字 */
.m-sec-state {
  margin: 0;
  font-size: var(--set-fs-stat, 22px);
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--set-text-heading, rgba(243, 244, 246, 0.95));
}

.m-sec-state--mute,
.m-sec-state--error {
  font-size: var(--set-fs-body, 15px);
  font-weight: 650;
  letter-spacing: 0;
}

.m-sec-state--mute {
  color: var(--set-text-tertiary);
}

.m-sec-state--error {
  color: var(--set-danger, #fca5a5);
}

/* 撤防 — 绿色安全 */
.m-sec-state--disarmed {
  color: #6ee7b7;
}

/* 在家 — 琥珀色 */
.m-sec-state--home {
  color: #fcd34d;
}

/* 离家 — 红色警戒 */
.m-sec-state--away {
  color: #fca5a5;
}

/* 夜间 — 紫色 */
.m-sec-state--night {
  color: #c4b5fd;
}

/* 模式按钮组 */
.m-sec-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.m-sec-action {
  flex: 1 1 calc(50% - 8px);
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 10px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: var(--set-text-tertiary);
  font-size: var(--set-fs-btn, 14px);
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.m-sec-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.m-sec-action:not(:disabled):active {
  transform: scale(0.98);
}

.m-sec-action--active {
  font-weight: 750;
}

/* 撤防 — 绿色安全 */
.m-sec-action--disarmed.m-sec-action--active {
  background: color-mix(in srgb, var(--premium-accent-green) 16%, rgba(0, 0, 0, 0));
  border-color: color-mix(in srgb, var(--premium-accent-green) 34%, rgba(0, 0, 0, 0));
  color: #6ee7b7;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--premium-accent-green) 28%, rgba(0, 0, 0, 0));
}

/* 在家 — 琥珀色 */
.m-sec-action--armed-home.m-sec-action--active {
  background: color-mix(in srgb, var(--premium-accent-amber) 16%, rgba(0, 0, 0, 0));
  border-color: color-mix(in srgb, var(--premium-accent-amber) 34%, rgba(0, 0, 0, 0));
  color: #fcd34d;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--premium-accent-amber) 28%, rgba(0, 0, 0, 0));
}

/* 离家 — 红色警戒 */
.m-sec-action--armed-away.m-sec-action--active {
  background: color-mix(in srgb, var(--premium-accent-red) 16%, rgba(0, 0, 0, 0));
  border-color: color-mix(in srgb, var(--premium-accent-red) 34%, rgba(0, 0, 0, 0));
  color: #fca5a5;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--premium-accent-red) 28%, rgba(0, 0, 0, 0));
}

/* 夜间 — 紫色 */
.m-sec-action--armed-night.m-sec-action--active {
  background: color-mix(in srgb, var(--premium-accent-violet) 16%, rgba(0, 0, 0, 0));
  border-color: color-mix(in srgb, var(--premium-accent-violet) 34%, rgba(0, 0, 0, 0));
  color: #c4b5fd;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--premium-accent-violet) 28%, rgba(0, 0, 0, 0));
}

.m-sec-action__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.m-sec-action__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 区域列表图标 */
.m-sec-zone-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-left: 4px;
  color: #6ee7b7;
}

/* 底部切换中提示 */
.m-sec-foot {
  margin: 0;
  text-align: center;
  font-size: var(--set-fs-caption, 13px);
  font-weight: 650;
  color: var(--set-text-tertiary);
}
</style>
