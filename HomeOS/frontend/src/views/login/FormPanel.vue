<!--
组件：LoginFormPanel.vue
所属模块：frontend / src / views
职责：登录页右侧表单区——账号/密码/MFA 输入 + 加载/错误态 + 唤醒中占位。
数据来源：登录态由父级管理，本组件通过 v-model 与父级双向同步表单字段。
Props：
  - checkSetup：是否正在唤醒中枢（true 时显示 spinner 占位）。
  - requiresMfa：是否需要双因素验证码（控制 MFA 输入框显隐）。
  - errorMsg：错误文案，非空时显示错误提示。
  - isLoading：登录中态，禁用提交按钮并显示「正在进入中枢...」。
  - handleLogin：父级注入的提交处理函数（async）。
v-model：
  - username / password / mfaCode / showPassword：表单字段与密码显隐开关。
关键交互：
  - 表单 submit.prevent 触发 handleLogin；
  - 密码字段右侧按钮切换明文/密文；
  - checkSetup 由 true 转 false 时自动聚焦用户名输入框（nextTick + watch immediate）。
-->
<template>
  <aside class="login-dock">
    <div v-if="checkSetup" class="login-boot">
      <div class="login-spinner" />
      <p>正在唤醒家居中枢...</p>
    </div>

    <div v-else class="login-panel animate-fade-in-up">
      <span class="login-panel__edge" aria-hidden="true" />
      <span class="login-panel__corner login-panel__corner--tl" aria-hidden="true" />
      <span class="login-panel__corner login-panel__corner--tr" aria-hidden="true" />
      <span class="login-panel__corner login-panel__corner--bl" aria-hidden="true" />
      <span class="login-panel__corner login-panel__corner--br" aria-hidden="true" />

      <div class="login-panel__head">
        <div class="login-panel__eyebrow-row">
          <p class="login-panel__eyebrow">管理登录</p>
          <span class="login-panel__secure">
            <i class="login-panel__secure-dot" aria-hidden="true" />
            本地鉴权
          </span>
        </div>
        <h2 class="login-panel__title">欢迎回家</h2>
        <p class="login-panel__desc">验证身份后，即可接管设备、场景与自动化。</p>
      </div>

      <div class="login-hub" aria-hidden="true">
        <span class="login-hub__scan" />
        <div class="login-hub__item login-hub__item--light">
          <div class="login-hub__top">
            <i class="login-hub__dot" />
            <span class="login-hub__code">LT</span>
          </div>
          <span class="login-hub__name">照明</span>
        </div>
        <div class="login-hub__item login-hub__item--climate">
          <div class="login-hub__top">
            <i class="login-hub__dot" />
            <span class="login-hub__code">CL</span>
          </div>
          <span class="login-hub__name">气候</span>
        </div>
        <div class="login-hub__item login-hub__item--secure">
          <div class="login-hub__top">
            <i class="login-hub__dot" />
            <span class="login-hub__code">SF</span>
          </div>
          <span class="login-hub__name">安防</span>
        </div>
        <div class="login-hub__item login-hub__item--scene">
          <div class="login-hub__top">
            <i class="login-hub__dot" />
            <span class="login-hub__code">SC</span>
          </div>
          <span class="login-hub__name">场景</span>
        </div>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="login-field">
          <label for="username">管理员账号</label>
          <div class="login-field__control">
            <input
              id="username"
              ref="usernameInput"
              v-model="username"
              type="text"
              autocomplete="username"
              class="login-input"
              placeholder="输入家庭管理员账号"
              required
            />
          </div>
        </div>

        <div class="login-field">
          <label for="password">访问密码</label>
          <div class="login-field__control login-pw">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              class="login-input login-input--secret"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              class="login-pw__btn"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="!showPassword" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div v-if="requiresMfa" class="login-field">
          <label for="mfaCode">双因素验证码</label>
          <div class="login-field__control">
            <input
              id="mfaCode"
              v-model="mfaCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              autocomplete="one-time-code"
              class="login-input login-input--otp"
              placeholder="000000"
              required
            />
          </div>
        </div>

        <Transition name="fade">
          <div v-if="errorMsg" class="login-error" role="alert">
            <p>{{ errorMsg }}</p>
          </div>
        </Transition>

        <button type="submit" :disabled="isLoading" class="login-submit">
          <span class="login-submit__sheen" aria-hidden="true" />
          <span>{{ isLoading ? '正在进入中枢...' : '进入管理中枢' }}</span>
        </button>
      </form>

      <div class="login-panel__copy">
        <div class="login-panel__meta">
          <span>安全会话</span>
          <i class="login-panel__meta-sep" aria-hidden="true" />
          <span>局域网优先</span>
          <i class="login-panel__meta-sep" aria-hidden="true" />
          <span>端到端就绪</span>
        </div>
        <p>版权所有：一埖一丗堺</p>
        <p>程序开发：方长鑫</p>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'

const props = defineProps({
  checkSetup: { type: Boolean, required: true },
  requiresMfa: { type: Boolean, required: true },
  errorMsg: { type: String, required: true },
  isLoading: { type: Boolean, required: true },
  handleLogin: { type: Function, required: true },
})

const username = defineModel('username', { type: String, required: true })
const password = defineModel('password', { type: String, required: true })
const mfaCode = defineModel('mfaCode', { type: String, required: true })
const showPassword = defineModel('showPassword', { type: Boolean, required: true })

// 用户名输入框引用：唤醒完成后自动聚焦，便于直接键盘输入
const usernameInput = ref(null)

// 唤醒结束（checkSetup 转 false）时聚焦用户名框；immediate 处理首次已就绪场景
watch(
  () => props.checkSetup,
  async (checking) => {
    if (!checking) {
      await nextTick()
      usernameInput.value?.focus?.()
    }
  },
  { immediate: true },
)
</script>
