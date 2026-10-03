<template>
  <!-- ScriptExecuteModal 脚本执行模态框：手动执行脚本并查看执行结果 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal">
      <div
        v-if="open"
        ref="rootRef"
        class="hos-modal-root linkage-script-exec-modal-root"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown.esc="emit('close')"
      >
        <div class="hos-modal-backdrop" @click="emit('close')" />
        <div class="hos-modal-panel hos-modal-panel--md hos-modal-panel--emerald">
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div>
                <h2 class="hos-modal-title">{{ `执行脚本：${targetName}` }}</h2>
                <p class="hos-modal-subtitle">{{
                  fields.length ? '填写变量后执行' : '确认执行此脚本'
                }}</p>
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
          <div class="hos-modal-body">
            <div v-for="field in fields" :key="field.name" class="linkage-script-exec-modal__field">
              <label :for="`script-var-${field.name}`">{{ field.name }}</label>
              <HosSelect
                v-if="field.selector === 'boolean'"
                :id="`script-var-${field.name}`"
                :model-value="String(vars[field.name] ?? 'false')"
                variant="settings"
                block
                :searchable="false"
                @update:model-value="updateVar(field.name, $event)"
              >
                <option value="true">{{ '是' }}</option>
                <option value="false">{{ '否' }}</option>
              </HosSelect>
              <input
                v-else
                :id="`script-var-${field.name}`"
                :type="field.selector === 'number' ? 'number' : 'text'"
                :value="vars[field.name] ?? ''"
                @input="updateVar(field.name, $event.target.value)"
              />
            </div>
          </div>
          <div class="hos-modal-footer">
            <button type="button" class="hos-modal-btn hos-modal-btn--ghost" @click="emit('close')">
              {{ '取消' }}
            </button>
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--primary"
              :disabled="running"
              @click="emit('confirm')"
            >
              <Loader2 v-if="running" class="w-4 h-4 animate-spin" />
              {{ '执行' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * ScriptExecuteModal - 脚本执行模态框组件
 * 功能特性：
 * - 手动触发脚本执行
 * - 显示执行状态和结果
 * - 可能支持参数配置
 * - 模态对话框形式
 */
import { nextTick, ref, watch } from 'vue'
import { Loader2, X } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'

const props = defineProps({
  open: { type: Boolean, default: false },
  targetName: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  vars: { type: Object, default: () => ({}) },
  running: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'confirm', 'update:vars'])

const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()
const rootRef = ref(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    nextTick(() => rootRef.value?.focus?.())
  },
)

function updateVar(name, value) {
  emit('update:vars', { ...props.vars, [name]: value })
}
</script>

<style scoped src="./styles/linkage.css"></style>
