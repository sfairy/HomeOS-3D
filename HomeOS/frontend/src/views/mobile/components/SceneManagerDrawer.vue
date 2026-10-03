/**
 * @file SceneManagerDrawer.vue
 * @module views/mobile/components
 * @description 移动端首页「场景管理」抽屉：展示全部场景，支持收藏/取消收藏与批量应用。
 * @dependencies @/stores/entities.store、@/stores/layout.store、@/utils/orchestrator/scene-favorites.util
 */
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CheckCheck, X, XCircle } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { domainIndexToArray, getEntityDisplayName } from '@/utils/entity/derived.util'
import {
  persistFavoriteSceneIds,
  resolveFavoriteSceneIds,
} from '@/utils/orchestrator/scene-favorites.util'

const props = defineProps({
  /** 是否展开抽屉 */
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const entitiesStore = useEntitiesStore()
const layoutStore = useLayoutStore()

/** 已选中（显示在首页滑轨）的场景 ID 集合，写入 layout.favoriteSceneIds */
const selectedIds = ref<string[]>(resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds))

/** 全部场景实体：id + 展示名，随 scene 域版本变化自动刷新 */
const allScenes = computed(() => {
  void entitiesStore.getDomainEpoch('scene')
  const ids = domainIndexToArray(entitiesStore.domainEntityIndex?.get('scene'))
  return ids
    .map((id) => {
      const entity = entitiesStore.entities[id]
      return { id, name: getEntityDisplayName(id, entity) }
    })
    .filter((s) => Boolean(s.id))
})

/** 统计：共 N 个场景 · M 个已显示 */
const sceneStats = computed(
  () => `共 ${allScenes.value.length} 个场景 · ${selectedIds.value.length} 个已显示`,
)

/** 全部隐藏：滑轨会因无收藏而自动收拢 */
const allHidden = computed(() => allScenes.value.length > 0 && selectedIds.value.length === 0)

function isSelected(id: string) {
  return selectedIds.value.includes(id)
}

/** 提交选中清单：写入 layout 并广播变更（首页滑轨据此刷新） */
function commit(next: string[]) {
  selectedIds.value = persistFavoriteSceneIds(next, layoutStore.layoutConfig)
}

/** 切换单个场景的显示状态 */
function toggleScene(id: string) {
  if (isSelected(id)) commit(selectedIds.value.filter((x) => x !== id))
  else commit([...selectedIds.value, id])
}

/** 全选：显示全部场景 */
function selectAll() {
  commit(allScenes.value.map((s) => s.id))
}

/** 全不选：隐藏全部场景（首页滑轨收拢） */
function deselectAll() {
  commit([])
}

// 抽屉重新展开时，从 layout 同步一次（其他入口可能已改动收藏）
watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedIds.value = resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds)
    }
  },
)

onMounted(() => {
  selectedIds.value = resolveFavoriteSceneIds(layoutStore.layoutConfig.favoriteSceneIds)
})
</script>

<template>
  <div v-if="open" class="m-page__sheet" @click.self="emit('close')">
    <div class="m-page__sheet-panel m-scene-manager">
      <header class="m-scene-manager__head">
        <div>
          <p class="m-page__card-label">场景</p>
          <h2 class="m-scene-manager__title">场景管理</h2>
        </div>
        <button
          type="button"
          class="m-scene-manager__close"
          aria-label="关闭场景管理"
          @click="emit('close')"
        >
          <X class="w-4 h-4" />
        </button>
      </header>

      <p class="m-scene-manager__stats">{{ sceneStats }}</p>

      <div class="m-scene-manager__actions">
        <button
          type="button"
          class="m-scene-manager__btn"
          :disabled="!allScenes.length"
          @click="selectAll"
        >
          <CheckCheck class="w-3.5 h-3.5" />
          <span>全选</span>
        </button>
        <button
          type="button"
          class="m-scene-manager__btn"
          :disabled="!allScenes.length"
          @click="deselectAll"
        >
          <XCircle class="w-3.5 h-3.5" />
          <span>全不选</span>
        </button>
      </div>

      <p v-if="!allScenes.length" class="m-page__hint">暂无场景实体</p>

      <ul v-else class="m-scene-manager__list">
        <li v-for="scene in allScenes" :key="scene.id">
          <button
            type="button"
            class="m-scene-manager__row"
            :class="{ 'm-scene-manager__row--on': isSelected(scene.id) }"
            :aria-pressed="isSelected(scene.id)"
            @click="toggleScene(scene.id)"
          >
            <span class="m-scene-manager__name">{{ scene.name }}</span>
            <span class="m-scene-manager__switch" aria-hidden="true">
              <span class="m-scene-manager__thumb" />
            </span>
          </button>
        </li>
      </ul>

      <p v-if="allHidden" class="m-scene-manager__warn">
        已隐藏所有场景 · 首页场景滑轨将自动收拢
      </p>
    </div>
  </div>
</template>

<style scoped>
.m-scene-manager {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 72vh;
}

.m-scene-manager__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.m-scene-manager__title {
  margin: 4px 0 0;
  font-size: var(--premium-fs-title);
  font-weight: 800;
}

.m-scene-manager__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  cursor: pointer;
}

.m-scene-manager__stats {
  margin: 0;
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  color: var(--set-text-secondary, rgba(255, 255, 255, 0.6));
  /* 窄屏下按语义换行，避免统计文案逐字竖排 */
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.m-scene-manager__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.m-scene-manager__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  cursor: pointer;
}

.m-scene-manager__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.m-scene-manager__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.m-scene-manager__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border-radius: var(--hos-radius-card, 14px);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.m-scene-manager__row--on {
  border-color: rgba(var(--m-accent-rgb), 0.45);
  background: rgba(var(--m-accent-rgb), 0.12);
}

.m-scene-manager__name {
  flex: 1;
  min-width: 0;
  font-size: var(--premium-fs-body-sm);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-scene-manager__switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  flex-shrink: 0;
  border-radius: var(--hos-radius-pill);
  background: rgba(255, 255, 255, 0.14);
  border: var(--hos-hairline, 1px) solid rgba(255, 255, 255, 0.16);
  transition: background 0.18s ease;
}

.m-scene-manager__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  transition: transform 0.18s ease;
}

.m-scene-manager__row--on .m-scene-manager__switch {
  background: rgba(var(--m-accent-rgb), 0.45);
  border-color: rgba(var(--m-accent-rgb), 0.6);
}

.m-scene-manager__row--on .m-scene-manager__thumb {
  transform: translateX(14px);
  background: #fff;
}

.m-scene-manager__warn {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--hos-radius-card);
  border: var(--hos-hairline, 1px) solid rgba(251, 191, 36, 0.3);
  background: rgba(251, 191, 36, 0.1);
  font-size: var(--premium-fs-micro);
  font-weight: 650;
  color: rgba(251, 191, 36, 0.95);
  white-space: normal;
  word-break: keep-all;
  overflow-wrap: anywhere;
}
</style>
