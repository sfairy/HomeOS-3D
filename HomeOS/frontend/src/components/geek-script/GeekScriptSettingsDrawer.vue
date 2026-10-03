<!--
  GeekScriptSettingsDrawer.vue
  职责：geek-script 脚本编辑器的「设置抽屉」组件（从 GeekScriptBuilder 抽离）。
       基于 GeekSettingsDrawer，渲染 HA 执行横幅、运行模式选择、HA 执行开关、
       新建/重置/删除按钮，以及 script 输入变量字段的行内编辑表格。
  所属模块：geek-script。
  关键依赖：
    - GeekSettingsDrawer（来自 geek-automation 的共用设置壳）。
    - OrchestratorExecutionEngineBadge：HA 执行需求横幅。
    - HosSelect：运行模式与变量 selector 下拉。
  Props：
    - open：抽屉开关。
    - mode：运行模式（single / restart / queued / parallel）。
    - runOnHa：是否由 HA 执行（script.turn_on）。
    - haExecutionNeeds / haExecutionReasons：HA 执行需求与原因。
    - saving / execRunning：保存与执行进行中态（用于禁用按钮）。
    - editingId：当前编辑脚本 id（存在时展示「删除本条」按钮）。
    - fields：输入变量数组（父级 ref 解包后共享引用，行内编辑直接变更行对象）。
  Emits：
    - close：关闭抽屉。
    - enable-ha：点击 HA 横幅的启用按钮。
    - update:mode / update:runOnHa：运行模式与 HA 执行开关变更。
    - start-new / reset-canvas / delete-current：新建/重置/删除动作。
    - add-field / remove-field：输入变量字段的增删。
-->
<template>
  <!-- GeekScriptSettingsDrawer 脚本设置抽屉：运行模式、HA 执行、输入变量定义 -->
  <GeekSettingsDrawer
    :open="open"
    aria-label="脚本设置"
    title="设置"
    subtitle="运行模式、HA 执行与输入变量"
    @close="$emit('close')"
  >
    <OrchestratorExecutionEngineBadge
      :needs-ha="haExecutionNeeds"
      :run-on-ha="runOnHa"
      :reasons="haExecutionReasons"
      @enable-ha="$emit('enable-ha')"
    />
    <label class="geek-field">
      <span>{{ '运行模式' }}</span>
      <HosSelect
        :model-value="mode"
        variant="orchestrator"
        size="sm"
        block
        @update:model-value="$emit('update:mode', $event)"
      >
        <option value="single">{{ '单次' }}</option>
        <option value="restart">{{ '可重启' }}</option>
        <option value="queued">{{ '排队' }}</option>
        <option value="parallel">{{ '并行' }}</option>
      </HosSelect>
    </label>
    <label class="geek-builder__ha">
      <input
        :checked="runOnHa"
        type="checkbox"
        @change="$emit('update:runOnHa', $event.target.checked)"
      />
      <span>{{ '由 HA 执行（script.turn_on）' }}</span>
    </label>
    <button type="button" class="list-page__link-btn" :disabled="saving" @click="$emit('start-new')">
      {{ '新建空白脚本' }}
    </button>
    <button type="button" class="list-page__link-btn" :disabled="saving" @click="$emit('reset-canvas')">
      {{ '重置画布' }}
    </button>
    <button
      v-if="editingId"
      type="button"
      class="list-page__link-btn is-danger"
      :disabled="saving || execRunning"
      @click="$emit('delete-current')"
    >
      {{ '删除本条' }}
    </button>
    <div class="geek-script-fields">
      <div class="geek-script-fields__head">
        <strong>{{ '输入变量' }}</strong>
        <button type="button" class="list-page__link-btn" @click="$emit('add-field')">{{ '+ 添加' }}</button>
      </div>
      <div v-if="fields.length" class="geek-script-fields__table">
        <div v-for="(f, fi) in fields" :key="fi" class="geek-script-fields__row">
          <input v-model="f.name" class="geek-script-fields__input" :placeholder="'变量名'" />
          <HosSelect
            v-model="f.selector"
            variant="orchestrator"
            size="xs"
            fit
            @change="f.selectorOptions = null"
          >
            <option value="text">{{ '文本' }}</option>
            <option value="number">{{ '数字' }}</option>
            <option value="entity">{{ '实体' }}</option>
            <option value="boolean">{{ '布尔' }}</option>
          </HosSelect>
          <span
            v-if="f.selectorOptions && Object.keys(f.selectorOptions).length"
            class="geek-hint"
            :title="JSON.stringify(f.selectorOptions)"
          >
            {{ '含高级选项' }}
          </span>
          <input
            v-model="f.default"
            class="geek-script-fields__input"
            :placeholder="'默认值'"
          />
          <input
            v-model="f.description"
            class="geek-script-fields__input geek-script-fields__input--wide"
            :placeholder="'说明（执行时提示）'"
          />
          <button type="button" class="list-page__link-btn" @click="$emit('remove-field', fi)">
            ✕
          </button>
        </div>
      </div>
      <p v-else class="geek-hint">{{ '可选：定义 script 输入字段' }}</p>
    </div>
  </GeekSettingsDrawer>
</template>

<script setup>
/**
 * GeekScriptSettingsDrawer - 脚本设置抽屉（从 GeekScriptBuilder 抽离）
 * fields 为父级 ref 解包后的数组，行内编辑直接变更行对象（与父级共享引用）
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekSettingsDrawer from '@/components/geek-automation/GeekSettingsDrawer.vue'
import OrchestratorExecutionEngineBadge from '@/components/dashboard/OrchestratorExecutionEngineBadge.vue'

defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'single' },
  runOnHa: { type: Boolean, default: false },
  haExecutionNeeds: { type: Boolean, default: false },
  haExecutionReasons: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  execRunning: { type: Boolean, default: false },
  editingId: { type: String, default: null },
  fields: { type: Array, default: () => [] },
})

defineEmits([
  'close',
  'enable-ha',
  'update:mode',
  'update:runOnHa',
  'start-new',
  'reset-canvas',
  'delete-current',
  'add-field',
  'remove-field',
])
</script>
