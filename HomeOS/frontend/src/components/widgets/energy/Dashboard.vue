<!--
  EnergyDashboard.vue / components/widgets/energy
  能源中心总仪表板 Hub：顶部 WidgetHubHeader 按「概览/水电/燃气/碳排」多 Tab
  切换，展示账户完成率环、电表读数、余额、趋势图、水电燃气用量与成本。
  Props: defaultTab 默认页签 / tabSelectToken 外部强制切页 / config 布局配置
  子组件：EnergyUsageTrendPanel 趋势图 + PricingAlertPanel 电价（通过 Insight 引入）
  依赖：services/api/energy 对比、分路、账单接口；
        services/api/system 生活账户接口；
        composables: useHubTabs tab 持久化 + useEnergySource 数据访问器；
        Pinia: useEntitiesStore 传感器实体 + useLayoutStore；
        SETTINGS_ROUTES 首装向导与生活账户设置入口。
  注意：使用 defineAsyncComponent 懒加载非激活 tab 的大体积子组件。
-->
<template>
  <div
    :class="['energy-card widget-glass-card widget-hub-root', embed && 'energy-card--embed']"
  >
    <WidgetHubHeader
      v-model="activeTab"
      title="能源中心"
      accent="var(--premium-accent-amber)"
      :tabs="hubTabs"
      stacked
      class="energy-hub-head"
    >
      <template #icon
        ><Zap class="w-3.5 h-3.5" style="color: var(--premium-accent-amber)"
      /></template>
    </WidgetHubHeader>

    <div class="energy-body widget-hub-panel">
      <HaStatusDegradeBanner title="能源数据" />

      <!-- 概览：左右分栏舞台 -->
      <div v-if="activeTab === 'overview'" class="energy-overview">
        <div class="energy-split">
          <div v-if="overviewHero" class="energy-hero">
            <div class="energy-hero__glow" aria-hidden="true" />
            <span class="energy-hero__label">{{ overviewHero.label }}</span>
            <div class="energy-hero__main">
              <span class="energy-hero__val">{{ overviewHero.value }}</span>
              <span class="energy-hero__unit">{{ overviewHero.unit }}</span>
            </div>
            <div v-if="overviewHero.cost" class="energy-hero__cost-row">
              <span class="energy-hero__cost-pill">¥{{ overviewHero.cost }}</span>
              <span class="energy-hero__meter-hint">{{ heroMeterHint }}</span>
            </div>
            <div class="energy-hero__meter">
              <div class="energy-hero__meter-track">
                <div class="energy-hero__meter-fill" :style="{ width: `${heroIntensity}%` }" />
              </div>
            </div>
          </div>

          <div class="energy-config-bar">
            <div class="energy-config-bar__head">
              <span>{{ '账户配置' }}</span>
              <span class="energy-config-bar__pct"
                >{{ `${configCompletion.done}/${configCompletion.total}` }}</span
              >
            </div>
            <div
              class="energy-config-bar__ring"
              :style="{
                background: `conic-gradient(#fbbf24 ${configCompletion.pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
              }"
            >
              <span>{{ configCompletion.pct }}%</span>
            </div>
            <div class="energy-config-bar__chips">
              <span
                v-for="item in configCompletion.items"
                :key="item.key"
                :class="['energy-config-chip', item.done && 'energy-config-chip--done']"
                >{{ item.label }}</span
              >
            </div>
          </div>
        </div>

        <div v-if="overviewCards.length" class="energy-overview-grid">
          <div
            v-for="(card, idx) in overviewCards"
            :key="card.key"
            :class="[
              'energy-overview-card',
              `energy-overview-card--${card.tone}`,
              idx === 0 && overviewCards.length >= 3 && 'energy-overview-card--lead',
            ]"
          >
            <div class="energy-overview-card__top">
              <span class="energy-overview-card__icon">
                <Zap v-if="card.icon === 'zap'" class="w-3.5 h-3.5" />
                <Flame v-else-if="card.icon === 'flame'" class="w-3.5 h-3.5" />
                <Droplets v-else-if="card.icon === 'droplets'" class="w-3.5 h-3.5" />
                <Wifi v-else class="w-3.5 h-3.5" />
              </span>
              <span class="energy-overview-card__label">{{ card.label }}</span>
            </div>
            <span class="energy-overview-card__val">{{ card.value }}</span>
            <span v-if="card.suffix" class="energy-overview-card__suffix">{{ card.suffix }}</span>
          </div>
        </div>

        <VEmptyState
          v-if="!hasOverviewData"
          compact
          tone="amber"
          title="暂无能耗概览"
          description="配置能源账户后此处将汇总各品类余额与用量"
        >
          <template #action>
            <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="energy-setup-link">{{
              '前往配置'
            }}</RouterLink>
          </template>
        </VEmptyState>
      </div>

      <!-- 电力 -->
      <template v-else-if="activeTab === 'electricity'">
        <VEmptyState
          v-if="!hasGridConfig"
          compact
          tone="amber"
          title="未配置电网账户"
          description="请在设置 → 生活账户 中绑定电网用量"
        >
          <template #action>
            <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="energy-setup-link">{{
              '前往配置'
            }}</RouterLink>
          </template>
        </VEmptyState>
        <div v-else class="energy-domain">
          <div v-for="row in gridAccountList" :key="'grid-' + row.index" class="energy-account">
            <div
              v-if="gridAccountList.length > 1"
              class="energy-account__head energy-account__head--grid"
            >
              <span>{{ '电网' }}</span>
              <span class="energy-account__label">{{ row.label }}</span>
              <span v-if="row.isPrimary" class="energy-account__badge">{{ '主' }}</span>
            </div>
            <div v-if="row.stats" class="energy-metrics energy-metrics--domain">
              <div class="energy-metric energy-metric--hero">
                <span class="energy-metric__label">{{ '今日用电' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--primary">{{
                    row.stats.dailyNum
                  }}</span>
                  <span class="energy-metric__unit">kWh</span>
                  <span class="energy-metric__sub">¥{{ row.stats.dailyCost }}</span>
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '本月用电' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.monthNum }}</span>
                  <span class="energy-metric__unit">kWh</span>
                  <span class="energy-metric__sub">¥{{ row.stats.monthCost }}</span>
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '上月用电' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.lastMonthNum }}</span>
                  <span class="energy-metric__unit">kWh</span>
                  <span class="energy-metric__sub">¥{{ row.stats.lastMonthCost }}</span>
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '年度用电' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.yearNum }}</span>
                  <span class="energy-metric__unit">kWh</span>
                  <span class="energy-metric__sub">¥{{ row.stats.yearCost }}</span>
                </div>
              </div>
              <div v-if="row.stats.balance !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '账户余额' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--balance"
                    >¥{{ row.stats.balance }}</span
                  >
                  <span class="energy-metric__sub">{{ `更新于 ${row.stats.updatedAt}` }}</span>
                </div>
              </div>
              <div
                v-if="row.stats.remainingDays !== '--'"
                class="energy-metric"
              >
                <span class="energy-metric__label">{{ '预计可用' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.remainingDays }}</span>
                  <span class="energy-metric__unit">天</span>
                </div>
              </div>
            </div>
            <EnergyUsageTrendPanel
              category="grid"
              :account-index="row.index"
              accent="#fbbf24"
            />
          </div>
        </div>
      </template>

      <!-- 燃气 -->
      <template v-else-if="activeTab === 'gas'">
        <VEmptyState
          v-if="!hasGasConfig"
          compact
          tone="amber"
          title="未配置燃气账户"
          description="请在设置 → 生活账户 中绑定燃气用量"
        >
          <template #action>
            <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="energy-setup-link">{{
              '前往配置'
            }}</RouterLink>
          </template>
        </VEmptyState>
        <div v-else class="energy-domain">
          <div v-for="row in gasAccountList" :key="'gas-' + row.index" class="energy-account">
            <div
              v-if="gasAccountList.length > 1"
              class="energy-account__head energy-account__head--gas"
            >
              <span>{{ '燃气' }}</span>
              <span class="energy-account__label">{{ row.label }}</span>
              <span v-if="row.isPrimary" class="energy-account__badge">{{ '主' }}</span>
            </div>
            <div v-if="row.stats" class="energy-metrics energy-metrics--domain">
              <div class="energy-metric energy-metric--hero energy-metric--hero-gas">
                <span class="energy-metric__label">{{ '今日用气' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--primary">{{
                    row.stats.dailyNum
                  }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.dailyCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.dailyCost }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '余额' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--balance"
                    >¥{{ row.stats.balance }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '本月用气' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.monthNum }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.monthCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.monthCost }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '上月用气' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.lastMonthNum }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.lastMonthCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.lastMonthCost }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '年度用气' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.yearNum }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.yearCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.yearCost }}</span
                  >
                </div>
              </div>
              <div v-if="row.stats.meterReading !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '抄表数' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.meterReading }}</span>
                  <span class="energy-metric__unit">m³</span>
                </div>
              </div>
            </div>
            <EnergyUsageTrendPanel
              category="gas"
              :account-index="row.index"
              accent="#fb923c"
            />
          </div>
        </div>
      </template>

      <!-- 用水 -->
      <template v-else-if="activeTab === 'water'">
        <VEmptyState
          v-if="!hasWaterConfig"
          compact
          tone="amber"
          title="未配置水务账户"
          description="请在设置 → 生活账户 中绑定用水用量"
        >
          <template #action>
            <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="energy-setup-link">{{
              '前往配置'
            }}</RouterLink>
          </template>
        </VEmptyState>
        <div v-else class="energy-domain">
          <div v-for="row in waterAccountList" :key="'water-' + row.index" class="energy-account">
            <div
              v-if="waterAccountList.length > 1"
              class="energy-account__head energy-account__head--water"
            >
              <span>{{ '水务' }}</span>
              <span class="energy-account__label">{{ row.label }}</span>
              <span v-if="row.isPrimary" class="energy-account__badge">{{ '主' }}</span>
            </div>
            <div v-if="row.stats" class="energy-metrics energy-metrics--domain">
              <div class="energy-metric energy-metric--hero energy-metric--hero-water">
                <span class="energy-metric__label">{{ '今日用水' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--primary">{{
                    row.stats.dailyNum
                  }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.dailyCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.dailyCost }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '余额' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--balance"
                    >¥{{ row.stats.balance }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '本月用水' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.monthNum }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.monthCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.monthCost }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '上月用水' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.lastMonthNum }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.lastMonthCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.lastMonthCost }}</span
                  >
                </div>
              </div>
              <div class="energy-metric">
                <span class="energy-metric__label">{{ '年度用水' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.yearNum }}</span>
                  <span class="energy-metric__unit">m³</span>
                  <span v-if="row.stats.yearCost !== '--'" class="energy-metric__sub"
                    >¥{{ row.stats.yearCost }}</span
                  >
                </div>
              </div>
            </div>
            <EnergyUsageTrendPanel
              category="water"
              :account-index="row.index"
              accent="#22d3ee"
            />
          </div>
        </div>
      </template>

      <!-- 通信 -->
      <template v-else-if="activeTab === 'comm'">
        <VEmptyState
          v-if="!hasCommConfig"
          compact
          tone="amber"
          title="未配置通信账户"
          description="请在设置 → 生活账户 中绑定电信或联通账户"
        >
          <template #action>
            <RouterLink :to="SETTINGS_ROUTES.lifeAccounts()" class="energy-setup-link">{{
              '前往配置'
            }}</RouterLink>
          </template>
        </VEmptyState>
        <div v-else class="energy-domain">
          <div v-for="row in ctAccountList" :key="'ct-' + row.index" class="energy-account energy-account--comm">
            <div class="energy-account__head energy-account__head--ct">
              <span>{{ '中国电信' }}</span>
              <span v-if="ctAccountList.length > 1" class="energy-account__label">{{
                row.label
              }}</span>
              <span v-if="row.isPrimary" class="energy-account__badge">{{ '主' }}</span>
            </div>
            <div v-if="row.stats" class="energy-metrics energy-metrics--domain">
              <div class="energy-metric energy-metric--hero energy-metric--hero-comm">
                <span class="energy-metric__label">{{ '余额' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--primary"
                    >¥{{ row.stats.balance }}</span
                  >
                </div>
              </div>
              <div v-if="row.stats.monthlyFee !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '本月消费' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">¥{{ row.stats.monthlyFee }}</span>
                </div>
              </div>
              <div v-if="row.stats.dataUsed !== '--'" class="energy-metric energy-metric--gauge">
                <span class="energy-metric__label">{{ '流量已用' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataUsed }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
                <div
                  v-if="commDataPct(row.stats) != null"
                  class="energy-metric__bar"
                  role="img"
                  :aria-label="`流量已用 ${commDataPct(row.stats)}%`"
                >
                  <i :style="{ width: `${commDataPct(row.stats)}%` }" />
                </div>
              </div>
              <div v-if="row.stats.dataRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '流量剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.dataCommonRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '通用剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataCommonRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.dataSpecialRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '专用剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataSpecialRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.talkRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '通话剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.talkRemaining }}</span>
                  <span class="energy-metric__unit">分钟</span>
                </div>
              </div>
              <div v-if="row.stats.points !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '积分' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.points }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-for="row in cuAccountList" :key="'cu-' + row.index" class="energy-account energy-account--comm">
            <div class="energy-account__head energy-account__head--cu">
              <span>{{ '中国联通' }}</span>
              <span v-if="cuAccountList.length > 1" class="energy-account__label">{{
                row.label
              }}</span>
              <span v-if="row.isPrimary" class="energy-account__badge">{{ '主' }}</span>
            </div>
            <div v-if="row.stats" class="energy-metrics energy-metrics--domain">
              <div class="energy-metric energy-metric--hero energy-metric--hero-comm">
                <span class="energy-metric__label">{{ '余额' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val energy-metric__val--primary"
                    >¥{{ row.stats.balance }}</span
                  >
                </div>
              </div>
              <div v-if="row.stats.monthlyFee !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '本月消费' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">¥{{ row.stats.monthlyFee }}</span>
                </div>
              </div>
              <div v-if="row.stats.arrear !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '欠费' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">¥{{ row.stats.arrear }}</span>
                </div>
              </div>
              <div v-if="row.stats.dataUsed !== '--'" class="energy-metric energy-metric--gauge">
                <span class="energy-metric__label">{{ '流量已用' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataUsed }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
                <div
                  v-if="commDataPct(row.stats) != null"
                  class="energy-metric__bar"
                  role="img"
                  :aria-label="`流量已用 ${commDataPct(row.stats)}%`"
                >
                  <i :style="{ width: `${commDataPct(row.stats)}%` }" />
                </div>
              </div>
              <div v-if="row.stats.dataRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '流量剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.dataCommonRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '通用剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataCommonRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.dataSpecialRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '专用剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataSpecialRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.dataOtherRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '其他剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataOtherRemaining }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.dataCarryover !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '上月转接' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.dataCarryover }}</span>
                  <span class="energy-metric__unit">GB</span>
                </div>
              </div>
              <div v-if="row.stats.talkRemaining !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '通话剩余' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">{{ row.stats.talkRemaining }}</span>
                  <span class="energy-metric__unit">分钟</span>
                </div>
              </div>
              <div v-if="row.stats.creditLimit !== '--'" class="energy-metric">
                <span class="energy-metric__label">{{ '信用额度' }}</span>
                <div class="energy-metric__main">
                  <span class="energy-metric__val">¥{{ row.stats.creditLimit }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <EnergyBudgetPanel
        v-else-if="activeTab === 'budget'"
        embedded
        class="energy-embed"
        :panel-visible="panelVisibleEffective"
      />
      <EnergySolarPanel
        v-else-if="activeTab === 'solar'"
        embedded
        class="energy-embed"
        :panel-visible="panelVisibleEffective"
      />
      <EnergyAnalyticsWidget
        v-else-if="activeTab === 'analytics'"
        embedded
        class="energy-embed"
        :panel-visible="panelVisibleEffective"
      />
      <WaterStatsPanel
        v-else-if="activeTab === 'waterTrend'"
        embedded
        class="energy-embed"
        :panel-visible="panelVisibleEffective"
      />
      <EnergyInsight
        v-else-if="activeTab === 'insight'"
        embedded
        hide-tabs
        default-tab="insight"
        class="energy-embed"
        :panel-visible="panelVisibleEffective"
      />
      <PricingAlertPanel
        v-else-if="activeTab === 'pricing'"
        embedded
        class="energy-embed"
        :panel-visible="panelVisibleEffective"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * @file Dashboard.vue
 * @module widgets/energy
 * @description 能源中心 Hub 面板：聚合「概览 / 电力 / 燃气 / 用水 / 预算 / 光伏 / 洞察 / 趋势 / 电价」等 tab，
 *              通过 useEnergyDashboard 统一拉取与聚合各子模块数据，支持多账户分栏展示。
 * @dependencies
 *  - vue: computed/defineAsyncComponent 响应式与异步组件
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: Zap / Wifi / Flame / Droplets 图标
 *  - @/components/common/HaStatusDegradeBanner.vue: HA 降级提示
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/components/widgets/shared/WidgetHubHeader.vue: 通用 Hub 头部
 *  - ./BudgetPanel.vue、./AnalyticsWidget.vue、./EnergySolarPanel.vue、
 *    ./WaterStatsPanel.vue、./Insight.vue、./UsageTrendPanel.vue、./PricingAlertPanel.vue
 *  - @/composables/energy/useEnergyDashboard: 能源仪表板数据 composable
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 */
import { computed, defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import { Zap, Wifi, Flame, Droplets } from '@lucide/vue'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'
import EnergyBudgetPanel from '@/components/widgets/energy/BudgetPanel.vue'
import EnergyAnalyticsWidget from '@/components/widgets/energy/AnalyticsWidget.vue'
import EnergySolarPanel from '@/components/widgets/energy/EnergySolarPanel.vue'
import WaterStatsPanel from '@/components/widgets/energy/WaterStatsPanel.vue'
import EnergyInsight from '@/components/widgets/energy/Insight.vue'
import EnergyUsageTrendPanel from '@/components/widgets/energy/UsageTrendPanel.vue'

const PricingAlertPanel = defineAsyncComponent(
  () => import('@/components/widgets/energy/PricingAlertPanel.vue'),
)
import { useEnergyDashboard } from '@/composables/energy/useEnergyDashboard'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import './styles/energy-dashboard.css'

const props = defineProps({
  defaultTab: { type: String, default: 'overview' },
  tabSelectToken: { type: Number, default: 0 },
  floatingCompact: { type: Boolean, default: false },
  embed: { type: Boolean, default: false },
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

/**
 * 通信账户流量使用百分比：已用 / (已用 + 剩余)。
 * 仅当两项均可解析为有限数值时返回 0-100 的整数，否则返回 null（不渲染进度条）。
 */
function commDataPct(stats) {
  const used = parseFloat(stats?.dataUsed)
  const remaining = parseFloat(stats?.dataRemaining)
  if (!Number.isFinite(used) || !Number.isFinite(remaining)) return null
  const total = used + remaining
  if (total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)))
}

const {
  hubTabs,
  activeTab,
  panelVisibleEffective,
  hasGridConfig,
  hasGasConfig,
  hasWaterConfig,
  hasCommConfig,
  gridAccountList,
  gasAccountList,
  waterAccountList,
  ctAccountList,
  cuAccountList,
  hasOverviewData,
  overviewHero,
  overviewCards,
  configCompletion,
} = useEnergyDashboard(props)

/** 概览强度条：按今日电量粗略映射（无数据则用配置完成度） */
const heroIntensity = computed(() => {
  const hero = overviewHero.value
  if (!hero) return configCompletion.value.pct
  if (hero.kind === 'grid' && hero.unit === 'kWh') {
    const n = parseFloat(String(hero.value).replace(/,/g, ''))
    if (Number.isFinite(n)) return Math.max(8, Math.min(100, Math.round((n / 30) * 100)))
  }
  return Math.max(12, configCompletion.value.pct)
})

const heroMeterHint = computed(() => {
  const hero = overviewHero.value
  if (!hero) return '完善账户配置后可对比用量强度'
  if (hero.kind === 'grid') return '相对家庭日均用电强度'
  if (hero.kind === 'gas') return '燃气账户运行状态'
  return '用水账户运行状态'
})
</script>
