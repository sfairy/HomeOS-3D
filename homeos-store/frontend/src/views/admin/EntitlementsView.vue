<script setup lang="ts">
/** 功能权益面板：列表 + 手工补权益 + 改期 / 开关。 */

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
import { useFeatureCatalogStore } from "../../stores/featureCatalog.js";
import { d, localInput, utcInput } from "../../utils/format.js";

interface Entitlement {
  id: string;
  featureCode?: string;
  productName?: string;
  licenseId?: string;
  startsAt?: string;
  expiresAt?: string | null;
  activeFlag?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

const COLUMNS = [
  { key: "featureCode", label: "功能码", nowrap: true },
  { key: "productName", label: "商品" },
  { key: "licenseId", label: "授权", nowrap: true },
  { key: "startsAt", label: "开始", nowrap: true },
  { key: "expiresAt", label: "到期", nowrap: true },
  { key: "activeFlag", label: "开关", nowrap: true },
  { key: "active", label: "实际生效", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const toast = useToastStore();
const confirm = useConfirmStore();
const catalog = useFeatureCatalogStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const feature = ref("");
const status = ref("");

function asEntitlements(items: unknown[]): Entitlement[] {
  return items as Entitlement[];
}

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (feature.value.trim()) next.keyword = feature.value.trim();
  if (status.value) next.status_filter = status.value;
  return next;
});

const createOpen = ref(false);
const patchOpen = ref(false);
const savingCreate = ref(false);
const savingPatch = ref(false);
const patchLabel = ref("");

const createDraft = reactive({
  licenseId: "",
  featureCodes: [] as string[],
  productName: "",
  startsAt: "",
  expiresAt: "",
  active: true,
});

const patchDraft = reactive({
  id: "",
  featureCodes: [] as string[],
  productName: "",
  startsAt: "",
  expiresAt: "",
  active: false,
});

const tabs = computed<AdminTabItem[]>(() => [
  { key: "list", label: "权益列表" },
  { key: "create", label: "手工补权益", hidden: !createOpen.value },
  { key: "patch", label: "改期 / 开关", hidden: !patchOpen.value },
]);

const { active, pick, reveal } = useAdminTabs("entitlements", tabs);

function reload() {
  return table.value?.search();
}

function reset() {
  feature.value = "";
  status.value = "";
  void reload();
}

function featureTitle(entry: Entitlement): string {
  return entry.featureCode || "";
}

function openCreate() {
  createDraft.licenseId = "";
  createDraft.featureCodes = [];
  createDraft.productName = "";
  createDraft.startsAt = "";
  createDraft.expiresAt = "";
  createDraft.active = true;
  createOpen.value = true;
  reveal("create");
}

function closeCreate() {
  createOpen.value = false;
}

function openPatch(entry: Entitlement) {
  patchDraft.id = entry.id;
  patchDraft.featureCodes = entry.featureCode ? [entry.featureCode] : [];
  patchDraft.productName = entry.productName || "";
  patchDraft.startsAt = localInput(entry.startsAt);
  patchDraft.expiresAt = localInput(entry.expiresAt);
  patchDraft.active = Boolean(entry.activeFlag);
  patchLabel.value = entry.featureCode || "";
  patchOpen.value = true;
  reveal("patch");
}

function closePatch() {
  patchOpen.value = false;
}

async function submitCreate() {
  if (!createDraft.featureCodes.length) {
    toast.push("请先选择功能码。", "danger");
    return;
  }
  savingCreate.value = true;
  try {
    await adminApi("/entitlements", {
      method: "POST",
      body: JSON.stringify({
        licenseId: createDraft.licenseId.trim(),
        featureCode: createDraft.featureCodes[0],
        productName: createDraft.productName.trim(),
        startsAt: utcInput(createDraft.startsAt),
        expiresAt: utcInput(createDraft.expiresAt),
        active: createDraft.active,
      }),
    });
    toast.push("权益已创建");
    closeCreate();
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    savingCreate.value = false;
  }
}

async function submitPatch() {
  if (!patchDraft.featureCodes.length) {
    toast.push("请先选择功能码。", "danger");
    return;
  }
  savingPatch.value = true;
  try {
    await adminApi(`/entitlements/${patchDraft.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        featureCode: patchDraft.featureCodes[0],
        productName: patchDraft.productName.trim(),
        startsAt: utcInput(patchDraft.startsAt),
        expiresAt: utcInput(patchDraft.expiresAt),
        active: patchDraft.active,
      }),
    });
    toast.push("权益已更新");
    closePatch();
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    savingPatch.value = false;
  }
}

async function remove(entry: Entitlement) {
  const code = entry.featureCode || entry.id;
  const ok = await confirm.confirm({
    title: "删除权益",
    message: `将删除功能 ${code} 的权益记录。`,
    detail:
      "删除后客户端<b>立刻失去</b>该功能（下次心跳刷新租约时生效）。<br>若只是临时收回，请改用「改期/开关」把开关关掉，保留记录。",
    confirmLabel: "删除",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/entitlements/${entry.id}`, { method: "DELETE" });
    toast.push("权益已删除");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

void catalog.load().catch(() => {});
</script>

<template>
  <section class="admin-panel active" data-domain="data">
    <PanelHead
      title="功能权益"
      titleHtml="功能权益"
      desc="客户端按 <code>feature_code</code> 判断功能开关；这张表过去在后台完全看不到"
      domain="数据"
    >
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">刷新</button>
      <button class="hb-button hb-button--primary hb-button--sm" @click="openCreate">手工补权益</button>
    </PanelHead>

    <div class="admin-tabs" role="tablist" aria-label="功能权益分区">
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
          v-model="feature"
          class="hb-input"
          aria-label="功能码、商品名或授权 ID 关键字"
          placeholder="功能码 / 商品 / 授权 ID"
        />
        <select v-model="status" class="hb-select" aria-label="按生效状态筛选">
          <option value="">全部</option>
          <option value="active">实际生效中</option>
          <option value="inactive">未生效 / 已过期</option>
        </select>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
        <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
      </div>

      <DataTable
        ref="table"
        path="/entitlements"
        :columns="COLUMNS"
        :params="params"
        empty-text="没有符合条件的权益记录"
      >
        <template #default="{ items }">
          <tr v-for="entry in asEntitlements(items)" :key="entry.id">
            <td>
              <span v-if="entry.featureCode" :title="featureTitle(entry)">
                {{ catalog.label(entry.featureCode) }}
              </span>
              <template v-else>—</template>
            </td>
            <td>
              <span v-if="entry.productName" :title="entry.productName">{{ entry.productName }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap mono" :title="entry.licenseId">
              {{ (entry.licenseId || "").slice(0, 8) }}…
            </td>
            <td class="nowrap">{{ d(entry.startsAt) }}</td>
            <td class="nowrap">{{ entry.expiresAt ? d(entry.expiresAt) : "永久" }}</td>
            <td class="nowrap">
              <span v-if="entry.activeFlag" class="pill pill--success">开</span>
              <span v-else class="pill pill--muted">关</span>
            </td>
            <td class="nowrap">
              <span v-if="entry.active" class="pill pill--success">生效中</span>
              <span v-else class="pill pill--warning">未生效</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="openPatch(entry)">
                  改期/开关
                </button>
                <RowMenu>
                  <button class="menu__item is-danger" type="button" @click="remove(entry)">删除</button>
                </RowMenu>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'create'" class="admin-tab-pane" role="tabpanel">
      <div v-if="createOpen" class="hb-card admin-editor">
        <div class="hb-card__body">
          <h3 class="admin-editor__title">手工补一条权益</h3>
          <p class="admin-editor__hint">
            「开关」是库里的原始值，「实际生效」是叠加有效期后的结果。
            两者分开看，才能解释「开关明明开着、客户端却没有这个功能」。
            同一张授权下同一个功能码只能有一条。
          </p>
          <form class="admin-grid admin-grid--wide" @submit.prevent="submitCreate">
            <label class="hb-field">
              <span>授权 ID</span>
              <input v-model="createDraft.licenseId" class="hb-input is-mono" required />
            </label>
            <div class="hb-field">
              <span>功能码</span>
              <FeaturePicker
                v-model="createDraft.featureCodes"
                :multiple="false"
                empty="点击选择功能码"
              />
            </div>
            <label class="hb-field">
              <span>商品名（留空取授权上的商品）</span>
              <input v-model="createDraft.productName" class="hb-input" />
            </label>
            <label class="hb-field">
              <span>开始时间</span>
              <input v-model="createDraft.startsAt" class="hb-input" type="datetime-local" />
              <span class="admin-field-hint">本地时间；留空即现在。</span>
            </label>
            <label class="hb-field">
              <span>到期时间</span>
              <input v-model="createDraft.expiresAt" class="hb-input" type="datetime-local" />
              <span class="admin-field-hint">本地时间；留空即跟随授权。</span>
            </label>
            <div class="hb-check-group">
              <label class="hb-check"><input v-model="createDraft.active" type="checkbox" /> 启用</label>
            </div>
            <div class="admin-form-actions admin-grid__full">
              <button class="hb-button hb-button--primary hb-button--sm" type="submit" :disabled="savingCreate">
                {{ savingCreate ? "保存中…" : "创建" }}
              </button>
              <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="closeCreate">
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div v-show="active === 'patch'" class="admin-tab-pane" role="tabpanel">
      <div v-if="patchOpen" class="hb-card admin-editor">
        <div class="hb-card__body">
          <h3 class="admin-editor__title">改期 / 开关 <span class="mono">{{ patchLabel }}</span></h3>
          <p class="admin-editor__hint">
            到期时间<b>留空即改为永久有效</b>。功能码改动会即时影响客户端识别，改错等于把功能换了个名字。
          </p>
          <form class="admin-grid admin-grid--wide" @submit.prevent="submitPatch">
            <div class="hb-field">
              <span>功能码</span>
              <FeaturePicker
                v-model="patchDraft.featureCodes"
                :multiple="false"
                empty="点击选择功能码"
              />
            </div>
            <label class="hb-field"><span>商品名</span><input v-model="patchDraft.productName" class="hb-input" /></label>
            <label class="hb-field">
              <span>开始时间（本地时间）</span>
              <input v-model="patchDraft.startsAt" class="hb-input" type="datetime-local" />
            </label>
            <label class="hb-field">
              <span>到期时间（本地时间）</span>
              <input v-model="patchDraft.expiresAt" class="hb-input" type="datetime-local" />
            </label>
            <div class="hb-check-group">
              <label class="hb-check"><input v-model="patchDraft.active" type="checkbox" /> 启用</label>
            </div>
            <div class="admin-form-actions admin-grid__full">
              <button class="hb-button hb-button--primary hb-button--sm" type="submit" :disabled="savingPatch">
                {{ savingPatch ? "保存中…" : "保存" }}
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
