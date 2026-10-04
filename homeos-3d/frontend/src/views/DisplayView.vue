<script setup lang="ts">
/**
 * 模板保留全部 id / class，供既有命令式引导逻辑按 DOM 契约操作。
 */
import { onMounted } from "vue";
import { loadClassicScript, useHardExit } from "../composables/useLegacyPage";

useHardExit();

onMounted(async () => {
  // display-boot 设置 window.HomeOSDisplayBoot 与启动态；display-startup 自判 /display 或
  // /homeos 路径。两者必须先于 display.ts 就位。
  await import("@app/display/display-boot");
  await import("@app/display/display-startup");
  await loadClassicScript("/static/vendor/hls.js/1.7.3/hls.min.js");
  await import("@app/display/display");
  await import("@app/display/apple-install-guide");
});
</script>

<template>
<main id="display-shell">
        <div id="display-root" tabindex="-1"></div>
    </main>
    <section id="display-splash" aria-label="正在打开仪表盘" tabindex="-1">
        <div class="display-splash-halo" aria-hidden="true"></div>
        <div class="display-splash-identity">
            <svg class="display-splash-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 168 168" role="img"
                aria-label="HomeOS">
                <title>HomeOS</title>
                <!-- 渐变与裁剪路径全在 defs 里定义，正文靠 fill="url(#id)" 引用；
                     这些 id 属于页面全局命名空间（都以 stmk 前缀避让），改名会同时打断所有引用点。 -->
                <defs>
                    <linearGradient id="stmkHouse" x1="12" y1="92" x2="90" y2="10" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#16263C" />
                        <stop offset="24%" stop-color="#24395A" />
                        <stop offset="52%" stop-color="#4E6489" />
                        <stop offset="78%" stop-color="#D89A3C" />
                        <stop offset="100%" stop-color="#FFD9A0" />
                    </linearGradient>
                    <linearGradient id="stmkLife" x1="10" y1="48" x2="50" y2="48" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#5FD0A8" stop-opacity="0.78" />
                        <stop offset="100%" stop-color="#5FD0A8" stop-opacity="0" />
                    </linearGradient>
                    <linearGradient id="stmkVoice" x1="90" y1="48" x2="50" y2="48" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#C9A0FF" stop-opacity="0.76" />
                        <stop offset="100%" stop-color="#C9A0FF" stop-opacity="0" />
                    </linearGradient>
                    <linearGradient id="stmkRoof" x1="50" y1="8" x2="50" y2="44" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#FFD9A0" stop-opacity="0.5" />
                        <stop offset="100%" stop-color="#FFC46A" stop-opacity="0" />
                    </linearGradient>
                    <radialGradient id="stmkWarm" cx="50" cy="70" r="34" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#FF9D4D" stop-opacity="0.38" />
                        <stop offset="50%" stop-color="#FF9D4D" stop-opacity="0.12" />
                        <stop offset="100%" stop-color="#FF9D4D" stop-opacity="0" />
                    </radialGradient>
                    <linearGradient id="stmkScreen" x1="50" y1="48" x2="50" y2="90" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="#16263C" />
                        <stop offset="100%" stop-color="#081020" />
                    </linearGradient>
                    <radialGradient id="stmkScreenGlow" cx="50%" cy="38%" r="75%">
                        <stop offset="0%" stop-color="#FFC46A" stop-opacity="0.2" />
                        <stop offset="55%" stop-color="#FF9D4D" stop-opacity="0.08" />
                        <stop offset="100%" stop-color="#FFC46A" stop-opacity="0" />
                    </radialGradient>
                    <radialGradient id="stmkHubGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stop-color="#FFE9C9" stop-opacity="0.95" />
                        <stop offset="40%" stop-color="#FF9D4D" stop-opacity="0.42" />
                        <stop offset="100%" stop-color="#FF9D4D" stop-opacity="0" />
                    </radialGradient>
                    <clipPath id="stmkHouseClip">
                        <path d="M50 7.8 C51.8 7.8 53.4 8.6 54.6 10.1 L91.6 39.6 C93.2 41 92.3 43.6 90.1 43.6 H82.2 V82.4 C82.2 90.2 75.8 96.4 68 96.4 H32 C24.2 96.4 17.8 90.2 17.8 82.4 V43.6 H9.9 C7.7 43.6 6.8 41 8.4 39.6 L45.4 10.1 C46.6 8.6 48.2 7.8 50 7.8 Z" />
                    </clipPath>
                </defs>

                <g transform="scale(1.68)">
                    <path fill="url(#stmkHouse)"
                        d="M50 7.8 C51.8 7.8 53.4 8.6 54.6 10.1 L91.6 39.6 C93.2 41 92.3 43.6 90.1 43.6 H82.2 V82.4 C82.2 90.2 75.8 96.4 68 96.4 H32 C24.2 96.4 17.8 90.2 17.8 82.4 V43.6 H9.9 C7.7 43.6 6.8 41 8.4 39.6 L45.4 10.1 C46.6 8.6 48.2 7.8 50 7.8 Z" />
                    <g clip-path="url(#stmkHouseClip)">
                        <rect x="8" y="8" width="42" height="90" fill="url(#stmkLife)" />
                        <rect x="50" y="8" width="42" height="90" fill="url(#stmkVoice)" />
                        <path d="M50 8 L92 43 L8 43 Z" fill="url(#stmkRoof)" />
                        <ellipse cx="50" cy="72" rx="30" ry="24" fill="url(#stmkWarm)" />
                    </g>

                    <!-- 山墙信号：三道弧 + 源点（stmk-wifi-a/b/c 由 display-boot.css 做递增延迟的闪烁） -->
                    <g fill="none" stroke="#FFD9A0" stroke-linecap="round" stroke-linejoin="round">
                        <path class="stmk-wifi-a" d="M46.4 38.4 Q50 35 53.6 38.4" stroke-width="2.2" />
                        <path class="stmk-wifi-b" d="M43.4 33.6 Q50 27 56.6 33.6" stroke-width="2.1" />
                        <path class="stmk-wifi-c" d="M39.4 28.4 Q50 19.8 60.6 28.4" stroke-width="2" />
                    </g>
                    <circle cx="50" cy="41.6" r="1.7" fill="#FFD9A0" />

                    <!-- ===== 屏内示意：四向连线代表四类被控设备，配色与上方渐变一一对应 ===== -->
                    <rect x="28.5" y="49.5" width="43" height="39.2" rx="7.2" fill="url(#stmkScreen)" />
                    <rect x="28.5" y="49.5" width="43" height="39.2" rx="7.2" fill="url(#stmkScreenGlow)" />

                    <g stroke-width="1.85" stroke-linecap="round">
                        <line x1="50" y1="69" x2="50" y2="56.8" stroke="#FFC46A" />
                        <line x1="50" y1="69" x2="63" y2="69" stroke="#C9A0FF" />
                        <line x1="50" y1="69" x2="50" y2="81.2" stroke="#FF9D4D" />
                        <line x1="50" y1="69" x2="37" y2="69" stroke="#5FD0A8" />
                    </g>
                    <circle cx="50" cy="56.8" r="3" fill="#FFC46A" />
                    <circle cx="63" cy="69" r="3" fill="#C9A0FF" />
                    <circle cx="50" cy="81.2" r="3" fill="#FF9D4D" />
                    <circle cx="37" cy="69" r="3" fill="#5FD0A8" />

                    <!-- 中枢光晕：stmk-hub 由 display-boot.css 做 3.4 秒呼吸动画，
                         外面那圈柔光是叠加的径向渐变，不是滤镜，性能开销更低。 -->
                    <circle class="stmk-hub" cx="50" cy="69" r="8.4" fill="url(#stmkHubGlow)" />
                    <circle cx="50" cy="69" r="3.3" fill="#FFF6E4" />
                </g>
            </svg>
            <div class="display-splash-wordmark">HOMEOS</div>
            <p id="display-splash-message" role="status" aria-live="polite">正在连接你的家…</p>
            <div id="display-splash-actions" hidden> <button id="display-splash-retry" type="button">重新加载</button>
                <button id="display-splash-enter" type="button" hidden>先进入仪表盘</button> </div>
        </div>
        <div class="display-splash-footer" aria-hidden="true">让家，触手可及</div>
    </section>
</template>
