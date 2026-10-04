<template>
  <!-- MediaPlayerModalHeader 媒体弹窗顶栏：显示设备状态、更多操作下拉与关闭按钮 -->
  <header class="media-modal__top">
    <div class="media-modal__status">
      <span class="media-modal__status-dot" :class="stateDotClass" aria-hidden="true" />
      <span class="media-modal__status-text">
        {{ deviceName || '媒体播放器' }}
        <span class="media-modal__status-sep">/</span>
        {{ stateLabelUpper }}
      </span>
    </div>
    <div class="media-modal__top-actions">
      <div class="media-modal__more-wrap" ref="moreWrapRef">
        <button
          type="button"
          class="media-modal__more-btn"
          :aria-label="'更多'"
          :aria-expanded="showMore"
          @click.stop.prevent="toggleShowMore"
        >
          <MoreHorizontal :size="18" />
        </button>
        <!--
          【策略：Teleport 到 body + 极简本地 viewport 坐标计算】
          为什么要彻底放弃 useDropdownPosition：那个 composable 是为"画布内 Teleport 到 #teleport-target"的下拉设计，
          含大量冗余逻辑（滚动父容器、shouldUseTeleportCanvasCoords、fitContent、resizeObserver 监听等），
          在 MediaPlayerModal 场景反而产生坐标系不一致的风险（前面三轮的位置/遮盖/偏移问题全部由此引出）。
          本组件只需纯 viewport 坐标 → Teleport 到 body（containing block=viewport），位置 1:1 零换算。
          由 watch(showMore) 触发，nextTick() 后用 getBoundingClientRect() 直接取 anchor/menu 视口坐标，
          自己判断：右边缘溢出 → 右对齐；下方空间不够 → 翻上方；height/maxHeight 自适应。
        -->
        <Teleport to="body">
          <div
            v-if="showMore"
            ref="moreMenuRef"
            :class="['media-modal__menu', moreMenuPlacement === 'top' && 'media-modal__menu--top']"
            :style="dropdownStyle"
            @click.stop
          >
            <button
              v-if="supports.shuffleSet"
              type="button"
              class="media-modal__menu-item"
              :class="{ 'media-modal__menu-item--on': attrs?.shuffle }"
              @click="toggleShuffle"
            >
              <Shuffle :size="14" />
              {{ '随机播放' }}
            </button>
            <button
              v-if="supports.repeatSet"
              type="button"
              class="media-modal__menu-item"
              :class="{ 'media-modal__menu-item--on': attrs?.repeat && attrs.repeat !== 'off' }"
              @click="toggleRepeat"
            >
              <Repeat :size="14" />
              {{ repeatLabel }}
            </button>
            <div v-if="supports.selectSource && sourceList.length" class="media-modal__menu-section">
              <span class="media-modal__menu-label">{{ '音源' }}</span>
              <button
                v-for="src in sourceList"
                :key="src"
                type="button"
                class="media-modal__menu-chip"
                :class="{ 'media-modal__menu-chip--active': attrs?.source === src }"
                @click="setSource(src)"
              >
                {{ src }}
              </button>
            </div>
            <div v-if="hasTts" class="media-modal__menu-tts">
              <input
                v-model="ttsText"
                type="text"
                class="media-modal__tts-input"
                :placeholder="'输入播报文字...'"
                @keydown.enter="speakTts"
              />
              <button
                type="button"
                class="media-modal__tts-btn"
                :disabled="!ttsText.trim()"
                :aria-label="'语音播报'"
                @click="speakTts"
              >
                <Volume2 :size="14" />
              </button>
            </div>
          </div>
        </Teleport>
      </div>
      <button type="button" class="media-modal__close" :aria-label="'关闭'" @click.stop.prevent="() => emit('close')">
        <X :size="18" />
      </button>
    </div>
  </header>
</template>

<script setup>
/**
 * MediaPlayerModalHeader - 媒体弹窗顶栏组件
 * 职责：展示播放器名称与状态、提供随机/循环/音源切换与 TTS 输入的更多菜单、关闭按钮。
 * Props:
 * - deviceName/stateLabelUpper/stateDotClass：设备名、状态文案与状态点样式；
 * - attrs：播放器原始属性对象，用于读取 shuffle/repeat/source 等；
 * - supports：能力开关对象，决定菜单项是否渲染；
 * - repeatLabel/sourceList/hasTts：循环文案、可选音源列表、是否支持 TTS；
 * - toggleShuffle/toggleRepeat/setSource/speakTts：父级传入的事件回调。
 * v-model:
 * - showMore：下拉菜单展开状态；
 * - ttsText：TTS 输入框文本。
 * Emits:
 * - close：关闭弹窗。
 */
import { nextTick, reactive, ref, watch } from 'vue'
import { X, Volume2, Repeat, Shuffle, MoreHorizontal } from '@lucide/vue'

const showMore = defineModel('showMore', { type: Boolean, default: false })
const ttsText = defineModel('ttsText', { type: String, default: '' })

defineProps({
  deviceName: { type: String, default: '' },
  stateLabelUpper: { type: String, default: '' },
  stateDotClass: { type: String, default: '' },
  attrs: { type: Object, default: null },
  supports: { type: Object, required: true },
  repeatLabel: { type: String, default: '' },
  sourceList: { type: Array, default: () => [] },
  hasTts: { type: Boolean, default: false },
  toggleShuffle: { type: Function, required: true },
  toggleRepeat: { type: Function, required: true },
  setSource: { type: Function, required: true },
  speakTts: { type: Function, required: true },
})

const emit = defineEmits(['close'])

const moreWrapRef = ref(null)
const moreMenuRef = ref(null)

/**
 * 三点更多菜单的显式切换函数。
 * 【说明】原本 template 中直接写 `@click.stop="showMore = !showMore"`，
 * 在 defineAsyncComponent（媒体播放器弹窗）+ Transition + defineModel
 * 的组合场景下，极少数浏览器/构建产物中 template 级 setter 未能正确
 * 触发 emit，导致"视觉 hover 正常但点击无反应"。改为显式函数调用，
 * 保证在任何挂载时机下 showMore 的 v-model 链路都能闭环。
 */
function toggleShowMore() {
  showMore.value = !showMore.value
}

// —————————————————————————————————————————————————————————————————————————————
// 本地极简下拉定位（替代 useDropdownPosition）
// —————————————————————————————————————————————————————————————————————————————
// 设计原则：
// 1) Teleport 到 body，containing block=viewport；
// 2) getBoundingClientRect() 得到的 viewport 坐标直接赋给 position:fixed，零换算；
// 3) 先设 visibility:hidden 防闪烁，测量后替换为真实 style；
// 4) 宽度/高度用"合理固定值"而非首次 getBoundingClientRect 测量——
//    首次测量时 menu 的 fixed 定位还没设 width，且 TTS input 有 width:100%
//    会把容器撑到 viewport 级别的离谱宽度（>1400px），后续按此宽度算
//    右对齐会把 left 推到负数，Math.max(8, left) 贴到视口最左，导致菜单
//    左边 1000+ 像素在 Modal 之外被裁掉，用户只看到最右 TTS 一条。
//    内容高度/宽度是已知稳定的（随机+循环+音源+TTS ≈ 260×280），直接锁定。
const MORE_MENU_WIDTH = 280
const MORE_MENU_EST_HEIGHT = 260
const MORE_MENU_GAP = 4
const MORE_MENU_VIEWPORT_MARGIN = 8

const moreMenuPlacement = ref('bottom')
const dropdownStyle = reactive({
  position: 'fixed',
  visibility: 'hidden',
})

watch(
  showMore,
  (open) => {
    if (!open) return
    const el = moreWrapRef.value
    if (!el) return
    nextTick().then(() => {
      const r = el.getBoundingClientRect()
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1920
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 1080

      // 水平：优先右对齐按钮右缘（按钮在 Modal 右上角，这是最符合用户直觉的方向）；
      //      若左缘会撞视口左边则回退为左对齐按钮左缘。
      let left = r.right - MORE_MENU_WIDTH
      if (left < MORE_MENU_VIEWPORT_MARGIN) {
        left = Math.max(MORE_MENU_VIEWPORT_MARGIN, r.left)
      }
      // 再做右缘兜底（极端窄视口时保证能完整看到）
      if (left + MORE_MENU_WIDTH > viewportW - MORE_MENU_VIEWPORT_MARGIN) {
        left = viewportW - MORE_MENU_VIEWPORT_MARGIN - MORE_MENU_WIDTH
        left = Math.max(MORE_MENU_VIEWPORT_MARGIN, left)
      }

      const spaceBelow = viewportH - r.bottom - MORE_MENU_VIEWPORT_MARGIN - MORE_MENU_GAP
      const spaceAbove = r.top - MORE_MENU_VIEWPORT_MARGIN - MORE_MENU_GAP

      if (spaceBelow >= MORE_MENU_EST_HEIGHT || spaceBelow >= spaceAbove) {
        moreMenuPlacement.value = 'bottom'
        dropdownStyle.position = 'fixed'
        dropdownStyle.visibility = 'visible'
        dropdownStyle.left = `${left}px`
        dropdownStyle.top = `${r.bottom + MORE_MENU_GAP}px`
        dropdownStyle.width = `${MORE_MENU_WIDTH}px`
        dropdownStyle.maxHeight = `${Math.max(MORE_MENU_EST_HEIGHT, spaceBelow)}px`
        delete dropdownStyle.bottom
      } else {
        moreMenuPlacement.value = 'top'
        dropdownStyle.position = 'fixed'
        dropdownStyle.visibility = 'visible'
        dropdownStyle.left = `${left}px`
        dropdownStyle.bottom = `${viewportH - r.top + MORE_MENU_GAP}px`
        dropdownStyle.width = `${MORE_MENU_WIDTH}px`
        dropdownStyle.maxHeight = `${Math.max(MORE_MENU_EST_HEIGHT, spaceAbove)}px`
        delete dropdownStyle.top
      }
    })
  },
  { flush: 'post', immediate: true },
)
</script>
