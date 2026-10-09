<!--
  组件文件：AdvancedSection.vue
  所属模块：frontend/src/features/settings/connect/connection
  组件职责：系统连接大类下的 HA WebSocket 集群角色高级入口展示卡，显示当前连接模式
    （standalone/主节点/只读从节点）与徽标，下方提供 4 个跳转到细颗粒高级参数页面的
    RouterLink：HA 连接器、WebSocket 推送、状态缓存、运维清理。
  主要 props / emits：
    - props haWsModeBadgeMod：徽标 CSS 修饰符（ok/warn/muted 等）
    - props haWsModeDesc：模式中文详细说明
    - props haWsModeLabel：模式简短标签
  依赖关系：引用 SETTINGS_ROUTES.params() 生成四个高级参数页面的链接；RouterLink 导航；
    无 Pinia store 或写操作。
  注意事项：普通用户不可见部分高级参数页面（仅 admin 可编辑 Redis/运维清理项）；链接
    路由失败时由 Vue Router 统一跳 404。
-->
<template>
  <div class="settings-conn-advanced">
    <div class="settings-conn-advanced__head">
      <div class="flex items-start gap-3 min-w-0">
        <div
          class="settings-conn-advanced__icon"
          :class="`settings-conn-advanced__icon--${haWsModeBadgeMod}`"
        >
          <Radio class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="settings-conn-advanced__title">{{ 'HA WebSocket 集群角色' }}</p>
          <p class="settings-conn-advanced__desc">{{ haWsModeDesc }}</p>
        </div>
      </div>
      <span
        class="settings-conn-role-badge"
        :class="`settings-conn-role-badge--${haWsModeBadgeMod}`"
      >
        <span class="settings-conn-role-badge__dot" />
        {{ haWsModeLabel }}
      </span>
    </div>
    <div class="settings-conn-advanced__actions">
      <RouterLink :to="SETTINGS_ROUTES.params('haConnector')" class="settings-conn-advanced__link">
        <Radio class="w-3.5 h-3.5" />
        <span>{{ 'HA 连接器' }}</span>
        <span class="settings-conn-advanced__link-sep">→</span>
        <span>{{ '高级参数' }}</span>
        <ArrowRight />
      </RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.params('wsPush')" class="settings-conn-advanced__link">
        <Gauge class="w-3.5 h-3.5" />
        <span>{{ 'WebSocket 推送' }}</span>
        <span class="settings-conn-advanced__link-sep">→</span>
        <span>{{ '高级参数' }}</span>
        <ArrowRight />
      </RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.params('stateStore')" class="settings-conn-advanced__link">
        <Database class="w-3.5 h-3.5" />
        <span>{{ '状态缓存' }}</span>
        <span class="settings-conn-advanced__link-sep">→</span>
        <span>{{ '高级参数' }}</span>
        <ArrowRight />
      </RouterLink>
      <RouterLink :to="SETTINGS_ROUTES.params('ops')" class="settings-conn-advanced__link">
        <Server class="w-3.5 h-3.5" />
        <span>{{ '运维清理' }}</span>
        <span class="settings-conn-advanced__link-sep">→</span>
        <span>{{ '高级参数' }}</span>
        <ArrowRight />
      </RouterLink>
    </div>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { Radio, Gauge, Database, Server, ArrowRight } from '@lucide/vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  haWsModeBadgeMod: { type: String, required: true },
  haWsModeDesc: { type: String, required: true },
  haWsModeLabel: { type: String, required: true },
})
</script>
<style src="./styles/connection.css"></style>
