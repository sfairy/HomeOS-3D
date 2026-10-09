<!--
  组件文件：RedisSection.vue
  所属模块：frontend/src/features/settings/connect/connection
  组件职责：系统连接大类下的 Redis 缓存与消息总线信息展示卡（只读展示型 Section），
    显示 Redis 连接状态徽标、三大能力特性标签（能源 Timeline / Pub/Sub 事件总线 /
    L2 状态缓存），底部跳转运维诊断页的链接。
  主要 props / emits：
    - props redisHealth：健康状态对象（含 ok/loading 标识）
    - props redisLabel：状态中文标签（已连接/未连接/未知等）
    - props redisRefreshError：刷新异常错误信息
  依赖关系：引用 SETTINGS_ROUTES.diagnostics() 生成诊断页跳转；RouterLink 组件导航；
    无 Pinia store 或写操作。
  注意事项：仅 admin 可在运维诊断页查看详细 Redis 指标；未配置 REDIS_URL 时系统自动降级
    为内存缓存，能源趋势与部分分析不可用。
-->
<template>
  <div class="conn-redis-card">
    <div class="conn-redis-head">
      <div class="conn-redis-meta">
        <div
          class="conn-redis-icon"
          :class="
            redisHealth.ok
              ? 'conn-redis-icon--ok'
              : redisHealth.loading
                ? 'conn-redis-icon--muted'
                : 'conn-redis-icon--warn'
          "
        >
          <Database class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="conn-redis-title">{{ 'Redis 缓存与消息总线' }}</p>
          <p class="conn-redis-desc">
            {{
              '与 HomeOS 同机部署 Redis 可启用能源 timeline、Pub/Sub 与 L2 缓存。无 Redis 时降级为进程内内存，能源趋势与部分分析不可用。'
            }}
          </p>
        </div>
      </div>
      <span
        class="conn-redis-badge"
        :class="
          redisRefreshError
            ? 'conn-redis-badge--muted'
            : redisHealth.ok
              ? 'conn-redis-badge--ok'
              : redisHealth.loading
                ? 'conn-redis-badge--muted'
                : 'conn-redis-badge--warn'
        "
      >
        <span
          class="conn-redis-badge-dot"
          :class="
            redisRefreshError
              ? 'conn-redis-badge-dot--muted'
              : redisHealth.ok
                ? 'conn-redis-badge-dot--ok'
                : redisHealth.loading
                  ? 'conn-redis-badge-dot--muted'
                  : 'conn-redis-badge-dot--warn'
          "
        />
        {{ redisRefreshError ? '未知' : redisLabel }}
      </span>
    </div>
    <div class="conn-redis-features">
      <span
        v-for="feat in ['能源 Timeline', 'Pub/Sub 事件总线', 'L2 状态缓存']"
        :key="feat"
        class="conn-redis-feature-chip"
      >
        {{ feat }}
      </span>
    </div>
    <RouterLink :to="SETTINGS_ROUTES.diagnostics()" class="conn-redis-link">
      <Activity class="w-3.5 h-3.5" />
      {{ '在运维诊断查看 redis_ok' }}
      <ArrowRight class="w-3.5 h-3.5" />
    </RouterLink>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { Database, Activity, ArrowRight } from '@lucide/vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

defineProps({
  redisHealth: { type: Object, required: true },
  redisLabel: { type: String, required: true },
  redisRefreshError: { type: String, default: '' },
})
</script>

<style scoped src="./styles/RedisSection.css"></style>
