<template>
  <div
    class="saw-overlay hos-overlay-scrub"
    role="dialog"
    aria-modal="true"
    aria-labelledby="saw-title"
    @click.self="$emit('close')"
    @keydown.escape="$emit('close')"
  >
    <div class="saw-modal">
      <!-- 向导头部：标题和描述 -->
      <header class="saw-head">
        <div class="saw-head__text">
          <p class="saw-eyebrow">{{ '自动化向导' }}</p>
          <h3 id="saw-title" class="saw-title">{{ '简单自动化向导' }}</h3>
          <p class="saw-desc">
            {{ '填写基础条件生成 YAML 草案；notify、zone 等高级项可在联动器中继续编辑。' }}
          </p>
        </div>
        <button type="button" class="saw-close" aria-label="关闭" @click="$emit('close')">
          ✕
        </button>
      </header>

          <!-- 向导主体：表单区域 -->
          <div class="saw-body">
            <div class="saw-field">
              <label class="saw-label" for="saw-name">{{ '名称' }}</label>
              <input
                id="saw-name"
                v-model="name"
                class="saw-input"
                placeholder="如：客厅人来灯亮"
                autocomplete="off"
              />
            </div>

            <!-- 触发条件配置卡片 -->
            <section class="saw-card saw-card--trigger">
              <div class="saw-card__head">
                <Zap class="saw-card__icon" aria-hidden="true" />
                <span class="saw-card__title">{{ '触发条件' }}</span>
                <span class="saw-card__hint">{{ triggerTypeHint }}</span>
              </div>
              <div class="saw-card__body">
                <div class="saw-field">
                  <label class="saw-label">{{ '触发类型' }}</label>
                  <HosSelect variant="orchestrator" size="sm" block v-model="triggerType">
                    <option value="state">{{ '状态变化' }}</option>
                    <option value="time">{{ '指定时间' }}</option>
                    <option value="sun">{{ '日出/日落' }}</option>
                    <option value="zone">{{ '进入/离开区域' }}</option>
                  </HosSelect>
                </div>

                <Transition name="saw-expand" mode="out-in">
                  <div v-if="triggerType === 'state'" key="state" class="saw-subfields">
                    <div class="saw-field">
                      <label class="saw-label">{{ '触发实体' }}</label>
                      <EntityInput
                        v-model="triggerEntity"
                        wrapper-class="saw-entity"
                        placeholder="如 binary_sensor.living_motion"
                      />
                    </div>
                    <div class="saw-field saw-field--compact">
                      <label class="saw-label">{{ '变为状态' }}</label>
                      <HosSelect variant="orchestrator" size="sm" block v-model="triggerTo">
                        <option value="on">{{ '开启 (on)' }}</option>
                        <option value="off">{{ '关闭 (off)' }}</option>
                      </HosSelect>
                    </div>
                  </div>

                  <div v-else-if="triggerType === 'time'" key="time" class="saw-subfields">
                    <div class="saw-field">
                      <label class="saw-label">{{ '触发时间' }}</label>
                      <input v-model="triggerAt" type="time" class="saw-input saw-input--time" />
                    </div>
                  </div>

                  <div v-else-if="triggerType === 'zone'" key="zone" class="saw-subfields">
                    <div class="saw-field">
                      <label class="saw-label">{{ '追踪实体' }}</label>
                      <EntityInput
                        v-model="triggerEntity"
                        domain-filter="person,device_tracker"
                        wrapper-class="saw-entity"
                        placeholder="如 person.homeowner"
                      />
                    </div>
                    <div class="saw-row">
                      <div class="saw-field saw-field--grow">
                        <label class="saw-label">{{ '区域 ID' }}</label>
                        <input v-model="zoneId" class="saw-input" placeholder="zone.home" />
                      </div>
                      <div class="saw-field saw-field--compact">
                        <label class="saw-label">{{ '事件' }}</label>
                        <HosSelect variant="orchestrator" size="sm" block v-model="zoneEvent">
                          <option value="enter">{{ '进入' }}</option>
                          <option value="leave">{{ '离开' }}</option>
                        </HosSelect>
                      </div>
                    </div>
                  </div>

                  <div v-else key="sun" class="saw-subfields">
                    <div class="saw-field">
                      <label class="saw-label">{{ '天文事件' }}</label>
                      <HosSelect variant="orchestrator" size="sm" block v-model="sunEvent">
                        <option value="sunset">{{ '日落' }}</option>
                        <option value="sunrise">{{ '日出' }}</option>
                      </HosSelect>
                    </div>
                  </div>
                </Transition>
              </div>
            </section>

            <!-- 流程箭头装饰 -->
            <div class="saw-flow" aria-hidden="true">
              <ArrowDown class="saw-flow__icon" />
            </div>

            <!-- 执行动作配置卡片 -->
            <section class="saw-card saw-card--action">
              <div class="saw-card__head">
                <Play class="saw-card__icon" aria-hidden="true" />
                <span class="saw-card__title">{{ '执行动作' }}</span>
                <span class="saw-card__hint">{{ actionKindHint }}</span>
              </div>
              <div class="saw-card__body">
                <div class="saw-field">
                  <label class="saw-label">{{ '动作类型' }}</label>
                  <HosSelect variant="orchestrator" size="sm" block v-model="actionKind">
                    <option value="device">{{ '控制设备' }}</option>
                    <option value="notify">{{ 'HomeOS 通知' }}</option>
                  </HosSelect>
                </div>

                <Transition name="saw-expand" mode="out-in">
                  <div v-if="actionKind === 'device'" key="device" class="saw-subfields">
                    <div class="saw-field">
                      <label class="saw-label">{{ '动作实体' }}</label>
                      <EntityInput
                        v-model="actionEntity"
                        wrapper-class="saw-entity"
                        placeholder="如 light.living_room"
                      />
                    </div>
                    <div class="saw-field saw-field--compact">
                      <label class="saw-label">{{ '执行操作' }}</label>
                      <HosSelect variant="orchestrator" size="sm" block v-model="actionService">
                        <option value="turn_on">{{ '打开' }}</option>
                        <option value="turn_off">{{ '关闭' }}</option>
                      </HosSelect>
                    </div>
                  </div>

                  <div v-else key="notify" class="saw-subfields">
                    <div class="saw-field">
                      <label class="saw-label">{{ '通知内容' }}</label>
                      <input v-model="notifyMsg" class="saw-input" placeholder="自动化已触发" />
                    </div>
                  </div>
                </Transition>
              </div>
            </section>
          </div>

          <!-- 向导底部：操作按钮 -->
          <footer class="saw-foot">
            <button type="button" class="saw-btn saw-btn--ghost" @click="$emit('close')">
              {{ '取消' }}
            </button>
            <button type="button" class="saw-btn saw-btn--primary" @click="apply">
              <Sparkles class="saw-btn__icon" aria-hidden="true" />
              {{ '生成草案' }}
            </button>
          </footer>
        </div>
      </div>
</template>

<script setup>
/**
 * SimpleAutomationWizard - 简单自动化向导组件
 * 功能特性：
 * - 引导式创建简单自动化
 * - 支持多种触发类型：状态变化、指定时间、日出日落、区域进入/离开
 * - 支持多种动作类型：控制设备、发送通知
 * - 生成 YAML 草案
 * - 模态对话框形式（由调用方 Teleport 到 body，避免被构建器抽屉挡住）
 */
import { ArrowDown, Play, Sparkles, Zap } from '@lucide/vue'
import { onDeactivated } from 'vue'
import './styles/SimpleAutomationWizard.css'
import HosSelect from '@/components/common/base/HosSelect.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useSimpleAutomationWizard } from '@/composables/orchestrator/useSimpleAutomationWizard'

const props = defineProps({ open: { type: Boolean, default: false } })
/** 组件事件：close（关闭对话框）、applied（应用生成的自动化） */
const emit = defineEmits(['close', 'applied'])

const {
  name,
  triggerType,
  triggerEntity,
  triggerTo,
  triggerAt,
  sunEvent,
  zoneId,
  zoneEvent,
  actionKind,
  actionEntity,
  actionService,
  notifyMsg,
  triggerTypeHint,
  actionKindHint,
  apply,
} = useSimpleAutomationWizard(emit)

/** KeepAlive 失活时关掉向导，避免 body 上残留遮罩 */
onDeactivated(() => {
  if (props.open) emit('close')
})
</script>
