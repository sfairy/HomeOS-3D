/** 后台面板分区：把 `{key,label,hidden}` 列表与 `/admin/:page/:tab` 路由绑在一起。 */

import { computed, onMounted, watch, type ComputedRef, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";

export interface AdminTabItem {
  key: string;
  label: string;
  tone?: string;
  hidden?: boolean;
}

export function useAdminTabs(page: string, tabs: Ref<AdminTabItem[]> | ComputedRef<AdminTabItem[]>) {
  const route = useRoute();
  const router = useRouter();

  const visible = computed(() => tabs.value.filter((tab) => !tab.hidden));
  const active = computed(() => {
    const wanted = visible.value.find((tab) => tab.key === route.params.tab);
    return (wanted || visible.value[0])?.key || "";
  });

  function sync() {
    if (!visible.value.length) return;
    if (active.value && active.value !== String(route.params.tab || "")) {
      void router.replace(`/admin/${page}/${active.value}`);
    }
  }

  function pick(key: string) {
    if (key === active.value) return;
    void router.push(`/admin/${page}/${key}`);
  }

  function reveal(key: string) {
    void router.replace(`/admin/${page}/${key}`);
  }

  watch(() => [route.params.tab, visible.value.map((tab) => tab.key).join(",")], sync);
  onMounted(sync);

  return { active, pick, reveal };
}
