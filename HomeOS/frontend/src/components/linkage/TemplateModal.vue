<template>
  <!-- LinkageTemplateModal 联动模板模态框：服务端内置 + 本机「我的模板」 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div
        v-if="open"
        ref="rootRef"
        class="hos-modal-root linkage-template-modal-root"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown.esc="emit('close')"
      >
        <div class="hos-modal-backdrop" @click="emit('close')" />
        <div
          class="hos-modal-panel hos-modal-panel--lg linkage-template-modal-panel"
          :class="toneClass"
        >
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div>
                <h2 class="hos-modal-title">{{ title }}</h2>
                <p class="hos-modal-subtitle">{{ subtitle }}</p>
              </div>
            </div>
            <button
              type="button"
              class="hos-modal-close"
              :aria-label="'关闭'"
              @click="emit('close')"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="hos-modal-body hos-modal-body--flush linkage-template-modal-body orch-builder-workspace">
            <div v-if="loading" class="linkage-template-modal-loading">{{ '加载模板中…' }}</div>
            <template v-else>
              <OrchestratorTemplateLibrary
                v-if="templates.length"
                :title="libraryTitle"
                :templates="templates"
                :installing-id="installingId"
                :collapsible="false"
                :storage-key="storageKey"
                :search-placeholder="searchPlaceholder"
                @install="onInstall"
              />
              <VEmptyState
                v-else
                compact
                tone="slate"
                :title="'暂无服务端内置模板'"
                :description="
                  showLocalPanel ? '可在下方使用本机已保存的「我的模板」' : ''
                "
              />

              <div v-if="showLocalPanel" class="linkage-template-modal-local">
                <OrchestratorLocalTemplatesPanel
                  v-if="hubKind === 'script' || hubKind === 'scene'"
                  :kind="hubKind"
                  apply-only
                  title="我的模板（本机）"
                  @apply="onApplyLocal"
                />
                <GeekTemplatesPanel
                  v-else-if="hubKind === 'automation'"
                  apply-only
                  custom-only
                  hide-title
                  :server-groups="[]"
                  @apply="onApplyLocal"
                />
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * LinkageTemplateModal - 联动模板模态框
 * - 服务端内置模板安装
 * - 本机「我的模板」应用（脚本/场景/自动化）
 */
import { computed, nextTick, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import OrchestratorTemplateLibrary from '@/components/dashboard/OrchestratorTemplateLibrary.vue'
import OrchestratorLocalTemplatesPanel from '@/components/dashboard/OrchestratorLocalTemplatesPanel.vue'
import GeekTemplatesPanel from '@/components/geek-automation/GeekTemplatesPanel.vue'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '内置模板' },
  subtitle: {
    type: String,
    default: '选择模板一键安装；也可应用本机已保存的「我的模板」',
  },
  libraryTitle: { type: String, default: '模板库' },
  templates: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  installingId: { type: String, default: null },
  tone: { type: String, default: 'purple' },
  storageKey: { type: String, default: 'homeos_orch_tpl_modal' },
  /** scene | script | automation */
  hubKind: { type: String, default: null },
})

const emit = defineEmits(['close', 'install', 'apply-local'])

const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()
const rootRef = ref(null)

const showLocalPanel = computed(
  () =>
    props.hubKind === 'script' ||
    props.hubKind === 'scene' ||
    props.hubKind === 'automation',
)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nextTick(() => rootRef.value?.focus?.())
  },
)

const toneClass = computed(() => {
  if (props.tone === 'amber') return 'hos-modal-panel--amber'
  if (props.tone === 'emerald') return 'hos-modal-panel--emerald'
  if (props.tone === 'sky') return 'hos-modal-panel--sky'
  if (props.tone === 'violet' || props.tone === 'purple') return 'hos-modal-panel--purple'
  return 'hos-modal-panel--purple'
})

const searchPlaceholder = computed(() => {
  if (props.hubKind === 'scene') return '搜索场景模板名称或描述…'
  if (props.hubKind === 'script') return '搜索脚本模板名称或描述…'
  if (props.hubKind === 'automation') return '搜索自动化模板名称、描述或标签…'
  return '搜索模板名称、描述或标签…'
})

function onInstall(tpl) {
  emit('install', tpl?.id ?? tpl)
}

function onApplyLocal(tpl) {
  emit('apply-local', tpl)
}
</script>

<style scoped src="./styles/linkage.css"></style>
<style scoped>
.linkage-template-modal-local {
  margin-top: 12px;
  padding: 12px 16px 16px;
  border-top: 1px solid color-mix(in srgb, var(--hos-border, #e2e8f0) 80%, transparent);
}
</style>
