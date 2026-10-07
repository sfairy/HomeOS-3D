<script setup lang="ts">
/**
 * 带「显示/隐藏」按钮的密码输入框（与授权商店 `PasswordField` 同构）。
 */
import { ref } from "vue";

withDefaults(
  defineProps<{
    modelValue: string;
    id?: string;
    placeholder?: string;
    autocomplete?: string;
    minlength?: number;
    required?: boolean;
  }>(),
  {
    id: "",
    placeholder: "请输入密码",
    autocomplete: "current-password",
    minlength: 0,
    required: false,
  },
);

const emit = defineEmits<{ "update:modelValue": [string] }>();
const revealed = ref(false);

function onInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="hos-control hos-password-field">
    <input
      :id="id"
      :type="revealed ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :minlength="minlength || undefined"
      :required="required"
      @input="onInput"
    />
    <button
      type="button"
      :aria-label="revealed ? '隐藏密码' : '显示密码'"
      :title="revealed ? '隐藏密码' : '显示密码'"
      @click="revealed = !revealed"
    >
      {{ revealed ? "隐藏" : "显示" }}
    </button>
  </div>
</template>
