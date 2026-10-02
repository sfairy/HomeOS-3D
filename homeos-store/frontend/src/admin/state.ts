/**
 * 跨面板缓存。
 */

 type AdminState = {
  products: unknown[];
  productPage: unknown[];
  licenses: unknown[];
  coupons: unknown[];
  accounts: unknown[];
  settings: unknown;
  settingsLoaded: boolean;
  settingsLoadPhase: 'loading' | 'ready' | 'error';
  settingsLoadMessage: string;
  entitlements: unknown[];
  featureCatalog: unknown[];
  featureGroups: unknown[];
  // 优惠码「查看核销记录」跳过来时带的筛选；空表示看全部。
  redemptionFilter: unknown;
  [key: string]: unknown;
};

// 界面上的跨面板缓存，只放真的被读过的东西：products / productPage、各列表当前页、
export const state: AdminState = {
  products: [],
  productPage: [],
  licenses: [],
  coupons: [],
  accounts: [],
  settings: null,
  settingsLoaded: false,
  settingsLoadPhase: 'loading',
  settingsLoadMessage: '',
  entitlements: [],
  featureCatalog: [],
  featureGroups: [],
  redemptionFilter: null,
};
