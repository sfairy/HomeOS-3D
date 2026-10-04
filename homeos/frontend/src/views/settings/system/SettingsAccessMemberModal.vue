<!--
组件：SettingsAccessMemberModal.vue
所属模块：frontend / src / views / settings / system
职责：成员编辑弹窗。新增/编辑成员信息（用户名、角色、头像），支持焦点陷阱、teleport 到 shell、
      keep-alive 期间自动关闭。
Props：
  - editing：正在编辑的成员对象（null 表示新建）
  - roleOptions：角色选项
  - memberSaving：是否保存中
Emits：
  - close / save
关键依赖：
  - useChromeStore：notify
  - useKeepAliveGate / useShellTeleportTarget：keep-alive 与 teleport
  - @lucide/vue 的 UserPlus / X / Shield / User / Baby
数据来源：父级透传的 editing 成员
-->
<template>
  <Teleport v-if="draft" :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="hos-modal" appear>
      <div class="hos-modal-root" style="z-index: 50">
        <div class="hos-modal-backdrop" @click="$emit('close')" />
        <div class="hos-modal-panel hos-modal-panel--sm hos-modal-panel--purple">
          <div class="hos-modal-head">
            <div class="hos-modal-head-left">
              <div class="hos-modal-head-icon"><UserPlus class="w-5 h-5" /></div>
              <div>
                <h3 class="hos-modal-title">{{ draft.id ? '编辑成员' : '添加成员' }}</h3>
                <p class="hos-modal-subtitle">{{ '配置用户名、密码与角色权限' }}</p>
              </div>
            </div>
            <button
              type="button"
              class="hos-modal-close"
              :aria-label="'关闭'"
              @click="$emit('close')"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
          <div class="hos-modal-body space-y-4">
            <div>
              <label class="hos-modal-label">{{ '用户名' }}</label>
              <input
                v-model="draft.username"
                :placeholder="'登录用户名'"
                class="hos-modal-input"
                autocomplete="off"
              />
            </div>
            <div>
              <label class="hos-modal-label">{{ draft.id ? '新密码（留空不改）' : '密码' }}</label>
              <input
                v-model="draft.password"
                type="password"
                class="hos-modal-input"
                autocomplete="new-password"
              />
            </div>
            <div>
              <label class="hos-modal-label mb-2">{{ '角色' }}</label>
              <div class="access-role-picker">
                <button
                  v-for="r in roleOptions"
                  :key="r.id"
                  type="button"
                  :class="[
                    'access-role-pick',
                    draft.role === r.id && 'access-role-pick--active',
                    `access-role-pick--${r.id}`,
                  ]"
                  @click="draft.role = r.id"
                >
                  <component :is="roleIcon(r.id)" class="access-role-pick__icon w-4 h-4" />
                  <span class="access-role-pick__label">{{ r.label }}</span>
                  <span class="access-role-pick__desc">{{ r.desc }}</span>
                </button>
              </div>
            </div>
            <div v-if="draft.role !== 'admin'">
              <label class="hos-modal-label">{{ '实体 ACL 前缀' }}</label>
              <input
                v-model="draft.restrictionsStr"
                :placeholder="'逗号分隔，如 light.living, climate.'"
                class="hos-modal-input font-mono text-xs"
              />
              <p class="text-[12px] am-text-tertiary mt-1.5">
                {{ '留空表示可访问全部实体（仍受角色权限约束）' }}
              </p>
            </div>
          </div>
          <div class="hos-modal-footer hos-modal-footer--split">
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--ghost"
              @click="$emit('close')"
            >
              {{ '取消' }}
            </button>
            <button
              type="button"
              class="hos-modal-btn hos-modal-btn--primary"
              :disabled="memberSaving"
              @click="submit"
            >
              {{ memberSaving ? '保存中…' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { UserPlus, X, Shield, User, Baby } from '@lucide/vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

const chrome = useChromeStore()
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

const props = defineProps({
  editing: { type: Object, default: null },
  roleOptions: { type: Array, default: () => [] },
  memberSaving: Boolean,
})

const emit = defineEmits(['close', 'save'])

const draft = ref(null)

watch(keepAliveTeleportDisabled, (disabled) => {
  if (disabled && draft.value) emit('close')
})

watch(
  () => props.editing,
  (val) => {
    draft.value = val ? { ...val } : null
  },
  { immediate: true },
)

function submit() {
  if (!draft.value) return
  const username = String(draft.value.username || '').trim()
  if (!username) {
    chrome.notify('请输入用户名', 'warning')
    return
  }
  if (!draft.value.id && !String(draft.value.password || '').trim()) {
    chrome.notify('请设置密码', 'warning')
    return
  }
  if (!draft.value.role) {
    chrome.notify('请选择角色', 'warning')
    return
  }
  emit('save', { ...draft.value, username })
}

function roleIcon(id) {
  if (id === 'admin') return Shield
  if (id === 'child') return Baby
  return User
}
</script>

<style scoped src="./styles/SettingsAccessMemberModal.css"></style>
