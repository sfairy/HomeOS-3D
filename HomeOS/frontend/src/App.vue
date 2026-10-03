<!--
  组件文件：App.vue
  所属模块：frontend/src / 应用根
  组件职责：单页应用最顶层根组件，包裹 ErrorBoundary（全局异常边界）与 router-view（路由视图容器），
    通过顶层匹配路由 key 实现 MainLayout 在子路由切换时的复用，并为所有页面切换提供统一淡入淡出过渡动画。
  依赖关系：Vue Router、全局 <ErrorBoundary> 组件（页面加载失败兜底展示）、useRoute composable 取 shellRouteKey。
  注意事项：App.vue 不包含任何业务布局，只负责错误兜底 + 路由切换过渡 + 顶层容器样式。
-->
<template>
  <!-- 应用根容器 -->
  <div class="app-container">
    <div class="homeos-theme-atmosphere" aria-hidden="true" />
    <!-- 路由视图，带淡入淡出过渡动画 -->
    <ErrorBoundary :title="'页面加载失败'">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <!-- 顶层 matched 作 key：/devices ↔ /scenes 等子路由切换不重建 MainLayout -->
          <div :key="shellRouteKey" class="route-transition-root">
            <!-- 动态渲染当前路由匹配的组件，v-if 防止 Component 为空时报错 -->
            <component :is="Component" v-if="Component" />
          </div>
        </transition>
      </router-view>
    </ErrorBoundary>
  </div>
</template>

<script setup>
/**
 * HomeOS 应用根组件
 *
 * 职责：
 * 1. 路由视图渲染（带 fade 过渡动画）
 * 2. 认证状态监听：登录后自动连接 Socket.IO 并加载 UI 配置
 * 3. 未认证 / 未商业授权时断开 Socket.IO 连接
 */
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAppTheme } from '@/composables/ui/useAppTheme'
import { useClientPowerReporter } from '@/composables/energy/useClientPowerReporter'
import { isLicenseGateOpen, useLicenseActivatedRef } from '@/router/license-gate'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'

// 初始化应用主题（监听并应用用户偏好的亮/暗主题）
useAppTheme()
// 启动客户端能耗数据上报器（用于在服务端汇总展示各终端功耗）
useClientPowerReporter()
const authStore = useAuthStore()
const layoutStore = useLayoutStore()
const route = useRoute()
const licenseActivatedRef = useLicenseActivatedRef()

/**
 * 仅顶层路由变化时重建壳（MainLayout / Login 等），子路由切换不 remount 整页。
 *
 * 取 matched[0].path 作为 key：
 * - /devices ↔ /scenes 等同属 MainLayout 的子路由切换时 key 不变，避免整页重建
 * - /login ↔ /dashboard 等顶层路由切换时 key 变化，触发壳重建
 */
const shellRouteKey = computed(() => route.matched[0]?.path ?? route.path)

async function disconnectEntities() {
  const { useEntitiesStore } = await import('@/stores/entities.store')
  useEntitiesStore().disconnect()
}

/**
 * 监听认证 / 授权 / 路由变化，联动管理 Socket.IO 连接与 UI 配置加载。
 *
 * 行为：
 * - 登录且授权放行（非 setup/login/activation）：解析 profile、按需连接 entities、按需加载 UI 配置
 * - 登出、未授权、或进入 activation：断开 entities 的 Socket.IO 连接
 * - login/setup：已登录时不主动断连（避免登录瞬间 connect→disconnect 打断 polling→websocket 升级）
 * - immediate: true 保证在组件挂载后立即执行一次，恢复已登录会话的连接
 */
watch(
  () => [authStore.isAuthenticated, route.name, licenseActivatedRef.value],
  async (curr, prev) => {
    const isAuth = curr?.[0]
    const wasAuth = prev?.[0]
    const gateOpen = isLicenseGateOpen()
    const onLoginOrSetup = route.name === 'login' || route.name === 'setup'
    const onActivation = route.name === 'activation'

    if (isAuth) {
      if (!gateOpen || onActivation) {
        // 已登录但未授权 / 激活页：必须断开，避免未激活读通道残留
        await disconnectEntities()
        return
      }
      if (onLoginOrSetup) {
        // 登录成功后仍短暂停留在 login/setup：交给 auth 侧重连，离开页面后再由下方分支接管
        return
      }
      const queryProfile = typeof route.query.profile === 'string' ? route.query.profile : undefined
      await layoutStore.ensureActiveProfileResolved(queryProfile)
      const { useEntitiesStore } = await import('@/stores/entities.store')
      const entitiesStore = useEntitiesStore()
      // ensure：已在握手/升级中则不拆掉现有 socket（避免二次 connect 打断 websocket）
      entitiesStore.ensureWsConnected()
      if (!layoutStore.isConfigLoaded && !layoutStore.isConfigLoading) {
        layoutStore.loadConfig()
      }
    } else if (wasAuth) {
      await disconnectEntities()
    }
  },
  { immediate: true },
)
</script>

<style src="./assets/styles/route-transitions.css"></style>
