/**
 * 跨面板缓存。
 */

// 界面上的跨面板缓存，只放真的被读过的东西：products / productPage、各列表当前页、
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
  redemptionFilter: null,
};
