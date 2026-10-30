<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfirmStore } from "@store/shared/stores/confirm";

const props = withDefaults(defineProps<{ variant?: "store" | "admin" }>(), {
  variant: "store",
});

const store = useConfirmStore();
const opts = computed(() => store.options);
const dialog = ref<HTMLDialogElement | null>(null);

const tone = computed(() => opts.value.tone || (opts.value.danger ? "danger" : "primary"));

/** 标题/正文/补充说明的 id 按变体区分：store 与 admin 两个实例可能同时在 DOM 里。 */
const ids = computed(() => {
  const prefix = props.variant === "admin" ? "admin-confirm" : "store-confirm";
  return { title: `${prefix}-title`, message: `${prefix}-message`, detail: `${prefix}-detail` };
});
const describedBy = computed(() =>
  opts.value.detail ? `${ids.value.message} ${ids.value.detail}` : ids.value.message,
);

/** 静态调用点里会用 <b>/<code> 强调；去掉标签后用纯文本渲染，既保留文案又消除 v-html。 */
const detailText = computed(() => String(opts.value.detail || "").replace(/<[^>]*>/g, ""));

const icon = computed(() => {
  if (opts.value.icon) return opts.value.icon;
  if (tone.value === "success") return "?";
  return "!";
});

const confirmBtnClass = computed(() => {
  if (props.variant === "admin") {
    const map: Record<string, string> = {
      danger: "hb-button hb-button--danger hb-button--sm",
      warning: "hb-button hb-button--warning hb-button--sm",
      success: "hb-button hb-button--success hb-button--sm",
      primary: "hb-button hb-button--primary hb-button--sm",
    };
    return map[tone.value] || map.primary;
  }
  return tone.value === "danger"
    ? "hb-button hb-button--danger"
    : "hb-button hb-button--primary";
});

watch(
  () => store.open,
  (open) => {
    const node = dialog.value;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
    }
  },
);
</script>

<template>
  <dialog
    ref="dialog"
    :class="variant === 'admin'
      ? ['confirm-dialog', tone === 'danger' ? 'is-danger' : tone === 'warning' ? 'is-warning' : 'is-success']
      : 'hb-dialog hb-confirm-dialog'"
    :aria-labelledby="ids.title"
    :aria-describedby="describedBy"
    @cancel.prevent="store.settle(false)"
  >
    <template v-if="variant === 'admin'">
      <div class="confirm-dialog__body">
        <div class="confirm-dialog__icon">{{ icon }}</div>
        <h2 :id="ids.title">{{ opts.title || "确认操作" }}</h2>
        <p :id="ids.message">{{ opts.message }}</p>
        <!-- 不再用 v-html：即使当前调用点全是静态字面量，未来把 detail 换成
             请求数据/用户输入时就会直接变成注入面。强调语气可用 CSS 表达。 -->
        <div v-if="opts.detail" :id="ids.detail" class="confirm-dialog__impact">{{ detailText }}</div>
      </div>
      <div class="confirm-dialog__actions">
        <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="store.settle(false)">
          {{ opts.cancelLabel || "取消" }}
        </button>
        <button :class="confirmBtnClass" type="button" @click="store.settle(true)">
          {{ opts.confirmLabel || "确认" }}
        </button>
      </div>
    </template>
    <template v-else>
      <div class="hb-dialog__head">
        <span class="hb-kicker hb-kicker--plain">{{ opts.kicker || "Confirm" }}</span>
        <h2 :id="ids.title">{{ opts.title }}</h2>
        <p :id="ids.message">{{ opts.message }}</p>
      </div>
      <div class="hb-dialog__body">
        <p v-if="opts.detail" :id="ids.detail" class="hb-dialog__status">{{ opts.detail }}</p>
      </div>
      <div class="hb-dialog__foot hb-dialog__foot--split">
        <button type="button" class="hb-button hb-button--secondary" @click="store.settle(false)">
          {{ opts.cancelLabel || "取消" }}
        </button>
        <button type="button" :class="confirmBtnClass" @click="store.settle(true)">
          {{ opts.confirmLabel || "确定" }}
        </button>
      </div>
    </template>
  </dialog>
</template>
