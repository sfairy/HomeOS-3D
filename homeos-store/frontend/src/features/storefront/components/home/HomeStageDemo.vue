<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useHomeView } from "@store/features/storefront/composables/useHomeView";

/**
 * 首屏右侧的中控画面。对照主项目 3D 舞台：一层户型上的设备锚点，
 * 以及「3D / 灯光 / 环境 / 设备 / 扫地机 / 安防」点选后的控制条。
 * 只轮播，不提供可点控件。
 */
const { stage } = useHomeView();
const view = stage;
/** 从「灯光」起：点中一盏灯再出亮度与色温，是这组交互里最直观的一帧。 */
const frame = ref(1);
let timer = 0;

const current = computed(() => view.modules[frame.value] ?? view.modules[0]);

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  timer = window.setInterval(() => {
    frame.value = (frame.value + 1) % view.modules.length;
  }, 3200);
});

onUnmounted(() => {
  window.clearInterval(timer);
});
</script>

<template>
  <div class="hm-stage" :data-tone="current.tone">
    <div class="hm-stage__bar">
      <span class="hm-stage__mark" aria-hidden="true">
        <i class="fa-duotone fa-regular fa-cube"></i>
      </span>
      <span class="hm-stage__title">{{ view.title }}</span>
      <span class="hm-stage__chip">
        <i class="hb-dot" aria-hidden="true"></i>
        {{ view.chip }}
      </span>
      <span class="hm-stage__clock hb-mono">{{ view.clock }}</span>
    </div>

    <div class="hm-stage__mods" aria-hidden="true">
      <span
        v-for="mod in view.modules"
        :key="mod.id"
        class="hm-stage__mod"
        :class="{ 'is-current': mod.id === current.id }"
        :data-tone="mod.id === current.id ? mod.tone : undefined"
      >
        {{ mod.label }}
      </span>
    </div>

    <div class="hm-stage__floor">
      <div class="hm-stage__plan">
        <img
          class="hm-stage__plan-art"
          :src="view.planImage"
          width="602"
          height="375"
          fetchpriority="high"
          decoding="async"
          alt=""
          aria-hidden="true"
        />
        <span
          v-for="anchor in view.anchors"
          :key="anchor.id"
          class="hm-stage__anchor"
          :class="[`is-label-${anchor.labelPlacement || 'bottom'}`, { 'is-picked': anchor.module === current.id }]"
          :data-tone="anchor.module === current.id ? current.tone : undefined"
          :style="{ left: `${anchor.x}%`, top: `${anchor.y}%` }"
        >
          <span class="hm-stage__node"></span>
          <span class="hm-stage__anchor-label">{{ anchor.label }}</span>
        </span>
      </div>
    </div>

    <dl class="hm-stage__dock">
      <div v-for="row in current.controls" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd class="hb-mono">{{ row.value }}</dd>
      </div>
    </dl>

    <p class="hm-sr">
      3D 交互示意：一层户型渲染图上按 3D、灯光、环境、设备、扫地机、安防点选设备。当前为{{ current.label }}，{{ current.focus }}。
    </p>
  </div>
</template>
