<script setup lang="ts">
/**
 * 模板保留全部 id / class，供既有命令式引导逻辑按 DOM 契约操作。
 */
import { onBeforeUnmount, onMounted } from "vue";
// 先于 pair.ts 求值：把扫码进来的 #code= 摘进 window.__HOMEOS_PAIRING_HASH__。
import "@app/auth/pairing-entry";
import { initPair } from "@app/auth/pair";
import { initEntryDeck } from "@app/auth/entry-deck";

let disposePair: (() => void) | undefined;
let disposeDeck: (() => void) | undefined;

onBeforeUnmount(() => disposeDeck?.());

onMounted(() => {
  disposePair = initPair();
  disposeDeck = initEntryDeck();
});

onBeforeUnmount(() => disposePair?.());
</script>

<template>
<div class="hos-page hos-tone--aura">
        <div class="hos-scene">
            <div class="hos-scene__stage" aria-hidden="true">
              <div class="hos-scene__sky"></div>
              <div class="hos-scene__aurora hos-scene__aurora--a"></div>
              <div class="hos-scene__aurora hos-scene__aurora--b"></div>
              <div class="hos-scene__stars hos-scene__stars--far"></div>
              <div class="hos-scene__stars hos-scene__stars--near"></div>
              <div class="hos-scene__hex"></div>
              <div class="hos-scene__hex hos-scene__hex--fine"></div>
              <div class="hos-scene__dawn"></div>
              <div class="hos-scene__orbit hos-scene__orbit--outer">
                <i class="hos-scene__orbit-node"></i>
                <i class="hos-scene__orbit-node hos-scene__orbit-node--opp"></i>
                <i class="hos-scene__orbit-tick"></i>
              </div>
              <div class="hos-scene__orbit hos-scene__orbit--mid">
                <i class="hos-scene__orbit-node"></i>
                <i class="hos-scene__orbit-node hos-scene__orbit-node--trail"></i>
                <i class="hos-scene__orbit-arc"></i>
              </div>
              <div class="hos-scene__orbit hos-scene__orbit--inner">
                <i class="hos-scene__orbit-node"></i>
                <i class="hos-scene__orbit-node hos-scene__orbit-node--opp"></i>
              </div>
              <div class="hos-scene__orbit-core"></div>
              <div class="hos-scene__radar"></div>
              <div class="hos-scene__scan"></div>
              <div class="hos-scene__ambient"></div>
              <div class="hos-scene__motes">
                <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
              </div>

              <svg class="hos-scene__mountains" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
                <defs>
                  <linearGradient id="hosMtFar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#5f7396" stop-opacity="0.38" />
                    <stop offset="100%" stop-color="#1e2b46" stop-opacity="0.55" />
                  </linearGradient>
                  <linearGradient id="hosMtMid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#3c5074" stop-opacity="0.82" />
                    <stop offset="100%" stop-color="#131d33" stop-opacity="0.96" />
                  </linearGradient>
                  <linearGradient id="hosMtNear" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#293a55" />
                    <stop offset="50%" stop-color="#0d1420" />
                    <stop offset="100%" stop-color="#050a13" />
                  </linearGradient>
                  <linearGradient id="hosSnow" x1="0" y1="0" x2="0.25" y2="1">
                    <stop offset="0%" stop-color="#e4eef8" stop-opacity="0.45" />
                    <stop offset="100%" stop-color="#e4eef8" stop-opacity="0" />
                  </linearGradient>
                  <linearGradient id="hosHomeBody" x1="0" y1="0" x2="0.4" y2="1">
                    <stop offset="0%" stop-color="#33475f" />
                    <stop offset="38%" stop-color="#1c2a3d" />
                    <stop offset="100%" stop-color="#090f18" />
                  </linearGradient>
                  <linearGradient id="hosHomeTower" x1="0" y1="0" x2="0.25" y2="1">
                    <stop offset="0%" stop-color="#2a4060" />
                    <stop offset="55%" stop-color="#16243a" />
                    <stop offset="100%" stop-color="#091019" />
                  </linearGradient>
                  <linearGradient id="hosHomeRoof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#46607a" />
                    <stop offset="100%" stop-color="#182438" />
                  </linearGradient>
                  <linearGradient id="hosHomeDoor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#111a26" />
                    <stop offset="100%" stop-color="#050a12" />
                  </linearGradient>

                  <linearGradient id="hosWinWarm" x1="0" y1="0" x2="0.15" y2="1">
                    <stop offset="0%" stop-color="#fff0c8" />
                    <stop offset="40%" stop-color="#f5cb8a" />
                    <stop offset="100%" stop-color="#c8893f" />
                  </linearGradient>
                  <linearGradient id="hosWinEco" x1="0" y1="0" x2="0.15" y2="1">
                    <stop offset="0%" stop-color="#e8fff6" />
                    <stop offset="42%" stop-color="#8fe6c5" />
                    <stop offset="100%" stop-color="#33a97e" />
                  </linearGradient>
                  <linearGradient id="hosWinAura" x1="0" y1="0" x2="0.15" y2="1">
                    <stop offset="0%" stop-color="#f2ecff" />
                    <stop offset="42%" stop-color="#bfa8ff" />
                    <stop offset="100%" stop-color="#7a63d8" />
                  </linearGradient>
                  <linearGradient id="hosWinCool" x1="0" y1="0" x2="0.1" y2="1">
                    <stop offset="0%" stop-color="#e8fbff" />
                    <stop offset="45%" stop-color="#7ee8ff" />
                    <stop offset="100%" stop-color="#2f96c4" />
                  </linearGradient>
                  <radialGradient id="hosHomePad" cx="50%" cy="45%" r="55%">
                    <stop offset="0%" stop-color="rgba(255,184,110,0.26)" />
                    <stop offset="35%" stop-color="rgba(255,196,106,0.12)" />
                    <stop offset="100%" stop-color="rgba(5,9,18,0)" />
                  </radialGradient>
                  <radialGradient id="hosWarmSpill" cx="50%" cy="15%" r="75%">
                    <stop offset="0%" stop-color="rgba(255,196,128,0.55)" />
                    <stop offset="100%" stop-color="rgba(255,196,128,0)" />
                  </radialGradient>
                  <radialGradient id="hosCoolSpill" cx="50%" cy="15%" r="75%">
                    <stop offset="0%" stop-color="rgba(88,196,255,0.5)" />
                    <stop offset="100%" stop-color="rgba(88,196,255,0)" />
                  </radialGradient>
                  <radialGradient id="hosWarmBloom" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="rgba(255,206,138,0.95)" />
                    <stop offset="45%" stop-color="rgba(255,178,96,0.45)" />
                    <stop offset="100%" stop-color="rgba(255,178,96,0)" />
                  </radialGradient>
                  <radialGradient id="hosEcoBloom" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="rgba(190,255,232,0.9)" />
                    <stop offset="45%" stop-color="rgba(78,214,168,0.42)" />
                    <stop offset="100%" stop-color="rgba(78,214,168,0)" />
                  </radialGradient>
                  <radialGradient id="hosAuraBloom" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="rgba(226,214,255,0.9)" />
                    <stop offset="45%" stop-color="rgba(156,138,255,0.42)" />
                    <stop offset="100%" stop-color="rgba(156,138,255,0)" />
                  </radialGradient>
                  <radialGradient id="hosCoolBloom" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="rgba(190,232,255,0.95)" />
                    <stop offset="45%" stop-color="rgba(88,196,255,0.4)" />
                    <stop offset="100%" stop-color="rgba(88,196,255,0)" />
                  </radialGradient>
                  <filter id="hosWindowGlow" x="-140%" y="-140%" width="380%" height="380%">
                    <feGaussianBlur stdDeviation="1.4" result="tight" />
                    <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" result="soft" />
                    <feMerge>
                      <feMergeNode in="soft" />
                      <feMergeNode in="tight" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="hosBeaconGlow" x="-250%" y="-250%" width="600%" height="600%">
                    <feGaussianBlur stdDeviation="3" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="hosHomeShadow" x="-20%" y="-10%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.45" />
                  </filter>
                </defs>

                <g class="hos-scene__ridge hos-scene__ridge--far">
                  <path
                    fill="url(#hosMtFar)"
                    d="M0 560 L160 400 L260 470 L400 300 L500 390 L620 230 L730 360 L860 270 L1000 420 L1140 310 L1280 400 L1440 340 L1440 900 L0 900 Z"
                  />
                </g>
                <g class="hos-scene__ridge hos-scene__ridge--mid">
                  <path
                    fill="url(#hosMtMid)"
                    d="M0 620 L100 530 L220 590 L360 430 L460 520 L600 340 L700 450 L840 300 L960 410 L1100 360 L1240 490 L1360 420 L1440 480 L1440 900 L0 900 Z"
                  />
                  <path fill="url(#hosSnow)" d="M600 340 L650 390 L620 375 L700 450 L600 340 Z M840 300 L900 370 L870 345 L960 410 L840 300 Z" />
                </g>
                <g class="hos-scene__ridge hos-scene__ridge--near">
                  <path
                    fill="url(#hosMtNear)"
                    d="M0 720 L140 590 L240 650 L380 510 L500 610 L660 430 L800 570 L940 470 L1080 590 L1220 530 L1440 640 L1440 900 L0 900 Z"
                  />
                </g>


                <g transform="translate(357 570) scale(1.5)">
                  <g class="hos-scene__home">
                    <path
                      class="hos-scene__home-aura"
                      d="M110 -20 L190 70 L110 150 L30 70 Z"
                      fill="rgba(255,196,106,0.05)"
                    />

                    <ellipse class="hos-scene__home-pad" cx="110" cy="140" rx="160" ry="32" fill="url(#hosHomePad)" />
                    <ellipse class="hos-scene__home-spill hos-scene__home-spill--warm" cx="78" cy="130" rx="64" ry="18" fill="url(#hosWarmSpill)" />
                    <ellipse class="hos-scene__home-spill hos-scene__home-spill--cool" cx="172" cy="128" rx="42" ry="16" fill="url(#hosCoolSpill)" />

                    <g filter="url(#hosHomeShadow)">
                      <rect x="18" y="48" width="152" height="86" rx="3" fill="url(#hosHomeBody)" />
                      <rect x="148" y="18" width="50" height="116" rx="3" fill="url(#hosHomeTower)" />
                    </g>

                    <rect x="20" y="50" width="2.5" height="82" fill="rgba(255,255,255,0.07)" />
                    <rect x="18" y="88" width="152" height="1" fill="rgba(255,255,255,0.035)" />
                    <rect x="150" y="20" width="2.5" height="112" fill="rgba(88,196,255,0.1)" />
                    <rect x="148" y="74" width="50" height="1" fill="rgba(255,255,255,0.04)" />

                    <rect x="10" y="42" width="168" height="9" rx="2" fill="url(#hosHomeRoof)" />
                    <rect x="10" y="42" width="168" height="1.8" fill="rgba(210,230,245,0.22)" />
                    <rect x="12" y="50" width="164" height="2.5" fill="rgba(0,0,0,0.28)" />
                    <rect x="142" y="14" width="62" height="7" rx="1.5" fill="url(#hosHomeRoof)" />
                    <rect x="142" y="14" width="62" height="1.5" fill="rgba(210,230,245,0.25)" />
                    <rect x="144" y="20" width="58" height="2" fill="rgba(0,0,0,0.3)" />

                    <ellipse class="hos-scene__win-bloom hos-scene__win-bloom--warm" cx="47" cy="77" rx="22" ry="20" fill="url(#hosWarmBloom)" />
                    <ellipse class="hos-scene__win-bloom hos-scene__win-bloom--eco hos-scene__win-bloom--d1" cx="81" cy="77" rx="22" ry="20" fill="url(#hosEcoBloom)" />
                    <ellipse class="hos-scene__win-bloom hos-scene__win-bloom--aura hos-scene__win-bloom--d2" cx="115" cy="77" rx="22" ry="20" fill="url(#hosAuraBloom)" />
                    <ellipse class="hos-scene__win-bloom hos-scene__win-bloom--cool" cx="173" cy="50" rx="18" ry="16" fill="url(#hosCoolBloom)" />
                    <ellipse class="hos-scene__win-bloom hos-scene__win-bloom--cool hos-scene__win-bloom--d3" cx="173" cy="80" rx="18" ry="16" fill="url(#hosCoolBloom)" />

                    <g filter="url(#hosWindowGlow)">
                      <g class="hos-scene__win">
                        <rect x="36" y="64" width="22" height="26" rx="2" fill="url(#hosWinWarm)" />
                        <path d="M47 64 V90 M36 77 H58" stroke="rgba(18,28,36,0.38)" stroke-width="1.1" />
                      </g>
                      <g class="hos-scene__win hos-scene__win--soft">
                        <rect x="70" y="64" width="22" height="26" rx="2" fill="url(#hosWinEco)" />
                        <path d="M81 64 V90 M70 77 H92" stroke="rgba(14,32,28,0.38)" stroke-width="1.1" />
                      </g>
                      <g class="hos-scene__win hos-scene__win--delay">
                        <rect x="104" y="64" width="22" height="26" rx="2" fill="url(#hosWinAura)" />
                        <path d="M115 64 V90 M104 77 H126" stroke="rgba(22,20,40,0.38)" stroke-width="1.1" />
                      </g>
                    </g>

                    <g filter="url(#hosWindowGlow)">
                      <g class="hos-scene__win hos-scene__win--cool">
                        <rect x="160" y="40" width="20" height="20" rx="1.5" fill="url(#hosWinCool)" />
                        <path d="M170 40 V60 M160 50 H180" stroke="rgba(8,20,30,0.34)" stroke-width="1" />
                      </g>
                      <g class="hos-scene__win hos-scene__win--cool hos-scene__win--cool-delay">
                        <rect x="160" y="70" width="20" height="20" rx="1.5" fill="url(#hosWinCool)" />
                        <path d="M170 70 V90 M160 80 H180" stroke="rgba(8,20,30,0.34)" stroke-width="1" />
                      </g>
                    </g>

                    <rect x="118" y="96" width="20" height="38" rx="2" fill="url(#hosHomeDoor)" />
                    <rect x="119.5" y="97.5" width="17" height="1.2" fill="rgba(88,196,255,0.16)" />
                    <rect x="122" y="104" width="12" height="22" rx="1" fill="rgba(255,255,255,0.025)" />
                    <circle cx="134" cy="116" r="1.4" fill="rgba(255,184,110,0.7)" />

                    <path
                      class="hos-scene__home-beam hos-scene__home-beam--warm"
                      d="M34 90 L24 132 L118 132 L128 90 Z"
                      fill="rgba(255,184,110,0.1)"
                    />
                    <path
                      class="hos-scene__home-beam hos-scene__home-beam--cool"
                      d="M158 90 L150 130 L196 130 L182 90 Z"
                      fill="rgba(255,217,160,0.1)"
                    />

                    <line x1="173" y1="14" x2="173" y2="8" stroke="rgba(255,217,160,0.55)" stroke-width="1.6" stroke-linecap="round" />
                    <g filter="url(#hosBeaconGlow)">
                      <path
                        class="hos-scene__uplink"
                        d="M173 8 L173 -52"
                        stroke="rgba(255,217,160,0.78)"
                        stroke-width="1.6"
                        stroke-dasharray="3.5 5.5"
                        stroke-linecap="round"
                        fill="none"
                      />
                      <circle class="hos-scene__uplink-packet" cx="173" cy="-8" r="1.8" fill="#ffd9a0" />
                      <circle class="hos-scene__uplink-node" cx="173" cy="-56" r="3.2" fill="#ffd9a0" />
                      <circle class="hos-scene__beacon-ring" cx="173" cy="-56" r="8" fill="none" stroke="rgba(255,217,160,0.6)" stroke-width="1.1" />
                      <circle class="hos-scene__beacon-ring hos-scene__beacon-ring--lag" cx="173" cy="-56" r="8" fill="none" stroke="rgba(255,217,160,0.35)" stroke-width="1" />
                    </g>
                    <circle cx="173" cy="12" r="2" fill="rgba(255,217,160,0.85)" />
                  </g>
                </g>
              </svg>

            <div class="hos-scene__mist hos-scene__mist--a"></div>
            <div class="hos-scene__mist hos-scene__mist--b"></div>
            <div class="hos-scene__horizon"></div>
            <div class="hos-scene__haze"></div>
            <div class="hos-scene__vignette"></div>
            <div class="hos-scene__shade"></div>
          </div>


          <div class="hos-scene__tint" aria-hidden="true"></div>


          <div class="hos-scene__nodes" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>


          <header class="hos-scene__head">
            <div class="hos-scene__lockup">
              <div class="hos-scene__mark-wrap">
                <span class="hos-scene__mark-sheen" aria-hidden="true"></span>
                <img src="/static/assets/icons/homeos-mark-white-orange.svg" alt="" class="hos-scene__mark" />
              </div>
              <div class="hos-scene__lockup-text">
                <span class="hos-scene__wordmark">
                  <span class="hos-scene__name">HomeOS</span>

                  <i class="hos-scene__wordmark-sep" aria-hidden="true"></i>
                  <span class="hos-scene__label">全屋智能家居</span>
                </span>
                <span class="hos-scene__accent" aria-hidden="true"></span>
              </div>
            </div>
            <div class="hos-scene__head-status">
              <span class="hos-scene__live">
                <i class="hos-scene__live-dot" aria-hidden="true"></i>
                <span class="hos-scene__live-label">等待配对</span>
              </span>
              <span class="hos-scene__ver" title="HomeOS 本机中控">
                <span class="hos-scene__ver-name">本机中控</span>
                <span class="hos-scene__ver-sep" aria-hidden="true"></span>
                <span class="hos-scene__ver-num">v1.0.0</span>
              </span>
            </div>
          </header>


          <div class="hos-scene__brand">
            <p class="hos-scene__title">把这块屏接进这个家</p>
            <p class="hos-scene__tag">
              <span class="hos-scene__tag-line">用管理员给的 6 位码，把这面屏接进来</span>
            </p>
            <div class="hos-scene__dossier">
              <p class="hos-scene__dossier-head">
                <i class="hos-scene__dossier-dot" aria-hidden="true"></i>
                <span>本机档案</span>
              </p>
              <dl class="hos-scene__dossier-list"><div class="hos-scene__dossier-row"><dt>输入</dt><dd>扫码或手动输入</dd></div><div class="hos-scene__dossier-row"><dt>凭证</dt><dd>配对成功后下发设备 Cookie</dd></div><div class="hos-scene__dossier-row"><dt>生效</dt><dd>刷新后仍停在这台设备的画面</dd></div><div class="hos-scene__dossier-row"><dt>之后</dt><dd>引导添加到主屏幕</dd></div></dl>
            </div>
          </div>
        </div>

        <main class="hos-dock">
            <section class="hos-panel hos-rise">
                <span class="hos-panel__edge" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--tl" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--tr" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--bl" aria-hidden="true"></span>
                <span class="hos-panel__corner hos-panel__corner--br" aria-hidden="true"></span>

                <div class="hos-panel__head">
                    <div class="hos-eyebrow-row">
                        <p class="hos-eyebrow">设备配对 · 04/05</p>
                        <span class="hos-secure"><i class="hos-secure-dot" aria-hidden="true"></i>6 位配对码</span>
                    </div>
                    <!-- 标题与说明都要能被 pair.js 就地改写：扫码模式与嵌入模式下说的是两件事。 -->
                    <h1 id="pair-title">配对中控设备</h1>
                    <p id="pair-description" class="hos-panel__desc">输入管理员为这台中控设置的固定 6 位配对码。</p>
                </div>

                <p id="apple-pair-note" class="hos-notice" hidden>连接成功后会引导你添加到主屏幕，以后点击 HomeOS
                    图标即可打开。</p>

                <form id="pair-form" class="hos-form">
                    <div class="hos-field">
                        <div class="hos-label-row"><label for="pair-code">6 位配对码</label></div>
                        <div class="hos-control">
                            <input id="pair-code" name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6"
                                maxlength="6" placeholder="000000" autocomplete="one-time-code" required>
                        </div>
                    </div>

                    <p id="message" class="hos-msg is-err" role="alert" hidden></p>

                    <div class="hos-actions">
                        <button class="hos-btn-primary" type="submit">完成配对</button>
                    </div>
                </form>

                <div class="hos-panel__copy">
                    <div class="hos-panel__meta">
                        <span>扫码或手动输入</span>
                        <i class="hos-panel__meta-sep" aria-hidden="true"></i>
                        <span>配对码由管理员在本机生成</span>
                    </div>
                    <p>配对成功后这台设备会拿到自己的设备 Cookie，刷新后仍停在它自己的画面。</p>
                </div>
            </section>
        </main>
    </div>

    <!-- 手持档开关：普通脚本（不导出、不 defer），必须在首帧前跑完给 <html> 挂 .hos-touch。 -->
</template>
