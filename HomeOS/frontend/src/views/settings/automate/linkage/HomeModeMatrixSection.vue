/**
 * 组件：HomeModeMatrixSection.vue
 *
 * 所属模块：frontend / src / views / settings / automate / linkage
 * 职责：安防 ↔ 家庭模式对照表。布防状态变更时按对照表激活对应家庭模式；写入显式映射时
 *      自动开启反向联动总开关。联动总开关见「跨模块联动」。
 * 关键依赖：
 *  - HOME_SECURITY_LINK_ROWS：安防↔家庭模式对照行定义
 *  - useLayoutStore：读写 securityModeLinks 映射
 *  - useChromeStore / fetchHomeModes：通知与家庭模式列表加载
 * 数据来源：layoutStore.securityModeLinks + 父级透传的 linkageSecurity / loading
 */
<script setup lang="ts">
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/HomeModeMatrixSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { onMounted, ref, computed } from 'vue'
import { Home, Loader2 } from '@lucide/vue'
import { HOME_SECURITY_LINK_ROWS } from '@homeos/shared'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { fetchHomeModes } from '@/services/api/home-modes'
import { normalizeCrudListResponse } from '@/utils/orchestrator/sync-issues.util'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'

// 入参：加载态、安防联动配置对象、是否隐藏标题
const props = defineProps({
  loading: { type: Boolean, default: false },
  linkageSecurity: { type: Object, required: true },
  hideHead: { type: Boolean, default: false },
})

// 对外事件：切换反向联动总开关、确保某开关开启
const emit = defineEmits(['toggle-flag', 'ensure-flag-on'])

const layoutStore = useLayoutStore()
const chrome = useChromeStore()
const modesLoading = ref(false)
const homeModes = ref<Array<{ id: string; name: string }>>([])

// 安防→家庭模式映射表，缺失时按四个标准布防 key 初始化
const links = computed(() => {
  const lc = layoutStore.layoutConfig
  if (!lc.securityModeLinks || typeof lc.securityModeLinks !== 'object') {
    lc.securityModeLinks = { armed_away: '', armed_home: '', armed_night: '', disarmed: '' }
  }
  return lc.securityModeLinks as Record<string, string>
})

const rows = HOME_SECURITY_LINK_ROWS
// 反向联动总开关是否已启用
const homeModeLinkOn = computed(() => !!props.linkageSecurity?.linkHomeModeOnSecurityChange)

// 加载家庭模式列表，用于对照表下拉选项
async function loadModes() {
  modesLoading.value = true
  try {
    const { data } = await fetchHomeModes()
    homeModes.value = normalizeCrudListResponse(data).rows.map((m) => ({
      id: String(m.id ?? ''),
      name: String(m.name ?? ''),
    }))
  } catch (e) {
    logger.warn('加载家庭模式列表失败', e)
    homeModes.value = []
    chrome.notify(getApiErrorMessage(e, '加载家庭模式列表失败'), 'warning')
  } finally {
    modesLoading.value = false
  }
}

onMounted(() => {
  void loadModes()
})

// 写入某布防状态对应的家庭模式映射；非空时自动打开反向联动总开关
function setLink(arming: string, value: unknown) {
  const next = String(value || '')
  links.value[arming] = next
  // 写入显式映射时自动打开反向联动，避免只配表开关却仍关着
  if (next) emit('ensure-flag-on', 'linkHomeModeOnSecurityChange')
}
</script>

<template>
  <section class="linkage-workspace-block linkage-workspace-block--matrix">
    <SettingsSectionHead
      v-if="!hideHead"
      :icon="Home"
      icon-class="linkage-workspace-head__icon--automation"
      orb-class="linkage-workspace-head__orb--automation"
      title="安防 ↔ 家庭模式对照"
      description="布防状态变更时可激活对应家庭模式。生活方式设备请配在家庭模式，安防场景动作仅留给外围设备。"
      bordered
    />

    <div v-else class="linkage-pane-toolbar">
      <p class="linkage-pane-toolbar__lead">
        {{ '布防变更时按对照表激活家庭模式；生活方式设备写在家庭模式，此处只映射关系。' }}
      </p>
    </div>

    <div class="linkage-workspace-block__content">
      <div
        :class="[
          'hm-sec-master',
          homeModeLinkOn && 'hm-sec-master--on',
        ]"
      >
        <div class="hm-sec-master__text">
          <span class="hm-sec-master__title">{{ '布防变更 → 家庭模式' }}</span>
          <span class="hm-sec-master__desc">{{
            homeModeLinkOn
              ? '已启用：按下方对照表或名称规则联动（回家/离家/睡眠）'
              : '未启用：手动布防不会切换家庭模式。打开开关，或在下方选择映射后自动开启'
          }}</span>
        </div>
        <button
          type="button"
          class="toggle-btn shrink-0"
          :class="{ on: homeModeLinkOn }"
          :disabled="loading"
          :aria-label="'布防变更 → 家庭模式'"
          @click="emit('toggle-flag', 'linkHomeModeOnSecurityChange')"
        >
          <div class="toggle-dot" :class="{ on: homeModeLinkOn }" />
        </button>
      </div>

      <div v-if="modesLoading" class="linkage-loading">
        <Loader2 class="w-5 h-5 animate-spin opacity-40" />
        <span>{{ '加载家庭模式…' }}</span>
      </div>
      <div v-else class="hm-sec-matrix">
        <div class="hm-sec-matrix__legend" aria-hidden="true">
          <span>{{ '安防状态' }}</span>
          <span>{{ '对应家庭模式' }}</span>
        </div>
        <div v-for="row in rows" :key="row.arming" class="hm-sec-matrix__row">
          <div class="hm-sec-matrix__arm">
            <span class="hm-sec-matrix__arm-label">{{ row.armingLabel }}</span>
            <span class="hm-sec-matrix__arm-key">{{ row.arming }}</span>
          </div>
          <HosSelect
            variant="home-mode"
            block
            class="hm-sec-matrix__select"
            :model-value="links[row.arming] || ''"
            @update:model-value="(v: unknown) => setLink(row.arming, v)"
          >
            <option value="">
              {{
                row.arming === 'disarmed'
                  ? '留空 = 退出家庭模式'
                  : `留空 = 按名称匹配（${row.homeModeHint}）`
              }}
            </option>
            <option v-for="m in homeModes" :key="m.id" :value="m.id">{{ m.name }}</option>
          </HosSelect>
        </div>
        <p class="linkage-footer-note">
          {{ '对照表写入当前显示方案，请点击页面「保存安防场景」后生效。' }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped src="./styles/HomeModeMatrixSection.css"></style>
