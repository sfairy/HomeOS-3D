<!--
  GeekFlowActionInspector.vue
  职责：流程型动作（stop / repeat / parallel / sequence / choose）的属性编辑器。
       在 GeekActionNodeForm 中根据 action.type 切换到此组件，统一管理流程控制字段。
  所属模块：geek-automation。
  关键依赖：
    - GeekDeviceCatalog / GeekVarKeyField / HosSelect：条件字段配置。
    - OrchestratorNestedActionRow：并行/顺序子动作行编辑。
    - condition-presets.util：条件预设匹配与应用。
    - choose-branch-condition.util：choose 分支条件增删与同步。
    - action-yaml-builder.util：并行子动作同步到 branches。
  v-model：action —— 双向绑定的当前动作对象。
  Props：
    - canvasFoldBranches：是否启用画布折叠模式（分支靠画布连线表达而非内联列表）。
    - showContinueOnError：是否显示「失败后继续」开关。
  Emits：change —— 任意字段变更时通知父级。
  关键交互：
    - stop：含「作为错误停止」开关，对应 data 字段写入 'error'。
    - repeat：支持 count/while/until/for_each 四种模式，并渲染预览。
    - parallel/sequence：分支模式下提示画布连线，非分支模式下提供内联子动作列表。
    - choose：分支 + 条件两层结构，支持多分支、多条件，分支可增删。
    - 切换 action.type=choose 时重置分支与条件索引；离开组件前 flush 同步活跃条件。
-->
<template>
  <div class="geek-flow-action-inspector">
    <div v-if="showContinueOnError" class="geek-switch-row">
      <div class="geek-switch-row__label">
        <strong>{{ '失败后继续' }}</strong>
        <span>{{ '出错时是否跳过并执行后续动作' }}</span>
      </div>
      <div class="geek-seg" role="group" aria-label="失败后继续">
        <button
          type="button"
          :class="['geek-seg__btn', !action.continueOnError && 'is-on']"
          @click="onContinueOnError('0')"
        >
          {{ '中止' }}
        </button>
        <button
          type="button"
          :class="['geek-seg__btn', 'is-warn', action.continueOnError && 'is-on']"
          @click="onContinueOnError('1')"
        >
          {{ '继续' }}
        </button>
      </div>
    </div>

    <template v-if="action.type === 'stop'">
      <div class="geek-flow-card">
        <p class="geek-flow-card__title">{{ '停止流程' }}</p>
        <p class="geek-flow-card__desc">{{ '执行到此节点后终止后续动作。' }}</p>
        <label class="geek-field">
          <span>{{ '停止消息' }}</span>
          <input v-model="action.notifyMsg" class="geek-flow-input" @input="notifyChange" />
        </label>
        <div class="geek-field">
          <span>{{ '作为错误停止' }}</span>
          <div class="geek-seg" role="group" aria-label="作为错误停止">
            <button
              type="button"
              :class="['geek-seg__btn', !String(action.data || '').includes('error') && 'is-on']"
              @click="onStopErrorChange('0')"
            >
              {{ '否' }}
            </button>
            <button
              type="button"
              :class="['geek-seg__btn', 'is-warn', String(action.data || '').includes('error') && 'is-on']"
              @click="onStopErrorChange('1')"
            >
              {{ '是' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <template v-if="action.type === 'repeat'">
      <div class="geek-flow-card">
        <p class="geek-flow-card__title">{{ '重复执行' }}</p>
        <p class="geek-flow-card__desc">
          {{ '从本节点「循环体」口连出的动作会在保存时折叠进重复序列。' }}
        </p>
        <div class="geek-field">
          <span>{{ '方式' }}</span>
          <div class="geek-seg geek-seg--wrap" role="group" aria-label="重复方式">
            <button
              type="button"
              :class="['geek-seg__btn', (action.repeatType === 'count' || !action.repeatType) && 'is-on']"
              @click="action.repeatType = 'count'; notifyChange()"
            >
              {{ '固定次数' }}
            </button>
            <button
              type="button"
              :class="['geek-seg__btn', action.repeatType === 'while' && 'is-on']"
              @click="action.repeatType = 'while'; notifyChange()"
            >
              {{ '当…时' }}
            </button>
            <button
              type="button"
              :class="['geek-seg__btn', action.repeatType === 'until' && 'is-on']"
              @click="action.repeatType = 'until'; notifyChange()"
            >
              {{ '直到…' }}
            </button>
            <button
              type="button"
              :class="['geek-seg__btn', action.repeatType === 'for_each' && 'is-on']"
              @click="action.repeatType = 'for_each'; notifyChange()"
            >
              {{ '遍历' }}
            </button>
          </div>
        </div>
        <label
          v-if="action.repeatType === 'count' || !action.repeatType"
          class="geek-field"
        >
          <span>{{ '次数' }}</span>
          <input
            v-model.number="action.repeatCount"
            class="geek-flow-input"
            type="number"
            min="1"
            @input="notifyChange"
          />
        </label>
        <label v-else-if="action.repeatType === 'for_each'" class="geek-field geek-field--stack">
          <span>{{ '遍历列表（YAML / 模板）' }}</span>
          <textarea
            v-model="action.repeatForEach"
            class="geek-textarea"
            rows="3"
            placeholder="- light.a&#10;- light.b"
            @change="notifyChange"
          />
        </label>
        <template v-if="action.repeatType === 'while' || action.repeatType === 'until'">
          <div class="geek-field geek-field--stack">
            <span>{{ '条件设备' }}</span>
            <GeekDeviceCatalog
              v-model="action.repeatEntityId"
              mode="condition"
              @update:model-value="notifyChange"
            />
          </div>
          <label class="geek-field">
            <span>{{ '状态' }}</span>
            <HosSelect
              v-model="action.repeatCondState"
              variant="orchestrator"
              size="sm"
              block
              @change="notifyChange"
            >
              <option value="on">on</option>
              <option value="off">off</option>
              <option value="home">home</option>
              <option value="not_home">not_home</option>
            </HosSelect>
          </label>
        </template>
        <p class="geek-flow-preview">{{ repeatPreview }}</p>
      </div>
    </template>

    <template v-if="action.type === 'parallel' || action.type === 'sequence'">
      <div class="geek-flow-card">
        <p class="geek-flow-card__title">{{ action.type === 'sequence' ? '顺序步骤' : '并行动作' }}</p>
        <p class="geek-flow-card__desc">
          {{
            canvasFoldBranches
              ? action.type === 'sequence'
                ? '从本节点「步骤」口拖出连线表示顺序子步骤；「完成后」接下一段。'
                : '从本节点拖出多条连线，保存时自动折叠为 parallel。'
              : action.type === 'sequence'
                ? '可在下方添加顺序子动作。'
                : '可在下方添加并行子动作。'
          }}
        </p>
        <template v-if="!canvasFoldBranches">
          <button type="button" class="wr-btn-add wr-btn-add--xs" @click="addParallelChild">
            {{ action.type === 'sequence' ? '+ 步骤' : '+ 子动作' }}
          </button>
          <div v-if="(action.parallelActions || []).length" class="geek-parallel-list">
            <OrchestratorNestedActionRow
              v-for="(pa, pi) in action.parallelActions"
              :key="pi"
              v-model="action.parallelActions[pi]"
              @remove="removeParallelChild(pi)"
            />
          </div>
        </template>
      </div>
    </template>

    <template v-if="action.type === 'choose'">
      <details class="geek-flow-help">
        <summary>{{ '画布连线说明' }}</summary>
        <p>
          {{
            '「满足 / 满足2…」口连各分支动作，「否则」连默认分支，「完成后」接下一段；保存时折叠进 choose YAML。'
          }}
        </p>
      </details>

      <div class="geek-flow-card">
        <div class="geek-flow-card__head">
          <p class="geek-flow-card__title">{{ '分支' }}</p>
          <div class="geek-flow-pills">
            <button
              v-for="(br, bi) in chooseNonDefaultBranches"
              :key="'br-' + bi"
              type="button"
              :class="['geek-flow-pill', chooseBranchIndex === bi && 'is-on']"
              @click="chooseBranchIndex = bi"
            >
              {{ bi === 0 ? '满足' : `满足${bi + 1}` }}
            </button>
            <button type="button" class="geek-flow-pill geek-flow-pill--ghost" @click="addChooseBranch">
              {{ '+ 分支' }}
            </button>
            <button
              v-if="chooseNonDefaultBranches.length > 1"
              type="button"
              class="geek-flow-pill geek-flow-pill--danger"
              @click="removeChooseBranch"
            >
              {{ '删除' }}
            </button>
          </div>
        </div>

        <div class="geek-flow-section">
          <div class="geek-flow-section__label">{{ '条件逻辑' }}</div>
          <div class="geek-seg" role="group" aria-label="条件逻辑">
            <button
              type="button"
              :class="['geek-seg__btn', chooseActiveBranch?.condLogic !== 'or' && 'is-on']"
              @click="onChooseCondLogic('and')"
            >
              {{ '全部满足' }}
            </button>
            <button
              type="button"
              :class="['geek-seg__btn', chooseActiveBranch?.condLogic === 'or' && 'is-on']"
              @click="onChooseCondLogic('or')"
            >
              {{ '满足任一' }}
            </button>
          </div>
        </div>

        <div class="geek-flow-section">
          <div class="geek-flow-section__label">{{ '条件列表' }}</div>
          <div class="geek-flow-pills">
            <button
              v-for="(_c, ci) in chooseBranchConditions"
              :key="'cc-' + ci"
              type="button"
              :class="['geek-flow-pill', chooseCondIndex === ci && 'is-on']"
              @click="onSelectChooseCond(ci)"
            >
              {{ '条件' + (ci + 1) }}
            </button>
            <button type="button" class="geek-flow-pill geek-flow-pill--ghost" @click="onAddChooseCond">
              {{ '+ 条件' }}
            </button>
            <button
              v-if="chooseBranchConditions.length > 1"
              type="button"
              class="geek-flow-pill geek-flow-pill--danger"
              @click="onRemoveChooseCond"
            >
              {{ '删除条件' }}
            </button>
          </div>
        </div>
      </div>

      <div class="geek-flow-card geek-flow-card--accent">
        <p class="geek-flow-card__title">{{ `编辑条件 ${chooseCondIndex + 1}` }}</p>
        <p class="geek-flow-preview">{{ chooseCondPreview }}</p>

        <label class="geek-field">
          <span>{{ '如果…（预设）' }}</span>
          <HosSelect
            v-model="chooseConditionPreset"
            variant="orchestrator"
            size="sm"
            block
            @change="onChooseConditionPresetPicked"
          >
            <option value="">{{ '自定义 / 选择场景…' }}</option>
            <optgroup v-for="g in conditionPresetGroups" :key="g" :label="g">
              <option
                v-for="p in GEEK_CONDITION_PRESETS.filter((x) => x.group === g)"
                :key="p.id"
                :value="p.id"
              >
                {{ p.label }}
              </option>
            </optgroup>
          </HosSelect>
        </label>

        <label v-if="chooseBranchNeedsEntity" class="geek-field geek-field--stack">
          <span>{{ '设备' }}</span>
          <GeekDeviceCatalog
            :model-value="chooseActiveBranch?.condEntityId || ''"
            mode="condition"
            :attribute="chooseActiveBranch?.condAttribute || ''"
            @update:model-value="onChooseCondEntity"
            @pick-attribute="onChooseCondAttribute"
          />
        </label>

        <label v-if="chooseActiveBranch?.condAttribute" class="geek-field">
          <span>{{ '属性' }}</span>
          <input
            class="geek-flow-input"
            :value="chooseActiveBranch?.condAttribute || ''"
            @change="onChooseCondAttributeField"
          />
        </label>

        <template v-if="String(chooseActiveBranch?.condOp || '').startsWith('var_')">
          <GeekVarKeyField
            :model-value="chooseActiveBranch?.condVarKey || ''"
            :scope="chooseActiveBranch?.condVarScope || 'global'"
            :label="'变量'"
            :declared="[]"
            :can-use-rule="false"
            @update:model-value="onChooseCondVarKey"
            @update:scope="onChooseCondVarScope"
            @change="notifyChange"
          />
        </template>

        <label class="geek-field geek-field--check">
          <input
            type="checkbox"
            :checked="Boolean(chooseActiveBranch?.condNegated)"
            @change="onChooseCondNegated"
          />
          <span>{{ '外层逻辑取反（condition: not）' }}</span>
        </label>
        <p
          v-if="chooseActiveBranch?.condOp === 'neq'"
          class="geek-hint"
        >{{ '「不等于」本身已是状态取反；一般无需再勾外层取反。' }}</p>

        <label class="geek-field">
          <span>{{ '判断' }}</span>
          <HosSelect
            :model-value="chooseActiveBranch?.condOp || 'eq'"
            variant="orchestrator"
            size="sm"
            block
            @change="onChooseCondOp"
          >
            <option value="eq">{{ '等于' }}</option>
            <option value="neq">{{ '不等于' }}</option>
            <option value="gt">{{ '大于' }}</option>
            <option value="lt">{{ '小于' }}</option>
            <option value="gte">{{ '大于等于' }}</option>
            <option value="lte">{{ '小于等于' }}</option>
            <option value="between">{{ '介于' }}</option>
            <option value="state_for">{{ '持续状态' }}</option>
            <option value="contains">{{ '包含' }}</option>
            <option value="time_after">{{ '晚于某时刻' }}</option>
            <option value="time_before">{{ '早于某时刻' }}</option>
            <option value="sun_after">{{ '太阳之后' }}</option>
            <option value="sun_before">{{ '太阳之前' }}</option>
            <option value="weekday">{{ '生效星期' }}</option>
            <option value="var_eq">{{ '变量等于' }}</option>
            <option value="var_neq">{{ '变量不等于' }}</option>
            <option value="var_lt">{{ '变量小于' }}</option>
            <option value="var_lte">{{ '变量小于等于' }}</option>
            <option value="var_gt">{{ '变量大于' }}</option>
            <option value="var_gte">{{ '变量大于等于' }}</option>
          </HosSelect>
        </label>

        <label
          v-show="
            !['time_after', 'time_before', 'sun_after', 'sun_before', 'weekday'].includes(
              String(chooseActiveBranch?.condOp || ''),
            ) && !String(chooseActiveBranch?.condOp || '').startsWith('var_')
          "
          class="geek-field"
        >
          <span>{{ '值' }}</span>
          <input
            class="geek-flow-input"
            :value="chooseActiveBranch?.condState ?? 'on'"
            @input="onChooseCondState"
          />
        </label>

        <label
          v-if="
            chooseActiveBranch?.condOp === 'time_after' ||
            chooseActiveBranch?.condOp === 'time_before'
          "
          class="geek-field"
        >
          <span>{{ '时刻' }}</span>
          <input
            class="geek-flow-input"
            :value="chooseActiveBranch?.condState || ''"
            type="time"
            step="1"
            @change="onChooseCondState"
          />
        </label>

        <label
          v-if="
            chooseActiveBranch?.condOp === 'sun_after' ||
            chooseActiveBranch?.condOp === 'sun_before'
          "
          class="geek-field"
        >
          <span>{{ '太阳事件' }}</span>
          <HosSelect
            :model-value="chooseActiveBranch?.condState || 'sunset'"
            variant="orchestrator"
            size="sm"
            block
            @change="onChooseCondState"
          >
            <option value="sunrise">{{ '日出' }}</option>
            <option value="sunset">{{ '日落' }}</option>
          </HosSelect>
        </label>

        <label
          v-if="
            chooseActiveBranch?.condOp === 'sun_after' ||
            chooseActiveBranch?.condOp === 'sun_before'
          "
          class="geek-field"
        >
          <span>{{ '偏移分钟' }}</span>
          <input
            class="geek-flow-input"
            :value="chooseActiveBranch?.condSunOffset ?? 0"
            type="number"
            step="1"
            :placeholder="'如 -30=提前半小时'"
            @change="onChooseCondSunOffset"
          />
        </label>

        <label v-if="chooseActiveBranch?.condOp === 'between'" class="geek-field">
          <span>{{ '上界' }}</span>
          <input
            class="geek-flow-input"
            :value="chooseActiveBranch?.condStateTo ?? ''"
            @change="onChooseCondStateTo"
          />
        </label>

        <label
          v-if="
            chooseActiveBranch?.condOp === 'state_for' ||
            chooseActiveBranch?.condOp === 'gt' ||
            chooseActiveBranch?.condOp === 'lt' ||
            chooseActiveBranch?.condOp === 'between' ||
            chooseActiveBranch?.condForSeconds
          "
          class="geek-field"
        >
          <span>{{ '持续秒' }}</span>
          <input
            class="geek-flow-input"
            :value="chooseActiveBranch?.condForSeconds ?? ''"
            type="number"
            min="0"
            @change="onChooseCondFor"
          />
        </label>

        <div
          v-if="
            chooseActiveBranch?.condOp === 'weekday' ||
            chooseActiveBranch?.condOp === 'time_after' ||
            chooseActiveBranch?.condOp === 'time_before'
          "
          class="geek-field geek-field--stack"
        >
          <span>{{ '生效星期' }}</span>
          <div class="geek-day-chips">
            <button
              v-for="d in weekDays"
              :key="'cb-' + d.value"
              type="button"
              :class="['geek-day-chip', isChooseDaySelected(d.value) && 'is-on']"
              @click="toggleChooseDay(d.value)"
            >
              {{ d.label }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import '@/components/geek-automation/styles/geek-builder-shared.css'
import HosSelect from '@/components/common/base/HosSelect.vue'
import OrchestratorNestedActionRow from '@/components/dashboard/OrchestratorNestedActionRow.vue'
import GeekDeviceCatalog from './GeekDeviceCatalog.vue'
import GeekVarKeyField from './GeekVarKeyField.vue'
import {
  GEEK_CONDITION_PRESETS,
  applyConditionPreset,
  matchConditionPreset,
} from '@/utils/geek-automation/condition-presets.util'
import {
  ensureChooseBranchConditions,
  getChooseBranchConditions,
  selectChooseBranchCondition,
  addChooseBranchCondition,
  removeChooseBranchCondition,
  syncChooseBranchConditionAt,
  applyConditionToChooseBranchFlat,
  createEmptyAutomationCondition,
} from '@/utils/orchestrator/choose-branch-condition.util'
import { syncParallelBranchesFromActions } from '@/utils/orchestrator/action-yaml-builder.util'

const action = defineModel({ type: Object, required: true })
defineProps({
  canvasFoldBranches: { type: Boolean, default: true },
  showContinueOnError: { type: Boolean, default: true },
})
const emit = defineEmits(['change'])

const chooseBranchIndex = ref(0)
const chooseCondIndex = ref(0)
const chooseConditionPreset = ref('')

// 条件预设分组列表，用于 optgroup 渲染
const conditionPresetGroups = [...new Set(GEEK_CONDITION_PRESETS.map((p) => p.group))]

// 星期 chip 选项（0=周日，1-6=周一至周六）
const weekDays = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
]

// choose 的非默认分支列表（去掉 default 分支）
const chooseNonDefaultBranches = computed(() => {
  const branches = action.value?.branches
  if (!Array.isArray(branches)) return []
  return branches.filter((b) => !b.isDefault)
})

// 当前激活的 choose 分支（按 chooseBranchIndex 取）
const chooseActiveBranch = computed(() => {
  const list = chooseNonDefaultBranches.value
  if (!list.length) return null
  const i = Math.min(Math.max(0, chooseBranchIndex.value), list.length - 1)
  return list[i] || null
})

// 当前激活分支的条件列表（统一从扁平字段读取）
const chooseBranchConditions = computed(() => {
  const br = chooseActiveBranch.value
  if (!br) return []
  return getChooseBranchConditions(br)
})

// 当前条件是否需要设备实体（变量类 / 时间 / 太阳 / 星期 不需要）
const chooseBranchNeedsEntity = computed(() => {
  const op = String(chooseActiveBranch.value?.condOp || '')
  if (op.startsWith('var_')) return false
  if (['time_after', 'time_before', 'sun_after', 'sun_before', 'weekday'].includes(op)) return false
  return true
})

// operator → 简短符号映射，用于条件预览渲染
const OP_LABELS = {
  eq: '=',
  neq: '≠',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  between: '介于',
  state_for: '持续',
  contains: '包含',
  time_after: '晚于',
  time_before: '早于',
  sun_after: '太阳后',
  sun_before: '太阳前',
  weekday: '星期',
  var_eq: '变量=',
  var_neq: '变量≠',
  var_lt: '变量<',
  var_lte: '变量≤',
  var_gt: '变量>',
  var_gte: '变量≥',
}

// 当前 choose 条件的可读预览，便于用户直观理解
const chooseCondPreview = computed(() => {
  const br = chooseActiveBranch.value
  if (!br) return '选择或添加条件'
  const op = String(br.condOp || 'eq')
  const opLabel = OP_LABELS[op] || op
  const left = op.startsWith('var_')
    ? String(br.condVarKey || '').trim() || '变量'
    : String(br.condEntityId || '').trim() || '设备'
  const right = String(br.condState ?? '').trim() || '…'
  const logic = br.condLogic === 'or' ? '任一' : '全部'
  const n = chooseBranchConditions.value.length
  return `如果 ${left} ${opLabel} ${right}` + (n > 1 ? `（本分支 ${logic} ${n} 条）` : '')
})

// repeat 节点预览文案：根据 repeatType 渲染不同的预览
const repeatPreview = computed(() => {
  const a = action.value
  if (!a) return ''
  const t = a.repeatType || 'count'
  if (t === 'count') return `重复 ${Number(a.repeatCount) || 1} 次`
  if (t === 'for_each') {
    const raw = String(a.repeatForEach || '').trim()
    return raw ? `遍历 ${raw.split('\n').length} 项/模板` : '遍历列表（未填写）'
  }
  const ent = String(a.repeatEntityId || '').trim() || '实体'
  const st = a.repeatCondState || 'on'
  return t === 'while' ? `当 ${ent} = ${st} 时重复` : `直到 ${ent} = ${st}`
})

// 切换 action.type 为 choose 时重置分支与条件索引
watch(
  () => action.value?.type,
  (type) => {
    if (type === 'choose') {
      chooseBranchIndex.value = 0
      chooseCondIndex.value = 0
    }
  },
)

// 监听 parallelActions 变化，同步到 branches（parallel/sequence 类型专用）
watch(
  () => action.value?.parallelActions,
  () => {
    const a = action.value
    if (a?.type === 'parallel' || a?.type === 'sequence') {
      syncParallelBranchesFromActions(a)
      notifyChange()
    }
  },
  { deep: true },
)

// 切换激活分支时：重置条件索引并补齐分支条件结构，匹配预设
watch(chooseActiveBranch, (br) => {
  chooseCondIndex.value = 0
  if (!br) {
    chooseConditionPreset.value = ''
    return
  }
  ensureChooseBranchConditions(br)
  chooseConditionPreset.value =
    matchConditionPreset({
      operator: br.condOp || 'eq',
      entityId: br.condEntityId || '',
      state: br.condState ?? 'on',
      stateTo: br.condStateTo || '',
      attribute: br.condAttribute || '',
      varKey: br.condVarKey || '',
      varScope: br.condVarScope || 'global',
      forSeconds: br.condForSeconds || '',
      days: Array.isArray(br.condDays) ? [...br.condDays] : [],
      sunOffset: Number(br.condSunOffset) || 0,
    }) || ''
})

// 统一从原生事件或字符串值中提取文本值
function eventValue(ev) {
  return ev?.target?.value ?? ev
}

function notifyChange() {
  emit('change')
}

// 切换「失败后继续」开关：1=继续，0=中止
function onContinueOnError(ev) {
  const a = action.value
  if (!a) return
  a.continueOnError = eventValue(ev) === '1'
  notifyChange()
}

// 切换「作为错误停止」开关：写入 'error' / '' 到 data 字段
function onStopErrorChange(ev) {
  const a = action.value
  if (!a || a.type !== 'stop') return
  a.data = eventValue(ev) === '1' ? 'error' : ''
  notifyChange()
}

// 新增 parallel/sequence 的内联子动作（含默认字段）
function addParallelChild() {
  const a = action.value
  if (!a) return
  if (!Array.isArray(a.parallelActions)) a.parallelActions = []
  a.parallelActions.push({
    type: 'callService',
    entityId: '',
    domain: 'light',
    service: 'turn_on',
    seconds: 5,
    notifyMsg: '通知',
    message: 'notify.mobile_app',
  })
  syncParallelBranchesFromActions(a)
  notifyChange()
}

function removeParallelChild(pi) {
  const a = action.value
  a?.parallelActions?.splice(pi, 1)
  if (a) syncParallelBranchesFromActions(a)
  notifyChange()
}

// 确保 choose 至少有 1 个非默认分支 + 1 个默认分支，并按当前 index 返回激活分支
function ensureChooseBranchesOnAction() {
  const a = action.value
  if (!a || a.type !== 'choose') return null
  if (!Array.isArray(a.branches) || a.branches.length < 2) {
    a.branches = [
      { isDefault: false, condEntityId: '', condOp: 'eq', condState: 'on', actions: [] },
      { isDefault: true, condEntityId: '', condOp: 'eq', condState: '', actions: [] },
    ]
  }
  const nonDefault = a.branches.filter((b) => !b.isDefault)
  if (!nonDefault.length) {
    a.branches.unshift({
      isDefault: false,
      condEntityId: '',
      condOp: 'eq',
      condState: 'on',
      actions: [],
    })
  }
  const list = a.branches.filter((b) => !b.isDefault)
  const i = Math.min(Math.max(0, chooseBranchIndex.value), list.length - 1)
  chooseBranchIndex.value = i
  return list[i] || null
}

// 同步当前激活分支 + 当前条件索引的字段到扁平条件结构
function syncActiveChooseCond() {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  syncChooseBranchConditionAt(br, chooseCondIndex.value)
}

// 离开组件前 flush：同步活跃条件；不在此 emit change 避免选中切换竞态
function flush() {
  if (action.value?.type !== 'choose') return
  try {
    syncActiveChooseCond()
  } catch {
    /* 忽略同步异常，避免阻塞组件卸载 */
  }
}

onBeforeUnmount(() => {
  if (action.value?.type === 'choose') flush()
})

defineExpose({ flush })

// 切换分支条件逻辑：and=全部满足，or=满足任一
function onChooseCondLogic(logic) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  syncActiveChooseCond()
  br.condLogic = logic === 'or' ? 'or' : 'and'
  notifyChange()
}

// 选中分支下的某个条件，并刷新预设匹配
function onSelectChooseCond(ci) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  chooseCondIndex.value = selectChooseBranchCondition(br, chooseCondIndex.value, ci)
  chooseConditionPreset.value =
    matchConditionPreset({
      operator: br.condOp || 'eq',
      entityId: br.condEntityId || '',
      state: br.condState ?? 'on',
      stateTo: br.condStateTo || '',
      attribute: br.condAttribute || '',
      varKey: br.condVarKey || '',
      varScope: br.condVarScope || 'global',
      forSeconds: br.condForSeconds || '',
      days: Array.isArray(br.condDays) ? [...br.condDays] : [],
      sunOffset: Number(br.condSunOffset) || 0,
    }) || ''
  notifyChange()
}

// 在当前分支追加一个空条件
function onAddChooseCond() {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  syncActiveChooseCond()
  chooseCondIndex.value = addChooseBranchCondition(br, chooseCondIndex.value)
  chooseConditionPreset.value = ''
  notifyChange()
}

// 删除当前分支下的当前条件
function onRemoveChooseCond() {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  chooseCondIndex.value = removeChooseBranchCondition(br, chooseCondIndex.value)
  notifyChange()
}

// 新增 choose 分支：插入到默认分支前，并切到新分支
function addChooseBranch() {
  const a = action.value
  if (!a || a.type !== 'choose') return
  ensureChooseBranchesOnAction()
  const defIdx = a.branches.findIndex((b) => b.isDefault)
  const branch = {
    isDefault: false,
    condEntityId: '',
    condOp: 'eq',
    condState: 'on',
    actions: [],
  }
  if (defIdx >= 0) a.branches.splice(defIdx, 0, branch)
  else a.branches.push(branch)
  chooseBranchIndex.value = a.branches.filter((b) => !b.isDefault).length - 1
  notifyChange()
}

// 删除当前激活分支（至少保留 1 个非默认分支）
function removeChooseBranch() {
  const a = action.value
  if (!a || a.type !== 'choose') return
  const nonDefault = a.branches.filter((b) => !b.isDefault)
  if (nonDefault.length <= 1) return
  const target = chooseActiveBranch.value
  if (!target) return
  a.branches = a.branches.filter((b) => b !== target)
  chooseBranchIndex.value = Math.max(0, chooseBranchIndex.value - 1)
  notifyChange()
}

// 应用条件预设到当前分支：先复制分支字段为临时 condition，应用预设后回写
function onChooseConditionPresetPicked() {
  const br = ensureChooseBranchesOnAction()
  if (!br || !chooseConditionPreset.value) return
  const tmp = createEmptyAutomationCondition({
    operator: br.condOp || 'eq',
    entityId: br.condEntityId || '',
    state: br.condState ?? 'on',
    stateTo: br.condStateTo || '',
    attribute: br.condAttribute || '',
    varKey: br.condVarKey || '',
    varScope: br.condVarScope || 'global',
    forSeconds: br.condForSeconds || '',
    days: Array.isArray(br.condDays) ? [...br.condDays] : [],
    sunOffset: Number(br.condSunOffset) || 0,
    negated: Boolean(br.condNegated),
  })
  applyConditionPreset(tmp, chooseConditionPreset.value)
  applyConditionToChooseBranchFlat(br, tmp)
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondNegated(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condNegated = Boolean(ev?.target?.checked)
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondAttribute(attr) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condAttribute = attr || ''
  syncActiveChooseCond()
  notifyChange()
}

// 属性输入框变更：直接取 input value 写回 condAttribute
function onChooseCondAttributeField(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condAttribute = eventValue(ev)
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondVarKey(v) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condVarKey = v || ''
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondVarScope(v) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condVarScope = v || 'global'
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondFor(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condForSeconds = eventValue(ev)
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondEntity(entityId) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condEntityId = entityId || ''
  syncActiveChooseCond()
  notifyChange()
}

// 切换 choose 条件 operator：按 operator 类型补全默认字段（与主条件表单一致）
function onChooseCondOp(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  const op = eventValue(ev) || 'eq'
  br.condOp = op
  if (op === 'weekday') {
    if (!Array.isArray(br.condDays) || !br.condDays.length) br.condDays = [1, 2, 3, 4, 5]
    br.condState = ''
  } else if (['time_after', 'time_before', 'sun_after', 'sun_before'].includes(op)) {
    if (!Array.isArray(br.condDays)) br.condDays = []
    if (op === 'sun_after' && !br.condState) br.condState = 'sunset'
    if (op === 'sun_before' && !br.condState) br.condState = 'sunrise'
    if (op === 'time_after' && (!br.condState || br.condState === 'on')) br.condState = '18:00:00'
    if (op === 'time_before' && (!br.condState || br.condState === 'on')) br.condState = '07:00:00'
    if (br.condSunOffset == null) br.condSunOffset = 0
  } else if (op === 'between') {
    if (!br.condState || br.condState === 'on') br.condState = '10'
    if (!br.condStateTo) br.condStateTo = '30'
  }
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondState(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condState = eventValue(ev)
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondStateTo(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condStateTo = eventValue(ev)
  syncActiveChooseCond()
  notifyChange()
}

function onChooseCondSunOffset(ev) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  br.condSunOffset = Number(eventValue(ev)) || 0
  syncActiveChooseCond()
  notifyChange()
}

function isChooseDaySelected(day) {
  const days = chooseActiveBranch.value?.condDays
  return Array.isArray(days) && days.includes(day)
}

// 切换星期 chip：增删后保持升序，便于序列化稳定
function toggleChooseDay(day) {
  const br = ensureChooseBranchesOnAction()
  if (!br) return
  const set = new Set(Array.isArray(br.condDays) ? br.condDays : [])
  if (set.has(day)) set.delete(day)
  else set.add(day)
  br.condDays = [...set].sort((a, b) => a - b)
  syncActiveChooseCond()
  notifyChange()
}
</script>

<style scoped>
.geek-flow-action-inspector {
  display: flex;
  flex-direction: column;
  gap: var(--geek-gap-md, 12px);
  margin: 0;
}
.geek-flow-help {
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 12px;
}
.geek-flow-help summary {
  cursor: pointer;
  font-size: var(--premium-fs-micro);
  color: rgba(255, 255, 255, 0.55);
  user-select: none;
}
.geek-flow-help[open] summary {
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.72);
}
.geek-flow-help p {
  margin: 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.45;
  color: var(--hos-text-secondary);
}
.geek-flow-card {
  display: flex;
  flex-direction: column;
  gap: var(--geek-gap-md, 12px);
  padding: var(--geek-pad-section, 14px);
  margin: 0;
  border-radius: var(--hos-radius-card);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}
.geek-flow-card--accent {
  border-color: rgba(56, 189, 248, 0.28);
  background: linear-gradient(
    180deg,
    rgba(56, 189, 248, 0.1) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
}
.geek-flow-card__head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.geek-flow-card__title {
  margin: 0;
  font-size: var(--premium-fs-caption);
  font-weight: 650;
  color: rgba(255, 255, 255, 0.88);
}
.geek-flow-card__desc {
  margin: 0;
  font-size: var(--premium-fs-micro);
  line-height: 1.45;
  color: var(--hos-text-secondary);
}
.geek-flow-section {
  display: flex;
  flex-direction: column;
  gap: var(--geek-gap-sm, 8px);
}
.geek-flow-section__label {
  font-size: var(--premium-fs-micro);
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.45);
}
.geek-flow-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.geek-flow-pill {
  min-height: 32px;
  padding: 6px 12px;
  border-radius: var(--hos-radius-pill);
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  font-size: var(--premium-fs-micro);
  font-weight: 600;
  cursor: pointer;
}
.geek-flow-pill.is-on {
  border-color: rgba(96, 165, 250, 0.85);
  background: rgba(59, 130, 246, 0.28);
  color: #dbeafe;
}
.geek-flow-pill--ghost {
  border-style: dashed;
  color: var(--hos-text-secondary);
}
.geek-flow-pill--danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fca5a5;
}
.geek-flow-preview {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(125, 211, 252, 0.25);
  color: #bae6fd;
  font-size: var(--premium-fs-micro);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.35;
  word-break: break-all;
}
.geek-flow-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
  font-size: var(--premium-fs-body-sm);
  outline: none;
}
.geek-flow-input:focus {
  border-color: rgba(56, 189, 248, 0.45);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.12);
}
.geek-parallel-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
</style>
