import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path) => readFileSync(join(root, path), "utf8");

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const raw = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

function token(css, name) {
  const marker = "--" + name + ":";
  const start = css.indexOf(marker);
  assert.ok(start >= 0, "缺少设计令牌 --" + name);
  const match = css.slice(start + marker.length).match(/#[0-9a-fA-F]{6}/);
  assert.ok(match, "令牌 --" + name + " 不是 6 位十六进制色");
  return match[0];
}

test("设计令牌：三级文字在三档深色背景上均达到 WCAG AA 4.5:1", () => {
  const css = read("packages/shared/src/styles/design-tokens.css");
  const fg = token(css, "hos-fg-3");
  for (const surface of ["hos-bg-canvas", "hos-bg-elev-2", "hos-bg-elev-3"]) {
    const ratio = contrast(fg, token(css, surface));
    assert.ok(ratio >= 4.5, "--hos-fg-3 在 --" + surface + " 上对比度 " + ratio.toFixed(2) + " < 4.5");
  }
});

test("设置侧栏：分组折叠暴露状态且收起后不可聚焦", () => {
  const source = read("homeos/frontend/src/features/settings/shared/layout/SettingsSidebar.vue");
  assert.ok(source.includes(':aria-expanded="isExpanded(group.id)"'));
  assert.ok(source.includes("aria-controls"));
  assert.ok(source.includes("settings-group-"));
  assert.ok(source.includes(":inert="));
  assert.ok(source.includes("focusFirstControl"));
});

test("设备详情：tab 与 tabpanel 具备关联和方向键", () => {
  const source = read("homeos/frontend/src/features/device/DeviceDetailPage.vue");
  assert.ok(source.includes('role="tabpanel"'));
  assert.ok(source.includes("device-detail-panel-"));
  assert.ok(source.includes("aria-controls"));
  assert.ok(source.includes("onDetailTabKeydown"));
  assert.ok(source.includes("ArrowLeft"));
  assert.ok(source.includes("ArrowRight"));
});

test("后台 AdminTabs：roving tabindex、面板关联和方向键", () => {
  const source = read("homeos-store/frontend/src/features/admin/components/AdminTabs.vue");
  assert.ok(source.includes("panelIdPrefix"));
  assert.ok(source.includes("aria-controls"));
  assert.ok(source.includes("ArrowLeft"));
  assert.ok(source.includes("ArrowRight"));
  assert.ok(source.includes("Home"));
  assert.ok(source.includes("End"));
});

test("后台通知与弹窗：live region 与可访问名称", () => {
  const toast = read("homeos-store/frontend/src/shared/components/AdminToastHost.vue");
  assert.ok(toast.includes('aria-live="polite"'));
  const layout = read("homeos-store/frontend/src/features/admin/layouts/AdminLayout.vue");
  assert.ok(layout.includes('aria-labelledby="pw-dialog-title"'));
  assert.ok(layout.includes("submitPassword"));
});

test("商店前台：移动导航可收起、可 Esc、可点外部关闭", () => {
  const source = read("homeos-store/frontend/src/features/storefront/views/StoreLayout.vue");
  assert.ok(source.includes('aria-controls="navbarNav"'));
  assert.ok(source.includes('@keydown.esc="onNavEscape"'));
  assert.ok(source.includes("onDocumentPointerDown"));
  assert.ok(source.includes("aria-current"));
});
