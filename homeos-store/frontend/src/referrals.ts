import { esc } from "./htmlsafe.js";
import { formatPoints, formatCentsPlain } from "./money.js";

const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
const storageKey = 'hb_invite_v1';
try {
  // 存储不可用 / 值被改坏时只是不预填邀请码，注册流程本身不依赖它。
  const code = new URL(location.href).searchParams.get('invite');
  if (code && /^[0-9]{6}$/.test(code)) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ code, expires: Date.now() + 30 * 86400000 }),
    );
  }
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as {
    code?: string;
    expires?: number;
  } | null;
  const referralInput = document.querySelector(
    '#store-register-form [name="referralCode"]',
  ) as HTMLInputElement | null;
  if (
    saved?.expires &&
    saved.expires > Date.now() &&
    saved.code &&
    /^[0-9]{6}$/.test(saved.code) &&
    referralInput
  ) {
    referralInput.value = saved.code;
  } else if (saved) {
    localStorage.removeItem(storageKey);
  }
} catch {
  /* ignore */
}
// 积分流水的类型标签。键必须覆盖后端全部写入方（apps/store/commerce/referrals.py 的
const labels: Record<string, string> = {
  reward: '邀请奖励',
  reversal: '邀请失败',
  freeze: '提现冻结',
  withdrawal: '提现完成',
  release: '退回积分',
  manual_adjust: '人工调账',
  pending: '待审核',
  paid: '已提现',
  rejected: '已驳回 / 撤销',
};
const date = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString('zh-CN', { hour12: false }) : '—';
const table = (heads: string[], rows: string[][]) =>
  rows.length
    ? `<div class="referral-table-wrap"><table class="referral-table"><thead><tr>${heads.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="referral-empty">暂无记录。分享邀请链接，开始积累积分。</p>';

type ReferralApi = (path: string, options?: RequestInit) => Promise<any>;
type ToastFn = (message: string, tone?: string) => void;

type ReferralData = {
  invitedCount?: number;
  settings?: {
    enabled?: boolean;
    ratePercent?: number;
    withdrawalFeePercent?: number;
    withdrawalMinPoints?: number;
  };
  wallet?: {
    code?: string;
    balance?: number;
    frozen?: number;
    earned?: number;
    withdrawn?: number;
  };
};

export const HBReferrals = {
  clearInvite() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  },
  async init(api: ReferralApi, toast: ToastFn) {
    let data: ReferralData | undefined;
    let kind = 'ledger';
    let page = 1;
    let requestKey = crypto.randomUUID();
    let busy = false;
    let sequence = 0;
    const error = (e: unknown) => {
      const message = e instanceof Error ? e.message : '请求失败';
      const box = $('#referral-error');
      if (box) {
        box.textContent = message;
        box.hidden = false;
      }
      toast(message);
    };
    // 提现下限只有一个主人：服务端下发的 settings.withdrawalMinPoints（后台可配）。
    const minPoints = () => Math.max(0, Number(data?.settings?.withdrawalMinPoints ?? 0));
    const preview = () => {
      const form = $('#referral-withdraw-form') as HTMLFormElement | null;
      const pointsEl = form?.elements.namedItem('points') as HTMLInputElement | null;
      const raw = pointsEl?.value;
      const cents = Math.round(Number(raw || minPoints() || 0) * 100);
      const bps = Math.round(Number(data?.settings?.withdrawalFeePercent) * 100);
      const fee = Math.floor((cents * bps) / 10000);
      const feeBox = $('#referral-fee-preview');
      if (feeBox) {
        feeBox.textContent = `手续费 ${data?.settings?.withdrawalFeePercent}%：${formatPoints(fee)} 积分；预计到账 ${formatCentsPlain(Math.max(0, cents - fee))} 元。`;
      }
    };
    async function refresh() {
      data = await api('/referrals');
      const { wallet: w, settings: s } = data!;
      const invited = $('#referral-invited');
      if (invited) invited.textContent = String(data!.invitedCount ?? '');
      const rate = $('#referral-rate');
      if (rate) {
        rate.textContent = s?.enabled
          ? `好友每笔实付订单，奖励 ${s.ratePercent}% 积分。`
          : '邀请活动暂时关闭，已有积分仍可查看和申请提现。';
      }
      const codeText = $('#referral-code-text');
      if (codeText) codeText.textContent = w?.code || '生成邀请码，开始邀请好友。';
      const generate = $('#referral-generate') as HTMLButtonElement | null;
      if (generate) {
        generate.hidden = Boolean(w);
        generate.disabled = !s?.enabled;
      }
      const copyCode = $('#referral-copy-code');
      if (copyCode) copyCode.hidden = !w;
      const copyLink = $('#referral-copy-link');
      if (copyLink) copyLink.hidden = !w;
      const link = $('#referral-link') as HTMLInputElement | null;
      if (link) {
        link.hidden = !w;
        if (w) {
          link.value = `${location.origin}/user/authentication/register?invite=${encodeURIComponent(w.code || '')}`;
        }
      }
      // 「可用积分」必须和服务端 referrals.available_points 同一口径：余额 - 提现冻结。
      const available = Math.max(0, Number(w?.balance || 0) - Number(w?.frozen || 0));
      // 四张积分卡各挂一个语义色（与账号概览、后台徽标同一套 data-tone 词汇）：
      const stats = $('#referral-stats');
      if (stats) {
        stats.innerHTML = (
          [
            ['可用积分', available, 'eco'],
            ['提现中积分', w?.frozen, 'lumen'],
            ['累计净奖励', w?.earned, 'accent'],
            ['已提现积分', w?.withdrawn, 'aura'],
          ] as Array<[string, unknown, string]>
        )
          .map(
            ([label, v, tone]) =>
              `<article data-tone="${tone}"><small>${label}</small><strong>${esc(typeof v === 'number' ? v.toFixed(2) : (v || '0.00'))}</strong><small>积分</small></article>`,
          )
          .join('');
      }
      const withdrawBtn = (
        $('#referral-withdraw-form') as HTMLFormElement | null
      )?.querySelector('button') as HTMLButtonElement | null;
      if (withdrawBtn) {
        withdrawBtn.disabled = !w || available < minPoints() || Number(w.frozen) > 0;
      }
      const guideReward = $('#referral-guide-reward');
      if (guideReward) {
        guideReward.textContent = `好友注册后，实际支付成功的订单，按实付金额的 ${s?.ratePercent}% 奖励积分。注册本身不发积分，支付成功后自动入账。`;
      }
      const guideFee = $('#referral-guide-fee');
      if (guideFee) {
        guideFee.textContent = `1 积分等于 1 元，满 ${minPoints()} 积分可以申请提现。当前手续费 ${s?.withdrawalFeePercent}%，申请 ${minPoints()} 积分，扣除 ${s?.withdrawalFeePercent} 积分手续费，实际到账 ${(minPoints() - Number(s?.withdrawalFeePercent)).toFixed(2)} 元。手续费不足 0.01 部分舍去。`;
      }
      // 输入框的下限同样跟服务端走：模板里的 min/placeholder 是给「还没拿到设置」时兜底的静态值。
      const form = $('#referral-withdraw-form') as HTMLFormElement | null;
      const pointsInput = form?.elements.namedItem('points') as HTMLInputElement | null;
      if (pointsInput) {
        pointsInput.min = String(minPoints());
        pointsInput.placeholder = `最低 ${minPoints()}`;
      }
      const lead = $('#referral-withdraw-lead');
      if (lead) {
        lead.textContent = `1 积分等于 1 元，满 ${minPoints()} 积分可申请提现。提交申请后凭申请编号联系客服人工办理。`;
      }
      preview();
    }
    async function history() {
      document.querySelectorAll<HTMLElement>('[data-referral-history]').forEach((b) => {
        b.classList.toggle('hb-button--primary', b.dataset.referralHistory === kind);
        b.classList.toggle('hb-button--secondary', b.dataset.referralHistory !== kind);
      });
      const current = ++sequence;
      const result = await api(`/referrals/history?kind=${kind}&page=${page}`);
      if (current !== sequence) return;
      const historyBox = $('#referral-history');
      if (historyBox) {
        historyBox.innerHTML =
          kind === 'ledger'
            ? table(
                ['时间', '类型', '可用积分变化', '冻结积分变化', '余额', '说明'],
                (result.items as any[]).map((i) => [
                  esc(date(i.createdAt)),
                  esc(labels[i.kind] || i.kind),
                  esc(i.delta),
                  esc(i.frozenDelta),
                  esc(i.balanceAfter),
                  `${esc(i.note)}${i.reference ? `<code>${esc(i.reference)}</code>` : ''}`,
                ]),
              )
            : table(
                [
                  '申请时间 / 编号',
                  '申请积分',
                  '手续费积分',
                  '实际到账（积分等值）',
                  '状态',
                  '处理说明',
                ],
                (result.items as any[]).map((i) => [
                  `${esc(date(i.createdAt))}<code>${esc(i.id)}</code>`,
                  esc(i.points),
                  `${esc(i.feePoints)} (${esc(i.feePercent)}%)`,
                  esc(i.netPoints),
                  esc(labels[i.status] || i.status),
                  `${esc(i.note || '待处理')}<small>${esc(date(i.resolvedAt))}</small>`,
                ]),
              );
      }
      const pageEl = $('#referral-page');
      if (pageEl) pageEl.textContent = `第 ${page} 页 · 共 ${result.total} 条`;
      const prev = $('#referral-prev') as HTMLButtonElement | null;
      if (prev) prev.disabled = page === 1;
      const next = $('#referral-next') as HTMLButtonElement | null;
      if (next) next.disabled = page * 20 >= result.total;
    }
    const copy = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast('已复制');
      } catch {
        const input = $('#referral-link') as HTMLInputElement | null;
        if (input) {
          input.hidden = false;
          input.value = text;
          input.focus();
          input.select();
        }
        toast('请长按或使用 Ctrl/Cmd+C 复制选中内容');
      }
    };
    const copyCodeBtn = $('#referral-copy-code');
    if (copyCodeBtn) {
      copyCodeBtn.onclick = () => copy(data?.wallet?.code || '');
    }
    const copyLinkBtn = $('#referral-copy-link');
    if (copyLinkBtn) {
      copyLinkBtn.onclick = () =>
        copy(
          `${location.origin}/user/authentication/register?invite=${data?.wallet?.code || ''}`,
        );
    }
    const generateBtn = $('#referral-generate');
    if (generateBtn) {
      generateBtn.onclick = async () => {
        if (busy) return;
        busy = true;
        try {
          await api('/referrals/code', { method: 'POST' });
          await refresh();
        } catch (e) {
          error(e);
        } finally {
          busy = false;
        }
      };
    }
    const withdrawForm = $('#referral-withdraw-form') as HTMLFormElement | null;
    const pointsField = withdrawForm?.elements.namedItem('points') as HTMLInputElement | null;
    if (pointsField) pointsField.oninput = preview;
    if (withdrawForm) {
      withdrawForm.onsubmit = async (e) => {
        e.preventDefault();
        if (busy) return;
        busy = true;
        const form = e.currentTarget as HTMLFormElement;
        const button = form.querySelector('button') as HTMLButtonElement | null;
        if (button) button.disabled = true;
        try {
          const pointsEl = form.elements.namedItem('points') as HTMLInputElement;
          const item = await api('/referrals/withdrawals', {
            method: 'POST',
            body: JSON.stringify({
              points: pointsEl.value,
              requestKey,
              expectedFeePercent: data?.settings?.withdrawalFeePercent,
            }),
          });
          requestKey = crypto.randomUUID();
          const app = $('#referral-application');
          if (app) {
            app.textContent = `申请已提交，编号：${item.id}。请联系客服办理提现。`;
          }
          kind = 'withdrawals';
          page = 1;
          await refresh();
          await history();
        } catch (err) {
          error(err);
          await refresh().catch(() => {});
        } finally {
          busy = false;
          const avail = Math.max(
            0,
            Number(data?.wallet?.balance || 0) - Number(data?.wallet?.frozen || 0),
          );
          if (button) {
            button.disabled =
              !data?.wallet || avail < minPoints() || Number(data?.wallet?.frozen) > 0;
          }
        }
      };
    }
    document.querySelectorAll<HTMLElement>('[data-referral-history]').forEach((b) => {
      b.onclick = () => {
        kind = b.dataset.referralHistory || 'ledger';
        page = 1;
        document.querySelectorAll<HTMLElement>('[data-referral-history]').forEach((x) => {
          x.classList.toggle('hb-button--primary', x === b);
          x.classList.toggle('hb-button--secondary', x !== b);
        });
        history().catch(error);
      };
    });
    const prevBtn = $('#referral-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        page--;
        history().catch(error);
      };
    }
    const nextBtn = $('#referral-next');
    if (nextBtn) {
      nextBtn.onclick = () => {
        page++;
        history().catch(error);
      };
    }
    await refresh();
    await history();
  },
};
