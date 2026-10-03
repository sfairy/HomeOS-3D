<!--
组件：SmartServicesLifespanSection.vue
所属模块：frontend / src / views / settings / interact / smart-services
职责：设备健康与寿命区段。基于开关次数与运行时长评估设备健康评分，展示概览统计（跟踪/健康/关注/告警），
      列出寿命告警设备（健康评分、告警原因）。
Props：
  - lifespanLoading / lifespanError：健康数据加载态/错误
  - lifespan：健康概览对象（totalDevices / healthyCount / warningCount / criticalCount / alerts）
  - refreshAll：刷新全部区段数据
关键依赖：
  - SettingsCard：卡片容器
  - ApiQueryState：加载态/错误重试
  - HeartPulse：健康图标
数据来源：父级 SettingsSmartServicesPanel 透传的 lifespan
-->
<template>
  <div class="settings-hub-section lifespan-hub settings-hub-section--fill">
    <SettingsCard extra-class="svc-workspace svc-workspace--lifespan svc-workspace--scrollable" static>
      <div class="svc-head-band svc-head-band--lifespan">
        <div class="svc-head">
          <div class="svc-head__orb svc-orb--lifespan">
            <HeartPulse class="w-5 h-5 svc-icon--lifespan" />
          </div>
          <div class="min-w-0">
            <h3 class="svc-head__title">{{ '设备健康与寿命' }}</h3>
            <p class="svc-head__desc">
              {{ '基于开关次数与运行时长的健康评分；阈值见「高级参数」device 分区' }}
            </p>
          </div>
        </div>

        <div v-if="lifespan" class="lifespan-overview">
          <div class="lifespan-overview__stat lifespan-overview__stat--primary">
            <HeartPulse class="w-3.5 h-3.5" />
            <span class="lifespan-overview__val">{{ lifespan.totalDevices }}</span>
            <span class="lifespan-overview__lbl">{{ '跟踪设备' }}</span>
          </div>
          <span class="lifespan-overview__pill lifespan-overview__pill--ok">
            {{ `健康 ${lifespan.healthyCount}` }}
          </span>
          <span
            v-if="lifespan.warningCount"
            class="lifespan-overview__pill lifespan-overview__pill--warn"
          >
            {{ `关注 ${lifespan.warningCount}` }}
          </span>
          <span
            v-if="lifespan.criticalCount"
            class="lifespan-overview__pill lifespan-overview__pill--crit"
          >
            {{ `告警 ${lifespan.criticalCount}` }}
          </span>
        </div>
      </div>

      <div class="svc-body svc-body--scroll">
        <ApiQueryState
          :loading="lifespanLoading"
          :error="lifespanError"
          error-title="设备健康数据加载失败"
          tone="rose"
          @retry="refreshAll"
        >
          <template v-if="lifespan">
            <section v-if="lifespan.alerts?.length" class="lifespan-section">
              <header class="lifespan-section__head">
                <p class="lifespan-section__eyebrow">{{ '需关注' }}</p>
                <h3 class="lifespan-section__title">{{ '寿命告警设备' }}</h3>
              </header>
              <div class="lifespan-alert-list">
                <article v-for="a in lifespan.alerts" :key="a.entityId" class="lifespan-alert-row">
                  <div class="lifespan-alert-row__score">
                    <span class="lifespan-alert-row__score-val">{{ a.healthScore }}</span>
                    <span class="lifespan-alert-row__score-lbl">{{ '健康' }}</span>
                  </div>
                  <div class="lifespan-alert-row__body">
                    <span class="lifespan-alert-row__name">{{ a.name || a.entityId }}</span>
                    <p class="lifespan-alert-row__meta">
                      {{ a.recommendation }} ·
                      {{ `开关 ${a.switchCount} 次 · 运行 ${a.totalHours}h` }}
                    </p>
                  </div>
                </article>
              </div>
            </section>
            <div v-else class="lifespan-ok">
              <HeartPulse class="lifespan-ok__icon" />
              <p class="lifespan-ok__title">{{ '当前无寿命告警设备' }}</p>
              <p class="lifespan-ok__desc">{{ '所有跟踪设备健康评分均在正常范围内' }}</p>
            </div>
          </template>
          <div
            v-else-if="!lifespanLoading && !lifespanError"
            class="settings-premium-empty settings-premium-empty--rose smart-svc-state"
          >
            <HeartPulse class="settings-premium-empty__icon" />
            <p class="settings-premium-empty__title">{{ '暂无设备健康数据' }}</p>
            <p class="settings-premium-empty__desc">
              {{ '请稍后刷新，或确认设备已有开关/运行记录' }}
            </p>
            <div class="settings-premium-empty__actions">
              <button
                type="button"
                class="settings-premium-empty__btn settings-premium-empty__btn--accent"
                @click="refreshAll"
              >
                {{ '刷新' }}
              </button>
            </div>
          </div>
        </ApiQueryState>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { HeartPulse } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'

defineProps({
  lifespanLoading: { type: Boolean, default: false },
  lifespanError: { type: String, default: '' },
  lifespan: { type: Object, default: null },
  refreshAll: { type: Function, required: true },
})
</script>

<style scoped src="./styles/smart-services.css"></style>
