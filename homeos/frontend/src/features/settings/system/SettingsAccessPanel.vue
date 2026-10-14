<!--
  访问控制页签（恢复原 homeos「访客模式与设置锁」区块）。提供设置锁启停开关、
  4–6 位访问 PIN 的分段输入、PIN 强度评估与弱口令提示；配置随侧栏全局「保存全部」持久化。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="access"
    icon-key="user"
    accent="var(--module-accent-admin)"
    layout="single"
    page-class="access-hub"
    body-class="access-hub__body"
  >
    <div class="settings-hub-section access-page">
      <SettingsCard static extra-class="access-card">
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
                :aria-pressed="lockEnabled"
                @click="toggleSettingsLock"
              >
                <div class="toggle-dot" :class="{ on: lockEnabled }" />
              </button>
            </div>
          </header>

          <p
            v-if="layoutStore.layoutDirty"
            class="settings-inline-hint settings-inline-hint--amber mt-4"
          >
            <Lock class="settings-inline-hint__icon" />
            <span>{{ '设置锁或 PIN 变更需点击侧边栏「保存全部」后才会持久化。' }}</span>
          </p>

          <div class="access-security-pane__body">
            <Transition name="access-expand" mode="out-in">
              <div v-if="showPinEditor" key="pin" class="access-pin-panel">
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
                    :value="pinValue"
                    type="password"
                    maxlength="6"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    autocomplete="off"
                    class="access-pin-input-sr"
                    aria-label="访问 PIN"
                    @input="sanitizePin"
                  />
                </div>
                <div class="access-pin-strength">
                  <VProgressBar
                    :value="pinStrengthPercent"
                    :variant="pinStrengthVariant"
                    size="xs"
                  />
                  <span class="access-pin-strength__label">{{ pinStrengthLabel }}</span>
                </div>
                <p v-if="isWeakPin" class="access-pin-hint access-pin-hint--warn">
                  <ShieldCheck class="w-3.5 h-3.5 asl-icon-warn shrink-0" />
                  {{ 'PIN 过于简单，请换用不易猜测的组合' }}
                </p>
                <p v-else-if="!canEnableLock" class="access-pin-hint access-pin-hint--warn">
                  <ShieldCheck class="w-3.5 h-3.5 asl-icon-warn shrink-0" />
                  {{ pinRequirementHint }}
                </p>
                <p v-if="!lockEnabled" class="access-pin-hint access-pin-hint--info">
                  <Lock class="w-3.5 h-3.5 asl-icon-accent-soft shrink-0" />
                  {{ '设置 4–6 位 PIN 后，打开上方开关并「保存全部」即可启用。' }}
                </p>
              </div>
              <div v-else key="idle" class="access-pin-idle">
                <div class="access-pin-idle__orb">
                  <Lock class="w-6 h-6 asl-icon-accent-soft" />
                </div>
                <p class="access-pin-idle__title">{{ '设置锁未开启' }}</p>
                <p class="access-pin-idle__desc">
                  {{ '开启后可为大屏终端设置入口配置 4–6 位数字 PIN' }}
                </p>
                <button type="button" class="settings-btn-accent text-xs mt-3" @click="openPinEditor">
                  {{ '设置访问 PIN' }}
                </button>
              </div>
            </Transition>
          </div>

          <footer class="access-security-pane__foot">
            <ShieldCheck class="w-3.5 h-3.5 asl-icon-success shrink-0" />
            <span>{{ 'PIN 保存在本地布局配置，仅用于保护本机设置入口' }}</span>
          </footer>
        </section>
      </SettingsCard>
    </div>
  </SettingsPageShell>
</template>

<script setup>
/**
 * 访问控制页签：设置锁启停 + 访问 PIN 配置。
 * 禁用态默认展示引导卡，点击「设置访问 PIN」展开输入区，避免「未设 PIN 无法启用」的死循环。
 */
import { computed, ref } from 'vue'
import { Lock, ShieldCheck } from '@lucide/vue'
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { useAccessPanel } from '@/features/settings/composables/system/access-panel.internals'

defineProps({ activeTab: { type: String, default: 'access' } })

const {
  layoutStore,
  pinInputRef,
  lockEnabled,
  pinValue,
  pinLength,
  isWeakPin,
  pinStrengthPercent,
  pinStrengthLabel,
  pinStrengthVariant,
  canEnableLock,
  pinRequirementHint,
  toggleSettingsLock,
  sanitizePin,
  focusPinInput,
} = useAccessPanel()

/** 禁用态下是否已手动展开 PIN 输入区（避免未设 PIN 时无法启用） */
const pinEditorOpen = ref(false)
/** 是否展示 PIN 输入区：已启用，或用户主动展开 */
const showPinEditor = computed(() => lockEnabled.value || pinEditorOpen.value)

/** 展开 PIN 输入区并聚焦，便于直接输入 */
function openPinEditor() {
  pinEditorOpen.value = true
  requestAnimationFrame(() => focusPinInput())
}
</script>

<style scoped src="./styles/access-panel.css"></style>
