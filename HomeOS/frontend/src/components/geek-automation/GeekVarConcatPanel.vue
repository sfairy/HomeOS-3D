<!--
  GeekVarConcatPanel.vue
  职责：动作节点表单中 var_concat（文本拼接）动作的配置面板。
       语义：结果变量 = 原值 + 追加来源（文本字面量或另一变量）。
  所属模块：geek-automation。
  关键依赖：HosSelect（作用域选择）。
  v-model：action —— 双向绑定的当前 var_concat 动作对象（含 varKey/varScope/concatSourceKind/concatParts/concatSourceVar）。
  Emits：change —— 任意字段变更时通知父级。
  关键交互：
    - 通过 chip 在「文本」与「变量」两种来源间切换，切换时清空另一侧字段。
    - 实时展示预览式（如 count = count + "abc"）。
-->
<template>
  <div class="geek-var-math">
    <div class="geek-var-math__target">
      <label class="geek-var-math__field geek-var-math__field--grow">
        <span>{{ '写入变量' }}</span>
        <input
          :value="model.varKey || ''"
          class="geek-var-math__input"
          :placeholder="'结果 key'"
          @input="patch({ varKey: inputValue($event) })"
        />
      </label>
      <label class="geek-var-math__field geek-var-math__field--scope">
        <span>{{ '作用域' }}</span>
        <HosSelect
          :model-value="model.varScope || 'global'"
          variant="orchestrator"
          size="sm"
          block
          :searchable="false"
          @update:model-value="patch({ varScope: String($event || 'global') })"
        >
          <option value="global">{{ '全局' }}</option>
          <option value="rule">{{ '本规则' }}</option>
        </HosSelect>
      </label>
    </div>

    <div class="geek-var-math__expr">
      <div class="geek-var-math__head">
        <span>{{ '追加来源' }}</span>
        <div class="geek-var-math__chips">
          <button
            type="button"
            :class="['geek-var-math__chip', sourceKind === 'literal' && 'is-on']"
            @click="setSource('literal')"
          >
            {{ '文本' }}
          </button>
          <button
            type="button"
            :class="['geek-var-math__chip', sourceKind === 'var' && 'is-on']"
            @click="setSource('var')"
          >
            {{ '变量' }}
          </button>
        </div>
      </div>
      <input
        v-if="sourceKind === 'literal'"
        :value="model.concatParts || ''"
        class="geek-var-math__input"
        :placeholder="'要拼接的文字'"
        @input="patch({ concatParts: inputValue($event) })"
      />
      <input
        v-else
        :value="model.concatSourceVar || ''"
        class="geek-var-math__input"
        :placeholder="'源变量 key'"
        @input="patch({ concatSourceVar: inputValue($event) })"
      />
      <p class="geek-var-math__preview">{{ preview }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'

const model = defineModel({ type: Object, required: true })
const emit = defineEmits(['change'])

function inputValue(ev) {
  return String(ev?.target?.value ?? '')
}

const sourceKind = computed(() => {
  const kind = String(model.value?.concatSourceKind || '')
  if (kind === 'var' || kind === 'literal') return kind
  return String(model.value?.concatSourceVar || '').trim() ? 'var' : 'literal'
})

const preview = computed(() => {
  const key = String(model.value?.varKey || '').trim() || '结果'
  const add =
    sourceKind.value === 'var'
      ? `{${String(model.value?.concatSourceVar || '').trim() || '源变量'}}`
      : `"${String(model.value?.concatParts || '')}"`
  return `${key} = ${key} + ${add}`
})

function patch(partial) {
  Object.assign(model.value, partial)
  emit('change')
}

function setSource(kind) {
  const next = kind === 'var' ? 'var' : 'literal'
  if (next === 'literal') {
    patch({ concatSourceKind: 'literal', concatSourceVar: '' })
  } else {
    patch({ concatSourceKind: 'var', concatParts: '' })
  }
}
</script>

<style>
@import './styles/geek-var-panel.css';
</style>
