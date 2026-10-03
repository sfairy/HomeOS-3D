<template>
  <template v-if="hasDataBuilder">
    <!-- 参数切换按钮：展开/收起服务参数面板 -->
    <div class="wr-params-toggle">
      <button v-if="!expanded" class="wr-btn-add wr-btn-add--xs" @click="toggleParams">
        {{ '+ 参数' }}
      </button>
      <button v-else class="wr-btn-add wr-btn-add--xs wr-btn-add--active" @click="toggleParams">
        {{ '− 隐藏参数' }}
      </button>
    </div>
    <!-- 参数面板：挂载时触发 sync 事件，从外部同步初始数据到 panel -->
    <div v-if="expanded" class="wr-params" @vue:mounted="emit('sync')">
      <div class="wr-params-head">
        <span class="wr-params-head-title">{{ '⚙ 参数配置' }}</span>
        <button class="wr-btn-x" @click="closeParams">✕</button>
      </div>
      <!-- 灯具 turn_on：亮度/色温/过渡/颜色/特效 -->
      <template v-if="isLightTurnOn(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '亮度' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.brightness_pct"
              type="range"
              min="1"
              max="100"
              class="wr-range wr-range--grn"
              :style="builderSliderFill(panel.brightness_pct, 1, 100, '#22C55E', 100)"
            />
          </div>
          <span class="wr-param-val">{{ panel.brightness_pct }}%</span>
        </div>
        <div class="wr-param">
          <span class="wr-param-label">{{ '色温' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.color_temp"
              type="range"
              min="0"
              max="6500"
              class="wr-range wr-range--amb"
              :style="colorTempSliderTrackStyle(panel.color_temp, 0, 6500)"
            />
          </div>
          <span class="wr-param-val">{{
            panel.color_temp > 0 ? panel.color_temp + 'K' : '默认'
          }}</span>
        </div>
        <div class="wr-param">
          <span class="wr-param-label">{{ '过渡' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.transition"
              type="range"
              min="0"
              max="10"
              step="0.5"
              class="wr-range wr-range--blu"
              :style="builderSliderFill(panel.transition, 0, 10, '#60A5FA', 0, 0.5)"
            />
          </div>
          <span class="wr-param-val">{{ panel.transition || '0' }}s</span>
        </div>
        <div class="wr-param">
          <span class="wr-param-label">{{ '颜色' }}</span>
          <input
            type="color"
            class="wr-color-pick"
            :value="panel.rgb_color || '#FFD700'"
            @input="panel.rgb_color = $event.target.value"
          />
          <span class="wr-param-val wr-param-val--hex">{{ panel.rgb_color || '未设置' }}</span>
          <button
            v-if="panel.rgb_color"
            type="button"
            class="list-page__link-btn"
            @click="panel.rgb_color = ''"
          >
            {{ '清除' }}
          </button>
        </div>
        <div class="wr-param">
          <span class="wr-param-label">{{ '特效' }}</span>
          <HosSelect variant="orchestrator" size="xs" fit v-model="panel.effect">
            <option value="">{{ '无' }}</option>
            <option value="colorloop">{{ '颜色循环' }}</option>
            <option value="random">{{ '随机' }}</option>
            <option value="white">{{ '白光' }}</option>
          </HosSelect>
        </div>
      </template>
      <!-- 恒温器 set_temperature：目标温度 -->
      <template v-if="isClimateSetTemp(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '目标温度' }}</span>
          <input
            v-model.number="panel.temperature"
            type="number"
            class="wr-num wr-num--lg"
            placeholder="22"
          />
          <span class="wr-param-val">°C</span>
        </div>
      </template>
      <!-- 卷帘 set_cover_position：位置百分比 -->
      <template v-if="isCoverPosition(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '位置' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.position"
              type="range"
              min="0"
              max="100"
              class="wr-range wr-range--blu"
              :style="builderSliderFill(panel.position, 0, 100, '#60A5FA', 50)"
            />
          </div>
          <span class="wr-param-val">{{ panel.position }}%</span>
        </div>
      </template>      <!-- 媒体播放器 set_volume：音量 -->
      <template v-if="isMediaPlayerVolume(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '音量' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.volume_level"
              type="range"
              min="0"
              max="1"
              step="0.1"
              class="wr-range wr-range--grn"
              :style="builderSliderFill(panel.volume_level, 0, 1, '#22C55E', 0.5, 0.1)"
            />
          </div>
          <span class="wr-param-val">{{ Math.round(panel.volume_level * 100) }}%</span>
        </div>
      </template>
      <!-- 风扇 set_percentage：风速 -->
      <template v-if="isFanSetPct(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '风速' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.percentage"
              type="range"
              min="0"
              max="100"
              step="25"
              class="wr-range wr-range--grn"
              :style="builderSliderFill(panel.percentage, 0, 100, '#22C55E', 50, 25)"
            />
          </div>
          <span class="wr-param-val">{{ panel.percentage }}%</span>
        </div>
      </template>
      <!-- 加湿器 set_humidity：目标湿度 -->
      <template v-if="isHumidifierSet(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '湿度' }}</span>
          <div class="wr-range-wrap">
            <input
              v-model.number="panel.humidity"
              type="range"
              min="0"
              max="100"
              class="wr-range wr-range--blu"
              :style="builderSliderFill(panel.humidity, 0, 100, '#60A5FA', 50)"
            />
          </div>
          <span class="wr-param-val">{{ panel.humidity }}%</span>
        </div>
      </template>
      <!-- 恒温器 set_hvac_mode：HVAC 模式 -->
      <template v-if="isClimateSetHvac(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '模式' }}</span>
          <HosSelect variant="orchestrator" size="sm" fit v-model="panel.hvac_mode">
            <option value="heat">{{ '制热' }}</option>
            <option value="cool">{{ '制冷' }}</option>
            <option value="auto">{{ '自动' }}</option>
            <option value="dry">{{ '除湿' }}</option>
            <option value="fan_only">{{ '送风' }}</option>
            <option value="off">{{ '关闭' }}</option>
          </HosSelect>
        </div>
      </template>
      <!-- 锁具 lock/unlock：锁码 -->
      <template v-if="isLockService(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '锁码' }}</span>
          <input
            v-model="panel.code"
            class="wr-num"
            :placeholder="codePlaceholder"
            style="width: 120px; text-align: left"
          />
        </div>
      </template>
      <!-- input_number set_value：数值 -->
      <template v-if="isInputNumberSet(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '数值' }}</span>
          <input
            v-model.number="panel.value"
            class="wr-num wr-num--lg"
            type="number"
            :placeholder="'值'"
          />
        </div>
      </template>
      <!-- input_select select_option：选项 -->
      <template v-if="isInputSelectOpt(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '选项' }}</span>
          <input
            v-model="panel.option"
            class="wr-num"
            :placeholder="'选项值'"
            style="width: 180px; text-align: left"
          />
        </div>
      </template>
      <!-- 报警 arm/disarm：锁码 -->
      <template v-if="isAlarmService(action)">
        <div class="wr-param">
          <span class="wr-param-label">{{ '锁码' }}</span>
          <input
            v-model="panel.code"
            class="wr-num"
            :placeholder="codePlaceholder"
            style="width: 120px; text-align: left"
          />
        </div>
      </template>
      <!-- 确认参数：将 panel 数据写回 action.data -->
      <button class="wr-btn-apply" @click="emit('apply')">{{ '✓ 确认参数' }}</button>
    </div>
  </template>
</template>
<script setup>
/**
 * OrchestratorServiceDataPanel.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：HA 服务调用的参数面板。根据 action 类型动态渲染对应的参数控件
 *      （灯具亮度/色温/颜色/特效、恒温器温度/HVAC 模式、卷帘位置、媒体音量、
 *      风扇风速、加湿器湿度、锁具/报警锁码、input_number/input_select 等）。
 *      参数编辑完成后通过 apply 事件回写到 action.data。
 * 依赖：vue、HosSelect、useBuilderUtils（滑块填充）、progress-bar.util（色温滑块轨道）、
 *      orchestrator-service-data.util（action 类型判定与展开状态管理）。
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import { computed } from 'vue'
import { builderSliderFill, colorTempSliderTrackStyle } from '@/utils/ui/progress-bar.util'
import {
  supportsServiceDataBuilder,
  actionServiceDataExpanded,
  toggleActionServiceDataPanel,
  setActionServiceDataExpanded,
  isLightTurnOn,
  isClimateSetTemp,
  isCoverPosition,
  isMediaPlayerVolume,
  isFanSetPct,
  isHumidifierSet,
  isClimateSetHvac,
  isLockService,
  isInputNumberSet,
  isInputSelectOpt,
  isAlarmService,
} from '@/utils/orchestrator/service-data.util'

/**
 * 服务数据面板对象，与父级 v-model 双向绑定
 * 各属性由具体服务类型决定（如 brightness_pct / color_temp / temperature 等）
 */
const panel = defineModel('panel', { type: Object, required: true })

/**
 * 组件 Props
 * @property {object} action        - 当前动作对象（含 type/domain/service/entityId 等）
 * @property {string} showParamsKey - 控制参数面板展开的属性 key（默认 _showParams）
 * @property {string} codePlaceholder - 锁码输入框 placeholder
 */
const props = defineProps({
  action: { type: Object, required: true },
  showParamsKey: { type: String, default: '_showParams' },
  codePlaceholder: { type: String, default: '' },
})

/** 事件：apply（确认参数回写）/ sync（挂载时从 action 同步数据到 panel） */
const emit = defineEmits(['apply', 'sync'])

/**
 * 是否支持参数构建器
 * 根据 action 的 domain/service 判定是否提供图形化参数面板
 */
const hasDataBuilder = computed(() => supportsServiceDataBuilder(props.action))

/**
 * 参数面板是否展开
 * 读取 action 上以 showParamsKey 命名的属性判定展开状态
 */
const expanded = computed(() => actionServiceDataExpanded(props.action, props.showParamsKey))

/**
 * 切换参数面板展开/收起
 * 首次展开时会从 action.data 同步初始值到 panel
 */
function toggleParams() {
  toggleActionServiceDataPanel(props.action, panel.value, props.showParamsKey)
}

/** 关闭参数面板 */
function closeParams() {
  setActionServiceDataExpanded(props.action, props.showParamsKey, false)
}
</script>