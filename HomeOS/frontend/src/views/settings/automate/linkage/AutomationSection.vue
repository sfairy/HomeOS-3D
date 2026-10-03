/**
 * 组件：AutomationSection.vue
 *
 * 所属模块：frontend / src / views / settings / automate / linkage
 * 职责：全屋联动「跨模块联动」面板。展示联动预设卡片（离家布防等）与人员布防自动化开关，
 *      点击即写入系统配置；底部提供相关高级参数跳转入口。
 * 关键依赖：
 *  - SettingsSectionHead：分区标题
 *  - SETTINGS_ROUTES / LINKAGE_HUB_ROUTES：参数与联动中心路由
 * 数据来源：父级透传的 linkageSecurity / 预设 / 开关与参数行 + presetIcon / paramRoute 回调
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/AutomationSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { RouterLink } from 'vue-router'
import { Link2, ChevronRight, Loader2 } from '@lucide/vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { LINKAGE_HUB_ROUTES } from '@/utils/registry/linkage-route.util'

// 入参：加载态、安防联动配置对象、预设/开关/参数行、图标与路由回调、是否隐藏标题
defineProps({
  loading: { type: Boolean, default: false },
  linkageSecurity: { type: Object, required: true },
  linkagePresets: { type: Array, default: () => [] },
  flagRows: { type: Array, default: () => [] },
  paramRows: { type: Array, default: () => [] },
  presetIcon: { type: Function, required: true },
  paramRoute: { type: Function, required: true },
  hideHead: { type: Boolean, default: false },
})

// 对外事件：切换预设、切换人员布防开关
defineEmits(['toggle-preset', 'toggle-flag'])
</script>

<template>
  <section class="linkage-workspace-block linkage-workspace-block--automation">
    <SettingsSectionHead
      v-if="!hideHead"
      :icon="Link2"
      icon-class="linkage-workspace-head__icon--automation"
      orb-class="linkage-workspace-head__orb--automation"
      title="跨模块联动"
      description="一键启用离家布防、家庭模式等跨模块自动化；开启后立即写入系统配置。"
      bordered
    />

    <div v-else class="linkage-pane-toolbar">
      <p class="linkage-pane-toolbar__lead">
        {{ '一键启用跨模块自动化；开关立即写入系统配置。人员相关自动布防在下方列表。' }}
      </p>
    </div>

    <div class="linkage-workspace-block__content">
      <div v-if="loading" class="linkage-loading">
        <Loader2 class="w-5 h-5 animate-spin opacity-40" />
        <span>{{ '加载联动配置…' }}</span>
      </div>
      <template v-else>
        <div v-if="linkagePresets.length" class="linkage-preset-grid">
          <div
            v-for="preset in linkagePresets"
            :key="preset.id"
            :class="[
              'linkage-preset-card',
              `linkage-preset-card--${preset.theme || 'amber'}`,
              linkageSecurity[preset.configKey] && 'linkage-preset-card--on',
            ]"
          >
            <div class="linkage-preset-card__head">
              <div
                :class="[
                  'linkage-preset-card__orb',
                  linkageSecurity[preset.configKey] && 'linkage-preset-card__orb--on',
                ]"
              >
                <component :is="presetIcon(preset.icon)" class="w-5 h-5" />
              </div>
              <button
                type="button"
                class="toggle-btn shrink-0"
                :class="{ on: linkageSecurity[preset.configKey] }"
                :disabled="loading"
                :aria-label="preset.title"
                @click="$emit('toggle-preset', preset.id)"
              >
                <div class="toggle-dot" :class="{ on: linkageSecurity[preset.configKey] }" />
              </button>
            </div>
            <h3 class="linkage-preset-card__title">{{ preset.title }}</h3>
            <p class="linkage-preset-card__desc">{{ preset.description }}</p>
            <span v-if="linkageSecurity[preset.configKey]" class="linkage-preset-card__badge">
              {{ '运行中' }}
            </span>
          </div>
        </div>

        <div v-if="flagRows.length" class="linkage-params linkage-flags-block">
          <p class="linkage-params__label">{{ '人员与布防自动化' }}</p>
          <div class="hm-sec-flags">
            <div
              v-for="flag in flagRows"
              :key="flag.key"
              :class="['hm-sec-flag', linkageSecurity[flag.key] && 'hm-sec-flag--on']"
            >
              <div class="hm-sec-flag__text">
                <span class="hm-sec-flag__title">{{ flag.label }}</span>
                <span class="hm-sec-flag__desc">{{ flag.desc }}</span>
              </div>
              <button
                type="button"
                class="toggle-btn shrink-0"
                :class="{ on: linkageSecurity[flag.key] }"
                :disabled="loading"
                :aria-label="flag.label"
                @click="$emit('toggle-flag', flag.key)"
              >
                <div class="toggle-dot" :class="{ on: linkageSecurity[flag.key] }" />
              </button>
            </div>
          </div>
        </div>

        <div class="linkage-params">
          <p class="linkage-params__label">{{ '相关高级参数' }}</p>
          <div class="linkage-params__grid">
            <RouterLink
              v-for="row in paramRows"
              :key="row.key"
              :to="paramRoute(row.route)"
              :class="['linkage-param-chip', `linkage-param-chip--${row.theme || 'sky'}`]"
            >
              <span class="linkage-param-chip__title">{{ row.label }}</span>
              <span class="linkage-param-chip__desc">{{ row.desc }}</span>
              <ChevronRight class="linkage-param-chip__chev w-3.5 h-3.5" />
            </RouterLink>
          </div>
        </div>

        <p class="linkage-footer-note">
          {{ '布防阈值、离家确认等待等细项见' }}
          <RouterLink :to="SETTINGS_ROUTES.params('security')" class="linkage-footer-link">{{
            '高级参数 · 安防阈值'
          }}</RouterLink>
          {{ '；场景联动见' }}
          <RouterLink :to="LINKAGE_HUB_ROUTES.root()" class="linkage-footer-link">{{
            '联动中心'
          }}</RouterLink
          >。
        </p>
      </template>
    </div>
  </section>
</template>
<style src="./styles/linkage.css"></style>
