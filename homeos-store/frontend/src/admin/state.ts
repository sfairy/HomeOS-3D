/** 跨面板缓存。 */

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

  redemptionFilter: unknown;
  [key: string]: unknown;
};


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
