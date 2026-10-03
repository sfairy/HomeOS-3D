<script setup lang="ts">
/** 激活码面板：列表 + 手动签发 + 修正授权。 */

import { computed, reactive, ref } from "vue";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import { useRefreshOn } from "../../stores/adminRefresh.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import RowMenu from "../../components/admin/RowMenu.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { d, dt, utcInput } from "../../utils/format.js";
import { LICENSE_SOURCE } from "../../utils/vocab.js";
import { copyText } from "../../utils/clipboard.js";

interface License {
  activationCodeId: string;
  activationCode?: string;
  customerName?: string;
  productName?: string;
  accessExpiresAt?: string | null;
  issuanceSource?: string;
  active?: boolean;
  userLabel?: string;
  [key: string]: unknown;
}

interface ProductOption {
  id: string;
  name?: string;
}

interface IssueResult {
  activationCode?: string;
  email?: string;
  productName?: string;
  accessExpiresAt?: string | null;
}

const COLUMNS = [
  { key: "code", label: "激活码" },
  { key: "customer", label: "客户" },
  { key: "product", label: "商品" },
  { key: "expires", label: "有效期", nowrap: true },
  { key: "source", label: "来源", nowrap: true },
  { key: "status", label: "状态", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const toast = useToastStore();
const confirm = useConfirmStore();
const refresh = useAdminRefreshStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const products = ref<ProductOption[]>([]);
const keyword = ref("");
const status = ref("");
const expiring = ref("");

function asLicenses(items: unknown[]): License[] {
  return items as License[];
}

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  if (status.value) next.status_filter = status.value;
  if (expiring.value) next.expiring_days = expiring.value;
  return next;
});

const issueOpen = ref(false);
const patchOpen = ref(false);
const issuing = ref(false);
const patching = ref(false);

const tabs = computed<AdminTabItem[]>(() => [
  { key: "list", label: "激活码列表" },
  { key: "issue", label: "手动签发", hidden: !issueOpen.value },
  { key: "patch", label: "修正授权", hidden: !patchOpen.value },
]);

const { active, pick, reveal } = useAdminTabs("licenses", tabs);

const issue = reactive({ email: "", productId: "", validityDays: "" });
const issueResult = ref<IssueResult | null>(null);
const patchingCode = ref("");
const patch = reactive({
  licenseId: "",
  userLabel: "",
  extendDays: "",
  accessExpiresAt: "",
  permanent: false,
  validityDays: "",
});

function reload() {
  return table.value?.search();
}

function reset() {
  keyword.value = "";
  status.value = "";
  expiring.value = "";
  void reload();
}

async function loadProducts() {
  try {
    const data = await adminApi<{ items?: ProductOption[] }>("/products?limit=500&status_filter=active");
    products.value = data.items || [];
    if (!issue.productId && products.value.length) issue.productId = products.value[0]!.id;
  } catch {
    products.value = [];
  }
}

useRefreshOn(["productCatalog"], () => void loadProducts());
void loadProducts();

function openIssue() {
  issueResult.value = null;
  issueOpen.value = true;
  reveal("issue");
}

function closeIssue() {
  issueOpen.value = false;
}

function openPatch(license: License) {
  patch.licenseId = license.activationCodeId;
  patch.userLabel = license.userLabel || "";
  patch.extendDays = "";
  patch.accessExpiresAt = "";
  patch.permanent = false;
  patch.validityDays = "";
  patchingCode.value = license.activationCode || "";
  patchOpen.value = true;
  reveal("patch");
}

function closePatch() {
  patchOpen.value = false;
}

async function submitIssue() {
  issuing.value = true;
  try {
    const result = await adminApi<IssueResult>("/licenses", {
      method: "POST",
      body: JSON.stringify({
        email: issue.email.trim(),
        productId: issue.productId,
        validityDays: issue.validityDays ? Number(issue.validityDays) : null,
      }),
    });
    issueResult.value = result;
    issue.email = "";
    issue.validityDays = "";
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    issuing.value = false;
  }
}

function issueTarget(): string {
  const result = issueResult.value;
  if (!result) return "";
  return [
    result.email || "",
    result.productName || "",
    result.accessExpiresAt ? `到期 ${dt(result.accessExpiresAt)}` : "永久有效",
  ]
    .filter(Boolean)
    .join(" · ");
}

async function submitPatch() {
  if (patch.extendDays && (patch.accessExpiresAt || patch.permanent)) {
    toast.push("「续期天数」与「新的到期时间 / 永久有效」不能同时提交，请二选一。", "danger");
    return;
  }
  const payload: Record<string, unknown> = { userLabel: patch.userLabel.trim() };
  if (patch.extendDays) payload.extendDays = Number(patch.extendDays);
  if (patch.permanent) payload.accessExpiresAt = null;
  else if (patch.accessExpiresAt) payload.accessExpiresAt = utcInput(patch.accessExpiresAt);
  if (patch.validityDays) payload.validityDays = Number(patch.validityDays);
  patching.value = true;
  try {
    const result = await adminApi<{ accessExpiresAt?: string | null }>(`/licenses/${patch.licenseId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    toast.push(`授权已修正，到期时间：${result.accessExpiresAt ? dt(result.accessExpiresAt) : "永久"}`);
    closePatch();
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    patching.value = false;
  }
}

async function deactivate(license: License) {
  const ok = await confirm.confirm({
    title: "停用授权",
    message: "停用后该激活码将立即失效。",
    detail: "客户端<b>下次心跳</b>会转为吊销状态；已有设备绑定也会被释放。",
    confirmLabel: "停用",
    tone: "danger",
  });
  if (!ok) return;
  await setActive(license, false);
}

async function setActive(license: License, next: boolean) {
  try {
    await adminApi(`/licenses/${license.activationCodeId}/${next ? "activate" : "deactivate"}`, {
      method: "POST",
      body: JSON.stringify({ note: "后台操作" }),
    });
    toast.push(next ? "授权已启用" : "授权已停用（客户端下次心跳将转为吊销）");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function removeLicense(license: License) {
  const code = license.activationCode || license.activationCodeId;
  const ok = await confirm.confirm({
    title: "彻底删除授权",
    message: `将永久删除激活码 ${code}，无法恢复。`,
    detail:
      "会连带删除该授权的<b>权益、设备绑定、租约与会话</b>；相关订单会保留但不再指向它。<br>若该授权仍在生效，请先「停用」并强制解绑。",
    confirmLabel: "永久删除",
    tone: "danger",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ bindings?: number }>(`/licenses/${license.activationCodeId}`, {
      method: "DELETE",
    });
    toast.push(`授权已删除（连带清理 ${result.bindings ?? 0} 条绑定记录）`);
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="licensing">
    <PanelHead
      title="激活码"
      desc="停用后客户端下次心跳即转吊销；彻底删除需先停用且无活跃绑定"
      domain="授权"
    >
      <button class="hb-button hb-button--primary hb-button--sm" @click="openIssue">手动签发</button>
    </PanelHead>

    <div class="admin-tabs" role="tablist" aria-label="激活码分区">
      <button
        v-for="tab in tabs.filter((item) => !item.hidden)"
        :key="tab.key"
        class="admin-tabs__tab"
        type="button"
        role="tab"
        :aria-selected="tab.key === active ? 'true' : 'false'"
        :tabindex="tab.key === active ? 0 : -1"
        @click="pick(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-show="active === 'list'" class="admin-tab-pane" role="tabpanel">
      <div class="panel-toolbar">
        <input
          v-model="keyword"
          class="hb-input"
          aria-label="激活码、提示码、商品名或备注关键字"
          placeholder="激活码 / 提示码 / 商品 / 备注"
        />
        <select v-model="status" class="hb-select" aria-label="按授权状态筛选">
          <option value="">全部状态</option>
          <option value="active">启用中</option>
          <option value="inactive">已停用</option>
        </select>
        <select v-model="expiring" class="hb-select" aria-label="按到期时间筛选">
          <option value="">不限到期</option>
          <option value="7">7 天内到期</option>
          <option value="30">30 天内到期</option>
          <option value="90">90 天内到期</option>
        </select>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
        <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
      </div>

      <DataTable ref="table" path="/licenses" :columns="COLUMNS" :params="params" empty-text="没有符合条件的激活码">
        <template #default="{ items }">
          <tr v-for="license in asLicenses(items)" :key="license.activationCodeId">
            <td class="mono">
              <span>{{ license.activationCode }}</span>
              <button
                class="hb-button hb-button--ghost hb-button--sm admin-copy"
                type="button"
                aria-label="复制激活码"
                @click="copyText(license.activationCode || '')"
              >
                复制
              </button>
            </td>
            <td class="nowrap">
              <span v-if="license.customerName" :title="license.customerName">{{ license.customerName }}</span>
              <template v-else>—</template>
            </td>
            <td>
              <span v-if="license.productName" :title="license.productName">{{ license.productName }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ license.accessExpiresAt ? d(license.accessExpiresAt) : "永久" }}</td>
            <td class="nowrap">{{ LICENSE_SOURCE[license.issuanceSource || ""] || license.issuanceSource }}</td>
            <td class="nowrap">
              <span v-if="license.active" class="pill pill--success">有效</span>
              <span v-else class="pill pill--muted">已停用</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button
                  v-if="license.active"
                  class="hb-button hb-button--danger hb-button--sm"
                  @click="deactivate(license)"
                >
                  停用
                </button>
                <button
                  v-else
                  class="hb-button hb-button--success hb-button--sm"
                  @click="setActive(license, true)"
                >
                  启用
                </button>
                <RowMenu>
                  <button class="menu__item" type="button" @click="openPatch(license)">修正有效期 / 备注</button>
                  <button
                    class="menu__item is-danger"
                    type="button"
                    :title="license.active ? '需先停用' : '彻底删除该授权'"
                    @click="removeLicense(license)"
                  >
                    彻底删除
                  </button>
                </RowMenu>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'issue'" class="admin-tab-pane" role="tabpanel">
      <div v-if="issueOpen" class="hb-card admin-editor">
        <div class="hb-card__body">
          <h3 class="admin-editor__title">手动签发激活码</h3>
          <form class="admin-grid" @submit.prevent="submitIssue">
            <label class="hb-field">
              <span>账号邮箱</span>
              <input v-model="issue.email" class="hb-input" type="email" required />
            </label>
            <label class="hb-field admin-grid__wide">
              <span>商品</span>
              <select v-model="issue.productId" class="hb-select">
                <option v-for="product in products" :key="product.id" :value="product.id">
                  {{ product.name }}
                </option>
              </select>
            </label>
            <label class="hb-field">
              <span>有效期（天，留空取商品默认）</span>
              <input v-model="issue.validityDays" class="hb-input" type="number" min="1" />
            </label>
            <div class="admin-form-actions admin-grid__full">
              <button class="hb-button hb-button--primary hb-button--sm" type="submit" :disabled="issuing">
                {{ issuing ? "签发中…" : "签发" }}
              </button>
              <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="closeIssue">
                取消
              </button>
            </div>
          </form>
          <div v-if="issueResult" class="admin-result">
            <div class="admin-result__head">
              <strong>签发成功</strong><span>{{ issueTarget() }}</span>
            </div>
            <div class="admin-result__row">
              <code class="admin-result__code">{{ issueResult.activationCode }}</code>
              <button
                class="hb-button hb-button--secondary hb-button--sm"
                type="button"
                @click="copyText(issueResult?.activationCode || '')"
              >
                复制
              </button>
            </div>
            <small class="admin-result__note">
              激活码只会完整显示这一次，请立即交付给客户；账号中心里也能查到。
            </small>
          </div>
        </div>
      </div>
    </div>

    <div v-show="active === 'patch'" class="admin-tab-pane" role="tabpanel">
      <div v-if="patchOpen" class="hb-card admin-editor">
        <div class="hb-card__body">
          <h3 class="admin-editor__title">修正授权 <span class="mono">{{ patchingCode }}</span></h3>
          <p class="admin-editor__hint">
            客服处理「客户要延期」「备注写错」用这里。到期时间的三种给法<b>互斥</b>，
            一次只填一种；留空则保持原值不变。
          </p>
          <form class="admin-grid admin-grid--wide" @submit.prevent="submitPatch">
            <label class="hb-field">
              <span>续期天数（在现有到期时间上顺延）</span>
              <input v-model="patch.extendDays" class="hb-input" type="number" min="1" />
            </label>
            <label class="hb-field">
              <span>新的到期时间（本地时间）</span>
              <input v-model="patch.accessExpiresAt" class="hb-input" type="datetime-local" />
            </label>
            <div class="hb-check-group">
              <label class="hb-check"><input v-model="patch.permanent" type="checkbox" /> 改为永久有效</label>
            </div>
            <label class="hb-field">
              <span>有效天数（按开始时间重算到期）</span>
              <input v-model="patch.validityDays" class="hb-input" type="number" min="1" />
            </label>
            <label class="hb-field admin-grid__wide">
              <span>备注（客户/客服可读，清空即删除备注）</span>
              <input v-model="patch.userLabel" class="hb-input" maxlength="64" />
            </label>
            <div class="admin-form-actions admin-grid__full">
              <button class="hb-button hb-button--primary hb-button--sm" type="submit" :disabled="patching">
                {{ patching ? "保存中…" : "保存修正" }}
              </button>
              <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="closePatch">
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>
