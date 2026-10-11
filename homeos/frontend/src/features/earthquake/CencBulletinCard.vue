/**
 * @file CencBulletinCard.vue
 * @module components/earthquake
 * @brief 台网核定速报 / 迟到确认——平静科技风公报卡片（轻量关闭，无倒计时/滑动解锁）
 */
<template>
  <Teleport to="body">
    <Transition name="cenc-fade">
      <div
        v-if="visible"
        class="cenc-root"
        role="dialog"
        aria-modal="true"
        aria-label="台网核定速报"
        @click.self="onDismiss"
      >
        <div class="cenc-card">
          <header class="cenc-card__head">
            <div class="cenc-card__eyebrow">
              <span class="cenc-card__dot" aria-hidden="true" />
              台网核定速报
            </div>
            <button type="button" class="cenc-card__close" aria-label="关闭" @click="onDismiss">
              ×
            </button>
          </header>

          <div class="cenc-card__mag">
            <span class="cenc-card__mag-label">测定震级</span>
            <span class="cenc-card__mag-value">M{{ magnitudeText }}</span>
          </div>

          <dl class="cenc-card__grid">
            <div class="cenc-card__cell">
              <dt>震中位置</dt>
              <dd>{{ event?.epicenter || '—' }}</dd>
            </div>
            <div class="cenc-card__cell">
              <dt>震源深度</dt>
              <dd>{{ depthText }}</dd>
            </div>
            <div class="cenc-card__cell">
              <dt>本地烈度</dt>
              <dd>{{ intensityText }}</dd>
            </div>
            <div class="cenc-card__cell">
              <dt>震中距</dt>
              <dd>{{ distanceText }}</dd>
            </div>
          </dl>

          <p class="cenc-card__note">
            本通报为台网核定信息，非实时预警。已过强震预警阶段时可轻量关闭。
          </p>

          <button type="button" class="cenc-card__btn" @click="onDismiss">知道了</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEarthquakeStore } from '@/stores/earthquake.store'

const earthquakeStore = useEarthquakeStore()
const { showCencBulletin, cencEvent } = storeToRefs(earthquakeStore)

const visible = computed(() => showCencBulletin.value && Boolean(cencEvent.value))
const event = computed(() => cencEvent.value)

const magnitudeText = computed(() => {
  const m = Number(event.value?.magnitude)
  return Number.isFinite(m) ? m.toFixed(1) : '—'
})

const depthText = computed(() => {
  const d = event.value?.depth
  return d != null && Number.isFinite(Number(d)) ? `${Number(d)} km` : '—'
})

const intensityText = computed(() => {
  const max = event.value?.maxIntensity
  if (max) return String(max)
  const local = event.value?.localIntensity
  return local != null && Number.isFinite(Number(local)) ? `${Number(local)} 度` : '—'
})

const distanceText = computed(() => {
  const d = event.value?.distance
  return d != null && Number.isFinite(Number(d)) ? `${Number(d)} km` : '—'
})

function onDismiss() {
  earthquakeStore.dismissCencBulletin()
}
</script>

<style src="./styles/CencBulletinCard.css"></style>
