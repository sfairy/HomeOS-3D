<!--
组件：SettingsEmbeds.vue
所属模块：frontend / src / views / settings / display
职责：内嵌网页面板。管理 MoviePilot URL 与多个自定义内嵌页面（名称、地址、图标、排序），
      支持添加/移除/重排，并通过 iframe 嵌入到大屏 Tab。
关键依赖：
  - SettingsPageShell / SettingsFlowBand / SettingsFlowStat：页面骨架与流程概览
  - SettingsOrchTabs：内嵌页 Tab 切换与排序
  - useSettingsEmbeds：内嵌页编辑逻辑（图标、地址校验、复制等）
数据来源：useSettingsEmbeds composable 派生（最终来自 layoutStore.layoutConfig）
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="embeds"
    icon-key="globe"
    accent="var(--module-accent-layout)"
    layout="single"
    page-class="embeds-hub"
    header-compact
  >
    <template #actions>
      <span
        :class="[
          'embeds-status',
          embedCount > 0 && 'embeds-status--active',
        ]"
      >
        {{ embedCount ? `${embedCount} 个页面` : '暂无页面' }}
      </span>
      <button type="button" class="settings-btn-accent" @click="addEmbed">
        <Plus class="w-4 h-4" />
        {{ '添加网页' }}
      </button>
    </template>

    <div class="settings-hub-section embed-hub">
      <div class="embed-workspace">
        <SettingsFlowBand
          :steps="embedFlowSteps"
          class="embed-flow-band"
          band-class="embed-flow-band__shell"
          collapsible
          default-collapsed
          toggle-label="内嵌流程"
          :collapsed-summary="embedFlowSummary"
        >
          <template #stats>
            <SettingsFlowStat
              :label="'MoviePilot'"
              :value="moviePilotConfigured ? '已配置' : '未配置'"
              :tone="moviePilotConfigured ? 'emerald' : 'amber'"
              :val-tone="moviePilotConfigured ? 'emerald' : 'amber'"
            />
            <SettingsFlowStat
              :label="'布局变更'"
              :value="pending ? '待保存' : '已同步'"
              :tone="pending ? 'amber' : 'emerald'"
              :val-tone="pending ? 'amber' : 'emerald'"
            />
          </template>
        </SettingsFlowBand>

        <div class="embed-mp-card">
          <div class="embed-mp-card__head">
            <MonitorPlay class="w-4 h-4" />
            <div class="min-w-0">
              <h3 class="embed-mp-card__title">{{ 'MoviePilot' }}</h3>
              <p class="embed-mp-card__desc">
                {{
                  '填写后导航栏出现 MoviePilot Tab；页面以 iframe 直链打开为主。同源或需鉴权转发时可用代理 /api/v1/system/moviepilot/*。留空则不注入入口。'
                }}
              </p>
            </div>
          </div>
          <div class="embed-url-row">
            <input
              v-model="moviePilotUrl"
              type="url"
              class="settings-field embed-url-input"
              placeholder="http://10.0.0.x:3001"
            />
            <button
              type="button"
              class="embed-copy-btn"
              :title="'复制 URL'"
              :aria-label="'复制 URL'"
              @click="copyEmbedUrl(moviePilotUrl)"
            >
              <Copy class="w-4 h-4" />
            </button>
          </div>
          <p v-if="embedUrlWarning(moviePilotUrl)" class="embed-hint embed-hint--warn">
            {{ embedUrlWarning(moviePilotUrl) }}
          </p>
          <p v-else class="embed-hint">
            {{ '勿填 HomeOS 自身地址。保存布局后生效；未配置时「#/embed/movie-pilot」显示空态引导。' }}
          </p>
        </div>

        <template v-if="embedCount">
          <div class="embed-workspace__tabs">
            <p v-if="embedCount > 1" class="embed-tabs-meta">
              {{ '选中后 ← → 调整顺序' }}
            </p>
            <SettingsOrchTabs
              :key="embedTabsKey"
              v-model="activeEmbedId"
              :tabs="embedTabs"
              sortable
              plain
              @reorder="onEmbedReorder"
            />
          </div>

          <div
            v-if="activeEmbed"
            :key="activeEmbedId"
            class="embed-workspace__body embed-workspace__body--accent"
            :style="{
              '--embed-accent': activeEmbedAccent,
              '--embed-icon-accent': activeEmbedIconAccent,
            }"
          >
            <div class="embed-editor-head">
              <div ref="iconPickerRef" class="embed-icon-picker">
                <button
                  type="button"
                  class="embed-icon-picker__trigger"
                  :title="'选择图标'"
                  @click.stop="iconPickerOpen = !iconPickerOpen"
                >
                  <component :is="embedIconMap[activeEmbed.icon || 'MonitorPlay']" class="w-4 h-4" />
                  <span class="embed-icon-picker__label">{{ embedIconLabel(activeEmbed.icon) }}</span>
                  <ChevronDown
                    :class="[
                      'embed-icon-picker__chev',
                      iconPickerOpen && 'embed-icon-picker__chev--open',
                    ]"
                  />
                </button>
                <Teleport :to="iconPickerTeleportTarget" :disabled="iconPickerTeleportDisabled">
                  <Transition name="embed-pop">
                    <div
                      v-if="iconPickerOpen"
                      ref="iconPickerPanelRef"
                      :class="[
                        'embed-icon-picker__panel',
                        iconPickerPlacement === 'top' && 'embed-icon-picker__panel--top',
                      ]"
                      :style="iconPickerDropdownStyle"
                      @click.stop
                    >
                      <button
                        v-for="iconName in embedLucidIcons"
                        :key="iconName"
                        type="button"
                        :class="[
                          'embed-icon-picker__opt',
                          activeEmbed.icon === iconName && 'embed-icon-picker__opt--active',
                        ]"
                        :style="{ '--icon-accent': embedIconAccent(iconName) }"
                        :title="embedIconLabel(iconName)"
                        :aria-label="embedIconLabel(iconName)"
                        @click="pickEmbedIcon(iconName)"
                      >
                        <component :is="embedIconMap[iconName]" class="w-4 h-4" />
                      </button>
                    </div>
                  </Transition>
                </Teleport>
              </div>

              <span
                v-if="embedUrlWarning(activeEmbed.url)"
                class="embed-status-pill embed-status-pill--warn"
              >
                {{ '待修正' }}
              </span>
              <span
                v-else-if="activeEmbed.url?.trim()"
                class="embed-status-pill embed-status-pill--ok"
              >
                {{ '可用' }}
              </span>
              <span v-else class="embed-status-pill embed-status-pill--muted">{{ '未填地址' }}</span>

              <button type="button" class="embed-remove" @click="removeEmbed(activeEmbed.id)">
                {{ '移除' }}
              </button>
            </div>

            <div class="embed-form">
              <div class="embed-field">
                <label class="settings-form-label">{{ '页面名称' }}</label>
                <input
                  v-model="activeEmbed.name"
                  type="text"
                  class="settings-field"
                  :placeholder="'例如：网络存储、监控中心'"
                />
              </div>

              <div class="embed-field">
                <label class="settings-form-label">{{ '内嵌地址' }}</label>
                <div class="embed-url-row">
                  <input
                    v-model="activeEmbed.url"
                    type="text"
                    class="settings-field embed-url-input"
                    placeholder="http://10.0.0.x:8080"
                  />
                  <button
                    type="button"
                    class="embed-copy-btn"
                    :title="'复制 URL'"
                    :aria-label="'复制 URL'"
                    @click="copyEmbedUrl(activeEmbed.url)"
                  >
                    <Copy class="w-4 h-4" />
                  </button>
                </div>
                <p v-if="embedUrlWarning(activeEmbed.url)" class="embed-hint embed-hint--warn">
                  {{ embedUrlWarning(activeEmbed.url) }}
                </p>
                <p v-else class="embed-hint">
                  {{
                    '勿填 HomeOS 自身地址。HTTPS 访问时 HTTP 内嵌页将自动经同源反代加载；目标站点仍需允许 iframe（X-Frame-Options / CSP）。'
                  }}
                </p>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="embed-workspace__empty">
          <div class="settings-premium-empty settings-premium-empty--sky">
            <Globe class="settings-premium-empty__icon" />
            <p class="settings-premium-empty__title">{{ '暂无内嵌页面' }}</p>
            <p class="settings-premium-empty__desc">
              {{ '添加外部系统页面，在 HomeOS 内 iframe 嵌入展示' }}
            </p>
            <div class="settings-premium-empty__actions">
              <button
                type="button"
                class="settings-premium-empty__btn settings-premium-empty__btn--accent"
                @click="addEmbed"
              >
                <Plus class="w-3.5 h-3.5" />
                {{ '添加网页' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </SettingsPageShell>
</template>

<script setup>
import { computed } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import { Globe, Layout, MonitorPlay, Plus, ChevronDown, Copy } from '@lucide/vue'
import { useSettingsEmbeds } from '@/composables/settings/display/layout-dashboard.internals'
import { useLayoutStore } from '@/stores/layout.store'

const props = defineProps({ activeTab: { type: String, default: 'embeds' } })

const layoutStore = useLayoutStore()
// 布局是否有未保存更改：与侧栏全局保存/取消共用 layoutDirty 标记
const pending = computed(() => layoutStore.layoutDirty)

// 内嵌页编辑相关状态与方法，由 composable 统一管理
const {
  embedIconMap,
  embedLucidIcons,
  embedCount,
  activeEmbedId,
  iconPickerOpen,
  iconPickerRef,
  iconPickerPanelRef,
  iconPickerDropdownStyle,
  iconPickerTeleportTarget,
  iconPickerTeleportDisabled,
  iconPickerPlacement,
  embedTabsKey,
  embedTabs,
  activeEmbed,
  activeEmbedAccent,
  activeEmbedIconAccent,
  embedIconLabel,
  embedIconAccent,
  embedUrlWarning,
  pickEmbedIcon,
  copyEmbedUrl,
  addEmbed,
  removeEmbed,
  onEmbedReorder,
  moviePilotUrl,
  moviePilotConfigured,
} = useSettingsEmbeds(() => props.activeTab)

// 流程概览步骤：网页 URL → iframe 嵌入 → 图标主题 → 导航入口
const embedFlowSteps = computed(() => [
  { label: '网页 URL', meta: activeEmbed.value?.url?.trim() ? '已配置' : '待填写', icon: Globe, tone: 'in' },
  { label: 'iframe 嵌入', meta: '大屏 Tab', icon: Layout, tone: 'sky' },
  { label: '图标主题', meta: embedIconLabel(activeEmbed.value?.icon || 'MonitorPlay'), icon: MonitorPlay, tone: 'mid' },
  { label: '导航入口', meta: `${embedCount.value} 个页面`, icon: MonitorPlay, tone: 'out' },
])

// 流程概览折叠态摘要文案：页面数 · MoviePilot 状态 · 同步状态
const embedFlowSummary = computed(() => {
  const mp = moviePilotConfigured.value ? 'MP 已配置' : 'MP 未配置'
  const sync = pending.value ? '待保存' : '已同步'
  return `${embedCount.value} 个页面 · ${mp} · ${sync}`
})
</script>

<style src="./styles/layout-panels.css"></style>
