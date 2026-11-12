<!--
  安防模式「联动动作」单行：序号 + 域 + 服务 + 实体 + 删除。

  两个消费方（`SettingsSecurityModesModeCard.vue` 的模式动作、`SettingsSecurityModesEmergencySection.vue`
  的紧急动作）此前各抄了一份逐字相同的行模板，唯一差异是删除时 splice 的是哪个数组。
  行内格局一旦调整（例如给实体选择器换文案），两份就会漂移，故收敛到这里。

  契约：
  - `act` 是父级数组里的**同一个对象**：域/服务/实体直接写回它（与切片前一致，
    父级的 `v-for` 依赖同一引用，不需要额外事件）；
  - 删除只 `emit('remove')`，由父级决定 splice 哪个数组；
  - `domains` / `servicesForDomain` 由父级注入（两处取的是同一份 store 数据）。
-->
<template>
  <div class="sm-action-row">
    <span class="sm-action-row__idx">{{ index + 1 }}</span>
    <HosSelect
      variant="home-mode"
      block
      trigger-class="sm-action-row__select sm-action-row__select--domain"
      v-model="act.domain"
      @change="
        () => {
          act.service = ''
        }
      "
    >
      <option value="">{{ '域' }}</option>
      <option v-for="d in domains" :key="d" :value="d">{{ d }}</option>
    </HosSelect>
    <HosSelect
      variant="home-mode"
      block
      trigger-class="sm-action-row__select sm-action-row__select--service"
      v-model="act.service"
    >
      <option value="">{{ '服务' }}</option>
      <option v-for="s in servicesForDomain(act.domain)" :key="s" :value="s">{{ s }}</option>
    </HosSelect>
    <EntityInput
      v-model="act.entity_id"
      :placeholder="'实体 ID'"
      :domain-filter="act.domain || ''"
      wrapper-class="sm-action-row__entity [&_.ei-wrap]:bg-black/30 [&_input]:text-sm [&_input]:py-2.5"
    />
    <button
      type="button"
      class="sm-action-row__del"
      :title="'删除'"
      :aria-label="'删除动作'"
      @click="emit('remove')"
    >
      <Trash2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>

<script setup>
import { Trash2 } from '@lucide/vue'
import EntityInput from '@/components/common/entity-input/EntityInput.vue'
import HosSelect from '@/components/common/base/HosSelect.vue'

defineProps({
  /** 动作对象（父级数组里的同一引用，行内编辑直接写回）。 */
  act: { type: Object, required: true },
  /** 在数组中的下标（仅用于展示序号）。 */
  index: { type: Number, required: true },
  /** 可选的服务域列表。 */
  domains: { type: Array, required: true },
  /** 域 → 服务名列表。 */
  servicesForDomain: { type: Function, required: true },
})

const emit = defineEmits(['remove'])
</script>
