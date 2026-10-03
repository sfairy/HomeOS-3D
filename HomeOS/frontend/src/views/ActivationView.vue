<!--
组件：ActivationView.vue
商业授权激活页（离线授权，可含有效期）：与登录页同款场景 + 右侧激活坞
-->
<template>
  <ScaledViewport>
    <div
      class="login-page"
      :style="{
        '--page-accent': 'var(--module-accent-login)',
        '--page-accent-rgb': 'var(--module-accent-login-rgb)',
        '--page-accent-secondary': 'var(--module-accent-login-sub)',
        '--page-accent-secondary-rgb': 'var(--module-accent-login-sub-rgb)',
      }"
    >
      <LoginBrandPanel
        :brand-logo-url="brandLogoUrl"
        :pkg-version="pkgVersion"
        live-label="授权激活就绪"
        ver-name="Activate"
        brand-title="离线授权激活"
        brand-tag="一机一证 · 可设有效期 · 本地验签"
        :signal-items="['设备指纹', '待导入', '可激活']"
      />

      <aside class="login-dock">
        <div class="act-panel animate-fade-in-up">
          <span class="act-panel__edge" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--tl" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--tr" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--bl" aria-hidden="true" />
          <span class="act-panel__corner act-panel__corner--br" aria-hidden="true" />

          <div class="act-panel__head">
            <div class="act-panel__eyebrow-row">
              <p class="act-panel__eyebrow">商业授权</p>
              <span class="act-panel__secure">
                <i class="act-panel__secure-dot" aria-hidden="true" />
                离线授权
              </span>
            </div>
            <h2 class="act-panel__title">激活系统</h2>
            <p class="act-panel__desc">
              发送设备指纹给发卡方，导入许可证 JWT 后即可接管本机（授权码可含有效期）。
            </p>
          </div>

          <div class="act-hub" aria-label="激活步骤">
            <span class="act-hub__scan" aria-hidden="true" />
            <div class="act-hub__item" :class="{ 'act-hub__item--done': Boolean(hwid) }">
              <div class="act-hub__top">
                <i class="act-hub__dot" />
                <span class="act-hub__code">01</span>
              </div>
              <span class="act-hub__name">发送指纹</span>
            </div>
            <div class="act-hub__item" :class="{ 'act-hub__item--done': Boolean(token.trim()) }">
              <div class="act-hub__top">
                <i class="act-hub__dot" />
                <span class="act-hub__code">02</span>
              </div>
              <span class="act-hub__name">导入许可</span>
            </div>
            <div
              class="act-hub__item"
              :class="{ 'act-hub__item--active': Boolean(token.trim()) && Boolean(hwid) }"
            >
              <div class="act-hub__top">
                <i class="act-hub__dot" />
                <span class="act-hub__code">03</span>
              </div>
              <span class="act-hub__name">激活系统</span>
            </div>
          </div>

          <section class="act-block">
            <div class="act-block-head">
              <label class="act-label" for="act-hwid">设备指纹 HWID</label>
              <span class="act-hint">{{ copied ? '已复制到剪贴板' : '发给发卡方' }}</span>
            </div>
            <div class="act-hwid-field" :class="{ 'act-hwid-field--ok': copied }">
              <code
                id="act-hwid"
                class="act-hwid"
                :title="hwid || '加载中…'"
              >{{ hwidDisplay }}</code>
              <button
                type="button"
                class="act-btn-copy"
                :disabled="!hwid"
                :aria-label="copied ? '已复制' : '复制设备指纹'"
                :title="copied ? '已复制' : '复制指纹'"
                @click="copyHwid"
              >
                <Check v-if="copied" class="act-ico" />
                <Copy v-else class="act-ico" />
              </button>
            </div>
            <div v-if="licenseContactEmail" class="act-actions">
              <button
                type="button"
                class="act-btn-mail"
                :disabled="!hwid"
                aria-label="发送到授权方邮箱"
                @click="mailHwidToLicensor"
              >
                <Mail class="act-ico" />
                <span>发送到授权方</span>
              </button>
            </div>
          </section>

          <section class="act-block act-block--last">
            <div class="act-block-head">
              <label class="act-label" for="license-token">许可证</label>
              <span class="act-hint">{{ expiresHint || 'JWT 或 .jwt 文件' }}</span>
            </div>
            <div
              class="act-license"
              :class="{ 'act-license--drag': dragOver }"
              @dragenter.prevent="dragOver = true"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="onDrop"
            >
              <textarea
                id="license-token"
                v-model="token"
                rows="3"
                class="act-textarea"
                placeholder="粘贴发卡方提供的许可证内容…"
                spellcheck="false"
                autocomplete="off"
              />
              <label class="act-upload">
                <input
                  type="file"
                  class="act-file-input"
                  accept=".jwt,.txt,text/plain"
                  @change="onFile"
                />
                <Upload class="act-ico" aria-hidden="true" />
                <span>{{ fileName || '拖放或点击上传 .jwt 文件' }}</span>
              </label>
            </div>
          </section>

          <div v-if="errorMsg" class="act-error" role="alert">{{ errorMsg }}</div>

          <button
            type="button"
            class="act-submit"
            :disabled="isLoading || !token.trim() || !hwid"
            @click="handleActivate"
          >
            <span class="act-submit__sheen" aria-hidden="true" />
            <span v-if="isLoading" class="act-spinner" aria-hidden="true" />
            <span>{{ isLoading ? '正在激活…' : '激活系统' }}</span>
          </button>

          <div class="act-panel__copy">
            <div class="act-panel__meta">
              <span>离线永久</span>
              <i class="act-panel__meta-sep" aria-hidden="true" />
              <span>一机一证</span>
              <i class="act-panel__meta-sep" aria-hidden="true" />
              <span>本机验签</span>
            </div>
            <p>版权所有：一埖一丗堺</p>
            <p>程序开发：方长鑫</p>
            <p>换机请联系发卡方重签 · HomeOS v{{ pkgVersion }}</p>
          </div>
        </div>
      </aside>
    </div>
  </ScaledViewport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Copy, Mail, Upload } from '@lucide/vue'
import ScaledViewport from '@/layouts/ScaledViewport.vue'
import LoginBrandPanel from '@/views/login/BrandPanel.vue'
import { DEFAULT_BRAND_LOGO_URL } from '@/utils/layout/nav-tabs.util'
import { activateLicense, getLicenseStatus } from '@/services/api/license'
import { extractErrorMessage } from '@/utils/core/error-message'
import { markLicenseActivated } from '@/router/license-gate'
import { scalingEnabled } from '@/composables/ui/useScaling'
import { isPhoneViewport } from '@/utils/config/viewport-breakpoints.util'
import pkg from '../../package.json'
import '@/views/login/page.css'
import '@/views/login/brand.css'
import '@/views/login/form.css'

/** 授权方收件邮箱（构建时 VITE_LICENSE_CONTACT_EMAIL；未配置则隐藏 mailto） */
const licenseContactEmail = String(import.meta.env.VITE_LICENSE_CONTACT_EMAIL || '').trim()

const pkgVersion = pkg.version
const brandLogoUrl = DEFAULT_BRAND_LOGO_URL
const router = useRouter()

const hwid = ref('')
const token = ref('')
const errorMsg = ref('')
const isLoading = ref(false)
const copied = ref(false)
const dragOver = ref(false)
const fileName = ref('')
/** 激活成功后展示的有效期提示（跳转前短暂可见） */
const expiresHint = ref('')

const hwidDisplay = computed(() => {
  const raw = hwid.value
  if (!raw) return '正在读取设备指纹…'
  // 每 4 位分组，便于扫读；复制仍用原始 hwid
  return raw.replace(/(.{4})(?=.)/g, '$1 ')
})

function formatExpiresHint(expiresAt: number | null | undefined) {
  if (expiresAt == null) return '有效期：永久'
  const ms = Number(expiresAt)
  if (!Number.isFinite(ms)) return ''
  return `有效期至 ${new Date(ms).toLocaleString()}`
}

onMounted(async () => {
  if (isPhoneViewport()) {
    scalingEnabled.value = false
  }
  try {
    const status = await getLicenseStatus()
    hwid.value = status.data.hwid || ''
    if (!status.data.licenseRequired || status.data.isActivated) {
      markLicenseActivated(true)
      router.replace('/')
    }
  } catch (e) {
    errorMsg.value = extractErrorMessage(e)
  }
})

async function copyHwid() {
  if (!hwid.value) return
  try {
    await navigator.clipboard.writeText(hwid.value)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    errorMsg.value = '复制失败，请长按指纹文本手动选择'
  }
}

function mailHwidToLicensor() {
  if (!hwid.value || !licenseContactEmail) return
  const subject = encodeURIComponent('HomeOS 商业授权申请')
  const body = encodeURIComponent(
    [
      '您好，申请 HomeOS 离线授权。',
      '',
      `设备指纹 (HWID)：${hwid.value}`,
      `HomeOS 版本：${pkgVersion}`,
      '',
      '请签发许可证 JWT（可指定有效期）并回复本邮件，谢谢。',
    ].join('\n'),
  )
  window.location.href = `mailto:${licenseContactEmail}?subject=${subject}&body=${body}`
}

function readLicenseFile(file: File) {
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => {
    token.value = String(reader.result || '').trim()
    errorMsg.value = ''
  }
  reader.onerror = () => {
    errorMsg.value = '读取文件失败'
  }
  reader.readAsText(file)
}

function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) readLicenseFile(file)
}

function onDrop(ev: DragEvent) {
  dragOver.value = false
  const file = ev.dataTransfer?.files?.[0]
  if (file) readLicenseFile(file)
}

function normalizeJwt(raw: string) {
  return String(raw || '')
    .replace(/(?:\s|\u200b|\u200c|\u200d|\uFEFF)+/g, '')
    .trim()
}

async function handleActivate() {
  errorMsg.value = ''
  isLoading.value = true
  try {
    const cleaned = normalizeJwt(token.value)
    token.value = cleaned
    const activated = await activateLicense(cleaned)
    expiresHint.value = formatExpiresHint(activated.data?.expiresAt)
    const status = await getLicenseStatus()
    if (!status.data.licenseRequired || status.data.isActivated) {
      markLicenseActivated(true)
      router.push('/')
    } else {
      markLicenseActivated(false)
      errorMsg.value = '激活未生效，请确认许可证后重试'
    }
  } catch (e) {
    markLicenseActivated(false)
    errorMsg.value = extractErrorMessage(e)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped src="./styles/ActivationView.css"></style>
