<!--
  DoorbellAlertModal.vue / components/modals
  可视门铃提醒：紧凑三行结构——标题栏 / 纯净视频 / 操作说明。
  Props: isOpen / cameraId / triggerId / lockEntityId / label
  Emit: close
-->
<template>
  <Transition name="doorbell-pop">
    <div v-if="isOpen" class="hos-modal-root">
      <div class="hos-modal-backdrop" @click="onDismiss" />
      <div
        ref="panelRef"
        class="hos-modal-panel hos-modal-panel--doorbell hos-modal-panel--amber pointer-events-auto flex flex-col"
        role="dialog"
        aria-modal="true"
        :aria-label="'门铃提醒'"
      >
        <!-- 行 1：标题 + 关闭 -->
        <div class="dam-row dam-row--head">
          <div class="dam-row__title">
            <h2>{{ '发现访客按门铃' }}</h2>
            <p>{{ cameraName }} · {{ '实时' }}</p>
          </div>
          <button type="button" class="dam-close" :aria-label="'关闭'" @click.stop="onDismiss">
            ×
          </button>
        </div>

        <!-- 行 2：纯净视频 -->
        <div
          class="dam-row dam-row--video"
          @click="onStreamClick"
          :title="'点击画面关闭提醒'"
        >
          <HaCameraStream
            v-if="cameraEntity && isOpen"
            :entity="cameraEntity"
            :ha-url="haUrl"
            :active="isOpen"
            object-fit="cover"
            :prefer-webrtc="false"
            :snapshot-interval-ms="1000"
            class="w-full h-full"
            @error="onStreamError"
          />
          <div v-else class="dam-video-placeholder">
            <p>{{ '正在连接视频流…' }}</p>
          </div>
        </div>

        <!-- 行 3：可选开门 + 极简说明 -->
        <div class="dam-row dam-row--foot">
          <button
            v-if="doorLockEntityId"
            type="button"
            class="hos-modal-btn hos-modal-btn--primary dam-unlock"
            :disabled="isUnlocking"
            @click="onOpenDoor"
          >
            {{ isUnlocking ? '正在开启门锁…' : '一键远程开门' }}
          </button>
          <p class="dam-caption">{{ '点击画面可关闭' }}</p>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * 门铃提醒弹窗：实时视频 + 可选远程开门。
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch, onMounted, onUnmounted, toRef } from 'vue'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useEscLayer } from '@/composables/ui/useEscStack'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHaConnectionStore } from '@/stores/ha-connection.store'
import { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import HaCameraStream from '@/components/HaCameraStream.vue'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  isOpen: { type: Boolean },
  cameraId: {},
  triggerId: {},
  lockEntityId: { type: String, default: '' },
  label: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const entitiesStore = useEntitiesStore()
const haConnectionStore = useHaConnectionStore()
const chrome = useChromeStore()
const panelRef = ref(null)
useFocusTrap(
  panelRef,
  computed(() => !!props.isOpen),
)
useEscLayer(toRef(props, 'isOpen'), '门铃提醒', () => {
  void onDismiss()
})

const isUnlocking = ref(false)
let doorbellAudio = null

onMounted(() => {
  doorbellAudio = new Audio('/sounds/doorbell.mp3')
  doorbellAudio.load()
})

onUnmounted(() => {
  if (doorbellAudio) {
    doorbellAudio.pause()
    doorbellAudio = null
  }
})

watch(
  () => props.isOpen,
  (val) => {
    if (val && doorbellAudio) {
      doorbellAudio.currentTime = 0
      doorbellAudio.play().catch((e) => {
        logger.warn('[门铃] 自动播放声音受限，可能需要用户先与页面交互一次。', e)
      })
    }
  },
)

const haUrl = computed(() => haConnectionStore.baseUrl)

const cameraEntity = computed(() => {
  const eid = props.cameraId
  if (!eid) return null
  return entitiesStore.entities[eid] || null
})

function onStreamError() {
  logger.warn('[门铃] 视频流加载失败')
}

const cameraName = computed(() => {
  if (props.label) return props.label
  return (
    getEntityDisplayName(props.cameraId ?? '', entitiesStore.entities[props.cameraId]) || '门铃监控'
  )
})

const doorLockEntityId = computed(() => props.lockEntityId || '')

async function onOpenDoor() {
  if (!doorLockEntityId.value || isUnlocking.value) return
  isUnlocking.value = true
  try {
    const eid = doorLockEntityId.value.trim()
    if (!eid.includes('.')) throw new Error('无效的实体 ID 格式')
    const domain = getEntityDomain(eid)
    const entity = entitiesStore.entities[eid]
    let service = 'turn_on'
    if (domain === 'lock') {
      const canOpen = ((entity?.attributes?.supported_features || 0) & 1) !== 0
      service = canOpen ? 'open' : 'unlock'
    } else if (domain === 'button') service = 'press'
    else if (domain === 'script') service = eid.split('.')[1]
    else if (domain === 'scene' || domain === 'input_boolean' || domain === 'switch')
      service = 'turn_on'
    await entitiesStore.callService(domain, service, eid)
    chrome.notify(domain === 'lock' && service === 'open' ? '门锁已弹开' : '指令已发送', 'success')
    setTimeout(() => {
      emit('close')
    }, 1500)
  } catch (e) {
    logger.error('[门铃] 开门失败:', e)
    chrome.notify(`操作失败: ${getApiErrorMessage(e, 'HA 响应超时')}`, 'error')
  } finally {
    isUnlocking.value = false
  }
}

async function onDismiss() {
  if (props.triggerId) {
    const domain = getEntityDomain(props.triggerId)
    if (domain === 'input_boolean' || domain === 'switch') {
      try {
        await entitiesStore.callService(domain, 'turn_off', props.triggerId)
      } catch (e) {
        logger.debug('门铃触发器复位失败', e)
      }
    }
  }
  emit('close')
}

async function onStreamClick() {
  await onDismiss()
}
</script>

<style scoped>
.dam-row--head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dam-row__title h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 750;
  color: #fff;
  letter-spacing: -0.01em;
}

.dam-row__title p {
  margin: 2px 0 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--premium-accent-amber, #f59e0b);
}

.dam-close {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.dam-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.dam-row--video {
  position: relative;
  aspect-ratio: 16 / 9;
  width: 100%;
  background: #000;
  cursor: pointer;
}

.dam-video-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: rgba(255, 255, 255, 0.35);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.dam-row--foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.dam-unlock {
  width: 100%;
  min-height: 44px;
  border-radius: var(--hos-radius-card);
  font-size: 0.95rem;
  font-weight: 700;
}

.dam-caption {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.4);
}
</style>
<style scoped src="./styles/notification-drawer.css"></style>
