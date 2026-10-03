<!--
组件：LoginBrandPanel.vue
所属模块：frontend / src / views
职责：登录页左侧品牌视觉区——SVG 山景 + 智能家居插画 + 顶部状态栏 + 品牌标识。
数据来源：所有展示内容由父级透传（logo / 版本 / 标语 / 信号项）。
Props：
  - brandLogoUrl：品牌 logo 图片地址。
  - pkgVersion：当前构建版本号。
  - liveLabel：顶部状态条「就绪」文案。
  - verName：版本条产品名（默认 HomeOS）。
  - brandTitle：品牌大标题。
  - brandTag：品牌副标语。
  - signalItems：底部信号项数组（默认本地节点/链路空闲/可接入）。
说明：本组件纯展示，无 emits 与外部交互。
-->
<template>
  <div class="login-scene">
    <div class="login-scene__stage" aria-hidden="true">
      <div class="login-scene__sky" />
      <div class="login-scene__aurora login-scene__aurora--a" />
      <div class="login-scene__aurora login-scene__aurora--b" />
      <div class="login-scene__stars login-scene__stars--far" />
      <div class="login-scene__stars login-scene__stars--near" />
      <div class="login-scene__hex" />
      <div class="login-scene__hex login-scene__hex--fine" />
      <div class="login-scene__dawn" />
      <div class="login-scene__orbit login-scene__orbit--outer">
        <i class="login-scene__orbit-node" />
        <i class="login-scene__orbit-node login-scene__orbit-node--opp" />
        <i class="login-scene__orbit-tick" />
      </div>
      <div class="login-scene__orbit login-scene__orbit--mid">
        <i class="login-scene__orbit-node" />
        <i class="login-scene__orbit-node login-scene__orbit-node--trail" />
        <i class="login-scene__orbit-arc" />
      </div>
      <div class="login-scene__orbit login-scene__orbit--inner">
        <i class="login-scene__orbit-node" />
        <i class="login-scene__orbit-node login-scene__orbit-node--opp" />
      </div>
      <div class="login-scene__orbit-core" />
      <div class="login-scene__radar" />
      <div class="login-scene__scan" />
      <div class="login-scene__ambient" />
      <div class="login-scene__motes">
        <i /><i /><i /><i /><i /><i /><i /><i />
      </div>

      <svg class="login-scene__mountains" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="loginMtFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#617891" stop-opacity="0.38" />
            <stop offset="100%" stop-color="#243446" stop-opacity="0.55" />
          </linearGradient>
          <linearGradient id="loginMtMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3f556a" stop-opacity="0.82" />
            <stop offset="100%" stop-color="#182430" stop-opacity="0.96" />
          </linearGradient>
          <linearGradient id="loginMtNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2c3d4e" />
            <stop offset="50%" stop-color="#121a22" />
            <stop offset="100%" stop-color="#070b11" />
          </linearGradient>
          <linearGradient id="loginSnow" x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0%" stop-color="#e4eef8" stop-opacity="0.45" />
            <stop offset="100%" stop-color="#e4eef8" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="loginHomeBody" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stop-color="#354859" />
            <stop offset="38%" stop-color="#1e2d3a" />
            <stop offset="100%" stop-color="#0a1016" />
          </linearGradient>
          <linearGradient id="loginHomeTower" x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0%" stop-color="#2b4152" />
            <stop offset="55%" stop-color="#172632" />
            <stop offset="100%" stop-color="#0a1218" />
          </linearGradient>
          <linearGradient id="loginHomeRoof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4a6276" />
            <stop offset="100%" stop-color="#1a2834" />
          </linearGradient>
          <linearGradient id="loginHomeDoor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#121a22" />
            <stop offset="100%" stop-color="#05080c" />
          </linearGradient>
          <linearGradient id="loginWinWarm" x1="0" y1="0" x2="0.15" y2="1">
            <stop offset="0%" stop-color="#fff0c8" />
            <stop offset="40%" stop-color="#f5cb8a" />
            <stop offset="100%" stop-color="#c8893f" />
          </linearGradient>
          <linearGradient id="loginWinCool" x1="0" y1="0" x2="0.1" y2="1">
            <stop offset="0%" stop-color="#e8fbff" />
            <stop offset="45%" stop-color="#7ee8ff" />
            <stop offset="100%" stop-color="#2f96c4" />
          </linearGradient>
          <radialGradient id="loginHomePad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stop-color="rgba(240,196,138,0.28)" />
            <stop offset="35%" stop-color="rgba(126,216,255,0.12)" />
            <stop offset="100%" stop-color="rgba(10,18,28,0)" />
          </radialGradient>
          <radialGradient id="loginWarmSpill" cx="50%" cy="15%" r="75%">
            <stop offset="0%" stop-color="rgba(255,210,140,0.55)" />
            <stop offset="100%" stop-color="rgba(255,210,140,0)" />
          </radialGradient>
          <radialGradient id="loginCoolSpill" cx="50%" cy="15%" r="75%">
            <stop offset="0%" stop-color="rgba(126,232,255,0.5)" />
            <stop offset="100%" stop-color="rgba(126,232,255,0)" />
          </radialGradient>
          <radialGradient id="loginWarmBloom" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(255,210,140,0.95)" />
            <stop offset="45%" stop-color="rgba(240,180,90,0.45)" />
            <stop offset="100%" stop-color="rgba(240,180,90,0)" />
          </radialGradient>
          <radialGradient id="loginCoolBloom" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(180,245,255,0.95)" />
            <stop offset="45%" stop-color="rgba(95,212,255,0.4)" />
            <stop offset="100%" stop-color="rgba(95,212,255,0)" />
          </radialGradient>
          <filter id="loginWindowGlow" x="-140%" y="-140%" width="380%" height="380%">
            <feGaussianBlur stdDeviation="1.4" result="tight" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" result="soft" />
            <feMerge>
              <feMergeNode in="soft" />
              <feMergeNode in="tight" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="loginBeaconGlow" x="-250%" y="-250%" width="600%" height="600%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="loginHomeShadow" x="-20%" y="-10%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.45" />
          </filter>
        </defs>

        <g class="login-scene__ridge login-scene__ridge--far">
          <path
            fill="url(#loginMtFar)"
            d="M0 560 L160 400 L260 470 L400 300 L500 390 L620 230 L730 360 L860 270 L1000 420 L1140 310 L1280 400 L1440 340 L1440 900 L0 900 Z"
          />
        </g>
        <g class="login-scene__ridge login-scene__ridge--mid">
          <path
            fill="url(#loginMtMid)"
            d="M0 620 L100 530 L220 590 L360 430 L460 520 L600 340 L700 450 L840 300 L960 410 L1100 360 L1240 490 L1360 420 L1440 480 L1440 900 L0 900 Z"
          />
          <path fill="url(#loginSnow)" d="M600 340 L650 390 L620 375 L700 450 L600 340 Z M840 300 L900 370 L870 345 L960 410 L840 300 Z" />
        </g>
        <g class="login-scene__ridge login-scene__ridge--near">
          <path
            fill="url(#loginMtNear)"
            d="M0 720 L140 590 L240 650 L380 510 L500 610 L660 430 L800 570 L940 470 L1080 590 L1220 530 L1440 640 L1440 900 L0 900 Z"
          />
        </g>

        <g transform="translate(360 575) scale(1.18)">
          <g class="login-scene__home">
            <path
              class="login-scene__home-aura"
              d="M110 -20 L190 70 L110 150 L30 70 Z"
              fill="rgba(95,212,255,0.045)"
            />

            <ellipse class="login-scene__home-pad" cx="110" cy="140" rx="160" ry="32" fill="url(#loginHomePad)" />
            <ellipse class="login-scene__home-spill login-scene__home-spill--warm" cx="78" cy="130" rx="64" ry="18" fill="url(#loginWarmSpill)" />
            <ellipse class="login-scene__home-spill login-scene__home-spill--cool" cx="172" cy="128" rx="42" ry="16" fill="url(#loginCoolSpill)" />

            <g filter="url(#loginHomeShadow)">
              <rect x="18" y="48" width="152" height="86" rx="3" fill="url(#loginHomeBody)" />
              <rect x="148" y="18" width="50" height="116" rx="3" fill="url(#loginHomeTower)" />
            </g>

            <rect x="20" y="50" width="2.5" height="82" fill="rgba(255,255,255,0.07)" />
            <rect x="18" y="88" width="152" height="1" fill="rgba(255,255,255,0.035)" />
            <rect x="150" y="20" width="2.5" height="112" fill="rgba(126,216,255,0.1)" />
            <rect x="148" y="74" width="50" height="1" fill="rgba(255,255,255,0.04)" />

            <rect x="10" y="42" width="168" height="9" rx="2" fill="url(#loginHomeRoof)" />
            <rect x="10" y="42" width="168" height="1.8" fill="rgba(210,230,245,0.22)" />
            <rect x="12" y="50" width="164" height="2.5" fill="rgba(0,0,0,0.28)" />
            <rect x="142" y="14" width="62" height="7" rx="1.5" fill="url(#loginHomeRoof)" />
            <rect x="142" y="14" width="62" height="1.5" fill="rgba(210,230,245,0.25)" />
            <rect x="144" y="20" width="58" height="2" fill="rgba(0,0,0,0.3)" />

            <ellipse class="login-scene__win-bloom login-scene__win-bloom--warm" cx="47" cy="77" rx="22" ry="20" fill="url(#loginWarmBloom)" />
            <ellipse class="login-scene__win-bloom login-scene__win-bloom--warm login-scene__win-bloom--d1" cx="81" cy="77" rx="22" ry="20" fill="url(#loginWarmBloom)" />
            <ellipse class="login-scene__win-bloom login-scene__win-bloom--warm login-scene__win-bloom--d2" cx="115" cy="77" rx="22" ry="20" fill="url(#loginWarmBloom)" />
            <ellipse class="login-scene__win-bloom login-scene__win-bloom--cool" cx="173" cy="50" rx="18" ry="16" fill="url(#loginCoolBloom)" />
            <ellipse class="login-scene__win-bloom login-scene__win-bloom--cool login-scene__win-bloom--d3" cx="173" cy="80" rx="18" ry="16" fill="url(#loginCoolBloom)" />

            <g filter="url(#loginWindowGlow)">
              <g class="login-scene__win">
                <rect x="36" y="64" width="22" height="26" rx="2" fill="url(#loginWinWarm)" />
                <path d="M47 64 V90 M36 77 H58" stroke="rgba(18,28,36,0.38)" stroke-width="1.1" />
              </g>
              <g class="login-scene__win login-scene__win--delay">
                <rect x="70" y="64" width="22" height="26" rx="2" fill="url(#loginWinWarm)" />
                <path d="M81 64 V90 M70 77 H92" stroke="rgba(18,28,36,0.38)" stroke-width="1.1" />
              </g>
              <g class="login-scene__win login-scene__win--soft">
                <rect x="104" y="64" width="22" height="26" rx="2" fill="url(#loginWinWarm)" />
                <path d="M115 64 V90 M104 77 H126" stroke="rgba(18,28,36,0.38)" stroke-width="1.1" />
              </g>
            </g>

            <g filter="url(#loginWindowGlow)">
              <g class="login-scene__win login-scene__win--cool">
                <rect x="160" y="40" width="20" height="20" rx="1.5" fill="url(#loginWinCool)" />
                <path d="M170 40 V60 M160 50 H180" stroke="rgba(8,20,30,0.34)" stroke-width="1" />
              </g>
              <g class="login-scene__win login-scene__win--cool login-scene__win--cool-delay">
                <rect x="160" y="70" width="20" height="20" rx="1.5" fill="url(#loginWinCool)" />
                <path d="M170 70 V90 M160 80 H180" stroke="rgba(8,20,30,0.34)" stroke-width="1" />
              </g>
            </g>

            <rect x="118" y="96" width="20" height="38" rx="2" fill="url(#loginHomeDoor)" />
            <rect x="119.5" y="97.5" width="17" height="1.2" fill="rgba(126,216,255,0.16)" />
            <rect x="122" y="104" width="12" height="22" rx="1" fill="rgba(255,255,255,0.025)" />
            <circle cx="134" cy="116" r="1.4" fill="rgba(240,196,138,0.7)" />

            <path
              class="login-scene__home-beam login-scene__home-beam--warm"
              d="M34 90 L24 132 L118 132 L128 90 Z"
              fill="rgba(255,210,140,0.09)"
            />
            <path
              class="login-scene__home-beam login-scene__home-beam--cool"
              d="M158 90 L150 130 L196 130 L182 90 Z"
              fill="rgba(126,232,255,0.1)"
            />

            <line x1="173" y1="14" x2="173" y2="8" stroke="rgba(126,232,255,0.55)" stroke-width="1.6" stroke-linecap="round" />
            <g filter="url(#loginBeaconGlow)">
              <path
                class="login-scene__uplink"
                d="M173 8 L173 -52"
                stroke="rgba(126,232,255,0.78)"
                stroke-width="1.6"
                stroke-dasharray="3.5 5.5"
                stroke-linecap="round"
                fill="none"
              />
              <circle class="login-scene__uplink-packet" cx="173" cy="-8" r="1.8" fill="#b8f4ff" />
              <circle class="login-scene__uplink-node" cx="173" cy="-56" r="3.2" fill="#b8f4ff" />
              <circle class="login-scene__beacon-ring" cx="173" cy="-56" r="8" fill="none" stroke="rgba(126,232,255,0.6)" stroke-width="1.1" />
              <circle class="login-scene__beacon-ring login-scene__beacon-ring--lag" cx="173" cy="-56" r="8" fill="none" stroke="rgba(126,232,255,0.35)" stroke-width="1" />
            </g>
            <circle cx="173" cy="12" r="2" fill="rgba(180,245,255,0.85)" />
          </g>
        </g>
      </svg>

      <div class="login-scene__mist login-scene__mist--a" />
      <div class="login-scene__mist login-scene__mist--b" />
      <div class="login-scene__horizon" />
      <div class="login-scene__haze" />
      <div class="login-scene__vignette" />
      <div class="login-scene__shade" />
    </div>

    <div class="login-scene__bar">
      <span class="login-scene__live">
        <i class="login-scene__live-dot" aria-hidden="true" />
        <span class="login-scene__live-label">{{ liveLabel }}</span>
      </span>
      <span class="login-scene__ver" :title="`${verName} ${pkgVersion}`">
        <span class="login-scene__ver-name">{{ verName }}</span>
        <span class="login-scene__ver-sep" aria-hidden="true" />
        <span class="login-scene__ver-num">v{{ pkgVersion }}</span>
      </span>
    </div>

    <div class="login-scene__brand">
      <div class="login-scene__lockup">
        <div class="login-scene__mark-wrap">
          <span class="login-scene__mark-sheen" aria-hidden="true" />
          <img :src="brandLogoUrl" alt="" class="login-scene__mark" />
        </div>
        <div class="login-scene__lockup-text">
          <h1 class="login-scene__name">HomeOS</h1>
          <div class="login-scene__accent" aria-hidden="true" />
        </div>
      </div>
      <p class="login-scene__title">{{ brandTitle }}</p>
      <p class="login-scene__tag">
        <span class="login-scene__tag-line">{{ brandTag }}</span>
      </p>
      <p class="login-scene__signal">
        <i class="login-scene__signal-dot" aria-hidden="true" />
        <template v-for="(item, idx) in signalItems" :key="`${item}-${idx}`">
          <span v-if="idx > 0" class="login-scene__signal-sep" aria-hidden="true" />
          <span>{{ item }}</span>
        </template>
      </p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  brandLogoUrl: { type: String, required: true },
  pkgVersion: { type: String, required: true },
  liveLabel: { type: String, default: '家居中枢就绪' },
  verName: { type: String, default: 'HomeOS' },
  brandTitle: { type: String, default: '智能家居管理中枢' },
  brandTag: { type: String, default: '统一调度 · 静默守护整屋' },
  signalItems: {
    type: Array,
    default: () => ['本地节点', '链路空闲', '可接入'],
  },
})
</script>