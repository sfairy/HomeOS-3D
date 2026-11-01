<script setup lang="ts">
/**
 * 带「显示/隐藏」按钮的密码输入框：主应用（登录 / 注册）与授权商店（登录 / 注册 / 后台）
 * 共用。以源码形式供两个应用编译（`exports` 里的 `./components/*.vue` 子路径）。
 *
 * 语义属性（`disabled` / `invalid` / `describedby`）必须透传到内部 `<input>`：
 * 审计发现登录提交中密码框仍可编辑，且错误提示没有通过 `aria-describedby` 关联到字段，
 * 读屏用户听到的只有「密码，编辑框」，不知道错在哪。
 */
import { ref } from 'vue'

withDefaults(
  defineProps<{
    modelValue: string;
    id?: string;
    name?: string;
    placeholder?: string;
    autocomplete?: string;
    minlength?: number;
    required?: boolean;
    disabled?: boolean;
    /** 字段当前是否处于无效状态，映射到 `aria-invalid`。 */
    invalid?: boolean;
    /** 关联的错误提示元素 id（通常指向 `role="alert"` 的那条消息）。 */
    describedby?: string;
  }>(),
  {
    id: '',
    name: '',
    placeholder: '请输入密码',
    autocomplete: 'current-password',
    minlength: 0,
    required: false,
    disabled: false,
    invalid: false,
    describedby: '',
  },
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()
const revealed = ref(false)

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="hos-control hos-password-field">
    <input
      :id="id || undefined"
      :name="name || undefined"
      :type="revealed ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :minlength="minlength || undefined"
      :required="required"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="describedby || undefined"
      @input="onInput"
    />
    <button
      type="button"
      :aria-label="revealed ? '隐藏密码' : '显示密码'"
      :title="revealed ? '隐藏密码' : '显示密码'"
      :disabled="disabled"
      @click="revealed = !revealed"
    >
      {{ revealed ? "隐藏" : "显示" }}
    </button>
  </div>
</template>
