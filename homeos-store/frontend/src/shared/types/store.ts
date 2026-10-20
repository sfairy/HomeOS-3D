/**
 * 商店前台共享领域类型（API JSON 的宽松形状）。
 *
 * 归位说明：原 `shared/store-types.ts`（域根散件）→ `shared/types/store.ts`。
 */

import { retryAfterSeconds, withRetryHint } from "../api/error";

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
  /** 营销档位名；早期种子商品可能为空，展示时要回落到 `name`。 */
  edition?: string | null;
  /** 组合商品包含的子商品 id（后台「自定义套餐」用）。 */
  includedProductIds?: string[];
  /** 套餐内容在售出后锁定，前端只做提示，不做判定。 */
  packageContentsLocked?: boolean;
  /** 已交付订单数；0 表示没有可展示的社会化证明。 */
  purchaseCount?: number;
  /** 拥有该商品的客户数。 */
  customerCount?: number;
  [key: string]: unknown;
}

/** 功能码目录项（`GET /store/v1/features` 的 `items[]`）。 */
export interface StoreFeature {
  code: string;
  label: string;
  group: string;
  groupLabel?: string;
  description?: string;
}

/** 功能码分组（`GET /store/v1/features` 的 `groups[]`）。 */
export interface StoreFeatureGroup {
  key: string;
  label: string;
}

export interface StoreFeatureCatalog {
  groups: StoreFeatureGroup[];
  items: StoreFeature[];
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
  /** 凭据齐全 = 真能收到钱。 */
  configured?: boolean;
  /** 凭据齐全且站点开启了支付。 */
  available?: boolean;
  isDefault?: boolean;
  icon?: string;
  note?: string;
  [key: string]: unknown;
}

/** 一键部署命令（站点配置的 `deployScripts[]`）。 */
interface StoreDeployScript {
  label: string;
  command: string;
}

export interface StoreSiteConfig {
  siteTitle?: string;
  siteName?: string;
  description?: string;
  logoUrl?: string;
  announcement?: string;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  supportEmail?: string;
  deployBaseUrl?: string;
  deployScripts?: StoreDeployScript[];
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

export function errorMessage(error: unknown, fallback = "请求失败"): string {
  if (error instanceof Error && error.message) {
    // 限流提示在这里统一补齐等待时间：所有页面都经由 `errorMessage()` 展示错误，
    // 把 `Retry-After` 的消费放在这里，就不必每个 catch 各写一遍。
    return withRetryHint(error.message, retryAfterSeconds(error));
  }
  if (typeof error === "string" && error) return error;
  return fallback;
}

/** DataTable 槽位 items 的类型断言（API 列表行 → 本地行类型）。 */
export function asListItems<T>(items: unknown[]): T[] {
  return items as T[];
}
