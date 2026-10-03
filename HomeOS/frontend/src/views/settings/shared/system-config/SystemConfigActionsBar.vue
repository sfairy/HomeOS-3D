<!--
组件：SystemConfigActionsBar.vue
所属模块：frontend / src / views / settings / shared / system-config
职责：高级参数操作栏。左侧展示保存状态提示（成功/失败），右侧提供保存/取消按钮与工具插槽。
关键依赖：@lucide/vue 的 Check / Loader2
数据来源：父级透传的 savedTip / savedTipOk 等状态
-->
<template>
  <div class="config-actions">
    <div class="config-actions__status">
      <Transition name="fade">
        <span
          v-if="savedTip"
          :class="[
            'config-actions__tip',
            savedTipOk ? 'config-actions__tip--ok' : 'config-actions__tip--err',
          ]"
        >
          <Check v-if="savedTipOk" class="w-3.5 h-3.5 shrink-0" />
          <AlertCircle v-else class="w-3.5 h-3.5 shrink-0" />
          <span class="min-w-0 truncate">{{ savedTip }}</span>
          <button
            v-if="conflictReload"
            type="button"
            class="config-actions__conflict-reload"
            :disabled="loading"
            @click="emit('reload')"
          >
            {{ '立即刷新' }}
          </button>
        </span>
      </Transition>
    </div>

    <div class="config-actions__tools">
      <div class="config-actions__group">
        <button class="sys-action-btn" :disabled="exporting" type="button" @click="emit('export')">
          <Download class="w-4 h-4" />
          {{ exporting ? '导出中…' : '导出' }}
        </button>
        <button class="sys-action-btn" :disabled="importing" type="button" @click="pickFile">
          <Upload class="w-4 h-4" />
          {{ importing ? '导入中…' : '导入' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onFileChange"
        />
        <button class="sys-action-btn" :disabled="loading" type="button" @click="emit('reload')">
          <RefreshCw :class="['w-4 h-4', loading && 'animate-spin']" />
          {{ '刷新' }}
        </button>
      </div>

      <template v-if="pendingChanges > 0">
        <span class="config-actions__divider config-actions__pending-block" aria-hidden="true" />
        <span class="config-actions__pending config-actions__pending-block" :title="pendingHint">{{
          '{n} 项已修改'.replace('{n}', String(pendingChanges))
        }}</span>
        <button
          type="button"
          class="settings-btn-ghost config-actions__pending-block"
          :disabled="saving || loading"
          @click="emit('cancel')"
        >
          {{ '取消修改' }}
        </button>
        <button
          class="save-btn config-actions__save config-actions__pending-block !w-auto !px-4 !py-2"
          type="button"
          :disabled="saving || loading"
          @click="emit('save')"
        >
          <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
          <Save v-else class="w-4 h-4" />
          {{ saving ? '保存中…' : '保存更改' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { RefreshCw, Loader2, Save, Check, AlertCircle, Download, Upload } from '@lucide/vue'

defineProps({
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  exporting: { type: Boolean, default: false },
  importing: { type: Boolean, default: false },
  pendingChanges: { type: Number, default: 0 },
  pendingHint: { type: String, default: '仅提交已修改的分区，未改动的分区不会被覆盖' },
  savedTip: { type: String, default: '' },
  savedTipOk: { type: Boolean, default: true },
  conflictReload: { type: Boolean, default: false },
})

const emit = defineEmits(['export', 'reload', 'save', 'import-file', 'cancel'])

const fileInput = ref(null)

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(ev) {
  const file = ev.target?.files?.[0]
  ev.target.value = ''
  if (file) emit('import-file', file)
}
</script>

<style scoped src="./styles/SystemConfigActionsBar.css"></style>
