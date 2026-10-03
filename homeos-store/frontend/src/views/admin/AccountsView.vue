<script setup lang="ts">
/** 账号面板：列表 + 编辑。 */

import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import RowMenu from "../../components/admin/RowMenu.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminDialogsStore } from "../../stores/adminDialogs.js";
import { num } from "../../utils/format.js";

interface Account {
  id: string;
  email?: string;
  isAdmin?: boolean;
  isActive?: boolean;
  emailVerifiedAt?: string | null;
  licenseCount?: number;
  balance?: unknown;
  referralCode?: string;
  [key: string]: unknown;
}

const COLUMNS = [
  { key: "email", label: "邮箱", nowrap: true },
  { key: "role", label: "角色", nowrap: true },
  { key: "licenseCount", label: "授权数", nowrap: true },
  { key: "balance", label: "余额", nowrap: true },
  { key: "referralCode", label: "邀请码", nowrap: true },
  { key: "status", label: "状态", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const router = useRouter();
const toast = useToastStore();
const confirm = useConfirmStore();
const dialogs = useAdminDialogsStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const keyword = ref("");
const role = ref("");
const status = ref("");

function asAccounts(items: unknown[]): Account[] {
  return items as Account[];
}

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  if (role.value) next.role = role.value;
  if (status.value) next.status_filter = status.value;
  return next;
});

const editorOpen = ref(false);
const saving = ref(false);

const draft = reactive({
  id: "",
  email: "",
  newPassword: "",
  isAdmin: false,
  isActive: true,
  emailVerified: false,
});

const tabs = computed<AdminTabItem[]>(() => [
  { key: "list", label: "账号列表" },
  { key: "form", label: "编辑账号", hidden: !editorOpen.value },
]);

const { active, pick, reveal } = useAdminTabs("accounts", tabs);

function reload() {
  return table.value?.search();
}

function reset() {
  keyword.value = "";
  role.value = "";
  status.value = "";
  void reload();
}

function openEditor(account: Account) {
  draft.id = account.id;
  draft.email = account.email || "";
  draft.newPassword = "";
  draft.isAdmin = Boolean(account.isAdmin);
  draft.isActive = Boolean(account.isActive);
  draft.emailVerified = Boolean(account.emailVerifiedAt);
  editorOpen.value = true;
  reveal("form");
}

function closeEditor() {
  editorOpen.value = false;
}

async function save() {
  const payload: Record<string, unknown> = {
    email: draft.email.trim(),
    isAdmin: draft.isAdmin,
    isActive: draft.isActive,
    emailVerified: draft.emailVerified,
  };
  const password = draft.newPassword;
  if (password) payload.newPassword = password;
  saving.value = true;
  try {
    await adminApi(`/accounts/${draft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    toast.push(password ? "账号已更新，该账号的登录会话已全部失效" : "账号已更新");
    closeEditor();
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    saving.value = false;
  }
}

function openLedger(account: Account) {
  void router.push({ path: "/admin/ledger", query: { account_id: account.id } });
}

function adjust(account: Account) {
  void dialogs.askAdjust({ accountId: account.id, label: account.email || account.id });
}

async function removeAccount(account: Account) {
  const email = account.email || account.id;
  const licenses = Number(account.licenseCount || 0);
  const ok = await confirm.confirm({
    title: "删除账号",
    message: `将永久删除账号 ${email}。`,
    detail: licenses
      ? `该账号有 <b>${licenses}</b> 条授权，删除会被拒绝。请改用「编辑 → 取消启用」来停用。`
      : "只有当该账号没有任何授权、订单、积分流水时才会删除成功；否则系统会退回并提示改用停用。",
    confirmLabel: "永久删除",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/accounts/${account.id}`, { method: "DELETE" });
    toast.push("账号已删除");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="licensing">
    <PanelHead
      title="账号"
      desc="可改邮箱、角色、重置密码；只有未产生过授权/订单/积分的干净账号才能删除"
      domain="授权"
    />

    <div class="admin-tabs" role="tablist" aria-label="账号分区">
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
        <input v-model="keyword" class="hb-input" aria-label="邮箱或邀请码关键字" placeholder="邮箱 / 邀请码" />
        <select v-model="role" class="hb-select" aria-label="按角色筛选">
          <option value="">全部角色</option>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
        <select v-model="status" class="hb-select" aria-label="按账号状态筛选">
          <option value="">全部状态</option>
          <option value="active">已启用</option>
          <option value="inactive">已停用</option>
          <option value="unverified">邮箱未验证</option>
        </select>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
        <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
      </div>

      <DataTable ref="table" path="/accounts" :columns="COLUMNS" :params="params" empty-text="没有符合条件的账号">
        <template #default="{ items }">
          <tr v-for="account in asAccounts(items)" :key="account.id">
            <td class="nowrap">
              <span v-if="account.email" :title="account.email">{{ account.email }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ account.isAdmin ? "管理员" : "用户" }}</td>
            <td class="nowrap">{{ num(account.licenseCount) }}</td>
            <td class="nowrap">{{ account.balance }}</td>
            <td class="nowrap mono">{{ account.referralCode || "—" }}</td>
            <td class="nowrap">
              <span v-if="account.isActive" class="pill pill--success">正常</span>
              <span v-else class="pill pill--danger">已停用</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="openEditor(account)">
                  编辑
                </button>
                <RowMenu>
                  <button class="menu__item" type="button" @click="openLedger(account)">查看积分流水</button>
                  <button class="menu__item" type="button" @click="adjust(account)">人工调账</button>
                  <button class="menu__item is-danger" type="button" @click="removeAccount(account)">删除账号</button>
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
          <h3 class="admin-editor__title">编辑账号 <span class="mono">{{ draft.email }}</span></h3>
          <p class="admin-editor__hint">
            改密码会<b>立即踢掉该账号的全部登录会话</b>；审计日志只记录「改过密码」，不记录明文。
          </p>
          <form class="admin-grid admin-grid--wide" @submit.prevent="save">
            <label class="hb-field admin-grid__wide">
              <span>邮箱</span>
              <input v-model="draft.email" class="hb-input" type="email" required />
            </label>
            <label class="hb-field">
              <span>新密码（留空则不改）</span>
              <input
                v-model="draft.newPassword"
                class="hb-input"
                type="password"
                minlength="6"
                autocomplete="new-password"
                placeholder="至少 6 位"
              />
            </label>
            <div class="hb-check-group">
              <label class="hb-check"><input v-model="draft.isAdmin" type="checkbox" /> 管理员</label>
              <label class="hb-check"><input v-model="draft.isActive" type="checkbox" /> 启用</label>
              <label class="hb-check"><input v-model="draft.emailVerified" type="checkbox" /> 邮箱已验证</label>
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
