<template>
  <!-- LinkageBuilderDrawer 联动构建器抽屉：侧边抽屉形式的自动化/场景/脚本编辑器 -->
  <Teleport :to="teleportTarget" :disabled="teleportDisabled">
    <Transition name="linkage-builder-drawer">
      <div v-if="open" class="linkage-builder-drawer-overlay" role="presentation">
        <div class="linkage-builder-drawer-backdrop" aria-hidden="true" @click="emit('close')" />
        <aside
          :class="[
            'linkage-builder-drawer-panel',
            'linkage-builder-drawer-panel--chrome-less',
            (kind === 'automation' ||
              kind === 'script' ||
              kind === 'scene' ||
              kind === 'template') &&
              'linkage-builder-drawer-panel--geek',
          ]"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <div class="linkage-builder-drawer-body custom-scrollbar orch-builder-workspace">
            <KeepAlive :max="4">
              <GeekAutomationBuilder
                v-if="kind === 'automation'"
                :key="`automation-${editId || 'new'}-${remountEpoch}`"
                :visible="true"
                :embedded="true"
                :initial-edit-id="editId"
                :open-placeholder-wizard="openWizard"
                :initial-local-template="initialLocalTemplate"
                class="linkage-builder-drawer-builder flex-1 h-full"
                @close="emit('close')"
                @saved="emit('saved')"
                @local-template-consumed="emit('local-template-consumed')"
              />
              <GeekSceneBuilder
                v-else-if="kind === 'scene'"
                :key="`scene-v2-${editId || 'new'}-${remountEpoch}`"
                :visible="true"
                :embedded="true"
                show-embedded-close
                :initial-edit-id="editId"
                :open-placeholder-wizard="openWizard"
                :initial-local-template="initialLocalTemplate"
                class="linkage-builder-drawer-builder flex-1 h-full"
                @close="emit('close')"
                @saved="emit('saved')"
                @local-template-consumed="emit('local-template-consumed')"
              />
              <GeekScriptBuilder
                v-else-if="kind === 'script'"
                :key="`script-v2-${editId || 'new'}-${remountEpoch}`"
                :visible="true"
                :embedded="true"
                show-embedded-close
                :initial-edit-id="editId"
                :open-placeholder-wizard="openWizard"
                :initial-local-template="initialLocalTemplate"
                class="linkage-builder-drawer-builder flex-1 h-full"
                @close="emit('close')"
                @saved="emit('saved')"
                @local-template-consumed="emit('local-template-consumed')"
              />
              <GeekTemplateBuilder
                v-else-if="kind === 'template'"
                :key="`template-${editId || 'new'}-${remountEpoch}`"
                :visible="true"
                :embedded="true"
                show-embedded-close
                :initial-edit-id="editId"
                class="linkage-builder-drawer-builder flex-1 h-full"
                @close="emit('close')"
                @saved="emit('saved')"
              />
            </KeepAlive>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
/**
 * LinkageBuilderDrawer - 联动构建器抽屉组件
 * 自动化统一使用画布编辑器（kind=automation）。
 */
import { computed, defineAsyncComponent } from 'vue'
import { useOrchestratorTeleport } from '@/composables/orchestrator/useOrchestratorTeleport'
import { LINKAGE_HUB_KIND_META } from '@/composables/orchestrator/linkage-hub.types'

const GeekAutomationBuilder = defineAsyncComponent(
  () => import('@/components/geek-automation/GeekAutomationBuilder.vue'),
)
const GeekSceneBuilder = defineAsyncComponent(
  () => import('@/components/geek-scene/GeekSceneBuilder.vue'),
)
const GeekScriptBuilder = defineAsyncComponent(
  () => import('@/components/geek-script/GeekScriptBuilder.vue'),
)
const GeekTemplateBuilder = defineAsyncComponent(
  () => import('@/components/geek-template/GeekTemplateBuilder.vue'),
)

const props = defineProps({
  open: { type: Boolean, default: false },
  /** automation | scene | script | template */
  kind: { type: String, default: 'scene' },
  editId: { type: String, default: null },
  openWizard: { type: Boolean, default: false },
  settingsRoute: { type: [String, Object], default: null },
  /** 丢弃未保存后递增，迫使 KeepAlive 重建干净实例 */
  remountEpoch: { type: Number, default: 0 },
  /** Hub「我的模板」待应用载荷 */
  initialLocalTemplate: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved', 'local-template-consumed'])
const { teleportTarget, teleportDisabled } = useOrchestratorTeleport()

const title = computed(() => {
  const meta = LINKAGE_HUB_KIND_META[props.kind]
  const action = props.editId ? '编辑' : '新建'
  return meta ? `${action}${meta.label}` : action
})
</script>

<style scoped>
.linkage-builder-drawer-builder {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
