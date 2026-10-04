<!--
组件：SettingsAccessSecurityLockSection.vue
所属模块：frontend / src / views / settings / system
职责：设置锁定区段。配置设置页 PIN 锁定开关与 PIN 码，展示密码强度（百分比/等级/弱 PIN 提示）。
Props：
  - lockEnabled / pinLength / pinStrengthPercent / pinStrengthVariant / pinStrengthLabel / isWeakPin：锁定与 PIN 强度
  - sanitizePin / toggleSettingsLock：PIN 清理与开关切换
关键依赖：
  - VProgressBar：密码强度进度条
  - useLayoutStore：读写锁定配置
  - @lucide/vue 的 Lock / ShieldCheck
数据来源：父级透传的锁定状态与 useLayoutStore
-->
<template>
  <section :class="['access-security-pane', lockEnabled && 'access-security-pane--active']">
    <header class="access-security-pane__head">
      <div class="access-security-pane__head-main">
        <div class="settings-icon-orb shrink-0 asl-orb-accent">
          <Lock class="w-5 h-5 asl-icon-accent" />
        </div>
        <div class="min-w-0">
          <h3 class="access-security-pane__title">{{ '访客模式与设置锁' }}</h3>
          <p class="access-security-pane__desc">
            {{ '公共展示场景下，进入设置或修改布局需输入 4–6 位 PIN。' }}
          </p>
        </div>
      </div>
      <div class="access-security-pane__head-action">
        <span
          class="access-security-pane__status"
          :class="lockEnabled && 'access-security-pane__status--on'"
        >
          {{ lockEnabled ? '已启用' : '未开启' }}
        </span>
        <button
          type="button"
          class="toggle-btn access-security-toggle"
          :class="{ on: lockEnabled }"
          :aria-label="lockEnabled ? '关闭设置锁' : '启用设置锁'"
          @click="toggleSettingsLock"
        >
          <div class="toggle-dot" :class="{ on: lockEnabled }" />
        </button>
      </div>
    </header>

    <p v-if="layoutStore.layoutDirty" class="settings-inline-hint settings-inline-hint--amber mt-4">
      <Lock class="settings-inline-hint__icon" />
      <span>{{ '设置锁或 PIN 变更需点击侧边栏「保存全部」后才会持久化。' }}</span>
    </p>

    <div class="access-security-pane__body">
      <Transition name="access-expand" mode="out-in">
        <div v-if="lockEnabled" key="pin" class="access-pin-panel">
          <label for="pinCode" class="access-pin-panel__label">{{ '访问 PIN' }}</label>
          <div class="access-pin-row">
            <div class="access-pin-boxes" @click="focusPinInput">
              <span
                v-for="i in 6"
                :key="i"
                :class="[
                  'access-pin-box',
                  i <= pinLength && 'access-pin-box--filled',
                  i === pinLength + 1 && 'access-pin-box--cursor',
                ]"
              >
                <span v-if="i <= pinLength" class="access-pin-box__dot" />
              </span>
            </div>
            <input
              id="pinCode"
              ref="pinInputRef"
              v-model="layoutStore.layoutConfig.settingsLock.pin"
              type="password"
              maxlength="6"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              class="access-pin-input-sr"
              @input="sanitizePin"
            />
          </div>
          <div class="access-pin-strength">
            <VProgressBar :value="pinStrengthPercent" :variant="pinStrengthVariant" size="xs" />
            <span class="access-pin-strength__label">{{ pinStrengthLabel }}</span>
          </div>
          <p v-if="isWeakPin" class="access-pin-hint access-pin-hint--warn">
            <ShieldCheck class="w-3.5 h-3.5 asl-icon-warn shrink-0" />
            {{ 'PIN 过于简单，请换用不易猜测的组合' }}
          </p>
        </div>
        <div v-else key="idle" class="access-pin-idle">
          <div class="access-pin-idle__orb">
            <Lock class="w-6 h-6 asl-icon-accent-soft" />
          </div>
          <p class="access-pin-idle__title">{{ '设置锁未开启' }}</p>
          <p class="access-pin-idle__desc">{{ '开启后可为大屏终端设置入口配置 4–6 位数字 PIN' }}</p>
        </div>
      </Transition>
    </div>

    <footer class="access-security-pane__foot">
      <ShieldCheck class="w-3.5 h-3.5 asl-icon-success shrink-0" />
      <span>{{ 'PIN 保存在本地布局配置，用于保护设置入口' }}</span>
    </footer>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { Lock, ShieldCheck } from '@lucide/vue'
import { useLayoutStore } from '@/stores/layout.store'

defineProps({
  lockEnabled: Boolean,
  pinLength: { type: Number, default: 0 },
  pinStrengthPercent: { type: Number, default: 0 },
  pinStrengthVariant: { type: String, default: '' },
  pinStrengthLabel: { type: String, default: '' },
  isWeakPin: Boolean,
  sanitizePin: { type: Function, required: true },
  toggleSettingsLock: { type: Function, required: true },
})

const layoutStore = useLayoutStore()
const pinInputRef = ref(null)
function focusPinInput() {
  pinInputRef.value?.focus()
}
</script>

<style scoped src="./styles/settings-access-security-lock-section.css"></style>
