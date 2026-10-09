<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "../../stores/session.js";
import { useCatalogStore } from "../../stores/catalog.js";
import { useOrderStore, orderCountdownText } from "../../stores/order.js";
import { useSiteStore } from "../../stores/site.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useStoreToast } from "../../stores/toast.js";
import { api } from "../../api/http.js";
import { errorMessage, type StoreLicense, type StoreOrder } from "../../store-types.js";
import { formatCents as money } from "../../money.js";

const router = useRouter();
const session = useSessionStore();
const catalog = useCatalogStore();
const order = useOrderStore();
const site = useSiteStore();
const confirm = useConfirmStore();
const toast = useStoreToast();

const activeTab = ref<"licenses" | "addons" | "orders">("licenses");
const releaseLicense = ref<StoreLicense | null>(null);
const releasePassword = ref("");
const releaseError = ref("");
const releaseSubmitting = ref(false);
const releaseDialog = ref<HTMLDialogElement | null>(null);
const labelLicense = ref<StoreLicense | null>(null);
const labelValue = ref("");
const labelDialog = ref<HTMLDialogElement | null>(null);
const now = ref(Date.now());
const loadingMore = ref(false);
let tick: number | undefined;

const email = computed(() => session.account?.email || "—");
const accountHeading = computed(() => {
  const username = (session.account?.username || "").trim();
  if (username && email.value !== "—") return `${username} · ${email.value}`;
  return username || email.value;
});
const licenses = computed(() => session.licenses);
const activeEntitlements = computed(() => session.entitlements.filter((item) => item.active));
const orders = computed(() => session.orders);
const pendingCount = computed(() => session.pendingOrders.length);
const deployScripts = computed<Array<{ label: string; command: string }>>(() => {
  const scripts = (site.configuration?.store as { deployScripts?: unknown } | undefined)?.deployScripts;
  return Array.isArray(scripts) ? (scripts as Array<{ label: string; command: string }>) : [];
});
const addonOffers = computed(() =>
  session.hasPermanentLicense ? catalog.availableAddonProducts : [],
);
const moreOrders = computed(() => session.ordersTotal - session.ordersLoaded);

function activationCode(item: StoreLicense) {
  return String(item.activationCode || item.codeHint || "");
}

function isExpired(item: StoreLicense) {
  return Boolean(item.accessExpiresAt) && new Date(String(item.accessExpiresAt)) <= new Date();
}

function stateVariant(item: StoreLicense) {
  if (!item.active) return "danger";
  return isExpired(item) ? "warning" : "success";
}

function stateText(item: StoreLicense) {
  if (!item.active) return "已停用";
  return isExpired(item) ? "已到期" : "有效";
}

function licenseTitle(item: StoreLicense, index: number) {
  return item.userLabel || `主授权 #${licenses.value.length - index}`;
}

function licensePeriod(item: StoreLicense) {
  if (!item.accessExpiresAt) return item.validityDays ? `${item.validityDays} 天` : "永久授权";
  const start = item.accessStartedAt
    ? new Date(String(item.accessStartedAt)).toLocaleDateString("zh-CN")
    : "发卡日";
  const end = new Date(String(item.accessExpiresAt)).toLocaleDateString("zh-CN");
  return `${start} 至 ${end}`;
}

function entitlementStatus(item: Record<string, unknown>) {
  const expired =
    Boolean(item.expiresAt) && new Date(String(item.expiresAt)) <= new Date();
  if (!item.active) return "已停用";
  return expired ? "已到期" : "有效";
}

function entitlementTarget(item: Record<string, unknown>) {
  const target = licenses.value.find((license) => license.activationCodeId === item.licenseId);
  return target
    ? `${target.userLabel || target.productName} · 激活码尾号 ${target.codeHint}`
    : "原主授权";
}

function orderStatusLabel(item: StoreOrder) {
  if (item.status === "paid" && item.fulfillmentMode === "manual") return "待人工发卡";
  return item.statusLabel || item.status || "";
}

function orderCountdown(item: StoreOrder) {
  void now.value;
  return orderCountdownText(item.expiresAt);
}

function policyDeadlineMs(policy: NonNullable<StoreLicense["deviceReleasePolicy"]>): number | null {
  if (policy.nextAllowedAt != null && policy.nextAllowedAt !== "") {
    const parsed =
      typeof policy.nextAllowedAt === "number"
        ? policy.nextAllowedAt
        : Date.parse(String(policy.nextAllowedAt));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (policy.lastReleasedAt && policy.cooldownSeconds) {
    const start = Date.parse(String(policy.lastReleasedAt));
    if (Number.isFinite(start)) return start + Number(policy.cooldownSeconds) * 1000;
  }
  return null;
}

function releaseRemaining(item: StoreLicense | null) {
  if (!item?.deviceReleasePolicy) return 0;
  const policy = item.deviceReleasePolicy;
  const deadline = policyDeadlineMs(policy);
  if (deadline != null) {
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }
  return Math.max(0, Math.floor(Number(policy.remainingSeconds) || 0));
}

function formatReleaseWait(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours} 时 ${minutes} 分 ${seconds} 秒`;
}

const releaseSeconds = computed(() => {
  void now.value;
  return releaseRemaining(releaseLicense.value);
});

const releaseWaitText = computed(() => {
  const remaining = releaseSeconds.value;
  return remaining > 0
    ? `这份授权还需等待 ${formatReleaseWait(remaining)}。`
    : "这份授权当前可以解绑。";
});

async function refresh() {
  await session.load().catch((error) => toast.show(errorMessage(error), "err"));
  await catalog.ensureLoaded().catch(() => {});
}

onMounted(async () => {
  tick = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  await site.load();
  await refresh();
});

onBeforeUnmount(() => window.clearInterval(tick));

function switchTab(tab: "licenses" | "addons" | "orders") {
  activeTab.value = tab;
}

async function logout() {
  await session.logout();
  router.push("/user/authentication/login");
}

async function resendEmail(item: StoreLicense) {
  try {
    const result = await api<{ sent?: boolean; email?: string; deliveryError?: string }>(
      `/account/licenses/${item.activationCodeId}/email`,
      { method: "POST" },
    );
    if (result.sent) toast.show(`激活码已发往 ${result.email}。`);
    else toast.show(result.deliveryError || "邮件未能发出，请稍后再试或联系客服。", "err");
  } catch (error) {
    toast.show(errorMessage(error, "重发失败，请稍后再试。"), "err");
  }
}

function openLabel(item: StoreLicense) {
  labelLicense.value = item;
  labelValue.value = item.userLabel || "";
  labelDialog.value?.showModal();
}

async function saveLabel() {
  if (!labelLicense.value) return;
  try {
    await api(`/account/licenses/${labelLicense.value.activationCodeId}/label`, {
      method: "PATCH",
      body: JSON.stringify({ label: labelValue.value.trim() || null }),
    });
    labelDialog.value?.close();
    labelLicense.value = null;
    toast.show("授权备注已保存。");
    await refresh();
  } catch (error) {
    toast.show(errorMessage(error), "err");
  }
}

async function openRelease(item: StoreLicense, event: Event) {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "读取解绑设置…";
  try {
    await refresh();
    const fresh = licenses.value.find((l) => l.activationCodeId === item.activationCodeId);
    if (!fresh?.device) {
      toast.show("该授权当前没有绑定设备，已刷新账号信息。");
      return;
    }
    releaseLicense.value = fresh;
    releasePassword.value = "";
    releaseError.value = "";
    releaseDialog.value?.showModal();
  } catch (error) {
    toast.show(errorMessage(error), "err");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function submitRelease() {
  const item = releaseLicense.value;
  if (!item || !item.device || releaseSubmitting.value) return;
  if (releaseSeconds.value > 0) return;
  releaseSubmitting.value = true;
  releaseError.value = "";
  try {
    await api(`/account/licenses/${item.activationCodeId}/release`, {
      method: "POST",
      body: JSON.stringify({
        password: releasePassword.value,
        expectedBindingId: item.device.bindingId,
        expectedActivatedAt: item.device.activatedAt,
        expectedBindingVersion: item.device.bindingVersion,
      }),
    });
    releaseDialog.value?.close();
    releaseLicense.value = null;
    toast.show("设备已解绑。请回到 HomeOS 激活页，用商店购买邮箱与激活码重新激活。");
    await refresh();
  } catch (error) {
    const err = error as { status?: number };
    releaseError.value = errorMessage(error);
    if (err.status === 409) {
      releaseDialog.value?.close();
      toast.show(errorMessage(error), "err");
      await refresh();
    } else if (err.status === 429) {
      await refresh();
    }
  } finally {
    releaseSubmitting.value = false;
  }
}

async function payOrder(item: StoreOrder) {
  const payload = await api<{ orders?: StoreOrder[] }>("/account");
  const fresh = (payload.orders || []).find((o) => o.orderNo === item.orderNo);
  if (fresh) await order.showPayment(fresh);
}

async function archiveOrder(item: StoreOrder) {
  const ok = await confirm.confirm({
    kicker: "Clear Record",
    title: "清除这条订单记录？",
    message: "这条订单记录会从账号中心移除，账号下其他订单和授权不受影响。",
    detail: "如果之后还需要查这笔订单的金额或状态，请联系客服。",
    confirmLabel: "清除记录",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await order.archiveOrder(item.orderNo || "");
  } catch (error) {
    toast.show(errorMessage(error), "err");
  }
}

async function loadMore() {
  loadingMore.value = true;
  try {
    await session.loadMoreOrders();
  } catch (error) {
    toast.show(errorMessage(error), "err");
  } finally {
    loadingMore.value = false;
  }
}

async function copyCommand(command: string) {
  try {
    await navigator.clipboard.writeText(command);
    toast.show("部署指令已复制。");
  } catch {
    toast.show("复制失败，请手动选中命令复制。", "err");
  }
}
</script>

<template>
  <main class="hb-store-main" data-store-page="account">
    <div class="hb-container">
      <section class="hb-account-heading">
        <div>
          <div class="hb-account-heading__eyebrow">
            <span class="hb-kicker">My Account</span>
            <span class="hb-account-heading__path">~/account/licenses</span>
          </div>
          <h1>我的<strong>授权中心</strong></h1>
          <p>{{ accountHeading }}</p>
        </div>
        <div class="hb-account-heading__actions">
          <RouterLink class="hb-button hb-button--secondary hb-button--sm" to="/user/referrals">
            <i class="fa-duotone fa-regular fa-gift"></i> 邀请有礼
          </RouterLink>
          <button type="button" class="hb-button hb-button--secondary hb-button--sm" @click="logout">退出登录</button>
        </div>
      </section>

      <div class="hb-account-shell">
        <aside class="hb-account-rail">
          <nav class="hb-account-tabs" role="tablist" aria-label="账号中心分栏">
            <button type="button" class="hb-account-tabs__item" :class="{ 'is-active': activeTab === 'licenses' }" role="tab" :aria-selected="activeTab === 'licenses'" @click="switchTab('licenses')">
              <i class="fa-duotone fa-regular fa-id-card"></i>我的授权<span>{{ licenses.length }}</span>
            </button>
            <button type="button" class="hb-account-tabs__item" :class="{ 'is-active': activeTab === 'addons' }" role="tab" :aria-selected="activeTab === 'addons'" @click="switchTab('addons')">
              <i class="fa-duotone fa-regular fa-puzzle-piece"></i>增量包<span>{{ activeEntitlements.length }}</span>
            </button>
            <button type="button" class="hb-account-tabs__item" :class="{ 'is-active': activeTab === 'orders' }" role="tab" :aria-selected="activeTab === 'orders'" @click="switchTab('orders')">
              <i class="fa-duotone fa-regular fa-receipt"></i>我的订单<span>{{ orders.length }}</span>
            </button>
          </nav>
          <section class="hb-account-stats" aria-label="账号概览">
            <article data-tone="accent"><small>我的授权</small><strong>{{ licenses.length }}</strong></article>
            <article data-tone="aura"><small>已购增量包</small><strong>{{ activeEntitlements.length }}</strong></article>
            <article data-tone="eco"><small>订单记录</small><strong>{{ orders.length }}</strong></article>
            <article data-tone="lumen"><small>待支付订单</small><strong>{{ pendingCount }}</strong></article>
          </section>
        </aside>

        <div class="hb-account-content">
          <!-- 我的授权 -->
          <div v-show="activeTab === 'licenses'" class="hb-account-panel">
            <div class="hb-account-list">
              <article v-for="(item, index) in licenses" :key="item.activationCodeId" class="hb-account-item hb-account-item--stacked">
                <header class="hb-account-head">
                  <div class="hb-account-ident">
                    <div class="hb-account-title">
                      <h3>{{ licenseTitle(item, index) }}</h3>
                      <span class="hb-meta-chip" :class="`hb-meta-chip--${stateVariant(item)}`">{{ stateText(item) }}</span>
                    </div>
                    <p v-if="item.userLabel">{{ item.productName }}</p>
                  </div>
                  <div class="hb-account-actions">
                    <RouterLink
                      v-if="item.validityDays && catalog.primaryProducts.length"
                      class="hb-button hb-button--primary"
                      :to="`/products?upgrade=${encodeURIComponent(item.activationCodeId)}`"
                    >升级为永久授权</RouterLink>
                    <button v-if="item.activationCode" class="hb-button hb-button--secondary" @click="resendEmail(item)">重发激活码邮件</button>
                    <button class="hb-button hb-button--secondary" @click="openLabel(item)">修改备注</button>
                    <button v-if="item.device" class="hb-button hb-button--secondary" @click="openRelease(item, $event)">解除设备绑定</button>
                  </div>
                </header>
                <div class="hb-account-body">
                  <p class="hb-account-license-code">
                    <span>激活码</span><code>{{ activationCode(item) }}</code>
                    <small v-if="isExpired(item)" class="hb-account-code-note">试用已到期，请购买升级订单。支付完成后，原激活码将自动恢复生效。</small>
                    <small v-else-if="!item.activationCode" class="hb-account-code-note">历史激活码无法恢复完整内容，请联系管理员处理。</small>
                  </p>
                  <ul class="hb-account-facts">
                    <li><small>来源</small><span>{{ item.issuanceSourceLabel || "后台发放" }}</span></li>
                    <li><small>期限</small><span :class="{ 'is-accent': !item.validityDays }">{{ licensePeriod(item) }}</span></li>
                    <li><small>发卡时间</small><span>{{ new Date(String(item.issuedAt)).toLocaleString("zh-CN") }}</span></li>
                  </ul>
                  <section v-if="item.active && deployScripts.length" class="hb-deploy" aria-label="一键部署指令">
                    <header class="hb-deploy__head">
                      <span class="hb-deploy__icon" aria-hidden="true"><i class="fa-duotone fa-regular fa-rocket-launch"></i></span>
                      <div class="hb-deploy__title"><strong>一键部署 HomeOS</strong><small>复制到服务器的终端执行，脚本会自动拉取并启动服务。</small></div>
                    </header>
                    <div class="hb-deploy__commands">
                      <article v-for="script in deployScripts" :key="script.command" class="hb-deploy-cmd">
                        <div class="hb-deploy-cmd__bar"><span class="hb-deploy-cmd__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="hb-deploy-cmd__label">{{ script.label }}</span></div>
                        <div class="hb-deploy-cmd__body"><code><span class="hb-deploy-cmd__prompt">$</span> {{ script.command }}</code><button type="button" class="hb-deploy-cmd__copy" @click="copyCommand(script.command)">复制</button></div>
                      </article>
                    </div>
                    <p class="hb-deploy__hint"><i class="fa-duotone fa-regular fa-circle-info" aria-hidden="true"></i> 部署完成后回到本页，用上方的激活码完成授权。</p>
                  </section>
                </div>
                <footer class="hb-account-foot">
                  <div class="hb-account-foot-main">
                    <p class="hb-account-device">
                      <template v-if="item.device">已绑定本机（硬件指纹）· <code>{{ item.device.instanceId }}</code></template>
                      <template v-else>当前未绑定设备</template>
                    </p>
                    <p v-if="item.manuallyIssued" class="hb-account-manual-note">该授权由后台手动发放，因此没有支付订单。</p>
                  </div>
                </footer>
              </article>
              <div v-if="!licenses.length" class="hb-account-empty">账号下暂无授权。</div>
            </div>
          </div>

          <!-- 增量包 -->
          <div v-show="activeTab === 'addons'" class="hb-account-panel">
            <section v-if="activeEntitlements.length" class="hb-account-section">
              <div class="hb-section-heading hb-section-heading--compact">
                <span class="hb-kicker">Add-ons</span>
                <h2>已购增量包</h2>
              </div>
              <div class="hb-account-list">
                <article v-for="(item, index) in activeEntitlements" :key="index" class="hb-account-item hb-account-item--stacked">
                  <header class="hb-account-head">
                    <div class="hb-account-ident">
                      <div class="hb-account-title">
                        <h3>{{ item.productName }}</h3>
                        <span class="hb-meta-chip hb-meta-chip--success">{{ entitlementStatus(item) }}</span>
                      </div>
                      <p>{{ item.productType === "module" ? "功能增量包" : "UI 方案包" }}</p>
                    </div>
                  </header>
                  <div class="hb-account-body">
                    <ul class="hb-account-facts">
                      <li><small>附加到</small><span>{{ entitlementTarget(item) }}</span></li>
                      <li><small>有效期</small><span :class="{ 'is-accent': !item.expiresAt }">{{ item.expiresAt ? `有效至 ${new Date(String(item.expiresAt)).toLocaleDateString("zh-CN")}` : "永久" }}</span></li>
                    </ul>
                  </div>
                </article>
              </div>
            </section>
            <section v-if="addonOffers.length" class="hb-account-section">
              <div class="hb-section-heading hb-section-heading--compact">
                <span class="hb-kicker">Available Add-ons</span>
                <h2>可购买增量包</h2>
              </div>
              <div class="hb-addons-grid hb-addons-grid--compact">
                <article v-for="product in addonOffers" :key="product.id" class="hb-addon-card">
                  <span class="hb-addon-card__badge">{{ catalog.addonTypeLabel(product) }}</span>
                  <h3>{{ product.name }}</h3>
                  <p>{{ product.displayDescription || product.note || "购买后追加到现有激活码。" }}</p>
                  <div class="hb-addon-card__footer">
                    <strong>{{ money(product.priceCents) }}</strong>
                    <RouterLink class="hb-button hb-button--primary hb-button--sm" :to="`/item/${encodeURIComponent(product.id)}`">查看并购买</RouterLink>
                  </div>
                </article>
              </div>
            </section>
            <div v-if="!activeEntitlements.length && !addonOffers.length" class="hb-account-empty">暂无可展示的增量包。</div>
          </div>

          <!-- 我的订单 -->
          <div v-show="activeTab === 'orders'" class="hb-account-panel">
            <div class="hb-account-list">
              <article v-for="item in orders" :key="item.orderNo" class="hb-account-item hb-account-item--row">
                <div class="hb-account-order-main">
                  <h3>{{ item.productName }}</h3>
                  <p>订单号：{{ item.orderNo }}</p>
                  <p>{{ orderStatusLabel(item) }} · {{ money(item.amountCents) }}</p>
                  <p v-if="item.status === 'pending'" class="hb-order-countdown">
                    剩余 {{ orderCountdown(item) }}，超时后自动关闭
                  </p>
                </div>
                <div class="hb-account-order-side">
                  <span>{{ new Date(String(item.createdAt)).toLocaleDateString("zh-CN") }}</span>
                  <div v-if="item.status === 'pending' && item.payment?.qrCode" class="hb-account-actions">
                    <button class="hb-button hb-button--secondary" @click="payOrder(item)">继续支付</button>
                  </div>
                  <div v-else-if="['cancelled', 'expired', 'payment_failed', 'refunded'].includes(String(item.status))" class="hb-account-actions">
                    <button class="hb-button hb-button--secondary" @click="archiveOrder(item)">清除记录</button>
                  </div>
                </div>
              </article>
              <div v-if="!orders.length" class="hb-account-empty">账号下暂无订单。</div>
            </div>
            <div v-if="moreOrders > 0" class="hb-account-more">
              <button class="hb-button hb-button--secondary" type="button" :disabled="loadingMore" @click="loadMore">
                {{ loadingMore ? "加载中…" : `加载更多订单（还有 ${moreOrders} 单）` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 解除设备绑定 -->
    <dialog ref="releaseDialog" class="hb-dialog hb-release-dialog" @cancel.prevent="releaseDialog?.close()">
      <form @submit.prevent="submitRelease">
        <div class="hb-dialog__head">
          <button type="button" class="hb-dialog__close" aria-label="关闭" @click="releaseDialog?.close()"><i class="fa-duotone fa-regular fa-xmark"></i></button>
          <span class="hb-kicker hb-kicker--plain">Device Security</span>
          <h2>解除设备绑定</h2>
        </div>
        <div class="hb-dialog__body">
          <p><span>{{ releaseLicense?.userLabel || releaseLicense?.productName }} · 设备</span> <code>{{ releaseLicense?.device?.instanceId }}</code></p>
          <p class="hb-form-hint">{{ releaseWaitText }}</p>
          <p class="hb-form-hint">解绑后原设备授权会失效。若因升级/换机出现「硬件绑定不匹配」，解绑完成后再回 HomeOS 激活页重新激活。</p>
          <label v-if="releaseSeconds <= 0" class="hb-field">
            <span>商店登录密码</span>
            <span class="hb-password-field">
              <input v-model="releasePassword" type="password" autocomplete="current-password" required />
            </span>
            <small class="hb-form-hint">请输入商店账号密码，不是 HomeOS 本机管理员密码。</small>
          </label>
          <small v-if="releaseError" class="hb-release-error hb-form-error">{{ releaseError }}</small>
        </div>
        <div class="hb-dialog__foot hb-dialog__foot--split">
          <button type="button" class="hb-button hb-button--secondary" @click="releaseDialog?.close()">取消</button>
          <button type="submit" class="hb-button hb-button--primary" :disabled="releaseSeconds > 0 || releaseSubmitting">
            {{ releaseSubmitting ? "正在解绑…" : releaseSeconds > 0 ? "冷却中" : "确认解绑" }}
          </button>
        </div>
      </form>
    </dialog>

    <!-- 修改授权备注 -->
    <dialog ref="labelDialog" class="hb-dialog hb-release-dialog" @cancel.prevent="labelDialog?.close()">
      <form @submit.prevent="saveLabel">
        <div class="hb-dialog__head">
          <button type="button" class="hb-dialog__close" aria-label="关闭" @click="labelDialog?.close()"><i class="fa-duotone fa-regular fa-xmark"></i></button>
          <span class="hb-kicker hb-kicker--plain">License Label</span>
          <h2>修改授权备注</h2>
          <p>备注只用于区分当前账号下的多份授权，不会改变激活码或设备绑定。</p>
        </div>
        <div class="hb-dialog__body">
          <label class="hb-field"><span>授权备注</span><input v-model="labelValue" type="text" maxlength="50" placeholder="例如：家里主服务器" /></label>
        </div>
        <div class="hb-dialog__foot hb-dialog__foot--split">
          <button type="button" class="hb-button hb-button--secondary" @click="labelDialog?.close()">取消</button>
          <button type="submit" class="hb-button hb-button--primary">保存</button>
        </div>
      </form>
    </dialog>
  </main>
</template>
