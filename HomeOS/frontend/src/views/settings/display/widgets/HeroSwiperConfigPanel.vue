<!--
  组件文件：HeroSwiperConfigPanel.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：首页 Hero 三页滑动联动配置主面板，上方为每页卡片条（点击切换编辑，左右按钮
    交换页序），中部为 HeroSwiperSlideFields 表单（根据卡片类型切换字段），底部汇总
    当前配置摘要与保存按钮。支持独立面板与嵌入 Hero Swiper 两种模式。
  主要 props / emits：
    - props slides：幻灯片数组（id/type/config 字段）
    - props embedded：是否嵌入其他编辑面板
    - emit save：点击保存按钮
    - emit set-type：内部切换卡片类型，payload (slideIndex, type)
    - emit move：交换页序，payload (slideIndex, dir ±1)
  依赖关系：引用 HeroSwiperSlideFields 子组件；使用 useHeroSwiperConfigPanel composable
    管理 activeSlideKey、slideGroups、activePresetOptions、climateXXXEntities 等
    内部状态与 onTypeSelect/moveSlide/setSlideConfigField 方法。
  注意事项：交换页序仅在相邻时允许（首尾禁用方向按钮）；embedded 保存为草稿级，需再
    点页头「保存布局」才持久化。
-->
<template>
  <div class="hero-swiper-config">
    <div class="hero-swiper-config__panel">
      <div class="hero-swiper-config__head">
        <div v-if="!embedded">
          <p class="hero-swiper-config__eyebrow">{{ '三页滑动联动' }}</p>
          <p class="hero-swiper-config__desc">{{ '点击页卡切换编辑，保存后在侧栏即时预览。' }}</p>
        </div>
        <div v-else class="hero-swiper-config__head-spacer" />
        <div class="hero-swiper-config__swap" role="group" aria-label="交换页序">
          <button
            type="button"
            class="hero-swiper-config__swap-btn"
            :disabled="activeSlideIndex === 0"
            title="与前页交换"
            :aria-label="'与前页交换'"
            @click="moveSlide(-1)"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>
          <span class="hero-swiper-config__swap-label">{{ '交换' }}</span>
          <button
            type="button"
            class="hero-swiper-config__swap-btn"
            :disabled="activeSlideIndex >= slides.length - 1"
            title="与后页交换"
            @click="moveSlide(1)"
          >
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div class="hero-swiper-config__strip" role="tablist">
        <button
          v-for="(slide, idx) in slides"
          :key="slide.id || idx"
          type="button"
          role="tab"
          :aria-selected="idx === activeSlideIndex"
          class="hero-swiper-config__slot"
          :class="{ 'hero-swiper-config__slot--active': idx === activeSlideIndex }"
          @click="activeSlideKey = String(idx)"
        >
          <span class="hero-swiper-config__slot-index">{{ idx + 1 }}</span>
          <span class="hero-swiper-config__slot-label">{{ getSlideTypeLabel(slide.type) }}</span>
          <span class="hero-swiper-config__slot-dot" aria-hidden="true" />
        </button>
      </div>

      <HeroSwiperSlideFields
        :active-slide="activeSlide"
        :slide-groups="slideGroups"
        :active-hub-tab-set="activeHubTabSet"
        v-model:slide-tab-draft="slideTabDraft"
        :active-preset-options="activePresetOptions"
        :climate-chart-view-options="climateChartViewOptions"
        v-model:climate-temp-entities="climateTempEntities"
        v-model:climate-hum-entities="climateHumEntities"
        v-model:temp-chart-sensors="tempChartSensors"
        v-model:switch-shortcut-entities="switchShortcutEntities"
        @type-select="onTypeSelect"
        @set-config-field="setSlideConfigField"
        @html-input="onHtmlInput"
      />
    </div>

    <div class="hero-swiper-config__foot">
      <p class="hero-swiper-config__foot-hint">
        {{
          embedded
            ? `${footHint} · 保存后需点击页头「保存布局」持久化`
            : footHint
        }}
      </p>
      <button type="button" class="settings-btn-primary text-xs" @click="$emit('save')">
        {{ '保存配置' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import HeroSwiperSlideFields from './HeroSwiperSlideFields.vue'
import { useHeroSwiperConfigPanel } from '@/composables/settings/display/layout-dashboard.internals'

const props = defineProps<{
  slides: Array<{ id: string; type: string; config?: Record<string, unknown> }>
  embedded?: boolean
}>()

const emit = defineEmits<{
  save: []
  'set-type': [slideIndex: number, type: string]
  move: [slideIndex: number, dir: number]
}>()

const {
  slideGroups,
  activeSlideKey,
  activeSlideIndex,
  activeSlide,
  activeHubTabSet,
  slideTabDraft,
  activePresetOptions,
  footHint,
  climateChartViewOptions,
  climateTempEntities,
  climateHumEntities,
  tempChartSensors,
  switchShortcutEntities,
  getSlideTypeLabel,
  onTypeSelect,
  moveSlide,
  setSlideConfigField,
  onHtmlInput,
} = useHeroSwiperConfigPanel(
  () => props.slides,
  emit,
)
</script>
<style src="./styles/hero-swiper-config-panel.css"></style>
