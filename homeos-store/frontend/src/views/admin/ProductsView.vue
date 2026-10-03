<script setup lang="ts">
/** 商品面板：列表 + 新增 / 编辑表单（含商品图上传与功能码选择）。 */

import { computed, reactive, ref } from "vue";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import RowMenu from "../../components/admin/RowMenu.vue";
import FeaturePicker from "../../components/admin/FeaturePicker.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { useFeatureCatalogStore } from "../../stores/featureCatalog.js";
import { money, num } from "../../utils/format.js";
import { PRODUCT_TYPE } from "../../utils/vocab.js";

interface Product {
  id: string;
  name?: string;
  productCode?: string | null;
  productType?: string;
  priceCents: number;
  originalPriceCents?: number | null;
  validityDays?: number | null;
  sortOrder?: number;
  featureCodes?: string[];
  includedProductIds?: string[];
  badgeText?: string | null;
  stockQuantity?: number | null;
  availableStock?: number | null;
  fulfillmentMode?: string;
  note?: string | null;
  displayDescription?: string | null;
  active?: boolean;
  featured?: boolean;
  isFullPrice?: boolean;
  packageContentsLocked?: boolean;
  requiresLicense?: boolean;
  imageUrl?: string | null;
  licenseCount?: number;
  orderCount?: number;
  [key: string]: unknown;
}

interface ProductDraft {
  id: string;
  name: string;
  productCode: string;
  productType: string;
  priceCents: string;
  originalPriceCents: string;
  validityDays: string;
  sortOrder: string;
  featureCodes: string[];
  includedProductIds: string;
  badgeText: string;
  stockQuantity: string;
  fulfillmentMode: string;
  note: string;
  displayDescription: string;
  active: boolean;
  featured: boolean;
  isFullPrice: boolean;
  packageContentsLocked: boolean;
  requiresLicense: boolean;
}

const COLUMNS = [
  { key: "name", label: "名称" },
  { key: "productType", label: "类型" },
  { key: "priceCents", label: "价格", nowrap: true },
  { key: "validityDays", label: "有效期", nowrap: true },
  { key: "featureCodes", label: "功能码" },
  { key: "stock", label: "库存", nowrap: true },
  { key: "active", label: "状态", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const toast = useToastStore();
const confirm = useConfirmStore();
const refresh = useAdminRefreshStore();
const catalog = useFeatureCatalogStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const rows = ref<Product[]>([]);
const keyword = ref("");
const status = ref("");

function asProducts(items: unknown[]): Product[] {
  return items as Product[];
}

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  if (status.value) next.status_filter = status.value;
  return next;
});

const editorOpen = ref(false);
const saving = ref(false);

function emptyDraft(): ProductDraft {
  return {
    id: "",
    name: "",
    productCode: "",
    productType: "base",
    priceCents: "0",
    originalPriceCents: "",
    validityDays: "",
    sortOrder: "100",
    featureCodes: [],
    includedProductIds: "",
    badgeText: "",
    stockQuantity: "",
    fulfillmentMode: "automatic",
    note: "",
    displayDescription: "",
    active: true,
    featured: false,
    isFullPrice: false,
    packageContentsLocked: false,
    requiresLicense: false,
  };
}

const draft = reactive<ProductDraft>(emptyDraft());

const title = computed(() => (draft.id ? `编辑商品 · ${draft.name}` : "新增商品"));

const tabs = computed<AdminTabItem[]>(() => [
  { key: "list", label: "商品列表" },
  { key: "form", label: "新增 / 编辑", hidden: !editorOpen.value },
]);

const { active, pick, reveal } = useAdminTabs("products", tabs);

function editProduct(product: Product | null) {
  const next = emptyDraft();
  if (product) {
    const numberText = (value: unknown) => (value == null ? "" : String(value));
    next.id = product.id;
    next.name = product.name || "";
    next.productCode = product.productCode || "";
    next.productType = product.productType || "base";
    next.priceCents = numberText(product.priceCents ?? 0);
    next.originalPriceCents = numberText(product.originalPriceCents);
    next.validityDays = numberText(product.validityDays);
    next.sortOrder = numberText(product.sortOrder ?? 100);
    next.featureCodes = [...(product.featureCodes || [])];
    next.includedProductIds = (product.includedProductIds || []).join(",");
    next.badgeText = product.badgeText || "";
    next.stockQuantity = numberText(product.stockQuantity);
    next.fulfillmentMode = product.fulfillmentMode || "automatic";
    next.note = product.note || "";
    next.displayDescription = product.displayDescription || "";
    next.active = Boolean(product.active);
    next.featured = Boolean(product.featured);
    next.isFullPrice = Boolean(product.isFullPrice);
    next.packageContentsLocked = Boolean(product.packageContentsLocked);
    next.requiresLicense = Boolean(product.requiresLicense);
  }
  Object.assign(draft, next);
  editorOpen.value = true;
  reveal("form");
}

function closeEditor() {
  editorOpen.value = false;
}

function findProduct(id: string): Product | undefined {
  return rows.value.find((item) => item.id === id);
}

function reload() {
  return table.value?.search();
}

function reset() {
  keyword.value = "";
  status.value = "";
  void reload();
}

function numberOrNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

function list(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function save() {
  const payload = {
    name: draft.name.trim(),
    productCode: draft.productCode.trim() || null,
    productType: draft.productType,
    priceCents: Number(draft.priceCents || 0),
    originalPriceCents: numberOrNull(draft.originalPriceCents),
    validityDays: numberOrNull(draft.validityDays),
    sortOrder: Number(draft.sortOrder || 100),
    featureCodes: draft.featureCodes,
    includedProductIds: list(draft.includedProductIds),
    badgeText: draft.badgeText.trim() || null,
    stockQuantity: numberOrNull(draft.stockQuantity),
    fulfillmentMode: draft.fulfillmentMode,
    note: draft.note.trim() || null,
    displayDescription: draft.displayDescription.trim() || null,
    active: draft.active,
    featured: draft.featured,
    isFullPrice: draft.isFullPrice,
    packageContentsLocked: draft.packageContentsLocked,
    requiresLicense: draft.requiresLicense,
  };
  saving.value = true;
  try {
    if (draft.id) {
      await adminApi(`/products/${draft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      toast.push("商品已更新");
    } else {
      await adminApi("/products", { method: "POST", body: JSON.stringify(payload) });
      toast.push("商品已创建");
    }
    closeEditor();
    refresh.bump("productCatalog", "overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    saving.value = false;
  }
}

async function removeImage(product: Product) {
  const ok = await confirm.confirm({
    title: "移除商品图",
    message: `将删除「${product.name}」的自定义商品图。`,
    detail: "同时会<b>删除磁盘上的图片文件</b>，前台该商品回落到默认标识。此操作不可撤销。",
    confirmLabel: "移除图片",
  });
  if (!ok) return;
  try {
    await adminApi(`/products/${product.id}/image`, { method: "DELETE" });
    toast.push("商品图已移除");
    refresh.bump("productCatalog");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function uploadImage(product: Product, file: File) {
  const body = new FormData();
  body.append("file", file);
  try {
    await adminApi(`/products/${product.id}/image`, { method: "POST", body });
    toast.push("商品图已更新");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

function onImageChange(product: Product, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files && input.files[0];
  input.value = "";
  if (file) void uploadImage(product, file);
}

async function removeProduct(product: Product) {
  const refs: string[] = [];
  if (product.licenseCount) refs.push(`<b>${num(product.licenseCount)}</b> 条授权`);
  if (product.orderCount) refs.push(`<b>${num(product.orderCount)}</b> 笔订单`);
  const ok = await confirm.confirm({
    title: "删除商品",
    message: `将删除「${product.name}」。`,
    detail: refs.length
      ? `该商品已被 ${refs.join("、")}引用，为避免历史数据悬空，系统只会把它<b>下架</b>而不是删除。`
      : "该商品没有产生过授权或订单，将被<b>彻底删除</b>（含商品图文件）。",
    confirmLabel: refs.length ? "下架" : "删除",
    tone: refs.length ? "warning" : "danger",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ deleted?: boolean; reason?: string }>(`/products/${product.id}`, {
      method: "DELETE",
    });
    toast.push(
      result.deleted ? "商品已删除" : `商品已下架（${result.reason || "存在历史引用"}）`,
      result.deleted ? "success" : "warning",
    );
    refresh.bump("productCatalog", "overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

void catalog.load().catch(() => {});
</script>

<template>
  <section class="admin-panel active" data-domain="catalog">
    <PanelHead
      title="商品"
      desc="定价、有效期与库存；有历史授权或订单的商品只能下架"
      domain="商品"
    >
      <button class="hb-button hb-button--primary hb-button--sm" @click="editProduct(null)">
        新增商品
      </button>
    </PanelHead>

    <div class="admin-tabs" role="tablist" aria-label="商品分区">
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
          aria-label="商品名、商品码、功能码或描述关键字"
          placeholder="商品名 / 商品码 / 功能码"
        />
        <select v-model="status" class="hb-select" aria-label="按商品状态筛选">
          <option value="">全部状态</option>
          <option value="active">已上架</option>
          <option value="inactive">已下架</option>
          <option value="soldout">已售罄</option>
          <option value="lowstock">低库存（可售 ≤ 5）</option>
        </select>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
        <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
      </div>

      <DataTable ref="table" path="/products" :columns="COLUMNS" :params="params" empty-text="没有符合条件的商品">
        <template #default="{ items }">
          <tr v-for="product in asProducts(items)" :key="product.id">
            <td>
              <span v-if="product.name" :title="product.name">{{ product.name }}</span>
              <template v-else>—</template>
              <span v-if="product.featured" class="pill pill--warning">推荐</span>
              <span v-if="product.requiresLicense" class="pill pill--info">增量包</span>
            </td>
            <td>{{ PRODUCT_TYPE[product.productType || ""] || product.productType }}</td>
            <td class="nowrap">{{ money(product.priceCents) }}</td>
            <td class="nowrap">{{ product.validityDays ? `${num(product.validityDays)} 天` : "永久" }}</td>
            <td>{{ catalog.cell(product.featureCodes || []) }}</td>
            <td class="nowrap">
              {{ product.stockQuantity === null ? "不限" : `${num(product.availableStock)}/${num(product.stockQuantity)}` }}
            </td>
            <td class="nowrap">
              <span v-if="product.active" class="pill pill--success">上架</span>
              <span v-else class="pill pill--muted">下架</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="editProduct(product)">
                  编辑
                </button>
                <RowMenu>
                  <label class="menu__item">
                    上传商品图
                    <input
                      type="file"
                      hidden
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      @change="onImageChange(product, $event)"
                    />
                  </label>
                  <button
                    v-if="product.imageUrl"
                    class="menu__item"
                    type="button"
                    @click="removeImage(product)"
                  >
                    移除商品图
                  </button>
                  <button class="menu__item is-danger" type="button" @click="removeProduct(product)">
                    删除
                  </button>
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
          <form class="admin-grid" @submit.prevent="save">
            <h4 class="admin-grid__section">基本定义</h4>
            <label class="hb-field"><span>名称</span><input v-model="draft.name" class="hb-input" required /></label>
            <label class="hb-field">
              <span>商品码</span>
              <input v-model="draft.productCode" class="hb-input is-mono" />
              <span class="admin-field-hint">写进授权的来源标识；留空自动生成。</span>
            </label>
            <label class="hb-field">
              <span>类型</span>
              <select v-model="draft.productType" class="hb-select">
                <option value="base">base</option>
                <option value="module">module</option>
                <option value="package">package</option>
              </select>
            </label>
            <h4 class="admin-grid__section">定价与有效期</h4>
            <label class="hb-field">
              <span>价格（分）</span>
              <input v-model="draft.priceCents" class="hb-input" type="number" min="0" />
            </label>
            <label class="hb-field">
              <span>划线原价（分，留空不展示）</span>
              <input v-model="draft.originalPriceCents" class="hb-input" type="number" min="0" />
            </label>
            <label class="hb-field">
              <span>有效期（天）</span>
              <input v-model="draft.validityDays" class="hb-input" type="number" min="1" />
            </label>
            <label class="hb-field">
              <span>排序</span>
              <input v-model="draft.sortOrder" class="hb-input" type="number" />
            </label>
            <h4 class="admin-grid__section">能力与交付</h4>
            <div class="hb-field admin-grid__full">
              <span>功能码</span>
              <FeaturePicker
                v-model="draft.featureCodes"
                :multiple="true"
                empty="未选择（该商品不发放任何能力）"
              />
              <small class="admin-field-hint">
                能力码由主程序逐项校验，勾选才会写进授权；未勾的能力客户端会被拦截。
              </small>
            </div>
            <label class="hb-field admin-grid__full">
              <span>套餐包含商品 ID（逗号分隔）</span>
              <input v-model="draft.includedProductIds" class="hb-input is-mono" />
            </label>
            <label class="hb-field"><span>角标文案</span><input v-model="draft.badgeText" class="hb-input" /></label>
            <label class="hb-field">
              <span>库存（留空=不限量）</span>
              <input v-model="draft.stockQuantity" class="hb-input" type="number" min="0" />
            </label>
            <label class="hb-field">
              <span>履约</span>
              <select v-model="draft.fulfillmentMode" class="hb-select">
                <option value="automatic">automatic</option>
                <option value="manual">manual</option>
              </select>
            </label>
            <h4 class="admin-grid__section">上架开关</h4>
            <div class="hb-check-group admin-grid__full">
              <label class="hb-check"><input v-model="draft.active" type="checkbox" /> 上架</label>
              <label class="hb-check"><input v-model="draft.featured" type="checkbox" /> 推荐</label>
              <label class="hb-check"><input v-model="draft.isFullPrice" type="checkbox" /> 全价商品</label>
              <label class="hb-check"><input v-model="draft.packageContentsLocked" type="checkbox" /> 锁定套餐内容</label>
            </div>
            <div class="hb-field admin-grid__full">
              <span>增量包（下单时必须挂到已有授权上）</span>
              <label class="hb-check"><input v-model="draft.requiresLicense" type="checkbox" /> 启用</label>
              <span class="admin-field-hint">
                勾上以后客户端下单要选一张已有授权、增量包的功能码写进那张授权，而不是另发一张新码。商品类型选了 module 也等同于此。
              </span>
            </div>
            <h4 class="admin-grid__section">文案备注</h4>
            <label class="hb-field admin-grid__full">
              <span>内部备注（仅后台可见）</span>
              <textarea v-model="draft.note" class="hb-textarea" rows="2"></textarea>
            </label>
            <label class="hb-field admin-grid__full">
              <span>展示描述</span>
              <textarea v-model="draft.displayDescription" class="hb-textarea" rows="2"></textarea>
            </label>
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
