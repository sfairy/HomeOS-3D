/**
 * 联动中心（一级导航 /linkage）深链。
 * 日常编排走这里；设置「联动编排」只保留同步 / YAML / Geek 构建器。
 */
export const LINKAGE_HUB_ROUTES = {
  root: () => '/linkage',
  tab: (tab?: string) => (tab ? `/linkage?tab=${encodeURIComponent(tab)}` : '/linkage'),
  overview: () => '/linkage?tab=overview',
  scene: () => '/linkage?tab=scene',
  automation: () => '/linkage?tab=automation',
  script: () => '/linkage?tab=script',
  template: () => '/linkage?tab=template',
} as const
