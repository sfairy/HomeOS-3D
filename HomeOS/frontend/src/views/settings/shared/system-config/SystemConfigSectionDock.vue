<!--
组件：SystemConfigSectionDock.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：高级参数分区委派引导。当某分区由独立面板承载时，展示紧凑 callout 与跳转链接。
Props：
  - guide：引导配置（text / links）
关键依赖：vue-router 的 RouterLink
数据来源：父级透传的 guide
-->
<template>
  <div v-if="guide" class="section-dock section-dock--callout">
    <p class="section-dock__text">{{ guide.text }}</p>
    <div class="section-dock__actions">
      <RouterLink
        v-for="link in guide.links"
        :key="link.to"
        :to="link.to"
        class="section-dock__btn"
      >
        {{ link.label }}
      </RouterLink>
    </div>
  </div>

  <div v-else-if="isDevBuild && sectionKey === 'screensaver'" class="section-dock section-dock--callout">
    <p class="section-dock__text">{{ '开发态：可立即预览锁屏，无需等待空闲超时。' }}</p>
    <div class="section-dock__actions">
      <button type="button" class="section-dock__btn" @click.stop="$emit('preview', 'clock')">
        <Clock3 class="w-3.5 h-3.5" />
        {{ '时钟' }}
      </button>
      <button type="button" class="section-dock__btn" @click.stop="$emit('preview', 'weather')">
        <CloudSun class="w-3.5 h-3.5" />
        {{ '天气' }}
      </button>
      <button
        v-if="previewActive"
        type="button"
        class="section-dock__btn section-dock__btn--ghost"
        @click="$emit('close-preview')"
      >
        <X class="w-3.5 h-3.5" />
        {{ '关闭' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Clock3, CloudSun, X } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { isDevBuild } from '@/utils/core/misc.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

const props = defineProps({
  sectionKey: { type: String, default: '' },
  previewActive: { type: Boolean, default: false },
})

defineEmits(['preview', 'close-preview'])

const GUIDE_BY_SECTION = {
  notification: {
    text: '免打扰与通知总开关在告警规则页；此处仅推送容量与冷却。',
    links: [{ to: SETTINGS_ROUTES.alerts(), label: '告警规则' }],
  },
  energy: {
    text: '电表绑定见首装向导；下方 linkage* 为异常自动联动。',
    links: [
      { to: SETTINGS_ROUTES.setupWizard(), label: '首装向导' },
      { to: SETTINGS_ROUTES.smartServices(), label: '智能服务' },
    ],
  },
  security: {
    text: '自动布防 / 切居家等开关在安防联动页；此处为冷却与巡检阈值。',
    links: [{ to: SETTINGS_ROUTES.securityModes('linkage'), label: '安防联动' }],
  },
  circadian: {
    text: '天气实体在集成绑定页配置；此处为照度反馈与学习开关。',
    links: [{ to: SETTINGS_ROUTES.bindings(), label: '集成绑定' }],
  },
  ops: {
    text: 'EventLog 域/实体筛选在连接页；此处为清理与缓冲阈值。',
    links: [{ to: SETTINGS_ROUTES.connection(), label: '连接页筛选' }],
  },
  pricing: {
    text: '完整电价参数在此编辑；Widget 内也可快捷改价。',
    links: [{ to: SETTINGS_ROUTES.widgets(), label: '能源组件' }],
  },
  frontend: {
    text: '会话刷新间隔在访问控制页；此处为列表与缓存阈值。',
    links: [{ to: SETTINGS_ROUTES.access(), label: '访问控制' }],
  },
  external: {
    text: 'TTS 音箱在语音中心；此处为 OpenWeather、天气预警联动场景/模式与日历。气象实体在集成绑定。',
    links: [
      { to: SETTINGS_ROUTES.voice(), label: '语音中心' },
      { to: SETTINGS_ROUTES.bindings(), label: '集成绑定' },
    ],
  },
  other: {
    text: '顾问动作与播报冷却在智能服务 / 语音中心。',
    links: [
      { to: SETTINGS_ROUTES.smartServices(), label: '智能服务' },
      { to: SETTINGS_ROUTES.voice(), label: '语音中心' },
    ],
  },
}

const guide = computed(() => GUIDE_BY_SECTION[props.sectionKey] || null)
</script>

<style scoped src="./styles/SystemConfigSectionDock.css"></style>
