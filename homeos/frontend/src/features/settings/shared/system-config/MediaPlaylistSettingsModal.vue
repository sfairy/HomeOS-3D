<!--
组件：MediaPlaylistSettingsModal.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：媒体播放列表设置弹窗。在高级参数中配置媒体播放列表部件的播放项，内嵌 PlaylistWidget 编辑器，
      支持焦点陷阱与 teleport 到 shell。
Props：
  - open：是否打开
Emits：
  - close：关闭弹窗
关键依赖：
  - MediaPlaylistWidget：播放列表编辑组件
  - useFocusTrap / useShellTeleportTarget：焦点陷阱与 teleport
数据来源：PlaylistWidget 内部状态
-->
<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <div
      v-if="open"
      class="media-pl-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-pl-modal-title"
      aria-describedby="media-pl-modal-desc"
    >
      <div class="media-pl-modal__backdrop" @click="emit('close')" />
      <div
        ref="panelRef"
        class="media-pl-modal__panel"
        tabindex="-1"
        @keydown.escape.prevent="emit('close')"
      >
        <header class="media-pl-modal__head">
          <div>
            <p class="media-pl-modal__eyebrow">{{ '专用设置页' }}</p>
            <h3 id="media-pl-modal-title" class="media-pl-modal__title">{{ '媒体播放列表' }}</h3>
            <p id="media-pl-modal-desc" class="media-pl-modal__desc">
              {{
                '选择 media_player 并查看/启动播放列表；变更会持久化到系统配置。也可在「微件管理」中将「播放列表」微件添加到侧栏。'
              }}
            </p>
          </div>
          <button
            type="button"
            class="media-pl-modal__close"
            :aria-label="'关闭'"
            @click="emit('close')"
          >
            <X class="w-4 h-4" />
          </button>
        </header>
        <div class="media-pl-modal__body">
          <MediaPlaylistWidget variant="settings" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref } from 'vue'
import { X } from '@lucide/vue'
import MediaPlaylistWidget from '@/components/widgets/media/PlaylistWidget.vue'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = shellTeleportPending
const panelRef = ref(null)

useFocusTrap(
  panelRef,
  computed(() => props.open),
)
</script>

<style scoped src="./styles/MediaPlaylistSettingsModal.css"></style>
