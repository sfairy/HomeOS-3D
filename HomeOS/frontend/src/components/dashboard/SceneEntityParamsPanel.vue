<!--
  组件文件：SceneEntityParamsPanel.vue
  所属模块：frontend/src/components/dashboard
  组件职责：场景批量预设/编排画布的实体参数面板。依据当前 entityId 所属域动态渲染不同的
    GeekCfgCard 卡片：light（亮度/色温/颜色/过渡/特效滑块）、cover（位置滑块）、climate（温度/模式/风速）、
    media_player（音量/源/静音）、fan（百分比/模式）、input_number/input_text/select 等；
    每个参数改动直接双向写入 entity 响应式对象，滑块高亮色随域变化（绿/蓝/琥珀/紫）。
  主要 props / emits：
    - props.unitForEntity(entityId)：取 input_number 等传感器单位（可选）。
    - 无显式 emits：通过父组件传入的响应式 entity ref 双向绑定；域判定使用 isLightDomain/isCoverDomain/
      isClimateDomain 等函数；辅助 disp/setNum/rangeFill/colorTempStyle/snapToSliderValue 本地闭包。
  依赖关系：vue computed；HosSelect 下拉 + GeekCfgCard 卡片容器；utils 滑块值解析与步长对齐函数
    resolveSliderValue/snapToSliderStep、rangeFill 样式计算。
-->
<template>
  <template v-if="entityId">
    <GeekCfgCard v-if="isLightDomain(entityId)" title="灯光" accent>
      <div class="geek-scene-params">
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '亮度' }}</span>
            <span class="geek-scene-param__val">{{ paramLabel('brightness', (v) => `${v}%`) }}</span>
          </div>
          <div class="wr-range-wrap">
            <input
              type="range"
              min="1"
              max="100"
              class="wr-range wr-range--grn"
              :value="disp('brightness', 1)"
              :style="rangeFill('brightness', 1, 100, '#22C55E', 1)"
              @input="setNum('brightness', $event)"
            />
          </div>
        </div>
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '色温' }}</span>
            <span class="geek-scene-param__val">{{
              entity.colorTemp ? `${entity.colorTemp}K` : '默认'
            }}</span>
          </div>
          <div class="wr-range-wrap">
            <input
              type="range"
              min="0"
              max="6500"
              class="wr-range wr-range--amb"
              :value="disp('colorTemp', 0)"
              :style="colorTempStyle('colorTemp', 0, 6500)"
              @input="setNum('colorTemp', $event)"
            />
          </div>
        </div>
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '颜色' }}</span>
            <span class="geek-scene-param__val">{{ entity.rgbColor || '未设置' }}</span>
          </div>
          <div class="geek-scene-param__row">
            <input
              type="color"
              class="wr-color-pick"
              :value="entity.rgbColor || '#FFD700'"
              @input="onRgbPick($event)"
            />
            <button
              v-if="entity.rgbColor"
              type="button"
              class="list-page__link-btn"
              @click="entity.rgbColor = ''"
            >
              {{ '清除' }}
            </button>
          </div>
        </div>
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '过渡（秒）' }}</span>
          </div>
          <input
            v-model.number="entity.transition"
            type="number"
            step="0.5"
            min="0"
            max="10"
            class="wr-num"
            :placeholder="'秒'"
          />
        </label>
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '特效' }}</span>
          </div>
          <HosSelect variant="orchestrator" size="sm" block v-model="entity.effect">
            <option value="">{{ '无' }}</option>
            <option value="colorloop">{{ '颜色循环' }}</option>
            <option value="random">{{ '随机' }}</option>
            <option value="white">{{ '白光' }}</option>
          </HosSelect>
        </label>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isCoverDomain(entityId)" title="窗帘" accent>
      <div class="geek-scene-params">
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '位置' }}</span>
            <span class="geek-scene-param__val">{{ paramLabel('position', (v) => `${v}%`) }}</span>
          </div>
          <div class="wr-range-wrap">
            <input
              type="range"
              min="0"
              max="100"
              class="wr-range wr-range--blu"
              :value="disp('position', 0)"
              :style="rangeFill('position', 0, 100, '#60A5FA', 0)"
              @input="setNum('position', $event)"
            />
          </div>
        </div>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isClimateDomain(entityId)" title="空调" accent>
      <div class="geek-scene-params">
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '温度（°C）' }}</span>
          </div>
          <input
            v-model.number="entity.temperature"
            type="number"
            class="wr-num"
            placeholder="°C"
          />
        </label>
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '模式' }}</span>
          </div>
          <HosSelect variant="orchestrator" size="sm" block v-model="entity.hvacMode">
            <option value="">{{ '不变' }}</option>
            <option value="heat">{{ '制热' }}</option>
            <option value="cool">{{ '制冷' }}</option>
            <option value="auto">{{ '自动' }}</option>
            <option value="dry">{{ '除湿' }}</option>
            <option value="fan_only">{{ '送风' }}</option>
            <option value="off">{{ '关闭' }}</option>
          </HosSelect>
        </label>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isMediaDomain(entityId)" title="媒体" accent>
      <div class="geek-scene-params">
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '音量' }}</span>
            <span class="geek-scene-param__val">{{
              paramLabel('volume', (v) => `${Math.round(v * 100)}%`)
            }}</span>
          </div>
          <div class="wr-range-wrap">
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              class="wr-range wr-range--grn"
              :value="disp('volume', 0, 0, 1, 0.1)"
              :style="rangeFill('volume', 0, 1, '#22C55E', 0, 0.1)"
              @input="setNum('volume', $event, true)"
            />
          </div>
        </div>
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '输入源' }}</span>
          </div>
          <input v-model="entity.source" class="wr-num" :placeholder="'输入源'" />
        </label>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isFanDomain(entityId)" title="风扇" accent>
      <div class="geek-scene-params">
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '风速' }}</span>
            <span class="geek-scene-param__val">{{ paramLabel('percentage', (v) => `${v}%`) }}</span>
          </div>
          <div class="wr-range-wrap">
            <input
              type="range"
              min="0"
              max="100"
              step="25"
              class="wr-range wr-range--grn"
              :value="disp('percentage', 0, 0, 100, 25)"
              :style="rangeFill('percentage', 0, 100, '#22C55E', 0, 25)"
              @input="setNum('percentage', $event)"
            />
          </div>
        </div>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isInputSelectDomain(entityId)" title="选择器" accent>
      <div class="geek-scene-params">
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '选项' }}</span>
          </div>
          <input v-model="entity.option" class="wr-num" :placeholder="'select 选项值'" />
        </label>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isInputNumberDomain(entityId)" title="数值" accent>
      <div class="geek-scene-params">
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ unitLabel ? `数值（${unitLabel}）` : '数值' }}</span>
          </div>
          <input
            v-model.number="entity.value"
            class="wr-num"
            type="number"
            :placeholder="'值'"
          />
        </label>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isHumidifierDomain(entityId)" title="加湿器" accent>
      <div class="geek-scene-params">
        <div class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '湿度' }}</span>
            <span class="geek-scene-param__val">{{ paramLabel('humidity', (v) => `${v}%`) }}</span>
          </div>
          <div class="wr-range-wrap">
            <input
              type="range"
              min="0"
              max="100"
              class="wr-range wr-range--blu"
              :value="disp('humidity', 0)"
              :style="rangeFill('humidity', 0, 100, '#60A5FA', 0)"
              @input="setNum('humidity', $event)"
            />
          </div>
        </div>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isLockDomain(entityId)" title="门锁" accent>
      <div class="geek-scene-params">
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '操作码' }}</span>
          </div>
          <input v-model="entity.code" class="wr-num" :placeholder="'可选操作码'" />
        </label>
        <p class="geek-hint">{{ '上锁 / 解锁 / 开门时使用' }}</p>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isVacuumDomain(entityId)" title="扫地机" accent>
      <div class="geek-scene-params">
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '风速' }}</span>
          </div>
          <HosSelect variant="orchestrator" size="sm" block v-model="entity.fanSpeed">
            <option value="">{{ '默认' }}</option>
            <option value="low">{{ '低' }}</option>
            <option value="medium">{{ '中' }}</option>
            <option value="high">{{ '高' }}</option>
            <option value="turbo">{{ '强力' }}</option>
          </HosSelect>
        </label>
      </div>
    </GeekCfgCard>

    <GeekCfgCard v-if="isAlarmControlDomain(entityId)" title="报警" accent>
      <div class="geek-scene-params">
        <label class="geek-scene-param">
          <div class="geek-scene-param__head">
            <span>{{ '操作码' }}</span>
          </div>
          <input v-model="entity.code" class="wr-num" :placeholder="'布撤防密码'" />
        </label>
      </div>
    </GeekCfgCard>
  </template>
</template>

<script setup>
/**
 * SceneEntityParamsPanel.vue
 *
 * 所属模块：dashboard（场景实体参数面板）
 * 职责：场景编辑器中根据当前实体 domain 渲染对应的参数卡片（GeekCfgCard）。
 *      覆盖灯光（亮度/色温/颜色/过渡/特效）、窗帘（位置）、空调（温度/模式）、
 *      媒体（音量/输入源）、风扇（风速）、input_select（选项）、input_number（数值）、
 *      加湿器（湿度）、门锁（操作码）、扫地机（吸力）、报警（密码）等。
 *      数值类参数通过滑块 + 进度填充展示，未设置时显示「不变」。
 * 依赖：vue、HosSelect、GeekCfgCard、progress-bar.util（滑块填充与色温轨道）、
 *      scene-yaml-builder.util（domain 判定）。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import GeekCfgCard from '@/components/geek-automation/GeekCfgCard.vue'
import { computed } from 'vue'
import {
  builderSliderFill,
  colorTempSliderTrackStyle,
  resolveSliderValue,
  snapToSliderStep,
} from '@/utils/ui/progress-bar.util'
import {
  isLightDomain,
  isCoverDomain,
  isClimateDomain,
  isMediaDomain,
  isFanDomain,
  isLockDomain,
  isInputSelectDomain,
  isInputNumberDomain,
  isHumidifierDomain,
  isVacuumDomain,
  isAlarmControlDomain,
} from '@/utils/orchestrator/scene-yaml-builder.util'
import '@/components/geek-automation/styles/geek-var-panel.css'
import '@/components/geek-automation/styles/geek-builder-shared.css'

/** 当前编辑的场景实体对象（含 entityId 与各 domain 对应字段，v-model 双向绑定） */
const entity = defineModel('entity', { type: Object, required: true })

/**
 * 组件 Props
 * @property {Function} unitForEntity - 由实体 ID 解析单位的函数（用于 input_number 卡片标签）
 */
const props = defineProps({
  unitForEntity: { type: Function, default: () => '' },
})
/** 当前实体的 entity_id（防御性取值） */
const entityId = computed(() => entity.value?.entityId || '')
/** 当前实体的单位文案（用于 input_number 卡片） */
const unitLabel = computed(() => props.unitForEntity(entityId.value))

/**
 * 取滑块展示值：缺失时回退 fallback，并按 step 对齐
 * @param {string} field    - 实体上的字段名（如 brightness/colorTemp）
 * @param {number} fallback - 缺省值
 * @param {number} [min]    - 最小值（提供时启用 snap）
 * @param {number} [max]    - 最大值
 * @param {number} [step]   - 步长
 * @returns {number}
 */
function disp(field, fallback, min, max, step) {
  const v = resolveSliderValue(entity.value[field], fallback)
  if (step != null && min != null && max != null) {
    return snapToSliderStep(v, min, max, step)
  }
  return v
}

/**
 * 滑块进度填充样式（builderSliderFill）
 * @returns {object} style 对象
 */
function rangeFill(field, min, max, color, fallback, step) {
  return builderSliderFill(entity.value[field], min, max, color, fallback, step)
}

/** 色温滑块轨道样式（带渐变） */
function colorTempStyle(field, min, max) {
  return colorTempSliderTrackStyle(entity.value[field], min, max)
}

/**
 * 参数值显示文案：未设置或非数字时返回「不变」，否则按 fmt 格式化
 * @param {string} field - 实体字段名
 * @param {(v: number) => string} fmt - 格式化函数
 * @returns {string}
 */
function paramLabel(field, fmt) {
  const v = entity.value[field]
  if (v == null || Number.isNaN(Number(v))) return '不变'
  return fmt(Number(v))
}

/**
 * 数值类输入变更：写入对应字段
 * 解析失败（NaN）时设为 null（表示「不变」）
 * @param {string} field  - 实体字段名
 * @param {Event}  event  - input 事件
 * @param {boolean} [float=false] - 是否按浮点解析（默认整数）
 */
function setNum(field, event, float = false) {
  const raw = float ? parseFloat(event.target.value) : parseInt(event.target.value, 10)
  entity.value[field] = Number.isNaN(raw) ? null : raw
}

/**
 * 颜色选择器变更：写入 rgbColor 字段
 * @param {Event} event - input 事件
 */
function onRgbPick(event) {
  entity.value.rgbColor = event?.target?.value || ''
}
</script>
