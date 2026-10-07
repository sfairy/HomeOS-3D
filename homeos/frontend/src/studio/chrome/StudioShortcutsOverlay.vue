<script setup lang="ts">
import { toRef } from 'vue'
import { useEscLayer } from '@/composables/ui/useEscStack'

const props = defineProps<{
  open: boolean
  title?: string
  rows: Array<{ action: string; keys: string }>
}>()

const emit = defineEmits<{ close: [] }>()

useEscLayer(toRef(props, 'open'), 'studio-shortcuts', () => emit('close'))
</script>

<template>
  <div
    v-if="open"
    class="sc-shortcuts-overlay"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="sc-shortcuts-card">
      <h3>{{ title || '快捷键' }}</h3>
      <dl>
        <template v-for="row in rows" :key="row.action">
          <dt>{{ row.action }}</dt>
          <dd>{{ row.keys }}</dd>
        </template>
      </dl>
      <div style="margin-top: 16px; text-align: right">
        <button type="button" class="sc-btn" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>
