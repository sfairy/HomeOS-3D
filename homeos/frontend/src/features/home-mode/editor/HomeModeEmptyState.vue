<script setup>
import { Home } from '@lucide/vue'
import HomeModePresetSidebar from './HomeModePresetSidebar.vue'

defineProps({
  showPresetSidebar: { type: Boolean, default: false },
  modePresets: { type: Array, default: () => [] },
  presetInstalling: { type: [String, null], default: null },
})

const emit = defineEmits(['seed', 'create', 'install-preset'])
</script>

<template>
  <div class="hm-split flex-1 min-h-0">
    <div class="hm-split__main flex flex-col overflow-y-auto px-6 py-6 gap-6">
      <div class="flex flex-wrap gap-2 justify-end shrink-0">
        <button type="button" class="hm-toolbar-btn" @click="emit('seed')">
          {{ '初始化默认' }}
        </button>
        <button type="button" class="hm-toolbar-btn hm-toolbar-btn--accent" @click="emit('create')">
          {{ '新建模式' }}
        </button>
      </div>
      <div class="hm-premium-empty hm-premium-empty--indigo">
        <Home class="hm-premium-empty__icon" />
        <p class="hm-premium-empty__title">{{ '暂无家庭模式' }}</p>
        <p class="hm-premium-empty__desc">
          {{ '使用右侧预设包，或点击「初始化默认」「新建模式」' }}
        </p>
        <div class="hm-premium-empty__actions">
          <button type="button" class="hm-premium-empty__btn" @click="emit('seed')">
            {{ '初始化默认' }}
          </button>
          <button
            type="button"
            class="hm-premium-empty__btn hm-premium-empty__btn--accent"
            @click="emit('create')"
          >
            {{ '新建模式' }}
          </button>
        </div>
      </div>
    </div>
    <HomeModePresetSidebar
      v-if="showPresetSidebar"
      :presets="modePresets"
      :installing="presetInstalling"
      @install="emit('install-preset', $event)"
    />
  </div>
</template>
