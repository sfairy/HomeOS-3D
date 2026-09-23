/**
 * 功能项选择器。
 *
 * 商品/权益上的功能码选择器：候选项渲染、多选与必选约束、摘要同步。
 *
 * 功能码选择器是跨面板控件（商品与权益都用同一个），所以单独成模块，候选清单也只取一份。
 */

import { state } from "./state.js?v=2609231046";
import { $, $$, esc, toast } from "./dom.js?v=2609231046";
import { MENU_GAP, MENU_MARGIN, closeRowMenus, hidePopoverIfOpen } from "./menus.js?v=2609231046";
import { api } from "./api.js?v=2609231046";

// 功能码选择器（商品多选 / 权益单选共用）：目录由 /feature-codes 下发，勾选即写代码，避免手写英文码抄错后静默失效。
// 根节点 data-* 配置：data-feature-picker（标记根）、data-feature-multiple="true"（多选，缺省单选）、data-feature-empty（空值提示）；仍提交与原 name 一致的隐藏域（多选存 CSV），单选必填需自行拦截（见 requireFeatureCode）。
function featureLabel(code) {
  const item = (state.featureCatalog || []).find(entry => entry.code === code);
  return item ? item.label : code;
}

// 列表里给运营看中文名，代码留在 title 里备查（中文是主口径）。
export function featureCell(codes) {
  if (!codes.length) return '—';
  return `<span title="${esc(codes.join(', '))}">${esc(codes.map(featureLabel).join('、'))}</span>`;
}

function featurePickers() {
  return $$('[data-feature-picker]');
}

function featurePickerValue(root) {
  const input = $('[data-feature-value]', root);
  const raw = input ? input.value : '';
  return raw.split(',').map(item => item.trim()).filter(Boolean);
}

export function setFeaturePickerValue(root, codes) {
  const input = $('[data-feature-value]', root);
  if (input) input.value = codes.join(',');
}

export function featurePickerMultiple(root) {
  return root.dataset.featureMultiple === 'true';
}

// 单选实例（权益的功能码）是必填字段：空值直接拦在客户端，别让一个空
// featureCode 打到服务端、换回一句读不懂的 pydantic 校验错误。
export function requireFeatureCode(root, message) {
  if (featurePickerValue(root).length) return true;
  toast(message, 'danger');
  openFeaturePicker(root);
  return false;
}

// 已有记录可能带着目录里没有的代码（旧版本遗留、脚本导入）。它们必须仍然可见、
// 可取消勾选——否则运营一保存就被静默丢掉，等于后台擅自改了授权内容。
function featurePickerExtras(selected) {
  // 目录还没到就别急着判「未知」：那会把所有已选代码都错标成自定义代码。
  if (!(state.featureCatalog || []).length) return [];
  const known = new Set(state.featureCatalog.map(item => item.code));
  return selected.filter(code => !known.has(code));
}

export function syncFeatureSummary(root) {
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
    summary.textContent = codes.map(code => `${featureLabel(code)} · ${code}`).join('、');
    return;
  }
  const labels = codes.map(featureLabel);
  summary.textContent = labels.length <= 3
    ? labels.join('、')
    : `${labels.slice(0, 3).join('、')} 等 ${labels.length} 项`;
}

function featureOptionRow(root, code, label, description) {
  const checked = featurePickerValue(root).includes(code) ? ' checked' : '';
  // 选项故意不带 name：单选若共用 name，form.elements.featureCode 会变成
  // RadioNodeList，各处 .value 的读取口径就跟着变了。互斥由 change 处理器自己管。
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
export function renderFeatureOptions(root) {
  const list = $('[data-feature-list]', root);
  if (!list) return;
  const searchInput = $('[data-feature-search]', root);
  const search = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const matched = (state.featureCatalog || []).filter(item => (
    !search
    || item.code.toLowerCase().includes(search)
    || (item.label || '').toLowerCase().includes(search)
    || (item.description || '').toLowerCase().includes(search)
  ));
  const groups = state.featureGroups && state.featureGroups.length
    ? [...state.featureGroups]
    : [{ key: 'base', label: '基础能力' }];
  // 目录里出现了分组表没登记的新 group 时补一个，避免新增能力码在界面上直接消失。
  const knownGroups = new Set(groups.map(group => group.key));
  matched.forEach(item => {
    if (knownGroups.has(item.group)) return;
    knownGroups.add(item.group);
    groups.push({ key: item.group, label: item.groupLabel || item.group });
  });
  const blocks = groups.map((group) => {
    const items = matched.filter(item => item.group === group.key);
    if (!items.length) return '';
    return `<div class="feature-group">
        <div class="feature-group__head">${esc(group.label)}</div>
        ${items.map(item => featureOptionRow(root, item.code, item.label, item.description)).join('')}
      </div>`;
  });
  const extras = featurePickerExtras(featurePickerValue(root));
  if (extras.length) {
    blocks.push(`<div class="feature-group">
        <div class="feature-group__head">自定义代码</div>
        ${extras.map(code => featureOptionRow(root, code, code, '不在当前能力码目录中，保留原样不丢失。')).join('')}
      </div>`);
  }
  list.innerHTML = blocks.filter(Boolean).join('')
    || '<div class="feature-picker__empty">没有匹配的功能码</div>';
}

// 勾选顺序按目录顺序收集，保证保存结果稳定、可 diff。
export function collectFeatureSelection(root) {
  const checked = new Set($$('[data-feature-option]:checked', root).map(input => input.value));
  const known = (state.featureCatalog || []).map(item => item.code);
  const ordered = known.filter(code => checked.has(code));
  featurePickerExtras([...checked]).forEach(code => {
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

export function closeFeaturePicker(root) {
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
// overflow 裁掉，所以打开时切成 position: fixed，用按钮位置现算坐标。
// 也因此和菜单一样必须借 popover 进顶层：编辑器卡片（.hb-card）挂着 --a-glass-blur，
// backdrop-filter 会把 fixed 的包含块从视口改成那张卡片，坐标全错 —— 表现是「点开选择器
// 什么都没出现，其实飘到卡片外面去了」。详见 menus.js 的 openRowMenu。
function placeFeaturePicker(root) {
  const pop = $('[data-feature-pop]', root);
  const toggle = $('[data-feature-toggle]', root);
  if (!pop || !toggle) return;
  pop.style.top = '0px';
  pop.style.left = '0px';
  const anchor = toggle.getBoundingClientRect();
  // 字段是整行宽，弹层跟着等宽会拉出一行超长的说明文字，这里夹到一档易读的宽度。
  pop.style.width = `${Math.round(Math.min(Math.max(anchor.width, 300), 460))}px`;
  const size = pop.getBoundingClientRect();
  let top = anchor.bottom + MENU_GAP;
  if (top + size.height > window.innerHeight - MENU_MARGIN) {
    top = anchor.top - MENU_GAP - size.height;
  }
  top = Math.min(
    Math.max(MENU_MARGIN, top),
    Math.max(MENU_MARGIN, window.innerHeight - MENU_MARGIN - size.height),
  );
  const left = Math.min(
    Math.max(MENU_MARGIN, anchor.left),
    Math.max(MENU_MARGIN, window.innerWidth - MENU_MARGIN - size.width),
  );
  pop.style.top = `${Math.round(top)}px`;
  pop.style.left = `${Math.round(left)}px`;
}

export function openFeaturePicker(root) {
  const pop = $('[data-feature-pop]', root);
  if (!pop) return;
  closeRowMenus();
  closeFeaturePickers();
  pop.hidden = false;
  root.classList.add('is-open');
  if (typeof pop.showPopover === 'function') pop.showPopover();
  $('[data-feature-toggle]', root).setAttribute('aria-expanded', 'true');
  // 每次都从完整目录打开：残留的搜索词会让「少了几项」看起来像功能码丢了。
  const searchInput = $('[data-feature-search]', root);
  if (searchInput) searchInput.value = '';
  renderFeatureOptions(root);
  placeFeaturePicker(root);
}

export async function loadFeatureCatalog() {
  const data = await api('/feature-codes');
  state.featureCatalog = data.items || [];
  state.featureGroups = data.groups || [];
  refreshFeaturePickers();
}

// 事件全部委托到 document：选择器实例散落在商品与权益的编辑器里，逐个
// addEventListener 会在反复开关编辑器时越绑越多。
document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-feature-toggle]');
  if (toggle) {
    const root = toggle.closest('[data-feature-picker]');
    if (root.classList.contains('is-open')) closeFeaturePicker(root);
    else openFeaturePicker(root);
    return;
  }
  // 点击弹层内部（勾选、搜索）不收起
  if (event.target.closest('[data-feature-picker]')) return;
  closeFeaturePickers();
});

document.addEventListener('change', (event) => {
  if (!event.target.matches('[data-feature-option]')) return;
  const root = event.target.closest('[data-feature-picker]');
  if (!root) return;
  const multiple = featurePickerMultiple(root);
  if (!multiple) {
    // 单选手动做互斥，选项才敢不带 name（见 featureOptionRow 的注释）
    $$('[data-feature-option]', root).forEach((input) => {
      if (input !== event.target) input.checked = false;
    });
  }
  setFeaturePickerValue(root, collectFeatureSelection(root));
  syncFeatureSummary(root);
  if (!multiple) closeFeaturePicker(root);
});

document.addEventListener('input', (event) => {
  if (!event.target.matches('[data-feature-search]')) return;
  const root = event.target.closest('[data-feature-picker]');
  if (root) renderFeatureOptions(root);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeFeaturePickers();
});

// 弹层坐标按按钮位置算死，任何祖先滚动都会错位；但弹层自身的列表要能滚，
// 所以捕获阶段里放行来自 .feature-picker 的 scroll。
$('.admin-main').addEventListener('scroll', (event) => {
  if (event.target.closest && event.target.closest('.feature-picker')) return;
  closeFeaturePickers();
}, { passive: true, capture: true });
