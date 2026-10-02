/**
 * 功能项选择器。
 */

import { state } from "./state.js";
import { $, $$, esc, toast } from "./dom.js";
import { closeRowMenus, hidePopoverIfOpen } from "./menus.js";
import { placePopover } from "./popover-place.js";
import { api } from "./api.js";

type FeatureCatalogItem = {
  code: string;
  label?: string;
  description?: string;
  group?: string;
  groupLabel?: string;
  [key: string]: unknown;
};

type FeatureGroup = {
  key: string;
  label: string;
  [key: string]: unknown;
};

type PopoverElement = HTMLElement & {
  showPopover?: () => void;
};

function catalog(): FeatureCatalogItem[] {
  return (state.featureCatalog || []) as FeatureCatalogItem[];
}

function groups(): FeatureGroup[] {
  return (state.featureGroups || []) as FeatureGroup[];
}

function featureLabel(code: string) {
  const item = catalog().find((entry) => entry.code === code);
  return item ? item.label || code : code;
}

// 列表里给运营看中文名，代码留在 title 里备查（中文是主口径）。
export function featureCell(codes: string[]) {
  if (!codes.length) return '—';
  return `<span title="${esc(codes.join(', '))}">${esc(codes.map(featureLabel).join('、'))}</span>`;
}

function featurePickers() {
  return $$('[data-feature-picker]');
}

function featurePickerValue(root: HTMLElement) {
  const input = $('[data-feature-value]', root) as HTMLInputElement | null;
  const raw = input ? input.value : '';
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

export function setFeaturePickerValue(root: HTMLElement, codes: string[]) {
  const input = $('[data-feature-value]', root) as HTMLInputElement | null;
  if (input) input.value = codes.join(',');
}

 function featurePickerMultiple(root: HTMLElement) {
  return root.dataset.featureMultiple === 'true';
}

// 单选实例（权益的功能码）是必填字段：空值直接拦在客户端，别让一个空
export function requireFeatureCode(root: HTMLElement, message: string) {
  if (featurePickerValue(root).length) return true;
  toast(message, 'danger');
  openFeaturePicker(root);
  return false;
}

// 已有记录可能带着目录里没有的代码（旧版本遗留、脚本导入）。它们必须仍然可见、
function featurePickerExtras(selected: string[]) {
  // 目录还没到就别急着判「未知」：那会把所有已选代码都错标成自定义代码。
  if (!catalog().length) return [];
  const known = new Set(catalog().map((item) => item.code));
  return selected.filter((code) => !known.has(code));
}

export function syncFeatureSummary(root: HTMLElement) {
  const summary = $('[data-feature-summary]', root);
  if (!summary) return;
  const codes = featurePickerValue(root);
  if (!codes.length) {
    summary.textContent = root.dataset.featureEmpty || '未选择';
    summary.classList.add('is-empty');
    return;
  }
  summary.classList.remove('is-empty');
  if (!featurePickerMultiple(root)) {
    // 单选（权益）连代码一起显示：客服核对「客户端认的是哪个功能」看的就是这个标识。
    summary.textContent = codes.map((code) => `${featureLabel(code)} · ${code}`).join('、');
    return;
  }
  const labels = codes.map(featureLabel);
  summary.textContent = labels.length <= 3
    ? labels.join('、')
    : `${labels.slice(0, 3).join('、')} 等 ${labels.length} 项`;
}

function featureOptionRow(
  root: HTMLElement,
  code: string,
  label: string,
  description?: string,
) {
  const checked = featurePickerValue(root).includes(code) ? ' checked' : '';
  // 选项故意不带 name：单选若共用 name，form.elements.featureCode 会变成
  const type = featurePickerMultiple(root) ? 'checkbox' : 'radio';
  return `<label class="feature-option">
      <input type="${type}" data-feature-option value="${esc(code)}"${checked}>
      <span class="feature-option__body">
        <span class="feature-option__title"><span class="feature-option__name">${esc(label)}</span><code class="feature-option__code">${esc(code)}</code></span>
        ${description ? `<span class="feature-option__desc">${esc(description)}</span>` : ''}
      </span>
    </label>`;
}

// 重新渲染整个列表：目录只拉一次，但每次打开编辑器都要按当前选中的代码重置勾选态。
export function renderFeatureOptions(root: HTMLElement) {
  const list = $('[data-feature-list]', root);
  if (!list) return;
  const searchInput = $('[data-feature-search]', root) as HTMLInputElement | null;
  const search = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const matched = catalog().filter((item) => (
    !search
    || item.code.toLowerCase().includes(search)
    || (item.label || '').toLowerCase().includes(search)
    || (item.description || '').toLowerCase().includes(search)
  ));
  const nextGroups: FeatureGroup[] = groups().length
    ? [...groups()]
    : [{ key: 'base', label: '基础能力' }];
  const knownGroups = new Set(nextGroups.map((group) => group.key));
  matched.forEach((item) => {
    if (!item.group || knownGroups.has(item.group)) return;
    knownGroups.add(item.group);
    nextGroups.push({ key: item.group, label: item.groupLabel || item.group });
  });
  const blocks = nextGroups.map((group) => {
    const items = matched.filter((item) => item.group === group.key);
    if (!items.length) return '';
    return `<div class="feature-group">
        <div class="feature-group__head">${esc(group.label)}</div>
        ${items.map((item) => featureOptionRow(root, item.code, item.label || item.code, item.description)).join('')}
      </div>`;
  });
  const extras = featurePickerExtras(featurePickerValue(root));
  if (extras.length) {
    blocks.push(`<div class="feature-group">
        <div class="feature-group__head">自定义代码</div>
        ${extras.map((code) => featureOptionRow(root, code, code, '不在当前能力码目录中，保留原样不丢失。')).join('')}
      </div>`);
  }
  list.innerHTML = blocks.filter(Boolean).join('')
    || '<div class="feature-picker__empty">没有匹配的功能码</div>';
}

// 勾选顺序按目录顺序收集，保证保存结果稳定、可 diff。
 function collectFeatureSelection(root: HTMLElement) {
  const checked = new Set(
    $$('[data-feature-option]:checked', root).map(
      (input) => (input as HTMLInputElement).value,
    ),
  );
  const known = catalog().map((item) => item.code);
  const ordered = known.filter((code) => checked.has(code));
  featurePickerExtras([...checked]).forEach((code) => {
    if (!ordered.includes(code)) ordered.push(code);
  });
  return ordered;
}

function refreshFeaturePickers() {
  featurePickers().forEach((root) => {
    renderFeatureOptions(root);
    syncFeatureSummary(root);
  });
}

 function closeFeaturePicker(root: HTMLElement | null | undefined) {
  if (!root || !root.classList.contains('is-open')) return;
  root.classList.remove('is-open');
  const pop = $('[data-feature-pop]', root);
  if (pop) {
    hidePopoverIfOpen(pop);
    pop.hidden = true;
  }
  const toggle = $('[data-feature-toggle]', root);
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

export function closeFeaturePickers() {
  featurePickers().forEach(closeFeaturePicker);
}

// 与行内「⋯」菜单同一套坐标算法：absolute 弹出层会被 .admin-main / .table-wrap 的
function placeFeaturePicker(root: HTMLElement) {
  const pop = $('[data-feature-pop]', root);
  const toggle = $('[data-feature-toggle]', root);
  if (!pop || !toggle) return;
  placePopover(pop, toggle, {
    align: 'left',
    // 字段是整行宽，弹层跟着等宽会拉出一行超长的说明文字，这里夹到一档易读的宽度。
    prepare: (node) => {
      const anchorWidth = toggle.getBoundingClientRect().width;
      node.style.width = `${Math.round(Math.min(Math.max(anchorWidth, 300), 460))}px`;
    },
  });
}

 function openFeaturePicker(root: HTMLElement) {
  const pop = $('[data-feature-pop]', root) as PopoverElement | null;
  if (!pop) return;
  closeRowMenus();
  closeFeaturePickers();
  pop.hidden = false;
  root.classList.add('is-open');
  if (typeof pop.showPopover === 'function') pop.showPopover();
  $('[data-feature-toggle]', root)?.setAttribute('aria-expanded', 'true');
  // 每次都从完整目录打开：残留的搜索词会让「少了几项」看起来像功能码丢了。
  const searchInput = $('[data-feature-search]', root) as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';
  renderFeatureOptions(root);
  placeFeaturePicker(root);
}

export async function loadFeatureCatalog() {
  const data = (await api('/feature-codes')) as {
    items?: FeatureCatalogItem[];
    groups?: FeatureGroup[];
  };
  state.featureCatalog = data.items || [];
  state.featureGroups = data.groups || [];
  refreshFeaturePickers();
}

// 事件全部委托到 document：选择器实例散落在商品与权益的编辑器里，逐个
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest('[data-feature-toggle]');
  if (toggle) {
    const root = toggle.closest('[data-feature-picker]') as HTMLElement | null;
    if (!root) return;
    if (root.classList.contains('is-open')) closeFeaturePicker(root);
    else openFeaturePicker(root);
    return;
  }
  // 点击弹层内部（勾选、搜索）不收起
  if (target.closest('[data-feature-picker]')) return;
  closeFeaturePickers();
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches('[data-feature-option]')) return;
  const root = target.closest('[data-feature-picker]') as HTMLElement | null;
  if (!root) return;
  const multiple = featurePickerMultiple(root);
  if (!multiple) {
    // 单选手动做互斥，选项才敢不带 name（见 featureOptionRow 的注释）
    $$('[data-feature-option]', root).forEach((input) => {
      if (input !== target) (input as HTMLInputElement).checked = false;
    });
  }
  setFeaturePickerValue(root, collectFeatureSelection(root));
  syncFeatureSummary(root);
  if (!multiple) closeFeaturePicker(root);
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches('[data-feature-search]')) return;
  const root = target.closest('[data-feature-picker]') as HTMLElement | null;
  if (root) renderFeatureOptions(root);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeFeaturePickers();
});

// 弹层坐标按按钮位置算死，任何祖先滚动都会错位；但弹层自身的列表要能滚，
$('.admin-main')?.addEventListener('scroll', (event) => {
  const scrollTarget = event.target;
  if (
    scrollTarget instanceof Element &&
    scrollTarget.closest &&
    scrollTarget.closest('.feature-picker')
  ) {
    return;
  }
  closeFeaturePickers();
}, { passive: true, capture: true });
