<script setup lang="ts">
/** 优惠码面板：列表 + 新增 / 编辑。 */

import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import RowMenu from "../../components/admin/RowMenu.vue";
import { adminApi } from "../../api/http.js";
import { asListItems, errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { localInput, money, num, utcInput } from "../../utils/format.js";

interface Coupon {
  id: string;
  code?: string;
  description?: string;
  discountType?: string;
  amountCents: number;
  percent?: number;
  minAmountCents?: number;
  redeemedCount?: number;
  maxRedemptions?: number | null;
  redemptionCount?: number;
  active?: boolean;
  perAccountLimit?: number;
  startsAt?: string;
  expiresAt?: string;
  applicableProductIds?: string[];
  [key: string]: unknown;
}

interface CouponDraft {
  id: string;
  code: string;
  description: string;
  discountType: string;
  percent: string;
  amountCents: string;
  minAmountCents: string;
  maxRedemptions: string;
  perAccountLimit: string;
  startsAt: string;
  expiresAt: string;
  applicableProductIds: string;
  active: boolean;
}

const COLUMNS = [
  { key: "code", label: "码" },
  { key: "description", label: "说明" },
  { key: "discount", label: "折扣", nowrap: true },
  { key: "threshold", label: "门槛", nowrap: true },
  { key: "quota", label: "占用/上限", nowrap: true },
  { key: "history", label: "历史核销", nowrap: true },
  { key: "active", label: "状态", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const router = useRouter();
const toast = useToastStore();
const confirm = useConfirmStore();
const refresh = useAdminRefreshStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const keyword = ref("");
const status = ref("");

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  if (status.value) next.status_filter = status.value;
  return next;
});

const editorOpen = ref(false);
const saving = ref(false);

function emptyDraft(): CouponDraft {
  return {
    id: "",
    code: "",
    description: "",
    discountType: "percent",
    percent: "0",
    amountCents: "0",
    minAmountCents: "0",
    maxRedemptions: "",
    perAccountLimit: "1",
    startsAt: "",
    expiresAt: "",
    applicableProductIds: "",
    active: true,
  };
}

const draft = reactive<CouponDraft>(emptyDraft());
const title = computed(() => (draft.id ? `编辑优惠码 ${draft.code}` : "新增优惠码"));

const tabs = computed<AdminTabItem[]>(() => [
  { key: "list", label: "优惠码列表" },
  { key: "form", label: "新增 / 编辑", hidden: !editorOpen.value },
]);

const { active, pick, reveal } = useAdminTabs("coupons", tabs);

function reload() {
  return table.value?.search();
}

function reset() {
  keyword.value = "";
  status.value = "";
  void reload();
}

function openEditor(coupon: Coupon | null) {
  Object.assign(draft, emptyDraft());
  if (coupon) {
    draft.id = coupon.id;
    draft.code = coupon.code || "";
    draft.description = coupon.description || "";
    draft.discountType = coupon.discountType || "percent";
    draft.percent = String(coupon.percent ?? 0);
    draft.amountCents = String(coupon.amountCents ?? 0);
    draft.minAmountCents = String(coupon.minAmountCents ?? 0);
    draft.maxRedemptions = coupon.maxRedemptions == null ? "" : String(coupon.maxRedemptions);
    draft.perAccountLimit = String(coupon.perAccountLimit ?? 0);
    draft.startsAt = localInput(coupon.startsAt);
    draft.expiresAt = localInput(coupon.expiresAt);
    draft.applicableProductIds = (coupon.applicableProductIds || []).join(", ");
    draft.active = Boolean(coupon.active);
  }
  editorOpen.value = true;
  reveal("form");
}

function closeEditor() {
  editorOpen.value = false;
}

async function save() {
  const body = {
    description: draft.description.trim(),
    discountType: draft.discountType,
    percent: Number(draft.percent || 0),
    amountCents: Number(draft.amountCents || 0),
    minAmountCents: Number(draft.minAmountCents || 0),
    maxRedemptions: draft.maxRedemptions ? Number(draft.maxRedemptions) : null,
    perAccountLimit: Number(draft.perAccountLimit || 0),
    startsAt: utcInput(draft.startsAt),
    expiresAt: utcInput(draft.expiresAt),
    applicableProductIds: draft.applicableProductIds
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    active: draft.active,
  };
  saving.value = true;
  try {
    if (draft.id) {
      await adminApi(`/coupons/${draft.id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.push("优惠码已更新");
    } else {
      await adminApi("/coupons", {
        method: "POST",
        body: JSON.stringify({ ...body, code: draft.code.trim() }),
      });
      toast.push("优惠码已创建");
    }
    closeEditor();
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    saving.value = false;
  }
}

async function toggle(coupon: Coupon) {
  const next = !coupon.active;
  try {
    await adminApi(`/coupons/${coupon.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
    toast.push(next ? "优惠码已启用" : "优惠码已停用");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

function viewRedemptions(coupon: Coupon) {
  void router.push({
    path: "/admin/diagnostics/redeem",
    query: { coupon_id: coupon.id, coupon_code: coupon.code || coupon.id },
  });
}

async function removeCoupon(coupon: Coupon) {
  const code = coupon.code || coupon.id;
  const used = Number(coupon.redemptionCount || 0);
  const ok = await confirm.confirm({
    title: "删除优惠码",
    message: `将删除优惠码 ${code}。`,
    detail: used
      ? `该码已被核销 <b>${used}</b> 次，为保留核销记录，系统只会把它<b>停用</b>而不是删除。`
      : "该码尚未被使用，将被<b>彻底删除</b>。",
    confirmLabel: used ? "停用" : "删除",
    tone: used ? "warning" : "danger",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ deleted?: boolean; reason?: string }>(`/coupons/${coupon.id}`, {
      method: "DELETE",
    });
    toast.push(
      result.deleted ? "优惠码已删除" : `优惠码已停用（${result.reason || "已有核销记录"}）`,
      result.deleted ? "success" : "warning",
    );
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="catalog">
    <PanelHead
      title="优惠码"
      desc="「占用」= 此刻仍占着名额（参与上限校验，取消订单会回落）；「历史核销」= 曾占用过的次数（对账凭证，决定能否删除）"
      domain="商品"
    >
      <button class="hb-button hb-button--primary hb-button--sm" @click="openEditor(null)">新增优惠码</button>
    </PanelHead>

    <div class="admin-tabs" role="tablist" aria-label="优惠码分区">
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
        <input v-model="keyword" class="hb-input" aria-label="优惠码或说明关键字" placeholder="码 / 说明" />
        <select v-model="status" class="hb-select" aria-label="按优惠码状态筛选">
          <option value="">全部状态</option>
          <option value="active">启用中</option>
          <option value="inactive">已停用</option>
          <option value="scheduled">未生效</option>
          <option value="expired">已失效</option>
        </select>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
        <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
      </div>

      <DataTable ref="table" path="/coupons" :columns="COLUMNS" :params="params" empty-text="没有符合条件的优惠码">
        <template #default="{ items }">
          <tr v-for="coupon in asListItems<Coupon>(items)" :key="coupon.id">
            <td class="mono">
              <span v-if="coupon.code" :title="coupon.code">{{ coupon.code }}</span>
              <template v-else>—</template>
            </td>
            <td>
              <span v-if="coupon.description" :title="coupon.description">{{ coupon.description }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              {{ coupon.discountType === "fixed" ? money(coupon.amountCents) : `${num(coupon.percent)}%` }}
            </td>
            <td class="nowrap">{{ coupon.minAmountCents ? money(coupon.minAmountCents) : "无" }}</td>
            <td class="nowrap">{{ num(coupon.redeemedCount) }}/{{ coupon.maxRedemptions ?? "∞" }}</td>
            <td class="nowrap">
              <span
                v-if="coupon.redemptionCount"
                title="历史上被占用过的次数（含已归还），点击「查看核销记录」可逐条作废"
              >
                {{ num(coupon.redemptionCount) }} 次
              </span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              <span v-if="coupon.active" class="pill pill--success">启用</span>
              <span v-else class="pill pill--muted">停用</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="toggle(coupon)">
                  {{ coupon.active ? "停用" : "启用" }}
                </button>
                <RowMenu>
                  <button class="menu__item" type="button" @click="openEditor(coupon)">编辑</button>
                  <button class="menu__item" type="button" @click="viewRedemptions(coupon)">查看核销记录</button>
                  <button class="menu__item is-danger" type="button" @click="removeCoupon(coupon)">删除</button>
                </RowMenu>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'form'" class="admin-tab-pane" role="tabpanel">
      <div v-if="editorOpen" class="hb-card admin-editor">
        <div class="hb-card__body">
          <h3 class="admin-editor__title">{{ title }}</h3>
          <p class="admin-editor__hint">码本身是对外承诺，创建后不可修改；其余字段都能改。时间留空表示不限制。</p>
          <form class="admin-grid" @submit.prevent="save">
            <h4 class="admin-grid__section">识别信息</h4>
            <label class="hb-field">
              <span>码（创建后不可改）</span>
              <input v-model="draft.code" class="hb-input is-mono" :readonly="Boolean(draft.id)" required />
            </label>
            <label class="hb-field"><span>说明</span><input v-model="draft.description" class="hb-input" /></label>
            <h4 class="admin-grid__section">优惠力度</h4>
            <label class="hb-field">
              <span>类型</span>
              <select v-model="draft.discountType" class="hb-select">
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
            </label>
            <label class="hb-field">
              <span>百分比</span>
              <input v-model="draft.percent" class="hb-input" type="number" step="0.01" />
            </label>
            <label class="hb-field">
              <span>减免(分)</span>
              <input v-model="draft.amountCents" class="hb-input" type="number" />
            </label>
            <label class="hb-field">
              <span>门槛(分)</span>
              <input v-model="draft.minAmountCents" class="hb-input" type="number" />
            </label>
            <h4 class="admin-grid__section">使用限制</h4>
            <label class="hb-field">
              <span>总量上限</span>
              <input v-model="draft.maxRedemptions" class="hb-input" type="number" />
            </label>
            <label class="hb-field">
              <span>每账号</span>
              <input v-model="draft.perAccountLimit" class="hb-input" type="number" />
            </label>
            <label class="hb-field">
              <span>生效时间（本地时间，空=立即）</span>
              <input v-model="draft.startsAt" class="hb-input" type="datetime-local" />
            </label>
            <label class="hb-field">
              <span>失效时间（本地时间，空=不限）</span>
              <input v-model="draft.expiresAt" class="hb-input" type="datetime-local" />
            </label>
            <label class="hb-field admin-grid__full">
              <span>限定商品 ID（逗号分隔，留空=全部商品）</span>
              <input v-model="draft.applicableProductIds" class="hb-input is-mono" />
            </label>
            <div class="hb-check-group admin-grid__full">
              <label class="hb-check"><input v-model="draft.active" type="checkbox" /> 启用</label>
            </div>
            <div class="admin-form-actions admin-grid__full">
              <button class="hb-button hb-button--primary hb-button--sm" type="submit" :disabled="saving">
                {{ saving ? "保存中…" : "保存" }}
              </button>
              <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="closeEditor">
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </section>
</template>
