<template>
  <!-- 紧凑网格卡片：light/switch 域使用，点击直接切换开关（静态网格与虚拟滚动共用） -->
  <div
    class="group transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] tap-active dgm-light-card cursor-pointer"
    :class="isOn ? 'is-active' : ''"
    @click="$emit('toggle')"
  >
    <div
      :class="[
        'dgm-light-icon',
        isOn
          ? domain === 'switch'
            ? 'dgm-light-icon--switch-on'
            : 'dgm-light-icon--on'
          : 'dgm-light-icon--off',
      ]"
    >
      <component :is="icon" class="w-[18px] h-[18px]" />
    </div>
    <div class="dgm-light-body">
      <h3 class="dgm-light-name">{{ name }}</h3>
      <span
        :class="[
          'dgm-light-state',
          isOn ? (domain === 'switch' ? 'dgm-light-state--switch' : 'dgm-light-state--on') : '',
        ]"
        >{{ isOn ? '开启' : '关闭' }}</span
      >
    </div>
    <span
      class="dgm-light-dot"
      :class="isOn ? (domain === 'switch' ? 'dgm-light-dot--switch' : 'dgm-light-dot--on') : ''"
      aria-hidden="true"
    />
  </div>
</template>

<script setup>
/**
 * @file DeviceGroupLightCard.vue
 * @description light/switch 域紧凑卡片（独立组件以便静态网格与虚拟滚动复用同一份模板）
 */
defineProps({
  /** 实体域（light / switch），决定开态配色 */
  domain: { type: String, required: true },
  /**
   * 域图标组件（@lucide/vue 以函数式组件导出，故同时接受 Object / Function；
   * 运行时校验用 [Object, Function]，避免非法 prop 告警）
   */
  icon: { type: [Object, Function], required: true },
  /** 展示名称（父级已解析） */
  name: { type: String, required: true },
  /** 是否开启（决定 is-active 高亮） */
  isOn: { type: Boolean, default: false },
})

defineEmits(['toggle'])
</script>
