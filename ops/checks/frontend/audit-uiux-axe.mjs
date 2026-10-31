#!/usr/bin/env node
/**
 * UI/UX 可访问性门禁（opt-in）：用 axe-core 扫描两应用公开页。
 *
 * 默认扫描本机 8801/8802；登录后页面需要真实会话，本脚本不造假账号，故只覆盖公开路由：
 *   homeos: /login /register /reset-password
 *   store:  / /products /user/authentication/login
 *
 * 用法：
 *   bun run audit:uiux:a11y
 *   UIUX_A11Y_BASE_HOMEOS=http://127.0.0.1:18901 \
 *   UIUX_A11Y_BASE_STORE=http://127.0.0.1:18902 bun run audit:uiux:a11y
 *   UIUX_A11Y_EDGE=/path/to/msedge bun run audit:uiux:a11y
 *
 * 产出：docs/analysis/2026-10-31-dual-project-uiux/evidence/after/axe-public.json
 * 退出码：serious/critical 违规 > 0 时为 1，moderate/minor 只报告。
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { AxeBuilder } = require("@axe-core/playwright");

const root = resolve(import.meta.dirname, "../../..");
const EDGE =
  process.env.UIUX_A11Y_EDGE ||
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const TARGETS = [
  {
    project: "homeos",
    base: process.env.UIUX_A11Y_BASE_HOMEOS || "http://127.0.0.1:8801",
    routes: ["/login", "/register", "/reset-password"],
  },
  {
    project: "homeos-store",
    base: process.env.UIUX_A11Y_BASE_STORE || "http://127.0.0.1:8802",
    routes: ["/", "/products", "/user/authentication/login"],
  },
];

const outPath = resolve(
  root,
  "docs/analysis/2026-10-31-dual-project-uiux/evidence/after/axe-public.json",
);

function impactRank(impact) {
  return { critical: 0, serious: 1, moderate: 2, minor: 3 }[impact] ?? 4;
}

async function audit(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // 不注入 <style>：两应用都有 style-src 'self' CSP，注入会被拦截。
  // 动效由 newContext({ reducedMotion: "reduce" }) 的 prefers-reduced-motion 降级覆盖。
  await page.waitForTimeout(250);
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

const results = [];
const browser = await chromium.launch({ executablePath: EDGE, headless: true });
try {
  for (const target of TARGETS) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    for (const route of target.routes) {
      const url = target.base.replace(/\/$/, "") + route;
      const started = Date.now();
      try {
        const report = await audit(page, url);
        const violations = report.violations
          .map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
            targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
          }))
          .sort((a, b) => impactRank(a.impact) - impactRank(b.impact));
        results.push({ project: target.project, route, url, ms: Date.now() - started, violations });
        const worst = violations.filter((v) => ["critical", "serious"].includes(v.impact));
        console.log(
          `${worst.length ? "❌" : "✅"} [${target.project}] ${route} — ${violations.length} 类违规 / ${violations.reduce((n, v) => n + v.nodes, 0)} 个节点`,
        );
        for (const v of violations.slice(0, 6)) {
          console.log(`   ${v.impact.padEnd(8)} ${v.id} ×${v.nodes}  ${v.targets[0] ?? ""}`);
        }
      } catch (error) {
        results.push({
          project: target.project,
          route,
          url,
          error: error instanceof Error ? error.message : String(error),
        });
        console.log(`⚠️  [${target.project}] ${route} 无法扫描：${error}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
);
console.log(`\n明细：${outPath}`);

const blocking = results.some(
  (r) => r.violations?.some((v) => ["critical", "serious"].includes(v.impact)),
);
process.exit(blocking ? 1 : 0);
