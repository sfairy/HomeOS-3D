<!--
组件：LoginFormPanel.vue
所属模块：frontend / src / views / login
职责：登录页右侧玻璃登录坞——账号/密码/MFA 输入 + 加载/错误态 + 唤醒中占位。
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
说明：样式来自 /static/scene/panel.css 的共享 hos-* 类，与激活页 / 商店 / 3D 前端同源。
-->
<template>
  <main class="hos-dock">
    <section v-if="checkSetup" class="hos-panel hos-rise login-boot" aria-live="polite">
      <span class="login-boot__spinner" aria-hidden="true" />
      <p>正在唤醒家居中枢…</p>
    </section>

    <section v-else class="hos-panel hos-rise">
      <span class="hos-panel__edge" aria-hidden="true" />
      <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true" />
      <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true" />
      <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true" />
      <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true" />

      <div class="hos-panel__head">
        <div class="hos-eyebrow-row">
          <p class="hos-eyebrow">管理登录</p>
          <span class="hos-secure">
            <i class="hos-secure-dot" aria-hidden="true" />
            本地鉴权
          </span>
        </div>
        <h1>欢迎回家</h1>
        <p class="hos-panel__desc">验证身份后，即可接管设备、场景与自动化。</p>
      </div>

      <div class="hos-hub" aria-hidden="true">
        <span class="hos-hub__scan" />
        <div class="hos-hub__item hos-hub__item--light">
          <span class="hos-hub__code">LT</span>
          <span class="hos-hub__name">照明</span>
        </div>
        <div class="hos-hub__item hos-hub__item--climate">
          <span class="hos-hub__code">CL</span>
          <span class="hos-hub__name">气候</span>
        </div>
        <div class="hos-hub__item hos-hub__item--secure">
          <span class="hos-hub__code">SF</span>
          <span class="hos-hub__name">安防</span>
        </div>
        <div class="hos-hub__item hos-hub__item--scene">
          <span class="hos-hub__code">SC</span>
          <span class="hos-hub__name">场景</span>
        </div>
      </div>

      <form class="hos-form" @submit.prevent="handleLogin">
        <p v-if="errorMsg" class="hos-msg is-err" role="alert">{{ errorMsg }}</p>

        <div class="hos-field">
          <div class="hos-label-row">
            <label for="login-username">管理员账号</label>
          </div>
          <div class="hos-control">
            <input
              id="login-username"
              ref="usernameInput"
              v-model="username"
              type="text"
              autocomplete="username"
              placeholder="输入家庭管理员账号"
              required
            />
          </div>
        </div>

        <div class="hos-field">
          <div class="hos-label-row">
            <label for="login-password">访问密码</label>
          </div>
          <div class="hos-control hos-password-field">
            <input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div v-if="requiresMfa" class="hos-field">
          <div class="hos-label-row">
            <label for="login-mfa">双因素验证码</label>
            <span class="hos-hint">6 位动态码</span>
          </div>
          <div class="hos-control">
            <input
              id="login-mfa"
              v-model="mfaCode"
              type="text"
              inputmode="numeric"
              maxlength="6"
              autocomplete="one-time-code"
              placeholder="000000"
              required
            />
          </div>
        </div>

        <div class="hos-actions">
          <button class="hos-btn-primary" type="submit" :disabled="isLoading">
            {{ isLoading ? '正在进入中枢…' : '进入管理中枢' }}
          </button>
        </div>
      </form>

      <div class="hos-panel__copy">
        <div class="hos-panel__meta">
          <span>安全会话</span>
          <i class="hos-panel__meta-sep" aria-hidden="true" />
          <span>局域网优先</span>
          <i class="hos-panel__meta-sep" aria-hidden="true" />
          <span>端到端就绪</span>
        </div>
        <p>版权所有：一埖一丗堺</p>
        <p>程序开发：方长鑫</p>
      </div>
    </section>
  </main>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

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

<style scoped>
/* 唤醒占位：仅本组件在共享场景坞内的临时加载态，不属于场景令牌 */
.login-boot {
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 220px;
  gap: 16px;
  color: var(--hos-accent-bright);
}

.login-boot p {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.08em;
}

.login-boot__spinner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(var(--hos-accent-rgb), 0.25);
  border-top-color: var(--hos-accent);
  animation: login-boot-spin 0.9s linear infinite;
}

@keyframes login-boot-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
