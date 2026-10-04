<!--
组件：SettingsAccessSecurityMfaSection.vue
所属模块：frontend / src / views / settings / system
职责：MFA（多因素认证）区段。展示 MFA 启用状态与二维码，支持开启/确认/关闭 MFA 流程。
defineModel：
  - showChangePassword / mfaConfirmCode / mfaDisableCode：修改密码开关与 MFA 验证码
Props：
  - lockEnabled / pinLength / isWeakPin：锁定状态
  - users / mfaEnabled / mfaQr：成员列表与 MFA 状态
  - startMfaSetup / confirmMfaSetup / disableMfa：MFA 流程方法
关键依赖：@lucide/vue 的 ShieldCheck / KeyRound
数据来源：父级透传的 MFA 状态与方法
-->
<template>
  <section class="access-security-pane access-security-pane--account">
    <header class="access-security-pane__head">
      <div class="access-security-pane__head-main">
        <div class="settings-icon-orb shrink-0 asm-orb-danger">
          <ShieldCheck class="w-5 h-5 asm-icon-danger" />
        </div>
        <div class="min-w-0">
          <h3 class="access-security-pane__title">{{ '账号安全与隐私' }}</h3>
          <p class="access-security-pane__desc">
            {{ '修改管理员登录密码，操作后所有活跃会话将失效。' }}
          </p>
        </div>
      </div>
      <div class="access-security-pane__head-action">
        <button type="button" class="access-credential-btn" @click="showChangePassword = true">
          <KeyRound class="w-4 h-4" />
          {{ '修改凭证' }}
        </button>
      </div>
    </header>

    <div class="access-security-pane__body access-security-pane__body--stack">
      <div class="access-check-grid">
        <div :class="['access-check-item', lockEnabled && 'access-check-item--ok']">
          <span class="access-check-item__icon">{{ lockEnabled ? '✓' : '○' }}</span>
          <span>{{ '设置锁保护终端' }}</span>
        </div>
        <div
          :class="['access-check-item', pinLength >= 4 && !isWeakPin && 'access-check-item--ok']"
        >
          <span class="access-check-item__icon">{{
            pinLength >= 4 && !isWeakPin ? '✓' : '○'
          }}</span>
          <span>{{ 'PIN ≥ 4 位' }}</span>
        </div>
        <div :class="['access-check-item', (users?.length ?? 0) >= 2 && 'access-check-item--ok']">
          <span class="access-check-item__icon">{{ (users?.length ?? 0) >= 2 ? '✓' : '○' }}</span>
          <span>{{ '多用户角色' }}</span>
        </div>
        <div :class="['access-check-item', mfaEnabled && 'access-check-item--ok']">
          <span class="access-check-item__icon">{{ mfaEnabled ? '✓' : '○' }}</span>
          <span>{{ '双因素认证' }}</span>
        </div>
      </div>

      <div class="access-mfa-panel">
        <div class="access-mfa-panel__head">
          <span class="access-mfa-panel__title">{{ '双因素认证 (TOTP)' }}</span>
          <span v-if="mfaEnabled" class="access-mfa-enabled-badge">
            <ShieldCheck class="w-3 h-3" /> {{ '已启用' }}
          </span>
        </div>
        <div class="access-mfa-panel__steps">
          <template v-if="!mfaEnabled && !mfaQr">
            <button
              type="button"
              class="access-credential-btn access-credential-btn--ghost"
              @click="startMfaSetup"
            >
              <ShieldCheck class="w-4 h-4" />
              {{ '生成验证器二维码' }}
            </button>
          </template>
          <template v-else-if="mfaQr && !mfaEnabled">
            <div class="access-mfa-setup">
              <div class="access-mfa-qr-wrap">
                <img :src="mfaQr" :alt="'MFA 验证器二维码'" class="w-24 h-24 rounded-lg" />
              </div>
              <div class="access-mfa-setup__form">
                <input
                  v-model="mfaConfirmCode"
                  maxlength="6"
                  :placeholder="'6 位验证码'"
                  class="settings-field"
                />
                <button
                  type="button"
                  class="access-credential-btn access-credential-btn--ghost"
                  @click="confirmMfaSetup"
                >
                  {{ '确认启用' }}
                </button>
              </div>
            </div>
          </template>
          <template v-else-if="mfaEnabled">
            <div class="access-mfa-setup__form access-mfa-setup__form--row">
              <input
                v-model="mfaDisableCode"
                maxlength="6"
                :placeholder="'验证码关闭 MFA'"
                class="settings-field"
              />
              <button
                type="button"
                class="access-credential-btn access-credential-btn--ghost"
                @click="disableMfa"
              >
                {{ '关闭 MFA' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ShieldCheck, KeyRound } from '@lucide/vue'

defineProps({
  lockEnabled: Boolean,
  pinLength: { type: Number, default: 0 },
  isWeakPin: Boolean,
  users: { type: Array, default: () => [] },
  mfaEnabled: Boolean,
  mfaQr: { type: String, default: '' },
  startMfaSetup: { type: Function, required: true },
  confirmMfaSetup: { type: Function, required: true },
  disableMfa: { type: Function, required: true },
})

const showChangePassword = defineModel('showChangePassword', { type: Boolean, default: false })
const mfaConfirmCode = defineModel('mfaConfirmCode', { type: String, default: '' })
const mfaDisableCode = defineModel('mfaDisableCode', { type: String, default: '' })
</script>

<style scoped src="./styles/settings-access-security-mfa-section.css"></style>
