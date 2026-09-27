/**
 * 后台各模块回调「外壳」时用的窄接口（`admin/app.ts`）。
 */
export type PagedLoader = () => Promise<unknown> | unknown;

export type AdminHost = {
  showLogin?: () => void;
  raw?: boolean;
  loadOverview?: () => Promise<void> | void;
  loadAccounts?: () => Promise<unknown> | unknown;
  loadLedger?: () => Promise<unknown> | unknown;
  loadSessions?: () => Promise<unknown> | unknown;
  loadLicenseSessions?: () => Promise<unknown> | unknown;
  loadRecoveryTokens?: () => Promise<unknown> | unknown;
  loadLoginAttempts?: () => Promise<unknown> | unknown;
  loadEmailVerifications?: () => Promise<unknown> | unknown;
  loadReleaseEvents?: () => Promise<unknown> | unknown;
  loadRedemptions?: () => Promise<unknown> | unknown;
  loadCoupons?: () => Promise<unknown> | unknown;
  hideEditor?: (...args: unknown[]) => void;
  showEditor?: (...args: unknown[]) => void;
  activate?: (...args: unknown[]) => Promise<unknown> | unknown;
  collectTabs?: (page: string) => unknown;
  setNavBadge?: (page: string, count: unknown) => void;
  loadProducts?: () => Promise<unknown> | unknown;
  PAGED_LOADERS?: Record<string, PagedLoader>;
  [key: string]: unknown;
};

export const host: AdminHost = {};
