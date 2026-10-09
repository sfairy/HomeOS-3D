<!--
  组件文件：WeatherHubConfigPanel.vue
  所属模块：frontend/src/features/settings/display/widgets
  组件职责：天气中心 Hub 小部件配置面板，配置显示 Tab（实况/预报/雷达/空气质量/预警）
    的可见性与排序、默认 Tab 与预报天数；可选绑定天气实体与显示在家人员。
    支持独立面板与嵌入 Hero Swiper 两种模式。
  主要 props / emits：
    - defineModel draft：双向绑定配置草稿（defaultTab/visibleTabs/forecastDays/
      weatherEntityId/showPresence/presencePersonIds）
    - props embedded：是否嵌入 Hero Swiper 中（独立模式使用 SettingsCard 包裹）
    - emit save：点击保存按钮写入草稿到编辑态
  依赖关系：引用 WEATHER_HUB_TABS 常量定义 Tab 列表；usePresenceHome composable 拉取
    在家人员；引用 WidgetConfigFooter 统一的保存按钮壳。
  注意事项：至少保留 1 个可见 Tab；embedded=true 时 footer 提示需额外点「保存布局」。
-->
<template>
  <component
    :is="embedded ? 'div' : SettingsCard"
    :class="embedded ? 'weather-hub-config weather-hub-config--embedded' : undefined"
    v-bind="embedded ? {} : { static: true, extraClass: 'weather-hub-config-card' }"
  >
    <SettingsCardIntro
      v-if="!embedded"
      :icon="CloudSun"
      icon-class="whc-icon-info"
      orb-class="whc-orb-info"
      eyebrow="天气中心"
      description="配置默认视图、显示 Tab 与数据源；留空实体则沿用全局绑定。"
      bordered
    />

    <div class="weather-hub-config__body">
      <section class="weather-hub-config__block">
        <h4 class="weather-hub-config__block-title">{{ '视图与 Tab' }}</h4>

        <div class="weather-hub-config__field">
          <label class="settings-form-label">{{ '显示 Tab' }}</label>
          <p class="weather-hub-config__hint">{{ '至少保留 1 个；未勾选的视图不会在 Tab 栏出现。' }}</p>
          <div class="weather-hub-config__tab-grid">
            <button
              v-for="tab in WEATHER_HUB_TABS"
              :key="tab.id"
              type="button"
              :disabled="isTabVisible(tab.id) && visibleTabCount <= 1"
              :class="[
                'weather-hub-config__tab-toggle',
                isTabVisible(tab.id) && 'weather-hub-config__tab-toggle--on',
              ]"
              @click="toggleTab(tab.id)"
            >
              <span v-if="isTabVisible(tab.id)" class="weather-hub-config__tab-order">{{
                tabOrder(tab.id)
              }}</span>
              <span>{{ tab.label }}</span>
            </button>
          </div>
        </div>

        <div class="weather-hub-config__field">
          <label class="settings-form-label">{{ '默认 Tab' }}</label>
          <div class="weather-hub-config__segments">
            <button
              v-for="tab in visibleTabOptions"
              :key="tab.id"
              type="button"
              :class="[
                'weather-hub-config__segment',
                draft.defaultTab === tab.id && 'weather-hub-config__segment--active',
              ]"
              @click="draft.defaultTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div v-if="isTabVisible('forecast')" class="weather-hub-config__field">
          <label class="settings-form-label">{{ '预报天数' }}</label>
          <div class="weather-hub-config__segments weather-hub-config__segments--dense">
            <button
              v-for="days in forecastDayOptions"
              :key="days"
              type="button"
              :class="[
                'weather-hub-config__segment',
                draft.forecastDays === days && 'weather-hub-config__segment--active',
              ]"
              @click="draft.forecastDays = days"
            >
              {{ `${days} 天` }}
            </button>
          </div>
        </div>
      </section>

      <section class="weather-hub-config__block">
        <h4 class="weather-hub-config__block-title">{{ '数据源' }}</h4>
        <div class="weather-hub-config__field">
          <label class="settings-form-label">{{ '天气实体' }}</label>
          <EntityInput
            v-model="draft.weatherEntityId"
            domain-filter="weather"
            placeholder="留空使用全局绑定 weather.*"
          />
          <p class="weather-hub-config__hint">
            {{ '全局默认在' }}
            <RouterLink :to="SETTINGS_ROUTES.bindings('weather')" class="weather-hub-config__link">{{
              '集成绑定 → 天气'
            }}</RouterLink>
            {{ '中配置。此处填写可覆盖本卡片。' }}
          </p>
        </div>
      </section>

      <section v-if="isTabVisible('sun')" class="weather-hub-config__block">
        <div class="weather-hub-config__block-head">
          <div class="weather-hub-config__block-head-copy">
            <h4 class="weather-hub-config__block-title mb-0">{{ '日出 · 在家成员' }}</h4>
            <p class="weather-hub-config__hint mb-0">{{ '展示安防联动中配置的人员在家/离家状态' }}</p>
          </div>
          <button
            type="button"
            :class="[
              'weather-hub-config__switch',
              draft.showPresence && 'weather-hub-config__switch--on',
            ]"
            role="switch"
            :aria-checked="draft.showPresence"
            :aria-label="draft.showPresence ? '关闭日出页在家成员显示' : '开启日出页在家成员显示'"
            @click="draft.showPresence = !draft.showPresence"
          >
            <span class="weather-hub-config__switch-knob" />
          </button>
        </div>

        <div v-if="draft.showPresence" class="weather-hub-config__field weather-hub-config__field--nested">
          <label class="settings-form-label">{{ '显示人员' }}</label>
          <p class="weather-hub-config__hint">
            {{ presencePickHint }}
            <RouterLink
              :to="SETTINGS_ROUTES.securityModes('linkage')"
              class="weather-hub-config__link"
              >{{ '安防联动' }}</RouterLink
            >
            {{ '中维护人员列表；点击下方姓名切换是否显示。' }}
          </p>
          <div v-if="presenceMembers.length" class="weather-hub-config__segments">
            <button
              v-for="member in presenceMembers"
              :key="member.id"
              type="button"
              :class="[
                'weather-hub-config__segment',
                isPresencePersonSelected(member.id) && 'weather-hub-config__segment--active',
              ]"
              @click="togglePresencePerson(member.id)"
            >
              {{ member.name }}
            </button>
          </div>
          <p v-else class="weather-hub-config__hint mb-0">{{ '暂无可选人员，请先在安防联动中配置' }}</p>
        </div>
      </section>
    </div>

    <WidgetConfigFooter
      v-if="embedded"
      :layout-hint="embeddedFootHint"
      @save="$emit('save')"
    />
    <div v-else class="weather-hub-config__foot">
      <p class="weather-hub-config__foot-hint">{{ footHint }}</p>
      <button type="button" class="settings-btn-primary text-xs" @click="$emit('save')">
        {{ '保存配置' }}
      </button>
    </div>
  </component>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { CloudSun } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import WidgetConfigFooter from '@/features/settings/display/widgets/WidgetConfigFooter.vue'
import { WEATHER_HUB_TABS } from '@/utils/registry/weather-hub-options'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { usePresenceHome } from '@/composables/presence/usePresenceHome'

const draft = defineModel<{
  defaultTab: string
  visibleTabs: string[]
  forecastDays: number
  weatherEntityId: string
  showPresence: boolean
  presencePersonIds?: string[]
}>({ required: true })

defineEmits<{ save: [] }>()

defineProps<{ embedded?: boolean }>()

const {
  members: presenceMembers,
  autoMode: presenceAutoMode,
  refresh: refreshPresence,
} = usePresenceHome(0)

onMounted(() => {
  void refreshPresence()
})

const forecastDayOptions = [3, 4, 5, 6, 7]

const visibleTabOptions = computed(() =>
  WEATHER_HUB_TABS.filter((tab) => draft.value.visibleTabs.includes(tab.id)),
)

const visibleTabCount = computed(() => draft.value.visibleTabs.length)

const footHint = computed(() => visibleTabOptions.value.map((t) => t.label).join(' · '))

const embeddedFootHint = computed(
  () => `${footHint.value} · 保存后需点击页头「保存布局」持久化`,
)

const presencePickHint = computed(() => {
  const selected = draft.value.presencePersonIds?.length ?? 0
  if (selected) return `已选 ${selected} 位人员。`
  if (presenceAutoMode.value) return '未指定时显示全部自动跟踪实体，建议先在 '
  return '未指定时显示全部已配置人员，可在 '
})

function isTabVisible(id: string) {
  return draft.value.visibleTabs.includes(id)
}

function isPresencePersonSelected(id: string) {
  const ids = draft.value.presencePersonIds
  if (!ids?.length) return true
  return ids.includes(id)
}

function togglePresencePerson(id: string) {
  const allIds = presenceMembers.value.map((m) => m.id)
  if (!allIds.length) return

  let ids = draft.value.presencePersonIds?.length ? [...draft.value.presencePersonIds] : [...allIds]

  const idx = ids.indexOf(id)
  if (idx >= 0) {
    if (ids.length <= 1) return
    ids.splice(idx, 1)
  } else {
    ids.push(id)
  }

  draft.value.presencePersonIds = ids.length === allIds.length ? [] : ids
}

function tabOrder(id: string) {
  return draft.value.visibleTabs.indexOf(id) + 1
}

function toggleTab(id: string) {
  const list = draft.value.visibleTabs
  const idx = list.indexOf(id)
  if (idx >= 0) {
    if (list.length <= 1) return
    list.splice(idx, 1)
    if (draft.value.defaultTab === id) {
      draft.value.defaultTab = list[0] || 'current'
    }
    return
  }
  list.push(id)
  list.sort(
    (a, b) =>
      WEATHER_HUB_TABS.findIndex((t) => t.id === a) - WEATHER_HUB_TABS.findIndex((t) => t.id === b),
  )
}
</script>

<style scoped src="./styles/weather-hub-config-panel.css"></style>
