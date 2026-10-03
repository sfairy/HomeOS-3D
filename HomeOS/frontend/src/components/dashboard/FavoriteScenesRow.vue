<template>
  <!-- 收藏场景行：横向滚动展示收藏的场景 chip，点击即可激活 -->
  <div
    v-if="showWhenEmpty || scenes.length"
    :class="['fav-scenes-row', floating && 'fav-scenes-row--floating']"
  >
    <span class="fav-scenes-row__label">{{ '收藏场景' }}</span>

    <!-- 浮动图层空态：暂无收藏场景提示 -->
    <VEmptyState
      v-if="floating && !scenes.length"
      compact
      tone="violet"
      icon="✨"
      :title="'暂无收藏场景'"
      :description="'在侧栏快捷操作中收藏场景后显示于此'"
    />

    <!-- 场景 chip 列表 -->
    <div v-else class="fav-scenes-row__scroll">
      <button
        v-for="scene in scenes"
        :key="scene.id"
        type="button"
        class="fav-scenes-row__chip"
        :disabled="!!activating"
        @click="activate(scene)"
      >
        {{ scene.name }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * FavoriteScenesRow.vue
 *
 * 所属模块：dashboard（仪表盘收藏场景行）
 * 职责：展示用户收藏的场景列表（chip 形式），点击激活对应场景。
 *      支持浮动图层模式（带空态提示）与底栏嵌入模式。
 *      收藏优先来自 layout.favoriteSceneIds，localStorage 作迁移兜底。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { activateSceneById, canActivateSceneId } from '@/utils/orchestrator/activate-scene.util'
import { resolveFavoriteSceneIds } from '@/utils/orchestrator/scene-favorites.util'

defineProps({
  /** 浮动图层模式：纵向布局 + 空态提示 */
  floating: { type: Boolean, default: false },
  /** 无收藏时也渲染容器（浮动图层需要） */
  showWhenEmpty: { type: Boolean, default: false },
})

const entitiesStore = useEntitiesStore()
const authStore = useAuthStore()
const chrome = useChromeStore()
const layoutStore = useLayoutStore()
const favIds = ref(resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds))
const activating = ref('')

const scenes = computed(() => {
  void entitiesStore.derivedEpoch
  const list = []
  for (const id of favIds.value) {
    const e = entitiesStore.getEntity(id)
    list.push({
      id,
      name: e ? getEntityDisplayName(id, e) : id,
    })
  }
  return list
})

function refreshFavs() {
  favIds.value = resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds)
}

async function activate(scene) {
  if (activating.value) return
  const hasHaEntity = !!entitiesStore.getEntity(scene.id)
  const allowed = authStore.allowedSceneIds || []
  if (
    !canActivateSceneId({
      id: scene.id,
      hasHaEntity,
      canControl: authStore.canControl(scene.id),
      isGuest: authStore.isGuest(),
      allowedSceneIds: allowed,
    })
  ) {
    chrome.notify('当前账号无权限执行场景', 'warning')
    return
  }
  activating.value = scene.id
  try {
    await activateSceneById({
      id: scene.id,
      hasHaEntity,
      canControl: authStore.canControl(scene.id),
      isGuest: authStore.isGuest(),
      allowedSceneIds: allowed,
      callHaScene: (eid) => entitiesStore.callService('scene', 'turn_on', eid),
    })
    chrome.notify(`已激活场景 ${scene.name}`, 'success')
  } catch (e) {
    chrome.notify(getApiErrorMessage(e, '场景激活失败'), 'error')
  } finally {
    activating.value = ''
  }
}

onMounted(() => {
  window.addEventListener('storage', refreshFavs)
  window.addEventListener('homeos-scene-favs-changed', refreshFavs)
})
onUnmounted(() => {
  window.removeEventListener('storage', refreshFavs)
  window.removeEventListener('homeos-scene-favs-changed', refreshFavs)
})
</script>

<style scoped src="./styles/FavoriteScenesRow.css"></style>
