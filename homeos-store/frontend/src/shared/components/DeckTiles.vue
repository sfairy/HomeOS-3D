<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

interface DeckTile {
  label: string;
  text: string;
  unit?: string;
  spark?: string;
  hook?: string;
  since?: string;
}

const props = defineProps<{ page: string }>();
const emit = defineEmits<{ loaded: [] }>();

const tiles = ref<DeckTile[]>([]);
const now = ref(Date.now());
let timer: number | undefined;

const calm = () =>
  window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse), (hover: none)").matches;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function elapsed(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return "刚刚启动";
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}时${minutes % 60}分`;
  return `${Math.floor(hours / 24)}天${hours % 24}时`;
}

function renderTile(tile: DeckTile): string {
  if (tile.hook === "clock") {
    const d = new Date(now.value);
    const stamp = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return calm() ? stamp : `${stamp}:${pad(d.getSeconds())}`;
  }
  if (tile.hook === "uptime") {
    const since = tile.since ? Date.parse(tile.since) : Number.NaN;
    if (Number.isNaN(since)) return tile.text || "—";
    return elapsed((now.value - since) / 1000);
  }
  return tile.text;
}

/**
 * 数据回来之前占位用的四格。
 *
 * 为什么要占位：甲板是面板里唯一由异步接口撑开高度的一块，以前是 `v-if="tiles.length"` ——
 * 页面先画一张没有甲板的面板，接口回来后甲板整块插进来、下面所有内容往下跳一次。
 * 现在容器与四格从第 0 帧就在（`.is-pending` 只是 `visibility: hidden`），
 * 结构与真数据**逐节点相同**（label / value / spark 都在），所以接口回来只改文本：
 * 高度不变、行数不变、断点也不变。
 */
const PLACEHOLDER_TILES: { tile: DeckTile; text: string }[] = [
  { tile: { label: "", text: "", spark: "is-none" }, text: "" },
  { tile: { label: "", text: "", spark: "is-none" }, text: "" },
  { tile: { label: "", text: "", spark: "is-none" }, text: "" },
  { tile: { label: "", text: "", spark: "is-none" }, text: "" },
];

const rendered = computed<{ tile: DeckTile; text: string }[]>(() =>
  tiles.value.length
    ? tiles.value.map((tile) => ({ tile, text: renderTile(tile) }))
    : PLACEHOLDER_TILES,
);

/**
 * 按页面记住上一批读数。
 *
 * 为什么需要：甲板会随宿主面板**重挂载**——商店的登录 / 注册 / 找回密码共用一块坞体，
 * 切换时靠 `:panel-key` 重建（为了重放入场动画）。组件一重建，`tiles` 就回到空数组，
 * `.is-pending` 让甲板隐形一拍再显形。有了缓存，重建后的第一帧直接是可用的读数，
 * 随后那次刷新只改文本。
 */
const deckCache = new Map<string, DeckTile[]>();

async function load() {
  try {
    const response = await fetch(
      `/store/v1/shell/deck?page=${encodeURIComponent(props.page)}`,
      { credentials: "same-origin" },
    );
    if (!response.ok) {
      emit("loaded");
      return;
    }
    const data = (await response.json()) as { tiles?: DeckTile[] };
    tiles.value = data.tiles || [];
    deckCache.set(props.page, tiles.value);
  } catch {
    tiles.value = [];
  }
  // 甲板是首屏里最晚撑开布局的一块：消费方需要在这一刻重新对齐 hash 锚点。
  emit("loaded");
}

onMounted(async () => {
  // 同步命中缓存 → 首帧就有读数（重挂载时不再「隐形一拍」）；再在后台刷一次。
  const cached = deckCache.get(props.page);
  if (cached) tiles.value = cached;
  await load();
  if (!tiles.value.some((tile) => tile.hook)) return;
  const tick = calm() ? 30_000 : 1_000;
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, tick);
});

onBeforeUnmount(() => {
  window.clearInterval(timer);
});
</script>

<template>
  <!-- 容器常驻（不再 `v-if="tiles.length"`）：数据未到时用四格同构占位把高度占住，
       数据到了只换文本、不动布局。见 script 里 PLACEHOLDER_TILES 的说明。 -->
  <div
    class="hos-deck"
    :class="{ 'is-pending': !tiles.length }"
    role="group"
    aria-label="服务状态读数"
    :aria-busy="tiles.length ? undefined : 'true'"
  >
    <span class="hos-deck__scan" aria-hidden="true"></span>
    <div v-for="(item, index) in rendered" :key="index" class="hos-deck__tile">
      <span class="hos-deck__label">{{ item.tile.label }}</span>
      <span class="hos-deck__value">
        {{ item.text }}<span v-if="item.tile.unit" class="hos-deck__unit">{{ item.tile.unit }}</span>
      </span>
      <span class="hos-deck__spark" :class="item.tile.spark || 'is-mid'" aria-hidden="true"></span>
    </div>
  </div>
</template>
