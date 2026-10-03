<!--
  GeekVarMathPanel.vue
  职责：动作节点表单中 var_math（数值运算）动作的配置面板。
       语义：结果变量 = 左操作数 ⊕ 右操作数，运算符支持 + - * /。
  所属模块：geek-automation。
  关键依赖：HosSelect（作用域与运算符选择）。
  v-model：action —— 双向绑定的当前 var_math 动作对象（含 varKey/varScope/mathLhsKind/mathLhs/mathLhsVar/mathOp/mathRhsKind/mathRhs/mathRhsVar）。
  Props：无（仅 v-model 与 emit）。
  Emits：change —— 任意字段变更时通知父级。
  Slots：target（自定义写入变量行）/ lhs-var（左操作数为变量时的输入控件）/ rhs-var（右操作数为变量时的输入控件）。
  关键交互：
    - 左/右操作数均可在「数值（字面量）」与「变量」间切换，切换时清空另一侧字段并补默认值。
    - 实时展示预览式（如 count = 0 + 1）。
-->
<template>
  <div class="geek-var-math">
    <slot name="target">
      <div class="geek-var-math__target">
        <label class="geek-var-math__field geek-var-math__field--grow">
          <span>{{ '写入变量' }}</span>
          <input
            :value="model.varKey || ''"
            class="geek-var-math__input"
            :placeholder="'结果 key，如 count'"
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
    </slot>

    <div class="geek-var-math__expr">
      <div class="geek-var-math__operand">
        <div class="geek-var-math__head">
          <span>{{ '左操作数' }}</span>
          <div class="geek-var-math__chips">
            <button
              type="button"
              :class="['geek-var-math__chip', lhsKind === 'literal' && 'is-on']"
              @click="setKind('lhs', 'literal')"
            >
              {{ '数值' }}
            </button>
            <button
              type="button"
              :class="['geek-var-math__chip', lhsKind === 'var' && 'is-on']"
              @click="setKind('lhs', 'var')"
            >
              {{ '变量' }}
            </button>
          </div>
        </div>
        <input
          v-if="lhsKind === 'literal'"
          :value="model.mathLhs ?? '0'"
          class="geek-var-math__input"
          type="text"
          inputmode="decimal"
          :placeholder="'如 0'"
          @input="patch({ mathLhs: inputValue($event) })"
        />
        <slot v-else name="lhs-var">
          <input
            :value="model.mathLhsVar || ''"
            class="geek-var-math__input"
            :placeholder="'变量 key'"
            @input="patch({ mathLhsVar: inputValue($event) })"
          />
        </slot>
      </div>

      <label class="geek-var-math__op">
        <span>{{ '运算符' }}</span>
        <HosSelect
          :model-value="model.mathOp || '+'"
          variant="orchestrator"
          size="sm"
          block
          :searchable="false"
          @update:model-value="patch({ mathOp: String($event || '+') })"
        >
          <option value="+">{{ '+ 加' }}</option>
          <option value="-">{{ '− 减' }}</option>
          <option value="*">{{ '× 乘' }}</option>
          <option value="/">{{ '÷ 除' }}</option>
        </HosSelect>
      </label>

      <div class="geek-var-math__operand">
        <div class="geek-var-math__head">
          <span>{{ '右操作数' }}</span>
          <div class="geek-var-math__chips">
            <button
              type="button"
              :class="['geek-var-math__chip', rhsKind === 'literal' && 'is-on']"
              @click="setKind('rhs', 'literal')"
            >
              {{ '数值' }}
            </button>
            <button
              type="button"
              :class="['geek-var-math__chip', rhsKind === 'var' && 'is-on']"
              @click="setKind('rhs', 'var')"
            >
              {{ '变量' }}
            </button>
          </div>
        </div>
        <input
          v-if="rhsKind === 'literal'"
          :value="model.mathRhs ?? '0'"
          class="geek-var-math__input"
          type="text"
          inputmode="decimal"
          :placeholder="'如 1'"
          @input="patch({ mathRhs: inputValue($event) })"
        />
        <slot v-else name="rhs-var">
          <input
            :value="model.mathRhsVar || ''"
            class="geek-var-math__input"
            :placeholder="'变量 key'"
            @input="patch({ mathRhsVar: inputValue($event) })"
          />
        </slot>
      </div>

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

function resolveKind(side) {
  const kindKey = side === 'lhs' ? 'mathLhsKind' : 'mathRhsKind'
  const varKey = side === 'lhs' ? 'mathLhsVar' : 'mathRhsVar'
  const kind = String(model.value?.[kindKey] || '')
  if (kind === 'var' || kind === 'literal') return kind
  return String(model.value?.[varKey] || '').trim() ? 'var' : 'literal'
}

const lhsKind = computed(() => resolveKind('lhs'))
const rhsKind = computed(() => resolveKind('rhs'))

const preview = computed(() => {
  const a = model.value || {}
  const key = String(a.varKey || '').trim() || '结果'
  const opMap = { '+': '+', '-': '−', '*': '×', '/': '÷' }
  const op = opMap[a.mathOp] || a.mathOp || '+'
  const lhs =
    lhsKind.value === 'var'
      ? String(a.mathLhsVar || '').trim() || '左变量'
      : String(a.mathLhs ?? '0')
  const rhs =
    rhsKind.value === 'var'
      ? String(a.mathRhsVar || '').trim() || '右变量'
      : String(a.mathRhs ?? '0')
  return `${key} = ${lhs} ${op} ${rhs}`
})

function patch(partial) {
  Object.assign(model.value, partial)
  emit('change')
}

function setKind(side, kind) {
  const next = kind === 'var' ? 'var' : 'literal'
  if (side === 'lhs') {
    const partial = { mathLhsKind: next }
    if (next === 'literal') {
      partial.mathLhsVar = ''
      if (model.value.mathLhs == null || model.value.mathLhs === '') partial.mathLhs = '0'
    } else {
      partial.mathLhs = ''
    }
    patch(partial)
  } else {
    const partial = { mathRhsKind: next }
    if (next === 'literal') {
      partial.mathRhsVar = ''
      if (model.value.mathRhs == null || model.value.mathRhs === '') partial.mathRhs = '0'
    } else {
      partial.mathRhs = ''
    }
    patch(partial)
  }
}
</script>

<style>
@import './styles/geek-var-panel.css';
</style>
