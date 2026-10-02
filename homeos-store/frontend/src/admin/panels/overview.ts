/**
 * 概览面板。
 */

import { errorMessage } from "../../store-types.js";
import { $, emptyRow, esc, toast } from "../dom.js";
import { PENDING_FILTER_VALUES, resetPage } from "../table.js";
import { STATUS_HUES, d, dt, money, num, valueSize } from "../format.js";
import { api } from "../api.js";
import { askConfirm } from "../dialogs.js";
import { host } from "../host.js";

const REVENUE_WINDOW_LABELS: Record<string, string> = {
  last24h: '近 24 小时',
  last7d: '近 7 天',
  last30d: '近 30 天',
};

type OverviewJump = {
  page: string;
  filter?: string;
  value?: string | boolean;
  tab?: string;
};

// 待办磁贴：超过 0 才显示。jump 是「跳到哪个面板、先把某个筛选器设成什么」。
 const OVERVIEW_TODOS: Array<{
  key: string;
  label: string;
  tone: string;
  hint: string;
  jump: OverviewJump;
}> = [
  {
    key: 'awaitingFulfillment', label: '待发货', tone: 'is-alert',
    hint: '已付款但还没发出的自动发货订单',
    jump: { page: 'orders', filter: '#order-status', value: 'paid' },
  },
  {
    key: 'fulfillmentFailed', label: '发货失败', tone: 'is-danger',
    hint: '自动发货报错，需要人工重试或退款',
    jump: { page: 'orders', filter: '#order-status', value: 'fulfillment_failed' },
  },
  {
    key: 'paymentFailed', label: '支付失败', tone: 'is-alert',
    hint: '支付渠道拒单，库存预留已归还',
    jump: { page: 'orders', filter: '#order-status', value: 'payment_failed' },
  },
  {
    key: 'needsReview', label: '待人工复核', tone: 'is-danger',
    hint: '超时后仍收到款等异常入账，需人工确认',
    jump: { page: 'orders', filter: '#order-review', value: true },
  },
  {
    key: 'pendingWithdrawals', label: '待审提现', tone: 'is-alert',
    hint: '用户已申请、等待审核打款',
    jump: { page: 'withdrawals', filter: '#withdrawal-status', value: 'pending' },
  },
  {
    key: 'expiringLicenses', label: '临期授权', tone: 'is-alert',
    hint: '30 天内到期，可提前提醒续费',
    jump: { page: 'licenses', filter: '#license-expiring', value: '30' },
  },
  {
    key: 'soldOut', label: '售罄商品', tone: 'is-danger',
    hint: '库存为 0 且仍在售，下单会被拒',
    jump: { page: 'products', filter: '#product-status', value: 'soldout' },
  },
  {
    key: 'lowStock', label: '低库存商品', tone: 'is-alert',
    hint: '库存有限（含已被预留的部分）',
    jump: { page: 'products', filter: '#product-status', value: 'lowstock' },
  },
];

// 概览里的跳转统一走这里：先设筛选、再切面板，切面板时 loaders 会带着新筛选重新拉。
 function jumpFromOverview(target: OverviewJump | null | undefined) {
  if (!target) return;
  if (target.filter) {
    const node = $(target.filter) as HTMLInputElement | HTMLSelectElement | null;
    // 复选类筛选取的是 checked 而不是 value，赋值给 value 等于什么都没做。
    if (node && 'type' in node && node.type === 'checkbox') {
      (node as HTMLInputElement).checked = Boolean(target.value);
    } else if (node) {
      node.value = String(target.value ?? '');
      // 选项由服务端词表填的筛选器（订单状态）此刻可能还没选项：赋值给不存在的 value 会把
      if (node.tagName === 'SELECT' && node.value !== String(target.value ?? '')) {
        PENDING_FILTER_VALUES.set(target.filter, String(target.value ?? ''));
      }
    }
  }
  // 目标面板可能停在别的页码上，不清零会落到空的第 N 页
  resetPage(target.page);
  // 落到列表 tab：带 tab 的面板第一个 tab 都是列表，而待办说的都是
  const tab = host.collectTabs?.(target.page) ? 'list' : '';
  location.hash = tab ? `#${target.page}/${tab}` : `#${target.page}`;
  host.activate?.(target.page, tab);
}

// 巡检状态 → 徽标语气。**只放语气，中文名由后端下发**（sweep.healthLabel，见
const SWEEP_HEALTH_TONE: Record<string, string> = {
  ok: 'hb-tag--success',
  disabled: 'hb-tag--warning',
  pending: 'hb-tag--warning',
  never: 'hb-tag--danger',
  failing: 'hb-tag--danger',
  stopped: 'hb-tag--danger',
};

function humanAge(seconds: unknown) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 60) return `${Math.round(value)} 秒前`;
  if (value < 3600) return `${Math.round(value / 60)} 分钟前`;
  if (value < 86400) return `${Math.round(value / 3600)} 小时前`;
  return `${Math.round(value / 86400)} 天前`;
}

type Sweep = {
  health?: string;
  healthLabel?: string;
  intervalSeconds?: number;
  rounds?: number;
  consecutiveFailures?: number;
  lastResult?: {
    queried?: unknown;
    settled?: unknown;
    closed?: unknown;
    failed?: unknown;
  };
  lastError?: string;
  secondsSinceSuccess?: number;
  lastSuccessAt?: string;
};

// 这块的意义就在于「出问题时一定要看得见」：待办区没有待办会整块隐藏，
function renderPaymentSweep(sweep: Sweep | null | undefined) {
  const pillNode = $('#overview-sweep-pill');
  const detail = $('#overview-sweep-detail');
  if (!pillNode || !detail) return;
  if (!sweep) {
    pillNode.className = 'hb-tag hb-tag--warning';
    pillNode.textContent = '未知';
    detail.textContent = '这个版本的服务端没有上报巡检状态。';
    return;
  }
  // 中文名一律用后端下发的 healthLabel；缺失（老服务端）时才退回原始 health 值。
  pillNode.className = `hb-tag ${SWEEP_HEALTH_TONE[sweep.health || ''] || 'hb-tag--warning'}`;
  pillNode.textContent = sweep.healthLabel || sweep.health || '未知';

  const interval = Number(sweep.intervalSeconds || 0);
  const rounds = Number(sweep.rounds || 0);
  const failures = Number(sweep.consecutiveFailures || 0);
  const result = sweep.lastResult;
  const lastRun = result
    ? `上一轮：查单 ${num(result.queried)} · 入账 ${num(result.settled)} · 关单 ${num(result.closed)} · 失败 ${num(result.failed)}`
    : '';

  let text: string;
  if (sweep.health === 'disabled') {
    text = '站点配置里把巡检间隔设成了 0，也就是关掉了：付了款但异步通知丢掉的订单不会再被认领，超时订单的渠道交易也不会被关闭。';
  } else if (sweep.health === 'stopped') {
    text = '巡检循环已经退出，但服务还在运行。这段时间里没有任何订单在被对账。请重启服务，并确认日志里没有反复出现的巡检异常。';
  } else if (sweep.health === 'pending') {
    text = '巡检循环还没跑完第一轮（首轮会稍作延后，避免启动瞬间去抢数据库）。稍后刷新即可。';
  } else if (sweep.health === 'never') {
    text = `本进程启动后已经跑了 ${num(rounds)} 轮，一次都没成功，最近一次错误：${sweep.lastError || '（没有记录）'}`;
  } else if (sweep.health === 'failing') {
    text = `最近一次成功在 ${humanAge(sweep.secondsSinceSuccess)}，之后连续失败 ${num(failures)} 轮，最近一次错误：${sweep.lastError || '（没有记录）'}`;
  } else {
    text = sweep.lastSuccessAt
      ? `最近一次成功 ${humanAge(sweep.secondsSinceSuccess)}，已跑 ${num(rounds)} 轮。${lastRun}`
      : `已跑 ${num(rounds)} 轮。${lastRun}`;
  }
  if (interval > 0 && sweep.health !== 'disabled' && sweep.health !== 'stopped') {
    text += `（间隔 ${interval} 秒）`;
  }
  detail.textContent = text;
}

type Incidents = {
  total?: number;
  kinds?: Array<{
    label?: string;
    count?: unknown;
    lastAt?: string;
    lastOrderNo?: string;
    lastError?: string;
  }>;
  clearedAt?: string;
  clearedTotal?: unknown;
};

// 资金/履约异常计数。文案的重点是「这些异常不会自己报错」——运维看到
 function renderIncidents(incidents: Incidents | null | undefined) {
  const pillNode = $('#overview-incidents-pill');
  const detail = $('#overview-incidents-detail');
  const ackButton = $('#overview-incidents-ack');
  if (!pillNode || !detail || !ackButton) return;
  if (!incidents) {
    pillNode.className = 'hb-tag hb-tag--warning';
    pillNode.textContent = '未知';
    detail.textContent = '这个版本的服务端没有上报异常计数。';
    ackButton.hidden = true;
    return;
  }
  const total = Number(incidents.total || 0);
  const kinds = incidents.kinds || [];
  pillNode.className = `hb-tag ${total ? 'hb-tag--danger' : 'hb-tag--success'}`;
  pillNode.textContent = total ? `${num(total)} 次` : '无异常';
  ackButton.hidden = total === 0;

  if (!total) {
    const clearedNote = incidents.clearedAt
      ? `上次确认在 ${humanAge((Date.now() - Date.parse(incidents.clearedAt)) / 1000)}`
        + `（当时 ${num(incidents.clearedTotal)} 次）`
      : '本进程启动以来没有出现过。';
    detail.textContent = `${clearedNote}这些异常会被服务刻意吞掉：对账失败不能把用户的支付页打成 500，`
      + '入账后履约失败不能给渠道回失败（否则渠道会无限重推）。所以它们不会体现在任何报错里，只能靠这里看。';
    return;
  }

  const lines = kinds.map((item) => {
    const when = item.lastAt ? humanAge((Date.now() - Date.parse(item.lastAt)) / 1000) : '（无时间记录）';
    const order = item.lastOrderNo ? `订单 ${item.lastOrderNo}` : '（没有关联订单）';
    const error = item.lastError || '（没有记录错误信息）';
    return `${item.label} ${num(item.count)} 次，最近一次 ${when}，${order}：${error}`;
  });
  detail.textContent = `${lines.join('；')}。这些异常不会让接口报错：钱可能已经收到，`
    + '但发码 / 查单没有走完。请到「订单」里按状态 fulfillment_failed 处理（重试履约或退款）。';
}

export async function loadOverview() {
  const data = (await api('/overview')) as Record<string, any>;
  const revenue = data.revenue || {};
  const attention = data.attention || {};

  renderPaymentSweep(data.paymentSweep);
  renderIncidents(data.incidents);
  // —— 营收 ——
  const manualNote = revenue.totalManualCents
    ? ` · 人工补记 ${money(revenue.totalManualCents)} 不计营收`
    : '';
  const windowCards = (revenue.windows || []).map((bucket: any) => [
    REVENUE_WINDOW_LABELS[bucket.key] || bucket.key,
    money(bucket.netCents),
    `${bucket.paidOrders} 单付款`
      + (bucket.manualOrders ? ` · 人工补记 ${bucket.manualOrders} 单不计营收` : ''),
    'is-tone-amber',
  ]);
  const revenueEl = $('#overview-revenue');
  if (revenueEl) {
    revenueEl.innerHTML = [
      ['净营收（累计）', money(revenue.totalCents), `收款 ${money(revenue.totalGrossCents)} · 退款 ${money(revenue.totalRefundCents)}${manualNote}`, 'is-tone-amber'],
      ...windowCards,
    ].map(([label, value, note, tone]) =>
      `<div class="stat ${tone}"><span class="stat__label">${esc(label)}</span>` +
      `<strong class="stat__value${valueSize(value)}" title="${esc(value)}">${esc(value)}</strong>` +
      (note ? `<span class="stat__note">${esc(note)}</span>` : '') + '</div>'
    ).join('');
  }

  // —— 订单漏斗 ——
  // 条形宽度按最大计数归一。全为 0 时（新站）给 0 而不是 NaN。
  const funnel = data.orderFunnel || [];
  const maxCount = Math.max(1, ...funnel.map((item: any) => Number(item.count || 0)));
  const funnelEl = $('#overview-funnel');
  if (funnelEl) {
    funnelEl.innerHTML = funnel.map((item: any) => {
      const count = Number(item.count || 0);
      const width = Math.round((count / maxCount) * 100);
      const hue = STATUS_HUES[item.status];
      return `<button class="funnel-item${hue ? ` ${hue}` : ''}" type="button" data-funnel-status="${esc(item.status)}">` +
        `<span class="funnel-item__top"><span class="funnel-item__label">${esc(item.label)}</span>` +
        `<span class="funnel-item__count">${count}</span></span>` +
        `<span class="funnel-item__track"><span class="funnel-item__fill" style="width:${width}%"></span></span>` +
        `<span class="funnel-item__amount">${esc(money(item.amountCents))}</span></button>`;
    }).join('');
  }

  // —— 待办 ——
  const todos = OVERVIEW_TODOS.filter((todo) => Number(attention[todo.key] || 0) > 0);
  const todosEl = $('#overview-todos');
  if (todosEl) todosEl.hidden = todos.length === 0;
  const todosGrid = $('#overview-todos-grid');
  if (todosGrid) {
    todosGrid.innerHTML = todos.map((todo) =>
      `<button class="overview-todo ${esc(todo.tone)}" type="button" data-overview-todo="${esc(todo.key)}">` +
      `<span class="overview-todo__count">${Number(attention[todo.key] || 0)}</span>` +
      `<span class="overview-todo__label">${esc(todo.label)}</span>` +
      `<span class="overview-todo__hint">${esc(todo.hint)}</span></button>`
    ).join('');
  }

  // —— 库存预警 ——
  const stock = data.lowStockProducts || [];
  const stockRows = $('#overview-stock-rows');
  if (stockRows) {
    stockRows.innerHTML = stock.length
      ? stock.map((item: any) => {
        const available = Number(item.availableStock || 0);
        const tone = available <= 0 ? 'hb-tag--danger' : 'hb-tag--warning';
        return `<tr><td>${esc(item.name)}</td><td class="is-mono">${num(item.stockQuantity)}</td>` +
          `<td class="is-mono">${num(item.reservedStock)}</td>` +
          `<td><span class="hb-tag ${tone}"><b>${available}</b></span></td></tr>`;
      }).join('')
      : emptyRow(4, '没有设置库存的商品，或库存都很充足。');
  }

  // —— 临期授权 ——
  const expiring = data.expiringLicenses || [];
  const expiringRows = $('#overview-expiring-rows');
  if (expiringRows) {
    expiringRows.innerHTML = expiring.length
      ? expiring.map((item: any) =>
        `<tr><td class="is-mono">${esc(item.codeHint || item.activationCodeId)}</td>` +
        `<td>${esc(item.productName)}</td><td class="nowrap">${esc(d(item.accessExpiresAt))}</td></tr>`
      ).join('')
      : emptyRow(3, `未来 ${Number(attention.expiringWindowDays || 30)} 天内没有到期的授权。`);
  }

  // —— 累计 ——
  const referral = data.referral || {};
  // 积分负债 = 全部未兑付的积分 = balance（可用 + 冻结）。只给「可用」会低估要付的账，
  const pointsTotal = Number(referral.balancePoints || 0);
  const cards: Array<[string, unknown, string, string]> = [
    ['账号', data.accounts, '', 'is-tone-blue'],
    ['商品', data.products, '', 'is-tone-violet'],
    ['有效授权', `${data.activeLicenses}/${data.licenses}`, '', 'is-tone-accent'],
    ['权限项', `${data.activeEntitlements}/${data.entitlements}`, '', 'is-tone-violet'],
    ['待支付订单', data.pendingOrders, '', data.pendingOrders ? 'is-alert' : 'is-tone-accent'],
    ['已履约订单', data.fulfilledOrders, '', 'is-tone-emerald'],
    ['在线设备', data.deviceBindings, '', 'is-tone-accent'],
    ['积分负债', num(pointsTotal), `可用 ${num(referral.availablePoints)} · 冻结 ${num(referral.frozenPoints)}`, 'is-tone-blue'],
    ['维护模式', data.maintenanceMode ? '开启' : '关闭',
      data.maintenanceMode ? '前台已拦截下单' : '前台正常营业',
      data.maintenanceMode ? 'is-danger' : 'is-tone-emerald'],
  ];
  const stats = $('#overview-stats');
  if (stats) {
    stats.innerHTML = cards.map(([label, value, note, tone]) =>
      `<div class="stat ${tone}"><span class="stat__label">${esc(label)}</span>` +
      `<strong class="stat__value${valueSize(value)}" title="${esc(value)}">${esc(value)}</strong>` +
      (note ? `<span class="stat__note">${esc(note)}</span>` : '') + '</div>'
    ).join('');
  }

  const stamp = $('#overview-stamp');
  if (stamp) stamp.textContent = `数据时间 ${dt(data.serverTime)}`;

  host.setNavBadge?.('orders', data.pendingOrders);
  host.setNavBadge?.('withdrawals', data.pendingWithdrawals);
}

// 概览跳转：委托在面板上，这样磁贴与漏斗共用一套逻辑。
$('#panel-overview')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const todo = target.closest<HTMLElement>('[data-overview-todo]');
  if (todo) {
    const spec = OVERVIEW_TODOS.find((item) => item.key === todo.dataset.overviewTodo);
    jumpFromOverview(spec && spec.jump);
    return;
  }
  const funnelItem = target.closest<HTMLElement>('[data-funnel-status]');
  if (funnelItem) {
    jumpFromOverview({
      page: 'orders',
      filter: '#order-status',
      value: funnelItem.dataset.funnelStatus,
    });
  }
});

$('#overview-refresh')?.addEventListener('click', () =>
  loadOverview().catch((error) => toast(errorMessage(error, '操作失败'), 'danger')),
);

$('#overview-toggle-maintenance')?.addEventListener('click', async () => {
  try {
    const current = (await api('/settings')) as { store?: { maintenanceMode?: boolean } };
    const next = !current.store?.maintenanceMode;
    await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({ maintenanceMode: next }),
    });
    toast(next ? '已开启维护模式' : '已关闭维护模式');
    await loadOverview();
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

$('#overview-recompute-stock')?.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: '重算库存预留',
    message: '将按当前仍占用库存的订单（待支付 / 已付款）重算每个商品的预留数。',
    impact:
      '这是一次<b>覆盖式修正</b>：只改「预留数」这个统计值，不动库存总量，也不会改动任何订单。',
    okText: '重算',
    tone: 'warning',
  });
  if (!ok) return;
  try {
    const result = (await api('/maintenance/recompute-stock', {
      method: 'POST',
      body: JSON.stringify({}),
    })) as { updated?: number; detail?: string };
    toast(
      result.updated
        ? `已修正 ${result.updated} 个商品的预留数：${result.detail}`
        : '库存预留本来就是准的，无需修正',
      result.updated ? 'success' : 'warning',
    );
    await Promise.all([loadOverview(), host.loadProducts?.()]);
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});
// 重算优惠码核销数：与「重算库存预留」对称的维护动作，只改统计值。
$('#overview-recompute-coupons')?.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: '重算优惠码核销数',
    message: '将按优惠码核销记录重算每个码的「已核销」数量。',
    impact:
      '这是一次<b>覆盖式修正</b>：只改「已核销」这个统计值，不动优惠码本身，也不会改动任何订单。',
    okText: '重算',
    tone: 'warning',
  });
  if (!ok) return;
  try {
    const result = (await api('/maintenance/recompute-coupons', {
      method: 'POST',
      body: JSON.stringify({}),
    })) as { updated?: number; detail?: string };
    toast(
      result.updated
        ? `已修正 ${result.updated} 个优惠码的核销数：${result.detail}`
        : '核销数本来就是准的，无需修正',
      result.updated ? 'success' : 'warning',
    );
    await Promise.all([loadOverview(), host.loadCoupons?.()]);
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

// 确认（清零）入账异常计数。文案要说清这是「我已经处理过了」而不是
$('#overview-incidents-ack')?.addEventListener('click', async () => {
  const ok = await askConfirm({
    title: '确认已处理',
    message: '把「入账异常」计数清零。清零前会记进审计日志（谁确认的、确认掉了几次）。',
    impact:
      '这只是把计数器归零：<b>不会</b>修复任何订单。请先确认那些「入账后履约失败」的订单' +
      '已经重试发码或退款，否则真正的失败就不再显眼了。',
    okText: '清零计数',
    tone: 'warning',
  });
  if (!ok) return;
  try {
    const result = (await api('/incidents/ack', {
      method: 'POST',
      body: JSON.stringify({}),
    })) as { cleared?: number; detail?: string; incidents?: Incidents };
    toast(
      result.cleared
        ? `已清零 ${result.cleared} 次异常计数：${result.detail}`
        : '本来就没有异常计数',
      result.cleared ? 'success' : 'warning',
    );
    renderIncidents(result.incidents);
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});
