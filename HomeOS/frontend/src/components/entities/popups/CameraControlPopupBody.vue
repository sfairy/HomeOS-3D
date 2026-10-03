/**
 * @file CameraControlPopupBody.vue
 * @module components/entities/popups
 *
 * 摄像头弹窗内容区（头栏 + 画面 + 可选启停），供 CameraControlPopup 在
 * Teleport 居中 / EntityControlHost 两套外壳下复用。
 */
<template>
  <div class="ccp-body">
    <div class="ccp-head">
      <div class="ccp-head__left">
        <div class="ccp-head__icon">
          <Camera class="w-5 h-5" />
        </div>
        <div class="min-w-0">
          <h2 class="ccp-head__title">{{ entityName }}</h2>
          <p :class="['ccp-head__state', isLiveStatus ? 'ccp-state-active' : 'ccp-state-inactive']">
            {{ stateLabel }}
          </p>
        </div>
      </div>
      <button type="button" class="ccp-close" :aria-label="'关闭'" @click="$emit('close')">
        <X class="w-5 h-5" />
      </button>
    </div>

    <div class="ccp-stream">
      <HaCameraStream
        v-if="liveEntity?.entity_id && haUrl"
        :key="liveEntity.entity_id"
        :entity="liveEntity"
        :ha-url="haUrl"
        :active="isStreamActive"
        object-fit="cover"
        :prefer-webrtc="true"
        :prefer-hls="true"
        :low-latency="true"
        :snapshot-interval-ms="1000"
        class="w-full h-full"
      />
      <div v-else class="ccp-stream__empty">
        {{ haUrl ? '暂无画面' : '未配置 HA 地址' }}
      </div>
      <div v-if="isStreamActive" class="ccp-live-badge">
        <span class="ccp-live-badge__dot" />
        {{ '实时' }}
      </div>
    </div>

    <div v-if="canToggleCamera" class="ccp-footer">
      <div class="ccp-actions">
        <button
          type="button"
          class="cam-btn"
          :class="isActive ? 'cam-btn--off' : 'cam-btn--on'"
          @click.stop="$emit('toggle')"
        >
          <Video class="w-3.5 h-3.5" />
          <span>{{ isActive ? '停用' : '启用' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 CameraControlPopupBody 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'
import { Video, Camera, X } from '@lucide/vue'
import HaCameraStream from '@/components/HaCameraStream.vue'

const props = defineProps({
  entityName: { type: String, required: true },
  stateLabel: { type: String, required: true },
  isLiveStatus: { type: Boolean, required: true },
  isActive: { type: Boolean, required: true },
  liveEntity: { type: Object, default: null },
  haUrl: { type: String, default: '' },
  canToggleCamera: { type: Boolean, required: true },
  /** 弹窗可见时为 true；宿主可显式传入以暂停后台拉流 */
  streamActive: { type: Boolean, default: true },
})

defineEmits(['close', 'toggle'])

const isStreamActive = computed(
  () => props.streamActive && !!props.liveEntity?.entity_id && !!props.haUrl,
)
</script>

<style src="./styles/CameraControlPopup.css"></style>
