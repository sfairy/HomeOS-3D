<!--
组件：SettingsWholeHomeOffSection.vue
所属模块：frontend / src / views / settings / display
职责：全屋关闭区段。配置启用开关、关闭范围（设备域）、可用角色、排除实体与限定实体，
      并展示推荐卡片（一键添加全部排除）。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFeatureMaster：卡片与总开关
  - EntityMultiSelect：实体多选
  - RecommendInsightCard：推荐卡片
  - useWholeHomeOffSection / useWholeHomeOffRecommend：配置与推荐逻辑
数据来源：useWholeHomeOffSection 派生（最终来自 layoutStore.layoutConfig.wholeHomeOff）
-->
<template>
  <SettingsCard full static>
    <SettingsFlowBand
      :steps="whOffFlowSteps"
      class="wh-off-flow-band"
      band-class="wh-off-flow-band__shell"
      collapsible
      default-collapsed
      toggle-label="全屋关闭流程"
      :collapsed-summary="whOffFlowSummary"
    >
      <template #stats>
        <SettingsFlowStat
          :label="'关闭范围'"
          :value="`${enabledDomainCount}/4`"
          tone="accent"
          val-tone="accent"
        />
        <SettingsFlowStat
          :label="'排除实体'"
          :value="wholeHomeOff.excludeEntities?.length || 0"
          tone="amber"
          val-tone="amber"
        />
      </template>
    </SettingsFlowBand>

    <SettingsFeatureMaster
      class="settings-feature-master--stack"
      :icon="Power"
      tone="rose"
      :active="wholeHomeOff.enabled"
      :title="'启用全屋关闭'"
      :hint="
        wholeHomeOff.enabled ? '顶栏按钮与语音指令已启用' : '关闭后隐藏按钮并禁用语音指令'
      "
    >
      <template #actions>
        <button
          type="button"
          class="wh-off-toggle"
          :class="{ 'wh-off-toggle--on': wholeHomeOff.enabled }"
          role="switch"
          aria-label="全屋关闭开关"
          :aria-checked="wholeHomeOff.enabled ? 'true' : 'false'"
          @click="wholeHomeOff.enabled = !wholeHomeOff.enabled"
        >
          <span
            class="wh-off-toggle__thumb"
            :class="{ 'wh-off-toggle__thumb--on': wholeHomeOff.enabled }"
          />
        </button>
      </template>
    </SettingsFeatureMaster>

    <section class="wh-off-block">
      <header class="wh-off-block__head">
        <div class="wh-off-block__icon wh-off-block__icon--rose">
          <Layers class="w-4 h-4" />
        </div>
        <div>
          <h4 class="wh-off-block__title">{{ '关闭范围' }}</h4>
          <p class="wh-off-block__desc">{{ '选择全屋关闭时批量操作的设备域' }}</p>
        </div>
        <span class="wh-off-block__badge">{{ `${enabledDomainCount}/4 已启用` }}</span>
      </header>
      <div class="wh-off-domains">
        <button
          v-for="domain in domainCards"
          :key="domain.key"
          type="button"
          :class="[
            'wh-off-domain',
            `wh-off-domain--${domain.tone}`,
            wholeHomeOff[domain.key] && 'wh-off-domain--active',
          ]"
          @click="wholeHomeOff[domain.key] = !wholeHomeOff[domain.key]"
        >
          <div class="wh-off-domain__main">
            <div :class="['wh-off-domain__icon', `wh-off-domain__icon--${domain.tone}`]">
              <component :is="domain.icon" class="w-3.5 h-3.5" />
            </div>
            <span class="wh-off-domain__label">{{ domain.label }}</span>
          </div>
          <span
            class="wh-off-domain__state"
            :class="
              wholeHomeOff[domain.key] ? 'wh-off-domain__state--on' : 'wh-off-domain__state--off'
            "
          >
            {{ wholeHomeOff[domain.key] ? '已纳入' : '未纳入' }}
          </span>
        </button>
      </div>
    </section>

    <section class="wh-off-block wh-off-block--roles">
      <header class="wh-off-block__head">
        <div class="wh-off-block__icon wh-off-block__icon--amber">
          <Users class="w-4 h-4" />
        </div>
        <div>
          <h4 class="wh-off-block__title">{{ '可用角色' }}</h4>
          <p class="wh-off-block__desc">{{ '仅被选中的角色可见顶栏按钮并可执行语音全屋关闭' }}</p>
        </div>
        <span class="wh-off-block__badge">{{ `${(wholeHomeOff.roles || []).length} 个角色` }}</span>
      </header>
      <div class="wh-off-roles">
        <button
          v-for="role in WHOLE_HOME_OFF_ROLE_OPTIONS"
          :key="role"
          type="button"
          :class="['wh-off-role', roleActive(role) && 'wh-off-role--active']"
          @click="toggleRole(role)"
        >
          {{ roleLabel(role) }}
        </button>
      </div>
    </section>

    <RecommendInsightCard
      :title="recommendations.title || '全屋关闭推荐'"
      :summary="recommendations.summary"
      :loading="loading"
      :actionable="recommendations.hasActionable"
      :show-apply="recommendations.hasActionable"
      apply-label="一键添加全部排除"
      :groups="recommendations.groups"
      :visible="recommendations.hasActionable || loading"
      @refresh="refresh"
      @apply="applyAll"
      @chip-click="applyChip"
    />

    <section class="wh-off-entities">
      <div class="wh-off-entity wh-off-entity--exclude">
        <header class="wh-off-entity__head">
          <div class="wh-off-entity__icon">
            <ShieldOff class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h4 class="wh-off-entity__title">{{ '排除实体' }}</h4>
            <p class="wh-off-entity__desc">{{ '多选后这些实体永远不会被批量关闭' }}</p>
          </div>
          <span v-if="wholeHomeOff.excludeEntities?.length" class="wh-off-entity__count">
            {{ wholeHomeOff.excludeEntities.length }}
          </span>
        </header>
        <EntityMultiSelect
          v-model="wholeHomeOff.excludeEntities"
          :allowed-domains="entityDomains"
          :placeholder="'搜索并选择要排除的实体'"
        />
      </div>

      <div class="wh-off-entity wh-off-entity--limit">
        <header class="wh-off-entity__head">
          <div class="wh-off-entity__icon">
            <ListFilter class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h4 class="wh-off-entity__title">{{ '限定实体（可选）' }}</h4>
            <p class="wh-off-entity__desc">{{ '留空按域扫描全屋；非空时仅操作列表内实体' }}</p>
          </div>
          <span v-if="wholeHomeOff.entityIds?.length" class="wh-off-entity__count">
            {{ wholeHomeOff.entityIds.length }}
          </span>
        </header>
        <EntityMultiSelect
          v-model="wholeHomeOff.entityIds"
          :allowed-domains="entityDomains"
          :placeholder="'搜索并选择限定实体（可留空）'"
        />
      </div>
    </section>
  </SettingsCard>
</template>

<script setup>
import { computed } from 'vue'
import { Power, Layers, Users, ShieldOff, ListFilter, Mic } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsFeatureMaster from '@/views/settings/shared/layout/SettingsFeatureMaster.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import RecommendInsightCard from '@/components/common/RecommendInsightCard.vue'
import { useWholeHomeOffSection } from '@/composables/settings/automate/security-modes-extras.internals'
import { useWholeHomeOffRecommend } from '@/composables/settings/automate/security-modes-extras.internals'

const {
  wholeHomeOff,
  entityDomains,
  domainCards,
  enabledDomainCount,
  WHOLE_HOME_OFF_ROLE_OPTIONS,
  roleLabel,
  roleActive,
  toggleRole,
} = useWholeHomeOffSection()

const { loading, recommendations, applyChip, applyAll, refresh } = useWholeHomeOffRecommend()

// 全屋关闭流程步骤：启用开关 → 关闭范围 → 角色权限 → 顶栏/语音 → 排除实体
const whOffFlowSteps = computed(() => [
  {
    label: '启用开关',
    meta: wholeHomeOff.value.enabled ? '已启用' : '已关闭',
    icon: Power,
    tone: wholeHomeOff.value.enabled ? 'in' : 'secondary',
  },
  {
    label: '关闭范围',
    meta: `${enabledDomainCount.value}/4 域`,
    icon: Layers,
    tone: 'mid',
  },
  {
    label: '角色权限',
    meta: `${(wholeHomeOff.value.roles || []).length} 角色`,
    icon: Users,
    tone: 'sky',
  },
  {
    label: '顶栏/语音',
    meta: '触发入口',
    icon: Mic,
    tone: 'exec',
  },
  {
    label: '排除实体',
    meta: `${wholeHomeOff.value.excludeEntities?.length || 0} 项`,
    icon: ShieldOff,
    tone: 'out',
  },
])

// 全屋关闭流程折叠态摘要文案
const whOffFlowSummary = computed(() => {
  const on = wholeHomeOff.value.enabled ? '已启用' : '已关闭'
  return `${on} · ${enabledDomainCount.value}/4 域 · 排除 ${wholeHomeOff.value.excludeEntities?.length || 0}`
})
</script>
<style src="./styles/settings-whole-home-off.css"></style>
