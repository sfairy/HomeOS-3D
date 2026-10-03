<template>
  <!-- SwiperHeroWidget 轮播英雄区小部件：轮播图形式的英雄区组件 -->
  <div class="swiper-hero-outer widget-glass-card">
    <div ref="scrollContainer" class="swiper-hero-container no-scrollbar" @scroll="onScroll">
      <template v-for="(slide, idx) in slides" :key="slide.id">
        <div v-if="isSlideMounted(idx)" class="swiper-slide" @click.stop>
          <ErrorBoundary compact fill :title="slide.id">
            <component
              :is="slide.component"
              v-bind="slide.props"
              :panel-visible="panelActive"
              class="h-full min-h-0"
              @open-group="(dom, sens) => $emit('open-group', dom, sens)"
            />
          </ErrorBoundary>
        </div>
        <div v-else class="swiper-slide swiper-slide--placeholder" aria-hidden="true" />
      </template>
    </div>
    <div class="swiper-pagination">
      <div
        v-for="(_, idx) in slides"
        :key="idx"
        class="pagination-dot"
        :class="{ active: currentIndex === idx }"
        @click="goToSlide(idx)"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * SwiperHeroWidget - 轮播英雄区小部件
 * 功能特性：
 * - 轮播图展示
 * - 自动播放
 * - 指示器导航
 * - 用于首页或仪表盘的英雄区
 */
/** 三合一滑动容器：config.slides 配置每页卡片，类型见 hero-swiper-slide-registry */
import { ref, computed, watch } from 'vue'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import { getHeroSwiperSlides } from '@/utils/registry/hero-swiper-slide-options'
import {
  buildHeroSwiperSlideProps,
  resolveHeroSwiperComponent,
} from '@/utils/registry/hero-swiper-slide-registry'

const props = defineProps({
  config: {},
  panelVisible: { type: Boolean, default: true },
})

defineEmits(['open-group'])

const panelActive = computed(() => props.panelVisible !== false)

function isSlideMounted(idx) {
  if (!panelActive.value) return idx === currentIndex.value
  return Math.abs(idx - currentIndex.value) <= 1
}

const scrollContainer = ref(null)
const currentIndex = ref(0)

watch(
  () => props.config?.slides,
  () => {
    currentIndex.value = 0
  },
)

const slideConfigs = computed(() => getHeroSwiperSlides(props.config))

const slides = computed(() =>
  slideConfigs.value.map((s) => ({
    component: resolveHeroSwiperComponent(s.type),
    props: buildHeroSwiperSlideProps(s.type, s.config || {}),
    id: s.id,
  })),
)

function onScroll() {
  if (!scrollContainer.value) return
  const w = scrollContainer.value.clientWidth
  currentIndex.value = Math.round(scrollContainer.value.scrollLeft / w)
}

function goToSlide(idx) {
  if (!scrollContainer.value) return
  const w = scrollContainer.value.clientWidth
  scrollContainer.value.scrollTo({ left: idx * w, behavior: 'smooth' })
}
</script>

<style scoped src="./styles/SwiperHeroWidget.css"></style>
