/** 商店前台共享领域类型（API JSON 的宽松形状）。 */

 interface DeviceReleasePolicy {
  cooldownSeconds: number;
  lastReleasedAt?: string | null;
  nextAllowedAt?: string | number | null;
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

export interface StoreAccount {
  username?: string | null;
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

export interface StoreConfiguration {
  store?: StoreSiteConfig;
  payment?: {
    channels?: PaymentChannel[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function errorMessage(error: unknown, fallback = '请求失败'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

/** DataTable 槽位 items 的类型断言（API 列表行 → 本地行类型）。 */
export function asListItems<T>(items: unknown[]): T[] {
  return items as T[];
}
