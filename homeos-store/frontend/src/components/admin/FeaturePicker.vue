<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useFeatureCatalogStore } from "../../stores/featureCatalog.js";
import { hidePopoverIfOpen, placePopover, showPopoverIfPossible } from "../../utils/popover.js";

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    multiple?: boolean;
    empty?: string;
  }>(),
  { multiple: true, empty: "未选择" },
);

const emit = defineEmits<{ "update:modelValue": [string[]] }>();

const catalog = useFeatureCatalogStore();
const root = ref<HTMLElement | null>(null);
const toggleEl = ref<HTMLButtonElement | null>(null);
const popEl = ref<HTMLElement | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const open = ref(false);
const search = ref("");

const selected = computed(() => props.modelValue || []);

const matched = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return catalog.items;
  return catalog.items.filter(
    (item) =>
      item.code.toLowerCase().includes(term) ||
      (item.label || "").toLowerCase().includes(term) ||
      (item.description || "").toLowerCase().includes(term),
  );
});

/** 接口下发的分组优先，未覆盖的分组按出现顺序补在末尾。 */
const blocks = computed(() => {
  const base = catalog.groups.length ? [...catalog.groups] : [{ key: "base", label: "基础能力" }];
  const known = new Set(base.map((group) => group.key));
  for (const item of matched.value) {
    if (!item.group || known.has(item.group)) continue;
    known.add(item.group);
    base.push({ key: item.group, label: item.groupLabel || item.group });
  }
  return base
    .map((group) => ({
      group,
      items: matched.value.filter((item) => (item.group || "base") === group.key),
    }))
    .filter((block) => block.items.length);
});

const summary = computed(() => {
  if (!selected.value.length) return props.empty;
  const labels = selected.value.map((code) => catalog.label(code));
  if (!props.multiple) return selected.value.map((code, index) => `${labels[index]} · ${code}`).join("、");
  return labels.length <= 3 ? labels.join("、") : `${labels.slice(0, 3).join("、")} 等 ${labels.length} 项`;
});

function toggleCode(code: string) {
  if (!props.multiple) {
    emit("update:modelValue", [code]);
    close();
    return;
  }
  const checked = new Set(selected.value);
  if (checked.has(code)) checked.delete(code);
  else checked.add(code);
  emit("update:modelValue", catalog.items.map((item) => item.code).filter((item) => checked.has(item)));
}

function openPicker() {
  const pop = popEl.value;
  const toggle = toggleEl.value;
  if (!pop || !toggle) return;
  pop.hidden = false;
  open.value = true;
  search.value = "";
  showPopoverIfPossible(pop);
  void nextTick(() => {
    const node = popEl.value;
    const anchor = toggleEl.value;
    if (!node || !anchor) return;
    placePopover(node, anchor, {
      align: "left",
      prepare: (el) => {
        const width = anchor.getBoundingClientRect().width;
        el.style.width = `${Math.round(Math.min(Math.max(width, 300), 460))}px`;
      },
    });
    searchEl.value?.focus();
  });
}

function close() {
  if (!open.value) return;
  open.value = false;
  const pop = popEl.value;
  if (!pop) return;
  hidePopoverIfOpen(pop);
  pop.hidden = true;
}

function onToggle() {
  if (open.value) close();
  else openPicker();
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (root.value && target && root.value.contains(target)) return;
  close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeydown);
  } else {
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onKeydown);
  }
});

onMounted(() => {
  if (!catalog.items.length) void catalog.load().catch(() => {});
});

onBeforeUnmount(() => {
  close();
  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("keydown", onKeydown);
});

defineExpose({ close });
</script>

<template>
  <div ref="root" class="feature-picker" :class="{ 'is-open': open }">
    <button
      ref="toggleEl"
      type="button"
      class="feature-picker__control"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="onToggle"
    >
      <span class="feature-picker__value" :class="{ 'is-empty': !selected.length }">{{ summary }}</span>
      <span class="feature-picker__caret" aria-hidden="true"></span>
    </button>
    <div ref="popEl" class="feature-picker__pop" popover="manual" hidden>
      <input
        ref="searchEl"
        v-model="search"
        class="hb-input feature-picker__search"
        type="search"
        placeholder="搜索中文名或功能码"
        aria-label="搜索功能码"
      />
      <div class="feature-picker__list" role="listbox" :aria-multiselectable="multiple">
        <div v-for="block in blocks" :key="block.group.key" class="feature-group">
          <div class="feature-group__head">{{ block.group.label }}</div>
          <label v-for="item in block.items" :key="item.code" class="feature-option">
            <input
              :type="multiple ? 'checkbox' : 'radio'"
              :checked="selected.includes(item.code)"
              :value="item.code"
              @change="toggleCode(item.code)"
            />
            <span class="feature-option__body">
              <span class="feature-option__title">
                <span class="feature-option__name">{{ item.label || item.code }}</span>
                <code class="feature-option__code">{{ item.code }}</code>
              </span>
              <span v-if="item.description" class="feature-option__desc">{{ item.description }}</span>
            </span>
          </label>
        </div>
        <div v-if="!blocks.length" class="feature-picker__empty">没有匹配的功能码</div>
      </div>
    </div>
  </div>
</template>
