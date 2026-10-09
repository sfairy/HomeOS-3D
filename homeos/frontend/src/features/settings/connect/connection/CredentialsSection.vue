<!--
  ConnectionCredentials区域组件
  所属模块：设置 - 连接凭证
  职责：HA 局域网/外网地址与令牌录入、探测与反馈
-->
<template>
  <div class="conn-cred">
    <section class="conn-cred-block">
      <header class="conn-cred-block__head">
        <div class="conn-cred-block__icon">
          <Globe class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <h4 class="conn-cred-block__title">{{ 'HA 服务地址' }}</h4>
          <p class="conn-cred-block__desc">
            {{ '优先连局域网；不通时自动切外网，并周期探测以便切回' }}
          </p>
        </div>
      </header>

      <div class="conn-cred-url-grid">
        <div class="conn-cred-field">
          <div class="conn-cred-field__meta">
            <span class="conn-cred-field__label">{{ 'HA 局域网地址' }}</span>
            <span class="conn-cred-pill conn-cred-pill--primary">{{ '优先' }}</span>
          </div>
          <div class="conn-cred-field-row">
            <input
              v-model="draft.url"
              type="text"
              class="settings-field conn-cred-input"
              :placeholder="'例如: http://192.168.1.100:8123'"
            />
            <button
              type="button"
              class="conn-cred-icon-btn"
              :title="'复制 HA 局域网地址'"
              :aria-label="'复制 HA 局域网地址'"
              @click="copyHaUrl"
            >
              <Copy class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="conn-cred-field">
          <div class="conn-cred-field__meta">
            <span class="conn-cred-field__label">{{ 'HA 外网地址' }}</span>
            <span class="conn-cred-pill">{{ '可选' }}</span>
          </div>
          <div class="conn-cred-field-row">
            <input
              v-model="draft.fallbackUrl"
              type="text"
              class="settings-field conn-cred-input"
              :placeholder="'例如: https://ha.example.com'"
            />
            <button
              type="button"
              class="conn-cred-icon-btn"
              :title="'复制 HA 外网地址'"
              :aria-label="'复制 HA 外网地址'"
              @click="copyHaFallbackUrl"
            >
              <Copy class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="conn-cred-block conn-cred-block--token">
      <header class="conn-cred-block__head">
        <div class="conn-cred-block__icon">
          <KeyRound class="w-4 h-4" />
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="conn-cred-block__title">{{ '长效访问令牌' }}</h4>
          <p class="conn-cred-block__desc">{{ 'HA 用户配置 → 长期访问令牌' }}</p>
        </div>
      </header>

      <div
        class="conn-cred-token-secure"
        v-if="!showTokenInput && hasToken"
      >
        <div class="conn-cred-token-secure__shield">
          <ShieldCheck class="w-4 h-4" />
        </div>
        <div class="conn-cred-token-secure__body">
          <div class="conn-cred-token-secure__row">
            <span class="conn-cred-token-secure__label">{{ '令牌已加密存储' }}</span>
            <span class="conn-cred-token-secure__badge">{{ '已就绪' }}</span>
          </div>
          <p class="conn-cred-token-secure__hint">
            {{ '保存与测试连接时自动使用，无需重新粘贴' }}
          </p>
        </div>
        <button
          type="button"
          class="conn-cred-token-secure__edit"
          @click="$emit('update:showTokenInput', true)"
        >
          <Pencil class="w-3.5 h-3.5" />
          <span>{{ '更换' }}</span>
        </button>
      </div>

      <textarea
        v-else
        v-model="draft.token"
        rows="2"
        class="settings-field conn-cred-textarea resize-none font-mono"
        :placeholder="hasToken ? '留空表示沿用已保存的令牌' : '在此粘贴 HA 生成的 Token...'"
      />
    </section>

    <section class="conn-cred-test">
      <div class="conn-cred-test__main">
        <div class="conn-cred-test__icon">
          <PlugZap class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <p class="conn-cred-test__title">{{ '连接探测' }}</p>
          <p class="conn-cred-test__hint">
            {{
              hasToken
                ? '从后端探测：先测局域网，不通再测外网（与浏览器本机可达无关）'
                : '填写地址与令牌后可由后端探测连通性'
            }}
          </p>
        </div>
        <button
          type="button"
          class="conn-cred-test__btn"
          :disabled="testing || saving"
          @click="testConnection"
        >
          <Loader2 v-if="testing" class="w-4 h-4 animate-spin" />
          <PlugZap v-else class="w-4 h-4" />
          {{ testing ? '探测中…' : '测试连接' }}
        </button>
      </div>

      <div
        v-if="testResult"
        :class="[
          'conn-cred-feedback',
          testResult.ok ? 'conn-cred-feedback--ok' : 'conn-cred-feedback--err',
        ]"
      >
        <CheckCircle2 v-if="testResult.ok" class="w-4 h-4 shrink-0" />
        <AlertCircle v-else class="w-4 h-4 shrink-0" />
        <span>
          {{ testResult.message
          }}{{ testResult.ha_version ? `（HA ${testResult.ha_version}）` : '' }}
        </span>
      </div>

      <div
        v-if="saveFeedback"
        :class="[
          'conn-cred-feedback',
          saveFeedback.ok
            ? 'conn-cred-feedback--ok'
            : saveFeedback.ok === false
              ? 'conn-cred-feedback--err'
              : 'conn-cred-feedback--warn',
        ]"
      >
        <CheckCircle2 v-if="saveFeedback.ok" class="w-4 h-4 shrink-0" />
        <AlertCircle v-else-if="saveFeedback.ok === false" class="w-4 h-4 shrink-0" />
        <Loader2 v-else class="w-4 h-4 shrink-0 animate-spin" />
        <span>{{ saveFeedback.message }}</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import {
  PlugZap,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Globe,
  KeyRound,
  Pencil,
  ShieldCheck,
} from '@lucide/vue'

defineProps({
  /** 表单草稿（url / fallbackUrl / token），由 useConnectionCredentials 持有 */
  draft: { type: Object, required: true },
  /** 服务端是否已保存令牌（令牌明文不下发） */
  hasToken: { type: Boolean, default: false },
  showTokenInput: { type: Boolean, required: true },
  testing: { type: Boolean, default: false },
  testResult: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  saveFeedback: { type: Object, default: null },
  copyHaUrl: { type: Function, required: true },
  copyHaFallbackUrl: { type: Function, required: true },
  testConnection: { type: Function, required: true },
})

defineEmits(['update:showTokenInput'])
</script>

<style scoped src="./styles/connection-credentials.css"></style>
