<!--
  机甲小管家形象（对齐源码 AuraMechaVisual，逐字移植）。
  - mode="sleep"：待机形态，白→灰渐变机壳 + 黑色面罩 + 弯月眼 + 双天线 + 胸口心跳点。
  - mode="active"：工作形态，尖耳 + 青色描边面罩 + 发光椭圆眼 + 腮红，外圈虚线环顺转、内圈逆转。
  - is-active：只有 true 时环形 / 悬浮 / 眨眼 / 心跳才 running；待机静止时不白烧动画帧。

  SVG 的 <defs> id 统一带 companion 前缀：同一页面里浏览器按 id 全局查找渐变与滤镜，
  与页面上其它内联 SVG 重名会让两处图形互相串色。
-->
<template>
  <div class="mecha-avatar" :class="[`mecha-avatar--${mode}`, { 'is-active': isActive }]">
    <div v-if="mode === 'sleep'" class="mecha-sleep-wrapper">
      <div class="sleep-glow" aria-hidden="true"></div>
      <svg class="sleep-svg" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="companionSleepBody" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FFFFFF" />
            <stop offset="70%" stop-color="#E2E8F0" />
            <stop offset="100%" stop-color="#94A3B8" />
          </linearGradient>
          <linearGradient id="companionSleepVisor" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#18181B" />
            <stop offset="100%" stop-color="#09090B" />
          </linearGradient>
          <filter id="companionSleepNeon" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <path
          class="sleep-shell"
          d="M50,150 Q40,60 100,50 Q160,60 150,150 Q140,180 100,180 Q60,180 50,150"
          fill="url(#companionSleepBody)"
          stroke="#475569"
          stroke-width="2"
        />
        <rect
          x="65"
          y="85"
          width="70"
          height="35"
          rx="17.5"
          fill="url(#companionSleepVisor)"
          stroke="#27272A"
          stroke-width="1.5"
        />
        <g class="sleep-eyes" filter="url(#companionSleepNeon)">
          <path
            d="M78,102 Q86,95 94,102"
            fill="none"
            stroke="#00F0FF"
            stroke-width="2.5"
            stroke-linecap="round"
          />
          <path
            d="M106,102 Q114,95 122,102"
            fill="none"
            stroke="#00F0FF"
            stroke-width="2.5"
            stroke-linecap="round"
          />
        </g>
        <path
          class="sleep-antenna sleep-antenna--l"
          d="M75,65 L55,45"
          stroke="url(#companionSleepBody)"
          stroke-width="7"
          stroke-linecap="round"
        />
        <circle cx="55" cy="45" r="3" fill="#00F0FF" filter="url(#companionSleepNeon)" />
        <path
          class="sleep-antenna sleep-antenna--r"
          d="M125,65 L145,45"
          stroke="url(#companionSleepBody)"
          stroke-width="7"
          stroke-linecap="round"
        />
        <circle cx="145" cy="45" r="3" fill="#00F0FF" filter="url(#companionSleepNeon)" />
        <path
          d="M60,140 Q75,130 90,145"
          fill="none"
          stroke="#CBD5E1"
          stroke-width="5"
          stroke-linecap="round"
        />
        <path
          d="M140,140 Q125,130 110,145"
          fill="none"
          stroke="#CBD5E1"
          stroke-width="5"
          stroke-linecap="round"
        />
        <circle
          class="sleep-heartbeat"
          cx="100"
          cy="162"
          r="4"
          fill="#00F0FF"
          filter="url(#companionSleepNeon)"
        />
      </svg>
    </div>

    <div v-else class="mecha-active-wrapper">
      <div class="active-ring active-ring--outer" aria-hidden="true"></div>
      <div class="active-ring active-ring--inner" aria-hidden="true"></div>
      <div class="active-core">
        <svg class="active-svg" viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id="companionAeroBody" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FFFFFF" />
              <stop offset="60%" stop-color="#E2E8F0" />
              <stop offset="100%" stop-color="#64748B" />
            </linearGradient>
            <linearGradient id="companionAeroVisor" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0F172A" />
              <stop offset="100%" stop-color="#020617" />
            </linearGradient>
            <filter id="companionAeroGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <ellipse cx="100" cy="182" rx="45" ry="8" fill="rgba(0,0,0,0.4)" />
          <path d="M60,55 L45,15 L78,38 Z" fill="#1E293B" stroke="#00F0FF" stroke-width="1.5" />
          <path d="M140,55 L155,15 L122,38 Z" fill="#1E293B" stroke="#00F0FF" stroke-width="1.5" />
          <circle
            cx="100"
            cy="100"
            r="75"
            fill="url(#companionAeroBody)"
            stroke="#334155"
            stroke-width="2"
          />
          <rect
            x="42"
            y="70"
            width="116"
            height="60"
            rx="30"
            fill="url(#companionAeroVisor)"
            stroke="#00F0FF"
            stroke-width="1.5"
          />
          <g class="active-eyes" filter="url(#companionAeroGlow)">
            <ellipse cx="76" cy="98" rx="8" ry="12" fill="#00F0FF" />
            <circle cx="79" cy="94" r="3" fill="#FFFFFF" />
            <ellipse cx="124" cy="98" rx="8" ry="12" fill="#00F0FF" />
            <circle cx="127" cy="94" r="3" fill="#FFFFFF" />
            <ellipse cx="64" cy="112" rx="4" ry="2" fill="rgba(244,63,94,0.7)" />
            <ellipse cx="136" cy="112" rx="4" ry="2" fill="rgba(244,63,94,0.7)" />
          </g>
          <circle
            class="active-pulse"
            cx="100"
            cy="152"
            r="5"
            fill="#00F0FF"
            filter="url(#companionAeroGlow)"
          />
        </svg>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** sleep：待机形态；active：工作形态（聆听 / 思考 / 回复） */
  mode: 'sleep' | 'active'
  /** 仅 true 时运行循环动画，待机静止画面不占用动画帧 */
  isActive: boolean
}>()
</script>

<style scoped>
.mecha-avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  user-select: none;
  pointer-events: none;
}

.mecha-sleep-wrapper,
.mecha-active-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* ---------- 待机形态 ---------- */

.sleep-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: sleep-breathing 4s ease-in-out infinite;
}

.sleep-glow {
  position: absolute;
  inset: -10%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 240, 255, 0.15) 0%, transparent 70%);
  pointer-events: none;
  animation: sleep-glow 4s ease-in-out infinite;
}

.sleep-eyes {
  animation: sleep-blink 4s ease-in-out infinite;
}

.sleep-heartbeat {
  animation: sleep-pulse 3s ease-in-out infinite;
}

@keyframes sleep-breathing {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(2px) scale(0.98);
  }
}

@keyframes sleep-glow {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.1);
  }
}

@keyframes sleep-blink {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.95;
  }
}

@keyframes sleep-pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

/* ---------- 工作形态 ---------- */

.active-ring {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.active-ring--outer {
  border: 1.5px dashed rgba(0, 240, 255, 0.4);
  inset: -8%;
  animation: ring-rotate-cw 12s linear infinite paused;
}

.active-ring--inner {
  border: 1px solid rgba(0, 240, 255, 0.2);
  inset: -3%;
  animation: ring-rotate-ccw 18s linear infinite paused;
}

.active-core {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  animation: aero-hover 3s ease-in-out infinite paused;
}

.active-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.active-eyes {
  animation: active-blink 4s infinite paused;
}

.active-pulse {
  animation: active-pulse 1.8s ease-in-out infinite paused;
}

.mecha-avatar.is-active .active-ring--outer,
.mecha-avatar.is-active .active-ring--inner,
.mecha-avatar.is-active .active-core,
.mecha-avatar.is-active .active-eyes,
.mecha-avatar.is-active .active-pulse {
  animation-play-state: running;
}

@keyframes ring-rotate-cw {
  0% {
    transform: rotate(0);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes ring-rotate-ccw {
  0% {
    transform: rotate(0);
  }
  100% {
    transform: rotate(-360deg);
  }
}

@keyframes aero-hover {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}

@keyframes active-blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.1);
  }
}

@keyframes active-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 减少动效：只保留静态造型，避免持续重绘 */
@media (prefers-reduced-motion: reduce) {
  .sleep-svg,
  .sleep-glow,
  .sleep-eyes,
  .sleep-heartbeat,
  .active-ring--outer,
  .active-ring--inner,
  .active-core,
  .active-eyes,
  .active-pulse {
    animation: none !important;
  }
}
</style>
