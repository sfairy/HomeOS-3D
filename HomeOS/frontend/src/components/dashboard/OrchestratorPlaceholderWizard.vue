<template>
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <!-- 占位实体映射向导弹窗 -->
      <div v-if="open" class="hos-modal-root oph-wizard-root">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div class="hos-modal-panel oph-wizard-panel hos-modal-panel--amber">
          <!-- 装饰性发光层 -->
          <div class="hos-modal-glow hos-modal-glow--blue" aria-hidden="true" />
          <div class="hos-modal-glow hos-modal-glow--purple" aria-hidden="true" />

          <header class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div class="hos-modal-head-icon oph-wizard-icon" aria-hidden="true">
                <Wrench class="w-5 h-5" />
              </div>
              <div class="min-w-0">
                <div class="hos-modal-eyebrow">{{ '模板实体绑定' }}</div>
                <h2 class="hos-modal-title">{{ displayName || '自动化' }}</h2>
                <p class="hos-modal-subtitle">
                  {{ '将 YAML 中的占位实体替换为真实 HA 实体后再启用' }}
                </p>
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
          </header>

          <div class="hos-modal-body oph-wizard-body">
            <!-- 加载态：扫描占位实体中 -->
            <div v-if="loading" class="hos-modal-empty oph-wizard-empty">
              <Loader2 class="w-6 h-6 animate-spin oph-icon-warn" />
              <span>{{ '扫描占位实体…' }}</span>
            </div>

            <!-- 无占位态：所有实体已映射 -->
            <div v-else-if="!rowList.length" class="hos-modal-empty oph-wizard-empty">
              <span class="oph-wizard-empty__icon" aria-hidden="true">✅</span>
              <span>{{ '未发现需替换的占位实体' }}</span>
              <span class="oph-wizard-empty__hint">{{ emptyReadyHint }}</span>
            </div>

            <!-- 占位实体映射列表：每行展示占位 + 实体选择 + 建议 chip -->
            <div v-else class="oph-wizard-list">
              <div v-for="row in rowList" :key="row.placeholder" class="oph-wizard-row">
                <div class="oph-wizard-row__meta">
                  <code class="oph-wizard-row__ph">{{ row.placeholder }}</code>
                  <span class="oph-wizard-row__hint">{{ row.hint }}</span>
                </div>
                <EntityInput
                  :model-value="replacements[row.placeholder]"
                  :domain-filter="row.domain === 'unknown' ? '' : row.domain"
                  :placeholder="row.suggestions[0] || '选择实体'"
                  @update:model-value="setReplacement(row.placeholder, $event)"
                />
                <!-- 建议 chip：点击直接套用建议值，最多展示 3 个 -->
                <div v-if="row.suggestions?.length" class="oph-wizard-suggest">
                  <button
                    v-for="sid in row.suggestions.slice(0, 3)"
                    :key="sid"
                    type="button"
                    class="oph-wizard-suggest__chip"
                    @click="setReplacement(row.placeholder, sid)"
                  >
                    {{ sid }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer class="hos-modal-footer oph-wizard-footer">
            <!-- 警告：仍有未替换占位 -->
            <div v-if="requireAllResolved && unresolvedCount > 0" class="oph-wizard-warning">
              <AlertCircle class="w-4 h-4 oph-icon-warn" />
              <span>{{ `仍有 ${unresolvedCount} 个占位未替换，全部完成后才可启用` }}</span>
            </div>
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--ghost"
              @click="$emit('close')"
            >
              {{ '稍后' }}
            </button>
            <button
              type="button"
              class="hos-modal-btn oph-wizard-btn-primary"
              :disabled="
                saving || loading || !rowList.length || (requireAllResolved && unresolvedCount > 0)
              "
              @click="$emit('apply')"
            >
              {{ saving ? '保存中…' : '应用替换' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * OrchestratorPlaceholderWizard.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：模板实体绑定向导弹窗。当模板 YAML 中含占位实体（如 binary_sensor.door_1）时，
 *      引导用户将占位替换为真实 HA 实体后再启用联动项。支持建议实体 chip 一键套用。
 * 依赖：vue、@lucide/vue（X/Wrench/Loader2/AlertCircle）、EntityInput、useOrchestratorTeleport。
 */
import { computed } from 'vue'
import { X, Wrench, Loader2, AlertCircle } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'

/**
 * 组件 Props
 * @property {boolean}     open             - 弹窗是否打开
 * @property {boolean}     loading          - 是否正在扫描占位实体
 * @property {boolean}     saving           - 是否正在保存替换结果
 * @property {string|object} automationName - 自动化名称（字符串或含 name/title/label 的对象）
 * @property {Array}       rows             - 待映射占位行列表
 * @property {boolean}     requireAllResolved - 是否要求全部占位替换后才可应用
 */
const props = defineProps({
  open: Boolean,
  loading: Boolean,
  saving: Boolean,
  automationName: { type: [String, Object], default: '' },
  rows: { type: Array, default: () => [] },
  requireAllResolved: { type: Boolean, default: false },
  /** 联动类型文案：场景 / 自动化 / 脚本 */
  kindLabel: { type: String, default: '自动化' },
})

defineEmits(['close', 'apply'])

const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()
// 替换映射表：{ placeholder: entity_id }，与父级 v-model 双向绑定
const replacements = defineModel('replacements', { type: Object, default: () => ({}) })

const emptyReadyHint = computed(() => `可以直接启用${props.kindLabel || '自动化'}`)

/**
 * 展示用名称
 * automationName 为字符串时直接返回；为对象时优先取 name/title/label
 * @returns {string}
 */
const displayName = computed(() => {
  if (!props.automationName) return ''
  if (typeof props.automationName === 'string') return props.automationName
  const obj = props.automationName
  if (obj.name) return String(obj.name)
  if (obj.title) return String(obj.title)
  if (obj.label) return String(obj.label)
  return ''
})

/** 占位行列表（防御性处理：确保返回数组） */
const rowList = computed(() => (Array.isArray(props.rows) ? props.rows : []))

/**
 * 未解析占位数量
 * 计算仍为空或等于占位本身的替换项数量。
 * @returns {number}
 */
const unresolvedCount = computed(
  () =>
    rowList.value.filter((row) => {
      const val = String(replacements.value[row.placeholder] || '').trim()
      return !val || val === row.placeholder
    }).length,
)

/**
 * 设置单个占位的替换值
 * 通过整体替换对象触发响应式更新（避免直接修改 nested 属性的响应式边界问题）
 * @param {string} key   - 占位实体 ID
 * @param {string} value - 真实实体 ID
 */
function setReplacement(key, value) {
  replacements.value = { ...replacements.value, [key]: value }
}
</script>

<style scoped src="./styles/OrchestratorPlaceholderWizard.css"></style>