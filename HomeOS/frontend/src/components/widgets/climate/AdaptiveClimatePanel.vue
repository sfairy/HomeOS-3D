<template>
  <div class="ac-root">
    <!-- 头部：非嵌入模式下展示标题与季节徽标（制冷季/制热季） -->
    <div v-if="!embedded" class="ac-header">
      <div class="ac-header-left">
        <Thermometer class="w-3.5 h-3.5 ac-icon" />
        <span class="ac-title">{{ '自适应气候' }}</span>
      </div>
      <span :class="['ac-badge', rec.season === 'cool' ? 'ac-badge--cool' : 'ac-badge--heat']">
        {{ rec.season === 'cool' ? '制冷季' : '制热季' }}
      </span>
    </div>

    <div class="ac-body">
      <!-- API 查询状态容器：统一处理 loading/error/重试，tone=sky 蓝色主题 -->
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        tone="sky"
        error-title="自适应气候加载失败"
        @retry="query.retry()"
      >
        <template>
          <!-- 元信息：室外温度 / 在家状态 / 峰电时段 -->
          <div class="ac-meta">
            <span>{{ `室外 ${rec.outdoorTemp != null ? rec.outdoorTemp + '℃' : '—'}` }}</span>
            <span>{{ rec.anyoneHome ? '有人在家' : '无人在家' }}</span>
            <span v-if="rec.peak" class="ac-peak">{{ '峰电时段' }}</span>
          </div>

          <!-- 偏好摘要：展示当前偏好默认温度等信息 -->
          <div v-if="rec.preference?.summary" class="ac-pref-source">
            {{ rec.preference.summary }}
            <template v-if="rec.preference.defaultTemperature != null">
              {{ ` · 目标 ${rec.preference.defaultTemperature}℃` }}
            </template>
          </div>

          <!-- 空态：无可调节空调时提示用户配置 climate 实体 -->
          <VEmptyState
            v-if="(rec.items || []).length === 0"
            compact
            tone="emerald"
            :title="'无可调节的空调（需 climate 实体且非关闭）'"
          />

          <!-- 推荐列表：每台空调展示当前设定 → 推荐设定、原因与学习偏移 -->
          <div v-else class="ac-list">
            <div v-for="item in rec.items" :key="item.entityId" class="ac-item">
              <div class="ac-item-top">
                <span class="ac-item-name">
                  {{ item.friendlyName }}
                  <span v-if="item.room" class="ac-room-tag">{{ roomLabel(item.room) }}</span>
                </span>
                <div class="ac-item-temps">
                  <span class="ac-cur">{{ item.currentSetpoint ?? '—' }}°</span>
                  <ArrowRight class="w-3 h-3 text-white/30" />
                  <span class="ac-rec">{{ item.recommendedSetpoint }}°</span>
                </div>
              </div>
              <div class="ac-reasons">{{ (item.reasons || []).join(' · ') }}</div>
              <div v-if="overrideForRoom(item.room)" class="ac-override">
                {{ '已学习偏移 {v}℃'.replace('{v}', String(overrideForRoom(item.room))) }}
              </div>
            </div>
          </div>

          <!-- 应用预览：展示每台空调应用前后的设定变化并提供确认/取消 -->
          <div v-if="showPreview" class="ac-preview">
            <div class="ac-preview-title">{{ `应用预览（${rec.items?.length || 0} 台空调）` }}</div>
            <div v-for="item in rec.items" :key="'pv-' + item.entityId" class="ac-preview-item">
              {{
                `${item.friendlyName}：${item.currentSetpoint ?? '—'}° → ${item.recommendedSetpoint}°`
              }}
            </div>
            <div v-if="activeModeName" class="ac-mode-hint">
              {{ `家庭模式：${activeModeName}` }}
            </div>
            <div class="ac-preview-actions">
              <button class="ac-btn" :disabled="busy" @click="confirmApply">
                {{ '确认应用' }}
              </button>
              <button class="ac-btn ac-btn--ghost" @click="showPreview = false">
                {{ '取消' }}
              </button>
            </div>
          </div>
          <!-- 默认按钮：触发应用预览 -->
          <button
            v-else
            class="ac-btn"
            :disabled="busy || (rec.items || []).length === 0"
            @click="showPreview = true"
          >
            {{ '一键应用推荐设定' }}
          </button>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>
<script setup>
/**
 * @file AdaptiveClimatePanel.vue
 * @module widgets/climate
 * @description 自适应气候面板：基于室外温度、在家状态、家庭模式与电价峰谷，
 *              为每台空调推荐合理的目标温度，并支持一键应用到 HA。
 *
 * API:
 *  - GET  /system/climate/adaptive/recommend 获取推荐
 *  - POST /system/climate/adaptive/apply     应用推荐
 *
 * @dependencies
 *  - vue: computed 计算属性
 *  - @lucide/vue: Thermometer / ArrowRight 图标
 *  - @/services/api/system: 拉取推荐与学习偏移
 *  - @/composables/api/useWidgetApiQuery: Widget 数据查询 composable
 *  - @/composables/climate/useClimateRecommendApplyPanel: 应用流程 composable
 *  - @/components/common/ApiQueryState.vue: 通用查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 */
import { computed } from 'vue'
import { Thermometer, ArrowRight } from '@lucide/vue'

import { fetchAdaptiveClimateRecommend, fetchAdaptiveClimateOverrides } from '@/services/api/system'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { useClimateRecommendApplyPanel } from '@/composables/climate/useClimateRecommendApplyPanel'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'

defineProps({
  embedded: { type: Boolean, default: false },
})

// 数据查询：并行拉取推荐结果与已学习的偏移覆盖，每 60 秒自动刷新
const query = useWidgetApiQuery(
  'adaptiveClimate',
  async () => {
    const [recRes, ovRes] = await Promise.all([
      fetchAdaptiveClimateRecommend(),
      // 偏移查询失败时降级为空列表，避免阻塞推荐展示
      fetchAdaptiveClimateOverrides().catch(() => ({ data: { items: [] } })),
    ])
    return {
      data: { rec: recRes.data || {}, overrides: ovRes.data || { items: [] } },
      meta: recRes.data?.meta || null,
    }
  },
  60_000,
)

const loading = query.loading
const loadError = query.error
// 当前推荐结果，缺省为空对象
const rec = computed(() => query.data?.value?.rec || {})
// 已学习的房间温度偏移覆盖列表
const overrides = computed(() => query.data?.value?.overrides || { items: [] })

// 应用流程状态：busy（应用中）/ showPreview（预览弹层）/ activeModeName（家庭模式名）
const { busy, showPreview, activeModeName, roomLabel, confirmApply } =
  useClimateRecommendApplyPanel({
    useAdaptiveClimateApply: true,
    successUnit: '台空调',
    onApplied: () => query.retry(),
  })

/**
 * 查询指定房间已学习的温度偏移。
 * @param {string} room 房间标识
 * @returns {string|null} 偏移值（保留 1 位小数），未配置时返回 null
 */
function overrideForRoom(room) {
  if (!room) return null
  const item = overrides.value.items?.find((o) => o.scope === room)
  return item?.offset != null ? item.offset.toFixed(1) : null
}
</script>

<style scoped src="./styles/AdaptiveClimatePanel.css"></style>