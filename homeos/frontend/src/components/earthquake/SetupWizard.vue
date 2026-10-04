/**
 * @file SetupWizard.vue
 * @module components/earthquake
 * @brief 地震预警配置向导弹窗
 *
 * 职责：
 * - 三步引导用户完成地震预警配置：连接 Home Assistant（地址/Token/测试）、
 *   选择家庭位置（经纬度/城市预设/从 HA 同步）、确认并保存
 * - 顶部进度指示（1/2/3），底部提供上一步/下一步/跳过/完成操作
 * - 所有状态与逻辑由 useEarthquakeSetupWizard 组合式函数统一管理，组件仅负责展示与事件透传
 *
 * 依赖：
 * - @lucide/vue（图标库）
 * - useEarthquakeSetupWizard（向导逻辑聚合）
 * - 外部样式 ./styles/earthquake-setup-wizard.css
 */
/**
 * 组件 Props
 * @property {boolean} modelValue - 向导开关（v-model，默认 false）
 */
/**
 * 事件
 * @emits update:modelValue - 开关状态变更（v-model 同步）
 * @emits close             - 向导关闭
 */
<template>
  <Teleport to="body">
    <div v-if="open" class="eew-wizard-backdrop">
      <div class="eew-wizard-panel">
        <header class="eew-wizard-head">
          <div class="flex items-center gap-3">
            <div class="eew-wizard-icon">
              <TriangleAlert class="w-5 h-5 esw-icon-warn" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">HomeOS · 地震预警配置向导</h2>
              <p class="text-xs esw-text-muted">地震预警配置向导</p>
            </div>
          </div>
          <div class="eew-wizard-progress">
            <div
              v-for="n in 3"
              :key="n"
              class="eew-wizard-progress__seg"
              :class="{ 'eew-wizard-progress__seg--on': n <= step }"
            />
            <span class="text-[12px] esw-text-muted font-bold">{{ step }}/3</span>
          </div>
        </header>

        <div class="eew-wizard-body">
          <div v-if="step === 1" class="space-y-5">
            <div>
              <h3 class="text-base font-bold text-white mb-1">连接 Home Assistant</h3>
              <p class="text-sm esw-text-muted">
                配置 HA 地址与长期访问令牌，用于同步家庭坐标与设备状态。
              </p>
            </div>
            <div v-if="systemHaConfigured" class="eew-wizard-system-badge">
              <CheckCircle2 class="w-4 h-4 shrink-0" />
              <span>已读取系统连接配置{{ entitiesStore.connected ? '，HA 当前在线' : '' }}</span>
            </div>
            <label class="block">
              <span class="text-xs font-bold esw-text-muted uppercase tracking-wider"
                >Home Assistant 地址</span
              >
              <input
                v-model="haUrl"
                class="eew-wizard-input"
                placeholder="http://192.168.100.200:8123"
              />
            </label>
            <label class="block">
              <span class="text-xs font-bold esw-text-muted uppercase tracking-wider"
                >长期访问令牌</span
              >
              <div v-if="!showTokenInput && systemHaConfigured" class="eew-wizard-token-mask">
                <span>••••••••••••••••••••••••••••••••</span>
                <span class="eew-wizard-token-mask__badge">已安全配置</span>
              </div>
              <input
                v-else
                v-model="haToken"
                type="password"
                class="eew-wizard-input font-mono"
                placeholder="eyJhbGciOi..."
              />
              <button
                v-if="!showTokenInput && systemHaConfigured"
                type="button"
                class="eew-wizard-token-edit"
                @click="showTokenInput = true"
              >
                修改密钥
              </button>
            </label>
            <button
              type="button"
              class="eew-wizard-test-btn"
              :disabled="testingHa || !canTestHa"
              @click="testHa"
            >
              <Loader2 v-if="testingHa" class="w-4 h-4 animate-spin" />
              <Plug v-else class="w-4 h-4" />
              {{ testingHa ? '测试中…' : '测试 HA 连接' }}
            </button>
            <p v-if="haTestStatus === 'success'" class="text-xs esw-text-success">
              连接成功{{ haVersion ? ` (v${haVersion})` : '' }}
            </p>
            <p v-else-if="haTestStatus === 'failed'" class="text-xs esw-text-danger">
              {{ haTestMessage || '连接失败，请检查 URL 与 Token' }}
            </p>
          </div>

          <div v-else-if="step === 2" class="space-y-5">
            <div>
              <h3 class="text-base font-bold text-white mb-1">设置家庭地理坐标</h3>
              <p class="text-sm esw-text-muted">
                地震预警需要精确的家庭经纬度，以计算震中距离与横波到达倒计时。
              </p>
            </div>
            <button
              type="button"
              class="eew-wizard-sync-btn"
              :disabled="syncing"
              @click="syncFromHa"
            >
              <Loader2 v-if="syncing" class="w-4 h-4 animate-spin" />
              <Send v-else class="w-4 h-4" />
              {{ syncing ? '同步中…' : '从 HA 自动同步家庭坐标' }}
            </button>
            <p v-if="syncing" class="text-xs esw-text-muted">
              正在自动读取 Home Assistant 中的家庭坐标…
            </p>
            <div class="flex items-center gap-3">
              <div class="flex-1 h-px bg-white/10" />
              <span class="text-xs esw-text-muted uppercase">或</span>
              <div class="flex-1 h-px bg-white/10" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label class="block">
                <span class="text-xs font-bold esw-text-muted uppercase tracking-wider"
                  >家庭纬度 (LATITUDE)</span
                >
                <input v-model="latitude" class="eew-wizard-input" placeholder="30.5728" />
              </label>
              <label class="block">
                <span class="text-xs font-bold esw-text-muted uppercase tracking-wider"
                  >家庭经度 (LONGITUDE)</span
                >
                <input v-model="longitude" class="eew-wizard-input" placeholder="104.0668" />
              </label>
            </div>
            <div>
              <h4 class="text-sm font-semibold text-white mb-3">快捷城市坐标选择</h4>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <button
                  v-for="city in cityPresets"
                  :key="city.name"
                  type="button"
                  class="eew-wizard-city"
                  @click="selectCity(city)"
                >
                  <MapPin class="w-3 h-3" />
                  {{ city.name }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div>
              <h3 class="text-base font-bold text-white mb-1">确认配置</h3>
              <p class="text-sm esw-text-muted">
                保存后将启用地震预警，并通过 Wolfx 实时接收预警数据。
              </p>
            </div>
            <div class="eew-wizard-summary">
              <div>
                <span class="esw-text-muted">HA 地址</span
                ><span class="text-white">{{ haUrl || haCfg.url || '—' }}</span>
              </div>
              <div>
                <span class="esw-text-muted">家庭纬度</span
                ><span class="text-white">{{ latitude || cfg.latitude || '自动同步' }}</span>
              </div>
              <div>
                <span class="esw-text-muted">家庭经度</span
                ><span class="text-white">{{ longitude || cfg.longitude || '自动同步' }}</span>
              </div>
              <div>
                <span class="esw-text-muted">最低震级</span
                ><span class="text-white">M{{ cfg.minMagnitude }}</span>
              </div>
              <div>
                <span class="esw-text-muted">最大距离</span
                ><span class="text-white">{{ cfg.maxDistance }} km</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="eew-wizard-foot">
          <button type="button" class="eew-wizard-skip" @click="skip">
            <FastForward class="w-3.5 h-3.5" />
            跳过
          </button>
          <div class="flex items-center gap-2">
            <button v-if="step > 1" type="button" class="eew-wizard-nav" @click="step--">
              <ChevronLeft class="w-4 h-4" />
              上一步
            </button>
            <button v-if="step < 3" type="button" class="eew-wizard-next" @click="nextStep">
              下一步
              <ChevronRight class="w-4 h-4" />
            </button>
            <button v-else type="button" class="eew-wizard-next" :disabled="saving" @click="finish">
              <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
              {{ saving ? '保存中…' : '完成配置' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 职责：实现 SetupWizard 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Loader2,
  MapPin,
  Plug,
  Send,
  TriangleAlert,
} from '@lucide/vue'
import { useEarthquakeSetupWizard } from '@/composables/earthquake/useEarthquakeSetupWizard'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'close'])

const {
  open,
  step,
  haUrl,
  haToken,
  latitude,
  longitude,
  showTokenInput,
  testingHa,
  haTestStatus,
  haTestMessage,
  haVersion,
  syncing,
  saving,
  cityPresets,
  cfg,
  haCfg,
  systemHaConfigured,
  canTestHa,
  entitiesStore,
  selectCity,
  testHa,
  syncFromHa,
  nextStep,
  finish,
  skip,
} = useEarthquakeSetupWizard(props, emit)
</script>

<style scoped src="./styles/earthquake-setup-wizard.css"></style>
