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

const rendered = computed(() => tiles.value.map((tile) => ({ tile, text: renderTile(tile) })));

async function load() {
  try {
    const response = await fetch(
      `/store/v1/shell/deck?page=${encodeURIComponent(props.page)}`,
      { credentials: "same-origin" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as { tiles?: DeckTile[] };
    tiles.value = data.tiles || [];
  } catch {
    tiles.value = [];
  }
}

onMounted(async () => {
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
  <div v-if="tiles.length" class="hos-deck" role="group" aria-label="服务状态读数">
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
