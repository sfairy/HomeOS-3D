/** 商店前台共享领域类型（API JSON 的宽松形状）。 */

export type JsonObject = Record<string, unknown>;

export type TimerHandle = ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>;

 interface DeviceReleasePolicy {
  cooldownSeconds: number;
  lastReleasedAt?: string | null;
  nextAllowedAt?: number | null;
  remainingSeconds?: number;
  deadline?: number;
}

 interface StoreDevice {
  instanceId?: string;
  bindingId?: string;
  activatedAt?: string;
  bindingVersion?: number;
  [key: string]: unknown;
}

export interface StoreLicense {
  activationCodeId: string;
  customerId?: string;
  productId?: string;
  userLabel?: string;
  productName?: string;
  codeHint?: string;
  active?: boolean;
  validityDays?: number | null;
  accessExpiresAt?: string | null;
  device?: StoreDevice | null;
  deviceReleasePolicy?: DeviceReleasePolicy;
  [key: string]: unknown;
}

 interface StoreEntitlement {
  active?: boolean;
  licenseId?: string;
  customerId?: string;
  featureCode?: string;
  [key: string]: unknown;
}

 interface PackageItem {
  name?: string;
  [key: string]: unknown;
}

export interface StoreProduct {
  id: string;
  name?: string;
  priceCents: number;
  featureCodes?: string[];
  productType?: string;
  kind?: string;
  soldOut?: boolean;
  validityDays?: number | null;
  displayDescription?: string | null;
  note?: string | null;
  fulfillmentMode?: string;
  stockQuantity?: number | null;
  availableStock?: number | null;
  imageUrl?: string | null;
  packageItems?: PackageItem[];
  [key: string]: unknown;
}

 interface StorePayment {
  qrCode?: string;
  provider?: string;
  type?: string;
  displayName?: string;
  note?: string;
  [key: string]: unknown;
}

export interface StoreOrder {
  orderNo?: string;
  lookupToken?: string;
  status?: string;
  statusLabel?: string;
  productName?: string;
  amountCents: number;
  expiresAt?: string;
  fulfillmentMode?: string;
  orderType?: string;
  payment?: StorePayment | null;
  [key: string]: unknown;
}

 interface StoreAccount {
  email?: string;
  [key: string]: unknown;
}

export interface PaymentChannel {
  provider: string;
  displayName?: string;
  available?: boolean;
  isDefault?: boolean;
  [key: string]: unknown;
}

export interface StoreSiteConfig {
  siteTitle?: string;
  siteName?: string;
  logoUrl?: string;
  announcement?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  [key: string]: unknown;
}

 interface StoreConfiguration {
  store?: StoreSiteConfig;
  payment?: {
    channels?: PaymentChannel[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

 interface ReleaseTarget {
  expectedBindingId?: unknown;
  expectedActivatedAt?: unknown;
  expectedBindingVersion?: unknown;
  [key: string]: unknown;
}

 interface PurchaseBlock {
  label: string;
}

export interface StoreFrontState {
  products: StoreProduct[];
  product: StoreProduct | null;
  configuration: StoreConfiguration | null;
  account: StoreAccount | null;
  hasLicense: boolean;
  hasTemporaryLicense: boolean;
  hasPermanentLicense: boolean;
  hasUsedTrial: boolean;
  accountLicenses: StoreLicense[];
  accountEntitlements: StoreEntitlement[];
  accountOrders: StoreOrder[];
  accountOrdersLoaded?: boolean;
  accountOrdersTotal?: number;
  productFilter: string;
  ownedFeatureCodes: Set<string>;
  purchaseBlock?: PurchaseBlock | null;
  pollTimer: TimerHandle | null;
  paymentCountdownTimer: TimerHandle | null;
  pendingCountdownTimer: TimerHandle | null;
  accountCountdownTimer: TimerHandle | null;
  accountExpiryRefreshing: boolean;
  emailCooldownTimers: Map<HTMLButtonElement, TimerHandle>;
  deviceReleasePolicy: DeviceReleasePolicy | null;
  releaseCountdownTimer: TimerHandle | null;
  releaseOpening: boolean;
  releaseSubmitting: boolean;
  releaseLicenseId: string | null;
  releaseTarget: ReleaseTarget | null;
  labelLicenseId: string | null;
  currentOrder: StoreOrder | null;
  pendingOrder: StoreOrder | null;
  couponPreviewTimer: TimerHandle | null;
  couponPreviewSequence: number;
  _paymentVisibilityHandler?: (() => void) | null;
}

export function errorMessage(error: unknown, fallback = '请求失败'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
