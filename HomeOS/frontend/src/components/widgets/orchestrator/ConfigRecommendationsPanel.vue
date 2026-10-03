<!--
  @module 配置建议面板（ConfigRecommendationsPanel）
  @description 基于系统运行数据向用户展示可执行的配置优化建议（绑定、筛选、常用设备等）。
    使用 useConfigRecommendations 组合式函数管理数据加载与待处理计数；
    通过 RecommendInsightCard 卡片渲染每条建议，并支持点击 chip 跳转到对应设置页。
  @dependencies
    - vue（computed/onMounted）
    - vue-router 路由跳转
    - @lucide/vue Sparkles 图标
    - ApiQueryState 加载/错误状态
    - RecommendInsightCard 建议卡片组件
    - composables/recommend/useConfigRecommendations 数据组合式函数
-->
<template>
  <div :class="['config-rec-panel', embedded && 'config-rec-panel--embedded']">
    <header v-if="!embedded" class="config-rec-panel__head">
      <Sparkles class="w-3.5 h-3.5 config-rec-panel__icon" />
      <h3>{{ '配置建议' }}</h3>
      <button type="button" class="config-rec-panel__refresh" :disabled="loading" @click="load()">
        {{ '刷新' }}
      </button>
    </header>

    <ApiQueryState :loading="loading" :error="error" error-title="配置推荐加载失败" @retry="load()">
      <!-- 空状态：暂无待处理建议 -->
      <div v-if="!actionableInsights.length" class="config-rec-empty">
        <Sparkles class="config-rec-empty__icon" />
        <p class="config-rec-empty__title">{{ '暂无待处理配置建议' }}</p>
        <p class="config-rec-empty__desc">{{ '系统将根据运行数据推荐绑定、筛选与常用设备优化' }}</p>
      </div>

      <!-- 建议列表：仅渲染包含可执行项的洞察 -->
      <div v-else class="config-rec-list">
        <RecommendInsightCard
          v-for="item in actionableInsights"
          :key="item.domain"
          :title="item.title"
          :meta="item.meta"
          :summary="item.summary"
          :actionable="item.hasActionable"
          :groups="item.groups"
          :banners="item.banners"
          :link-to="item.linkTo"
          :link-label="item.linkLabel"
          @chip-click="(chip) => onChip(item, chip)"
        />
      </div>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * 配置建议面板脚本
 *
 * 职责：
 * - 通过 useConfigRecommendations 加载建议列表
 * - 过滤出可执行（hasActionable）的洞察
 * - 处理 chip 点击跳转，向外 emit 待处理统计
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import { useConfigRecommendations } from '@/composables/recommend/useConfigRecommendations'

defineProps({
  /** 是否嵌入到容器中（嵌入时隐藏头部） */
  embedded: { type: Boolean, default: false },
  /** 是否在挂载时自动加载 */
  autoLoad: { type: Boolean, default: true },
})

const emit = defineEmits(['stats'])
const router = useRouter()
// 解构组合式函数：loading/insights/pendingCount/error/load
const { loading, insights, pendingCount, error, load } = useConfigRecommendations()

/** 仅保留存在可执行项的洞察，过滤掉纯展示性条目 */
const actionableInsights = computed(() => insights.value.filter((item) => item.hasActionable))

/**
 * 处理卡片内 chip 点击事件
 * - 优先跳转 chip 自身配置的路由
 * - 否则跳转洞察整体 linkTo
 * @param {Object} item 当前洞察对象
 * @param {Object} chip 被点击的 chip 配置（可能含 route）
 */
function onChip(item, chip) {
  if (chip.route) {
    router.push(chip.route)
    return
  }
  if (item.linkTo) router.push(item.linkTo)
}

/**
 * 加载面板数据并向外抛出待处理统计
 * @param {Object} options 透传给组合式函数 load 的选项（如 quiet）
 * @returns {Promise<void>}
 */
async function loadPanel(options) {
  await load(options)
  emit('stats', { pending: pendingCount.value })
}

// 暴露给父组件的加载接口
defineExpose({
  load: loadPanel,
})

onMounted(() => {
  void loadPanel({ quiet: true })
})
</script>

<style scoped src="./styles/ConfigRecommendationsPanel.css"></style>