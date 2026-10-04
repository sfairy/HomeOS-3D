<!--
组件：ImportBackupModal.vue
所属模块：frontend / src / views / settings / shared
职责：导入备份弹窗。支持粘贴 JSON 或选择文件，按分区（布局/设置）勾选导入范围，
      展示文件名与导入进度。支持 teleport 到 shell 与 keep-alive 自动关闭。
Props：
  - open：是否打开
  - backupType：备份类型（ui / appConfig）
  - sections：选中的导入分区
  - importJsonText：导入 JSON 文本
  - selectedFileName：已选文件名
  - isImporting：是否正在导入
Emits：
  - close / import / update:importJsonText / update:sections / file-select
关键依赖：
  - useKeepAliveGate / useShellTeleportTarget：keep-alive 与 teleport
  - @lucide/vue 的 X / FileJson / AlertTriangle / Loader2 / Check
数据来源：父级透传的备份内容与导入状态
-->
<template>
  <Teleport v-if="open" :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal" appear>
      <div class="hos-modal-root" style="z-index: 50">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div
          class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--purple"
          style="max-width: 32rem"
        >
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div class="hos-modal-head-icon"><FileJson class="w-5 h-5" /></div>
              <div>
                <h3 class="hos-modal-title">{{ modalTitle }}</h3>
                <p class="hos-modal-subtitle">{{ modalSubtitle }}</p>
              </div>
            </div>
            <button
              type="button"
              class="hos-modal-close"
              :aria-label="'关闭'"
              @click="$emit('close')"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="hos-modal-body">
            <label
              class="hos-modal-dropzone rounded-xl p-4 text-center cursor-pointer transition-all block mb-5"
              :class="{ 'hos-modal-dropzone--active': selectedFileName }"
            >
              <div
                class="hos-modal-dropzone__icon w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
              >
                <FileJson class="w-6 h-6 ibm-icon-accent" />
              </div>
              <p class="text-sm font-bold text-white">{{ '选择备份文件 (.json)' }}</p>
              <p class="text-[12px] mt-1 hos-modal-dropzone__hint">{{ '直接读取导出文件' }}</p>
              <input
                type="file"
                accept=".json"
                class="hidden"
                @change="$emit('file-select', $event)"
              />
              <p v-if="selectedFileName" class="text-[12px] ibm-text-accent mt-2 truncate px-2">
                {{ selectedFileName }}
              </p>
            </label>
            <div class="hos-modal-divider">
              <span>{{ '或者 粘贴 JSON 源代码' }}</span>
            </div>
            <textarea
              :value="importJsonText"
              rows="6"
              class="hos-modal-input font-mono resize-none hos-modal-input--compact"
              placeholder='{ "kind": "homeos-system-bundle", ... }'
              @input="$emit('update:importJsonText', $event.target.value)"
            />
            <div v-if="backupType === 'bundle'" class="hos-modal-sections mt-4">
              <p class="hos-modal-sections__label">{{ '导入分区（未勾选的分区保持不变）' }}</p>
              <div class="hos-modal-sections__grid">
                <label
                  v-for="opt in sectionOptions"
                  :key="opt.key"
                  class="hos-modal-section-chip"
                  :class="{ 'hos-modal-section-chip--on': selectedSections.includes(opt.key) }"
                >
                  <input
                    v-model="selectedSections"
                    type="checkbox"
                    :value="opt.key"
                    class="hidden"
                    @change="emitSections"
                  />
                  <Check v-if="selectedSections.includes(opt.key)" class="w-3 h-3" />
                  <span>{{ opt.label }}</span>
                </label>
              </div>
              <p v-if="!selectedSections.length" class="hos-modal-sections__warn">
                {{ '至少选择一个分区，否则将按默认全选导入' }}
              </p>
            </div>
            <p class="hos-modal-alert mt-4">
              <AlertTriangle class="w-4 h-4 shrink-0 ibm-text-danger" />
              <span>{{ modalWarning }}</span>
            </p>
          </div>
          <div class="hos-modal-footer hos-modal-footer--split">
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--ghost"
              @click="$emit('close')"
            >
              {{ '取消' }}
            </button>
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isImporting || !importJsonText.trim() || (backupType === 'bundle' && !selectedSections.length)"
              @click="$emit('import')"
            >
              <Loader2 v-if="isImporting" class="w-4 h-4 animate-spin" />
              <Check v-else class="w-4 h-4" />
              {{
                isImporting
                  ? '正在执行还原...'
                  : backupType === 'appconfig'
                    ? '确定导入'
                    : backupType === 'bundle'
                      ? '确定完整还原'
                      : '确定执行覆盖还原'
              }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { X, FileJson, AlertTriangle, Loader2, Check } from '@lucide/vue'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

const props = defineProps({
  open: { type: Boolean, default: false },
  backupType: { type: String, default: 'ui' },
  sections: { type: Array, default: () => ['ui', 'appConfig'] },
  importJsonText: { type: String, default: '' },
  selectedFileName: { type: String, default: '' },
  isImporting: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'import', 'update:importJsonText', 'update:sections', 'file-select'])
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && props.open) emit('close')
})

/** 完整备份包可导入分区（仅布局 / 仅设置） */
const sectionOptions = [
  { key: 'ui', label: '仅布局' },
  { key: 'appConfig', label: '仅设置' },
]

const selectedSections = ref([])

// 打开弹窗或切换导入类型时，重置为父组件当前分区选择（默认全选）
watch(
  () => props.open,
  (open) => {
    if (open) selectedSections.value = [...props.sections]
  },
)
watch(
  () => props.backupType,
  () => {
    selectedSections.value = [...props.sections]
  },
)

function emitSections() {
  emit('update:sections', [...selectedSections.value])
}

const modalTitle = computed(() => {
  if (props.backupType === 'bundle') return '完整备份包还原'
  if (props.backupType === 'appconfig') return '系统参数还原'
  return 'UI 布局还原'
})

const modalSubtitle = computed(() => {
  if (props.backupType === 'bundle') return '一次还原 ① UI 布局 + ② 系统参数（默认不含用户）'
  if (props.backupType === 'appconfig') return '导入 AppConfig 运行参数（merge 或 replace）'
  return '从备份恢复各终端 display profile 布局'
})

const modalWarning = computed(() => {
  if (props.backupType === 'bundle') {
    return '警告：默认不含用户账号与 EventLog。所选分区将被全量替换，系统参数可选择合并或全量替换。户型图/图标文件需另行拷贝。'
  }
  if (props.backupType === 'appconfig')
    return '警告：全量替换会覆盖全部运行参数；合并模式仅更新 JSON 中出现的分区。敏感字段请从 admin 导出。'
  return '警告：导入将覆盖当前所有 UI 布局方案，请确保已备份。'
})
</script>

<style scoped src="./styles/settings-cards.css"></style>

<style scoped>
.hos-modal-sections__label {
  font-size: var(--premium-fs-micro, 12px);
  color: var(--set-text-2, rgba(148, 163, 184, 0.85));
  margin-bottom: 8px;
}
.hos-modal-sections__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.hos-modal-section-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 4px;
  border-radius: var(--hos-radius-card);
  font-size: var(--set-fs-micro, 12px);
  cursor: pointer;
  color: var(--set-text-2, rgba(148, 163, 184, 0.85));
  background: var(--hos-surface-well, rgba(0, 0, 0, 0.34));
  border: 1px solid var(--set-mini-surface-border, rgba(148, 163, 184, 0.14));
  transition: all 0.15s ease;
  user-select: none;
}
.hos-modal-section-chip:hover {
  border-color: var(--set-border, rgba(148, 163, 184, 0.35));
}
.hos-modal-section-chip--on {
  color: var(--set-text-strong, #fff);
  background: rgba(var(--page-accent-rgb, 148, 163, 184), 0.16);
  border-color: rgba(var(--page-accent-rgb, 148, 163, 184), 0.45);
}
.hos-modal-sections__warn {
  margin-top: 6px;
  font-size: var(--premium-fs-micro, 12px);
  color: var(--set-text-warn, #fbbf24);
}
</style>
