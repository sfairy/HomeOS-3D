<!--
组件：SettingsBindingsCamerasSection.vue
所属模块：frontend / src / views / settings / connect / bindings
职责：摄像头绑定分区。展示监控列表，支持标记门铃画面与安防首选，并以流程概览展示
      路数与首选状态。
关键依赖：
  - EntityInput：摄像头实体选择
  - SettingsFlowBand / SettingsFlowStat：流程概览
数据来源：父级透传的 securityCameras（双向）/ doorbellCameras / securityCamera
-->
<template>
  <div class="settings-hub-section bind-cameras-hub">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="cameraFlowSteps"
        class="bind-cam-flow"
        band-class="bind-cam-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="cameraFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'监控路数'"
            :value="`${securityCameras.length} 路`"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'安防首选'"
            :value="securityCamera?.trim() ? '已设' : '未设'"
            :tone="securityCamera?.trim() ? 'emerald' : 'secondary'"
            :val-tone="securityCamera?.trim() ? 'emerald' : 'secondary'"
          />
        </template>
      </SettingsFlowBand>

      <header class="bind-section__head">
        <div>
          <p class="bind-section__eyebrow">{{ '监控路由' }}</p>
          <h3 class="bind-section__title">{{ '摄像头绑定' }}</h3>
          <p class="bind-section__desc">
            {{
              'Frigate AI 事件：相关实体 entity_id 建议含 frigate，安防页会按此约定解析检测事件。'
            }}
          </p>
        </div>
        <span v-if="securityCameras.length" class="bind-section__badge">{{
          `${securityCameras.length} 路`
        }}</span>
      </header>

      <div v-if="securityCameras.length" class="bind-cam-list">
        <article v-for="(cam, idx) in securityCameras" :key="idx" class="bind-cam-card">
          <header class="bind-cam-card__head">
            <span class="bind-cam-card__index">{{ idx + 1 }}</span>
            <div class="bind-cam-card__entity flex-1 min-w-0">
              <EntityInput
                v-model="securityCameras[idx]"
                :placeholder="'camera.xxx'"
                domain-filter="camera"
              />
            </div>
            <button
              type="button"
              class="bind-cam-card__delete"
              :title="'移除此路监控'"
              :aria-label="'移除此路监控'"
              @click="$emit('remove-camera', idx)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </header>
          <div class="bind-cam-card__roles">
            <button
              type="button"
              :class="['bind-cam-role', doorbellCameras.includes(cam) && 'bind-cam-role--doorbell']"
              @click="$emit('toggle-doorbell-cam', cam)"
            >
              <Bell class="w-3 h-3" />
              {{ doorbellCameras.includes(cam) ? '门铃画面' : '设为门铃' }}
            </button>
            <button
              type="button"
              :class="['bind-cam-role', securityCamera === cam && 'bind-cam-role--default']"
              @click="$emit('set-default-camera', cam)"
            >
              <Star class="w-3 h-3" />
              {{ securityCamera === cam ? '安防首选' : '设为默认' }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="bind-cam-empty">
        <Video class="bind-cam-empty__icon" />
        <p class="bind-cam-empty__title">{{ '尚未添加摄像头' }}</p>
        <p class="bind-cam-empty__desc">{{ '点击页头「添加摄像头」绑定 HA 摄像头实体' }}</p>
      </div>

      <p class="settings-note-callout settings-note-callout--emerald mt-4">
        <span class="settings-note-callout__label">{{ '预览' }}</span>
        <span>{{
          '支持多路 MJPEG/HLS 实时预览；标记为「门铃」的画面用于门铃弹窗，「安防首选」用于安防页默认播放源。'
        }}</span>
      </p>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Bell, Monitor, Star, Trash2, Video } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'

// 双向绑定：监控摄像头实体 id 列表
const securityCameras = defineModel('securityCameras', { type: Array, default: () => [] })

// 入参：门铃画面列表、安防首选摄像头 id
const props = defineProps({
  doorbellCameras: { type: Array, default: () => [] },
  securityCamera: { type: String, default: '' },
})

// 对外事件：切换门铃画面标记、设默认摄像头、移除摄像头
defineEmits(['toggle-doorbell-cam', 'set-default-camera', 'remove-camera'])

// 流程概览折叠态摘要文案
const cameraFlowSummary = computed(() => {
  const n = securityCameras.value.length
  const def = props.securityCamera?.trim() ? '安防首选已设' : '安防首选未设'
  return `${n} 路监控 · ${def}`
})

// 流程概览步骤：HA 摄像头 / 实时预览 / 门铃画面 / 安防播放
const cameraFlowSteps = computed(() => [
  { label: 'HA 摄像头', meta: `${securityCameras.value.length} 路`, icon: Video, tone: 'in' },
  { label: '实时预览', meta: 'MJPEG/HLS', icon: Monitor, tone: 'sky' },
  {
    label: '门铃画面',
    meta: `${props.doorbellCameras.length} 路标记`,
    icon: Bell,
    tone: 'exec',
  },
  {
    label: '安防播放',
    meta: props.securityCamera?.trim() ? '已设默认' : '待指定',
    icon: Star,
    tone: 'out',
  },
])
</script>

<style scoped src="./styles/SettingsBindingsCamerasSection.css"></style>
