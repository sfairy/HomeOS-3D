<!--
  组件文件：WeatherEffectsOverviewCard.vue
  所属模块：frontend/src/features/settings/display/weather-effects
  组件职责：天气动效设置的总览卡片，属于显示主题大类下的特效配置。提供特效预设
    （逼真/柔和/关闭等）的切换按钮和显示范围的路由分组勾选（全局/首页/设备/联动等），
    并汇总已启用的页面数量。
  主要 props / emits：无 props / emits（独立 Card，依赖 composable 上下文）。
  依赖关系：通过 useWeatherEffectsSection composable 注入上下文，获取 form 响应式表单
    数据、presetOptions 预设选项、routeOptionGroups 路由分组、isRouteActive/toggleRoute
    显示范围切换方法。
  注意事项：切换预设后分场景的手动覆盖会被重置；「逼真」预设会联动读取 HA 天气实体
    的风速、湿度、降水强度数据实时微调场景强度。
-->
<template>
  <div class="weather-fx-overview-panel">
    <div class="weather-fx-insight-row">
      <p class="settings-note-callout settings-note-callout--sky weather-fx-insight">
        <span class="settings-note-callout__label">{{ '预设与实体融合' }}</span>
        <span>{{
          '「逼真」预设会读取 HA 天气实体的风速、湿度与降水强度微调场景；可在「分场景」Tab 中覆盖单项。'
        }}</span>
      </p>
      <p class="settings-note-callout settings-note-callout--violet weather-fx-insight">
        <span class="settings-note-callout__label">{{ '性能档位' }}</span>
        <span>{{
          '华丽 / 均衡 / 低功耗渲染模式在「性能调试」子页配置；「全局参数」与「分场景」控制特效密度与强度。'
        }}</span>
      </p>
    </div>

    <div class="weather-fx-block">
      <p class="settings-form-label weather-fx-block__label">{{ '特效预设' }}</p>
      <div class="settings-choice-grid">
        <button
          v-for="p in presetOptions"
          :key="p.id"
          type="button"
          :class="['settings-choice-btn', form.preset === p.id && 'settings-choice-btn--active']"
          :style="{ '--choice-accent': p.accent }"
          @click="form.preset = p.id"
        >
          <component :is="p.icon" class="w-5 h-5" />
          <div class="text-center">
            <div class="text-xs font-bold">{{ p.label }}</div>
            <div class="text-[12px] opacity-50">{{ p.desc }}</div>
          </div>
        </button>
      </div>
    </div>

    <div class="weather-fx-block weather-fx-block--routes">
      <header class="weather-fx-route-head">
        <div class="weather-fx-route-head__copy">
          <p class="settings-form-label">{{ '显示范围' }}</p>
          <p class="weather-fx-route-head__hint">{{
            '与顶栏导航一致；「联动」覆盖整个联动中心，下方可单独勾选页签。'
          }}</p>
        </div>
        <span class="weather-fx-route-summary">{{ routeSummary }}</span>
      </header>

      <div class="weather-fx-route-body">
        <section
          v-for="group in routeOptionGroups"
          :key="group.id"
          :class="['weather-fx-route-group', `weather-fx-route-group--${group.id}`]"
        >
          <header v-if="group.label || group.id === 'global'" class="weather-fx-route-group__head">
            <span v-if="group.label" class="weather-fx-route-group__label">{{ group.label }}</span>
            <span v-else class="weather-fx-route-group__label">{{ '快捷' }}</span>
          </header>
          <div class="weather-fx-route-grid">
            <button
              v-for="r in group.options"
              :key="r.id"
              type="button"
              :class="[
                'weather-fx-route-chip',
                `weather-fx-route-chip--${group.id}`,
                isRouteActive(r.id) && 'weather-fx-route-chip--on',
                r.id === 'all' && 'weather-fx-route-chip--all',
              ]"
              @click="toggleRoute(r.id)"
            >
              {{ r.label }}
            </button>
          </div>
        </section>
      </div>
    </div>

    <div class="weather-fx-toggle-row">
      <div class="weather-fx-toggle-row__text">
        <span class="text-xs font-bold wo-text-secondary">{{ '实体属性增强' }}</span>
        <span class="text-[12px] wo-text-label">{{ '风速 / 湿度 / 降水参与逼真模式计算' }}</span>
      </div>
      <WeatherEffectsSwitch v-model="form.useEntityAttributes" size="sm" />
    </div>
  </div>
</template>

<script setup>
import WeatherEffectsSwitch from './WeatherEffectsSwitch.vue'
import { useWeatherEffectsSection } from './context'

const { form, presetOptions, routeOptionGroups, routeSummary, isRouteActive, toggleRoute } =
  useWeatherEffectsSection([
    'form',
    'presetOptions',
    'routeOptionGroups',
    'routeSummary',
    'isRouteActive',
    'toggleRoute',
  ])
</script>

<style scoped src="./styles/weather-effects.css"></style>
