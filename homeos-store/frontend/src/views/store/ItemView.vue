<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCatalogStore } from "../../stores/catalog.js";
import { useSessionStore } from "../../stores/session.js";
import { useOrderStore } from "../../stores/order.js";
import { useSiteStore } from "../../stores/site.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useStoreToast } from "../../stores/toast.js";
import { api } from "../../api/http.js";
import { formatCents as money } from "../../money.js";
import type { StoreLicense } from "../../store-types.js";

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const session = useSessionStore();
const order = useOrderStore();
const site = useSiteStore();
const confirm = useConfirmStore();
const toast = useStoreToast();

const coupon = ref("");
const couponState = ref<"idle" | "checking" | "valid" | "invalid">("idle");
const couponMessage = ref("");
const couponDiscountCents = ref(0);
const couponOriginalCents = ref(0);
const couponAmountCents = ref(0);
const targetLicenseId = ref("");
const paymentChannel = ref("");
const submitting = ref(false);
const shareLabel = ref("复制商品链接");
let couponTimer: number | undefined;

const productId = computed(() => String(route.params.productId || ""));
const product = computed(() => catalog.findProduct(productId.value));
const isAddon = computed(() => catalog.isAddonProduct(product.value));
const isManual = computed(() => product.value?.fulfillmentMode === "manual");
const isPackage = computed(() => product.value?.productType === "package");
const unavailable = computed(
  () => Boolean(product.value) && !isAddon.value && catalog.primaryProductUnavailable(product.value!),
);

/** 购买确认以邮箱为主线；有账号名时一并展示。 */
const accountLabel = computed(() => {
  const email = session.account?.email;
  if (!email) return "尚未登录";
  const username = (session.account?.username || "").trim();
  return username ? `${username} · ${email}` : email;
});

const targets = computed<StoreLicense[]>(() => {
  const requested = new Set(product.value?.featureCodes || []);
  const seen = new Set<string>();
  return session.eligiblePermanentLicenses.filter((item) => {
    if (!item.activationCodeId || seen.has(item.activationCodeId)) return false;
    seen.add(item.activationCodeId);
    const owned = new Set(
      session.entitlements
        .filter((e) => e.active && e.licenseId === item.activationCodeId)
        .map((e) => e.featureCode as string)
        .filter(Boolean),
    );
    return !requested.size || [...requested].some((code) => !owned.has(code));
  });
});

function targetLabel(item: StoreLicense) {
  const parts = [item.userLabel || item.productName];
  if (item.userLabel && item.productName) parts.push(item.productName);
  parts.push(`激活码尾号 ${item.codeHint}`);
  if (item.device?.instanceId) parts.push(`设备 ${item.device.instanceId}`);
  return parts.join(" · ");
}

const channels = computed(() => site.paymentChannels.filter((item) => item.available));
const purchaseBlock = computed(() => {
  if (!product.value) return "";
  if (product.value.soldOut) return "已售罄";
  if (unavailable.value) {
    return session.hasPermanentLicense ? "已有永久授权，不可购买试用" : "每个账号只能购买一次试用";
  }
  return "";
});

const priceLabel = computed(() =>
  couponState.value === "valid" ? "优惠后" : "应付金额",
);
const priceCents = computed(() => {
  if (couponState.value === "valid") return couponAmountCents.value;
  return product.value?.priceCents || 0;
});

const deliveryLabel = computed(() =>
  isAddon.value ? "自动开通" : isManual.value ? "手动发货" : "自动发货",
);
const deliveryFact = computed(() =>
  isAddon.value ? "原激活码自动更新" : isManual.value ? "后台确认后发放" : "账号中心显示激活码",
);
const description = computed(() => {
  const item = product.value;
  if (!item) return "";
  return (
    item.displayDescription ||
    item.note ||
    (isAddon.value
      ? `支付确认后${catalog.addonTypeLabel(item)}会自动添加到选中的原激活码。`
      : isManual.value
        ? "支付确认后由管理员核对并发放激活码。"
        : "支付确认后系统自动生成激活码，并在账号中心显示。")
  );
});
const packageContents = computed(() =>
  isPackage.value && product.value
    ? `套餐包含：${catalog.packageContentsText(product.value)}。购买后共用一个激活码。`
    : "",
);
const stockFact = computed(() => {
  const item = product.value;
  if (!item) return "—";
  if (item.stockQuantity === null || item.stockQuantity === undefined) return "不限量";
  return item.soldOut ? "已售罄" : `剩余 ${item.availableStock} 份`;
});

watch(
  () => [productId.value, catalog.loaded],
  () => {
    coupon.value = "";
    resetCoupon();
    if (targets.value.length === 1) targetLicenseId.value = targets.value[0]!.activationCodeId;
    paymentChannel.value = channels.value.length === 1 ? channels.value[0]!.provider : "";
  },
  { immediate: true },
);

watch(coupon, () => {
  window.clearTimeout(couponTimer);
  if (!coupon.value.trim() || isManual.value) {
    resetCoupon();
    return;
  }
  couponState.value = "checking";
  couponMessage.value = "正在验证优惠码…";
  couponTimer = window.setTimeout(previewCoupon, 450);
});

function resetCoupon() {
  couponState.value = "idle";
  couponMessage.value = "";
  couponDiscountCents.value = 0;
  couponOriginalCents.value = 0;
  couponAmountCents.value = 0;
}

async function previewCoupon() {
  const item = product.value;
  const code = coupon.value.trim();
  if (!item || !code || item.fulfillmentMode === "manual") return;
  try {
    const result = await api<{
      discountCents: number;
      originalAmountCents: number;
      amountCents: number;
    }>("/coupons/preview", {
      method: "POST",
      body: JSON.stringify({ productId: item.id, couponCode: code }),
    });
    if (code !== coupon.value.trim()) return;
    couponState.value = "valid";
    couponMessage.value = `优惠码有效，优惠 ${money(result.discountCents)}`;
    couponDiscountCents.value = result.discountCents;
    couponOriginalCents.value = result.originalAmountCents;
    couponAmountCents.value = result.amountCents;
  } catch {
    if (code !== coupon.value.trim()) return;
    couponState.value = "invalid";
    couponMessage.value = "优惠码无效";
    couponDiscountCents.value = 0;
  }
}

async function ownedPermanentLicense(productIdValue: string) {
  return session.licenses.find((item) => {
    if (!item.active || item.productId !== productIdValue) return false;
    if (item.validityDays) return false;
    if (item.accessExpiresAt && new Date(item.accessExpiresAt).getTime() <= Date.now()) return false;
    return true;
  });
}

async function submit() {
  const item = product.value;
  if (!item) return;
  if (item.soldOut) {
    toast.show("该商品已售罄。", "err");
    return;
  }
  if (!session.account) {
    await confirm.confirm({
      kicker: "Login Required",
      title: "请先登录后购买",
      message: "未登录可以浏览商品，但不能购买或创建订单。",
      confirmLabel: "去登录",
      cancelLabel: "继续浏览",
    }).then((ok) => {
      if (ok) router.push("/user/authentication/login");
    });
    return;
  }
  const owned = await ownedPermanentLicense(item.id);
  if (owned) {
    const proceed = await confirm.confirm({
      kicker: "Duplicate Purchase",
      title: "你可能已经买过这个授权",
      message: `账号下已有一张有效期内的「${item.name}」授权。再买一张会额外签发一个新的激活码，而不是延长原有授权。`,
      detail: "如果你只是想续期或升级，请到账号中心使用「升级为永久授权」，或联系客服处理。",
      confirmLabel: "仍然购买新授权",
      cancelLabel: "先不买了",
    });
    if (!proceed) {
      toast.show("已取消，未创建订单。");
      return;
    }
  }
  const payload: Record<string, unknown> = {};
  if (!isManual.value) payload.couponCode = coupon.value.trim() || null;
  if (isAddon.value) {
    if (!targetLicenseId.value) {
      toast.show("请选择增量包要附加到的主授权。", "err");
      return;
    }
    payload.targetLicenseId = targetLicenseId.value;
  } else {
    const upgrade = new URLSearchParams(location.search).get("upgrade");
    if (upgrade && !catalog.isTrialProduct(item)) payload.upgradeLicenseId = upgrade;
  }
  if (paymentChannel.value) payload.paymentChannel = paymentChannel.value;

  submitting.value = true;
  try {
    await order.createOrder(item.id, payload);
  } catch {
    /* 错误已由 store 内提示。 */
  } finally {
    submitting.value = false;
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(location.href);
    shareLabel.value = "已复制链接";
    window.setTimeout(() => (shareLabel.value = "复制商品链接"), 2000);
  } catch {
    toast.show("复制失败，请手动复制地址栏链接。", "err");
  }
}
</script>

<template>
  <main class="hb-store-main" data-store-page="item">
    <div class="hb-container">
      <section v-if="!product || unavailable" class="hb-empty">
        <span><i class="fa-duotone fa-regular fa-box-open"></i></span>
        <strong>商品不可购买</strong>
        <p>该商品可能已下架或链接已失效，请返回商品列表重新选择。</p>
        <RouterLink class="hb-button hb-button--secondary" to="/products">返回商品列表</RouterLink>
      </section>

      <div v-else class="hb-checkout-shell">
        <div class="hb-checkout-main">
          <section class="hb-checkout-card" aria-label="填写购买信息">
            <div class="hb-checkout-card__header">
              <div>
                <span class="hb-kicker">Secure Checkout</span>
                <h2>{{ session.account ? "确认并支付" : "登录后继续购买" }}</h2>
              </div>
              <div class="hb-checkout-price">
                <small>{{ priceLabel }}</small>
                <div class="hb-checkout-price__amount">
                  <del v-if="couponState === 'valid'">{{ money(couponOriginalCents) }}</del>
                  <span class="price">{{ money(priceCents) }}</span>
                </div>
              </div>
            </div>

            <form class="hb-checkout-form" @submit.prevent="submit">
              <section class="hb-form-section">
                <div class="hb-form-section__head">
                  <div><strong>购买账号</strong><small>订单、激活码和设备以注册邮箱为主线归属</small></div>
                </div>
                <div class="hb-purchase-account">
                  <span><i class="fa-duotone fa-regular fa-envelope-circle-check"></i></span>
                  <div>
                    <strong>{{ accountLabel }}</strong>
                    <small>{{ session.account ? "登录账号可换，订单与激活码仍归属于注册邮箱" : "请先登录后购买，未登录不会创建订单" }}</small>
                  </div>
                </div>
                <div v-if="!session.account" class="hb-purchase-account-actions">
                  <RouterLink class="hb-button hb-button--primary" to="/user/authentication/login">登录后购买</RouterLink>
                  <RouterLink class="hb-button hb-button--secondary" to="/user/authentication/register">注册账号</RouterLink>
                </div>
              </section>

              <section v-if="isAddon" class="hb-form-section">
                <div class="hb-form-section__head">
                  <div><strong>选择原授权</strong><small>增量包将直接添加到选中的激活码</small></div>
                </div>
                <select v-model="targetLicenseId" class="hb-select" :disabled="!targets.length" aria-label="选择要添加增量包的授权">
                  <option v-if="targets.length > 1" value="" disabled>请选择要附加的主授权</option>
                  <option v-for="item in targets" :key="item.activationCodeId" :value="item.activationCodeId">
                    {{ targetLabel(item) }}
                  </option>
                </select>
                <small v-if="!targets.length" class="hb-form-help">当前账号没有可添加增量包的永久主授权。</small>
              </section>

              <section v-if="!isManual" class="hb-form-section">
                <div class="hb-form-section__head">
                  <div><strong>优惠码</strong><small>没有优惠码可留空，输入后自动校验</small></div>
                </div>
                <div class="hb-coupon-input" :class="couponState === 'valid' ? 'is-valid' : couponState === 'invalid' ? 'is-invalid' : ''">
                  <input v-model="coupon" type="text" class="hb-input" placeholder="输入优惠码" autocomplete="off" />
                  <small
                    v-if="couponState !== 'idle'"
                    class="hb-coupon-feedback"
                    :class="`is-${couponState}`"
                    aria-live="polite"
                  >{{ couponMessage }}</small>
                </div>
              </section>

              <section class="hb-form-section">
                <div class="hb-form-section__head">
                  <div><strong>购买数量</strong><small>基础授权每个订单购买 1 份</small></div>
                </div>
                <div class="hb-fixed-quantity"><strong>1</strong><span>份授权</span></div>
              </section>

              <section class="hb-form-section">
                <div class="hb-form-section__head">
                  <div><strong>选择支付方式</strong><small>支付结果由服务端确认，请勿重复付款</small></div>
                </div>
                <div class="hb-payment-methods">
                  <button
                    v-if="purchaseBlock"
                    type="button"
                    class="hb-button hb-button--primary hb-button--lg hb-pay-submit"
                    disabled
                  >{{ purchaseBlock }}</button>
                  <button
                    v-else-if="!channels.length"
                    type="button"
                    class="hb-button hb-button--primary hb-button--lg hb-pay-submit"
                    disabled
                  >支付渠道暂不可用</button>
                  <template v-else>
                    <button
                      v-for="channel in channels"
                      :key="channel.provider"
                      type="submit"
                      class="hb-button hb-button--lg hb-pay-submit"
                      :class="channel.isDefault ? 'hb-button--primary' : 'hb-button--secondary'"
                      :disabled="submitting"
                      @click="paymentChannel = channel.provider"
                    >
                      <i class="fa-duotone fa-regular fa-qrcode"></i> {{ channel.displayName }}付款
                    </button>
                  </template>
                </div>
              </section>
            </form>
          </section>
        </div>

        <aside class="hb-product-summary">
          <div class="hb-product-cover">
            <img :src="product.imageUrl || '/store-static/homeos-mark.svg'" :alt="product.name || '授权商品'" />
          </div>
          <div class="hb-product-summary__content">
            <div class="hb-product-summary__badges">
              <span><i class="fa-duotone fa-regular fa-bolt"></i> <b>{{ deliveryLabel }}</b></span>
              <span class="hb-product-summary__status"><i class="hb-dot"></i>授权服务在线</span>
            </div>
            <h1>{{ product.name }}</h1>
            <p>{{ description }}</p>
            <p v-if="packageContents" class="hb-package-contents">{{ packageContents }}</p>
            <dl class="hb-product-facts">
              <div><dt>交付方式</dt><dd>{{ deliveryFact }}</dd></div>
              <div><dt>库存状态</dt><dd>{{ stockFact }}</dd></div>
              <div><dt>售后凭证</dt><dd>订单号 + 下单邮箱</dd></div>
            </dl>
            <button type="button" class="hb-share-button" @click="share">
              <i class="fa-duotone fa-regular fa-share-nodes"></i> {{ shareLabel }}
            </button>
          </div>
        </aside>
      </div>

      <section v-if="product && !unavailable" class="hb-assurance-grid hb-checkout-assurances">
        <article data-tone="accent"><i class="fa-duotone fa-regular fa-user-check"></i><div><strong>账号统一管理</strong><p>购买记录、激活码和设备绑定都归属于当前账号。</p></div></article>
        <article data-tone="eco"><i class="fa-duotone fa-regular fa-clock"></i><div><strong>支付后自动处理</strong><p>支付平台确认后会立即生成或更新授权。</p></div></article>
        <article data-tone="lumen"><i class="fa-duotone fa-regular fa-headset"></i><div><strong>异常可人工处理</strong><p>保留订单号，管理员可查询并协助处理。</p></div></article>
      </section>
    </div>
  </main>
</template>
