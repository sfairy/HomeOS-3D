<!--
  内嵌网页面板。管理 MoviePilot URL 与多个自定义内嵌页面（名称、地址、图标、排序），
  支持添加/移除/重排，并通过 iframe 嵌入到大屏 Tab。
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="embeds"
    icon-key="globe"
    accent="var(--hos-color-accent)"
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
              :label="'页面'"
              :value="`${embedCount} 个`"
              tone="sky"
              val-tone="sky"
            />
            <SettingsFlowStat
              :label="'布局变更'"
              :value="pending ? '待保存' : '已同步'"
              :tone="pending ? 'amber' : 'emerald'"
              :val-tone="pending ? 'amber' : 'emerald'"
            />
          </template>
        </SettingsFlowBand>

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
import { RouterLink } from 'vue-router'
import SettingsPageShell from '@/features/settings/shell/SettingsPageShell.vue'
import SettingsOrchTabs from '@/features/settings/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import { Globe, Layout, MonitorPlay, Plus, ChevronDown, Copy } from '@lucide/vue'
import { useSettingsEmbeds } from '@/features/settings/groups/appearance/use-layout'
import { SETTINGS_ROUTES } from '@/kernel/registry/settings-route'
import { useLayoutStore } from '@/domain/layout/store/layout.store'

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
} = useSettingsEmbeds(() => props.activeTab)

// 流程概览步骤：网页 URL → iframe 嵌入 → 图标主题 → 导航入口
const embedFlowSteps = computed(() => [
  { label: '网页 URL', meta: activeEmbed.value?.url?.trim() ? '已配置' : '待填写', icon: Globe, tone: 'in' },
  { label: 'iframe 嵌入', meta: '大屏 Tab', icon: Layout, tone: 'sky' },
  { label: '图标主题', meta: embedIconLabel(activeEmbed.value?.icon || 'MonitorPlay'), icon: MonitorPlay, tone: 'mid' },
  { label: '导航入口', meta: `${embedCount.value} 个页面`, icon: MonitorPlay, tone: 'out' },
])

// 流程概览折叠态摘要文案：页面数 · 同步状态
const embedFlowSummary = computed(() => {
  const sync = pending.value ? '待保存' : '已同步'
  return `${embedCount.value} 个页面 · ${sync}`
})
</script>

<style src="./layout-panels.css"></style>
