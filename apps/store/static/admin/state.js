/**
 * 跨面板缓存。
 *
 * 面板之间共享的那一份内存缓存（商品目录、功能清单、核销筛选、当前站点配置等）。
 *
 * 后台各面板之间共享的那一份内存缓存。谁写谁读都在这一个对象上，避免每个面板各存一份
 * 「刚刚加载过的数据」而互相看不见。
 */

// 界面上的跨面板缓存，只放真的被读过的东西：products / productPage、各列表当前页、
// settings（凭据与邮件徽标要读它）、featureCatalog / featureGroups；
// settingsLoaded 是保存闸门读的「站点配置是否真的读到了」（见 setSettingsLoadState）。
export const state = {
  products: [],
  productPage: [],
  licenses: [],
  coupons: [],
  accounts: [],
  settings: null,
  settingsLoaded: false,
  entitlements: [],
  featureCatalog: [],
  featureGroups: [],
  // 优惠码「查看核销记录」跳过来时带的筛选；空表示看全部。写入方有两处（优惠码面板与
  // 诊断面板的核销记录），所以它属于跨面板缓存而不是某一个面板。
  redemptionFilter: null,
};
