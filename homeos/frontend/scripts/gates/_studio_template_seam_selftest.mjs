#!/usr/bin/env node
/**
 * `ops/studio/studio_template_seam.mjs`（模板整段切片）的自检：真造正/负用例，逐条确认会拦。
 *
 * 为什么这条自检必须在链上（与两条 `studio_slice_*` 自检同理）
 * 模板切片的失效方式**不是报错，而是静默变瞎**：
 *
 *   1. id 在宿主里被搬走后没人发现 → 引擎 `getElementById()` 拿到 `null`，界面「点了没反应」；
 *   2. 段落不连续却不说 → 渲染顺序前移，兄弟选择器 / `children` 遍历悄悄错位；
 *   3. 包裹元素被顺手加一层 → `.panel > .inspector-form` 一类子选择器整片失效（CSS 不报错）；
 *   4. 同 id 出现在宿主模板两处 → 取到的是「第一个」，另一处永远死着。
 *
 * 这四条都不会让 `tsc` / `vue-tsc` / lint 变红，所以只能靠这里的注入式对账固定住。
 *
 * 用法：`node scripts/gates/_studio_template_seam_selftest.mjs`
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..')
const TOOL = path.join(REPO_ROOT, 'ops', 'studio', 'studio_template_seam.mjs')

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'template-seam-'))
/** fixture 必须落在 `src/` 下，才能同时验到 `@/` 别名分支。 */
const projectSrc = path.join(tmp, 'proj', 'src')
const entriesDir = path.join(projectSrc, 'studio', 'entries')
const outDir = path.join(projectSrc, 'studio', 'chrome', 'editor')
fs.mkdirSync(entriesDir, { recursive: true })

const HOST_LINES = [
  '<script setup lang="ts">', // 1
  'import { ref } from "vue";', // 2
  'const alive = ref(0);', // 3
  '</script>', // 4
  '', // 5
  '<template>', // 6
  '  <div class="editor-root">', // 7
  '    <section class="panel inspector">', // 8
  '      <form id="alpha-form" class="inspector-form" hidden>', // 9
  '        <input name="alpha" type="text">', // 10
  '      </form>', // 11
  '      <dialog id="beta-dialog" class="settings-dialog">', // 12
  '        <div class="dialog-heading"><span>B</span></div>', // 13
  '      </dialog>', // 14
  '    </section>', // 15
  '    <dialog id="gamma-dialog" class="settings-dialog">', // 16
  '      <p>G</p>', // 17
  '    </dialog>', // 18
  '  </div>', // 19
  '</template>', // 20
  '',
]

function writeHost(name, lines) {
  const file = path.join(entriesDir, name)
  fs.writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}

function runPlan(plan, extra = []) {
  const planFile = path.join(tmp, `plan-${Math.random().toString(36).slice(2)}.json`)
  fs.writeFileSync(planFile, JSON.stringify(plan), 'utf8')
  try {
    const out = execFileSync(process.execPath, [TOOL, `--plan=${planFile}`, ...extra], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: REPO_ROOT,
    })
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

const basePlan = (hostName) => ({
  host: path.join(entriesDir, hostName),
  outDir,
  groups: [
    { component: 'EditorDialogs', desc: '对话框壳', ids: ['beta-dialog', 'gamma-dialog'] },
    { component: 'EditorAlphaInspector', desc: 'alpha 检查器', ids: ['alpha-form'] },
  ],
})

// ---------------------------------------------------------------- 1. 正向：dry-run 通过并报告
const hostFile = writeHost('Host.vue', HOST_LINES)
const dry = runPlan(basePlan('Host.vue'), ['--dry-run'])
check('正向：dry-run 退出码 0', dry.code === 0, dry.out.slice(-400))
check('正向：宿主行数下降且零残留到盘上（dry-run 不写盘）', fs.readFileSync(hostFile, 'utf8').includes('id="alpha-form"'), dry.out)
check(
  '正向：报出「段落不连续 → 渲染位置前移」告警（beta 与 gamma 之间隔着 </section>）',
  /warnings/.test(dry.out) && /渲染位置会前移/.test(dry.out),
  dry.out.slice(-600),
)
check(
  '正向：import 走 `@/` 别名（同处 src 下）',
  /@\/studio\/chrome\/editor\/EditorDialogs\.vue/.test(dry.out) && /@\/studio\/chrome\/editor\/EditorAlphaInspector\.vue/.test(dry.out),
  dry.out.slice(-600),
)

// ---------------------------------------------------------------- 2. 正向 apply：宿主不留 id、组件各持一份
const apply = runPlan(basePlan('Host.vue'))
check('apply 退出码 0', apply.code === 0, apply.out.slice(-600))
const hostAfter = fs.readFileSync(hostFile, 'utf8')
check('apply 后宿主模板不再含被搬 id', !/id="alpha-form"|id="beta-dialog"|id="gamma-dialog"/.test(hostAfter), hostAfter)
check(
  'apply 后宿主留 `<Component />` 挂载点（且是自闭合，不产生包裹元素）',
  /<EditorDialogs \/>/.test(hostAfter) && /<EditorAlphaInspector \/>/.test(hostAfter),
  hostAfter.split('\n').slice(0, 12).join(' | '),
)
check('apply 后宿主 import 挂在最后一条顶层 import 之后', /^import \{ ref \} from "vue";$/m.test(hostAfter) && /^import EditorDialogs from "@\/studio\/chrome\/editor\/EditorDialogs\.vue";$/m.test(hostAfter), hostAfter.split('\n').slice(0, 10).join(' | '))
const dialogs = fs.readFileSync(path.join(outDir, 'EditorDialogs.vue'), 'utf8')
check(
  '子组件是**多根模板**（fragment）：template 里第一行就是原 `<dialog`，没有新增包裹 div',
  /<template>\n\s*<dialog id="beta-dialog"/.test(dialogs),
  dialogs.split('<template>')[1]?.slice(0, 160),
)
check('子组件里每个 id 恰好一次', (dialogs.match(/id="beta-dialog"/g) ?? []).length === 1 && (dialogs.match(/id="gamma-dialog"/g) ?? []).length === 1, dialogs)
check(
  '宿主行数 = 原行数 − 被搬段落 + 挂载点 + import',
  hostAfter.split('\n').length === HOST_LINES.length - 9 + 2 + 2,
  `实际 ${hostAfter.split('\n').length} 行`,
)

// ---------------------------------------------------------------- 3. 负向：重复执行（幂等保护）
const again = runPlan(basePlan('Host.vue'))
check(
  '重复执行被拦（目标组件已存在，防止「第二次跑把 id 当找不到」误判）',
  again.code === 1 && /目标组件已存在/.test(again.out),
  again.out.slice(-400),
)

// ---------------------------------------------------------------- 4. 负向：id 缺失 / 重名 / 未闭合 / 段落嵌套
const missingFile = writeHost('Missing.vue', HOST_LINES)
const missing = runPlan(
  { host: missingFile, outDir, groups: [{ component: 'X', ids: ['nope-dialog'] }] },
  ['--dry-run'],
)
check('id 不存在 → 拦', missing.code === 1 && /找不到 id="nope-dialog"/.test(missing.out), missing.out.slice(-300))

const dupFile = writeHost('Dup.vue', [
  ...HOST_LINES.slice(0, 17),
  '    <dialog id="gamma-dialog" class="settings-dialog"><p>G2</p></dialog>',
  ...HOST_LINES.slice(17),
])
const dup = runPlan(
  { host: dupFile, outDir, groups: [{ component: 'Y', ids: ['gamma-dialog'] }] },
  ['--dry-run'],
)
check(
  '同 id 在宿主模板出现两次 → 拦（否则取到第一个、另一处永远死着）',
  dup.code === 1 && /出现 2 次/.test(dup.out),
  dup.out.slice(-300),
)

const unclosedFile = writeHost('Unclosed.vue', [
  ...HOST_LINES.slice(0, 8),
  '      <form id="lonely-form" class="inspector-form" hidden>',
  '        <input name="lonely" type="text">',
  ...HOST_LINES.slice(8),
])
const unclosed = runPlan(
  { host: unclosedFile, outDir, groups: [{ component: 'Z', ids: ['lonely-form'] }] },
  ['--dry-run'],
)
check('未闭合段落 → 拦（不猜闭合位置）', unclosed.code === 1 && /没有闭合/.test(unclosed.out), unclosed.out.slice(-300))

const nestedFile = writeHost('Nested.vue', HOST_LINES)
const nested = runPlan(
  {
    host: nestedFile,
    outDir,
    groups: [
      { component: 'Outer', ids: ['alpha-form'] },
      { component: 'Inner', ids: ['beta-dialog', 'alpha-form'] },
    ],
  },
  ['--dry-run'],
)
check(
  '同 id 归两个组 → 拦（plan 自相矛盾）',
  nested.code === 1 && /登记了两次/.test(nested.out),
  nested.out.slice(-300),
)

// ------------------------------------------------- 5. 负向：同一组里嵌套的两个段落（会重叠）
const overlapFile = writeHost('Overlap.vue', [
  ...HOST_LINES.slice(0, 11),
  '      <div id="beta-outer" class="outer">',
  '        <span id="beta-inner">I</span>',
  '      </div>',
  ...HOST_LINES.slice(11),
])
const overlap = runPlan(
  { host: overlapFile, outDir, groups: [{ component: 'Both', ids: ['beta-outer', 'beta-inner'] }] },
  ['--dry-run'],
)
check(
  '同一组里嵌套管段 → 拦（区间重叠会切出重复正文）',
  overlap.code === 1 && /段落重叠/.test(overlap.out),
  overlap.out.slice(-300),
)

// ------------------------------------------------- 6. class 锚点：`.plan-panel` 这类没有 id 的静态段落
const CLASS_HOST_LINES = [
  '<script setup lang="ts">', // 1
  'import { ref } from "vue";', // 2
  '</script>', // 3
  '', // 4
  '<template>', // 5
  '  <div class="studio-root">', // 6
  '    <section class="plan-panel panel-surface">', // 7
  '      <div class="plan-panel__head">平面图</div>', // 8
  '      <ul class="plan-tool-list">', // 9
  '        <li>工具</li>', // 10
  '      </ul>', // 11
  '    </section>', // 12
  '    <form id="alpha-form" class="inspector-form" hidden>', // 13
  '      <input name="alpha" type="text">', // 14
  '    </form>', // 15
  '  </div>', // 16
  '</template>', // 17
  '',
]
const classFile = writeHost('ClassAnchor.vue', CLASS_HOST_LINES)
const classPlan = {
  host: classFile,
  outDir,
  groups: [
    { component: 'PlanPanelSection', ids: ['.plan-panel'] },
    { component: 'AlphaOnly', ids: ['#alpha-form'] },
  ],
}
const classDry = runPlan(classPlan, ['--dry-run'])
check('class 锚点：dry-run 通过', classDry.code === 0, classDry.out.slice(-500))
check('class 锚点：报告里记的是 `.plan-panel`', /"\.plan-panel"/.test(classDry.out), classDry.out.slice(-400))
const classApply = runPlan(classPlan)
check('class 锚点：apply 成功', classApply.code === 0, classApply.out.slice(-300))
const classHost = fs.readFileSync(classFile, 'utf8')
check(
  'class 锚点：宿主不再含整段（`class="plan-panel panel-surface"` 已消失）',
  !/class="plan-panel panel-surface"/.test(classHost) && /<PlanPanelSection \/>/.test(classHost),
  classHost.split('\n').slice(0, 12).join(' | '),
)
const classComponent = fs.readFileSync(path.join(outDir, 'PlanPanelSection.vue'), 'utf8')
check(
  'class 锚点：段内子元素一并搬走（`plan-panel__head` 在子组件里、且不算重复命中）',
  /class="plan-panel__head"/.test(classComponent) && /class="plan-panel panel-surface"/.test(classComponent),
  classComponent.split('<template>')[1]?.slice(0, 200),
)

// 负向：只有 `plan-panel__head`（没有独立 `plan-panel` 整令牌）时必须「找不到」，不许误命中
const headOnly = writeHost('HeadOnly.vue', [
  ...CLASS_HOST_LINES.slice(0, 6),
  '    <div class="plan-panel__head">平面图</div>',
  '    <form id="alpha-form" class="inspector-form" hidden>',
  '      <input name="alpha" type="text">',
  '    </form>',
  ...CLASS_HOST_LINES.slice(15),
])
const headOnlyRun = runPlan(
  { host: headOnly, outDir, groups: [{ component: 'NopeC', ids: ['.plan-panel'] }] },
  ['--dry-run'],
)
check(
  'class 锚点用 `\\b` 词边界：`plan-panel__head` 不算命中 `.plan-panel`',
  headOnlyRun.code === 1 && /找不到 class="plan-panel" 的段落/.test(headOnlyRun.out),
  headOnlyRun.out.slice(-300),
)

// ------------------------------------------------- 7. 负向：锚点不合法
const bare = runPlan(
  { host: writeHost('Bare.vue', HOST_LINES), outDir, groups: [{ component: 'BareC', ids: ['.'] }] },
  ['--dry-run'],
)
check('空锚点 → 拦', bare.code === 1 && /锚点不能为空/.test(bare.out), bare.out.slice(-200))

// ------------------------------------------------- 8. 负向：跨组段落重叠（两组各自「没重叠」但互相套住）
const crossFile = writeHost('Cross.vue', CLASS_HOST_LINES)
const cross = runPlan(
  {
    host: crossFile,
    outDir,
    groups: [
      { component: 'CrossOuter', ids: ['.plan-panel'] },
      { component: 'CrossInner', ids: ['.plan-panel__head'] },
    ],
  },
  ['--dry-run'],
)
check(
  '跨组段落重叠 → 拦（否则同一段正文在两个组件里各切一份）',
  cross.code === 1 && /跨组重叠/.test(cross.out),
  cross.out.slice(-300),
)

// ------------------------------------------------- 9. 起始标签跨行：不能切出「空段落」
const multilineFile = writeHost('MultilineTag.vue', [
  ...HOST_LINES.slice(0, 11),
  '      <dialog id="multi-dialog"',
  '              class="settings-dialog multi-dialog"',
  '              aria-label="跨行起始标签">',
  '        <p>M</p>',
  '      </dialog>',
  ...HOST_LINES.slice(11),
])
const multiline = runPlan(
  { host: multilineFile, outDir, groups: [{ component: 'MultilineDialog', ids: ['multi-dialog'] }] },
)
check('跨行起始标签：apply 成功（读不到 `>` 时按「开」计）', multiline.code === 0, multiline.out.slice(-400))
const multilineComponent = fs.readFileSync(path.join(outDir, 'MultilineDialog.vue'), 'utf8')
check(
  '跨行起始标签：整段（含两行起始标签与 `</dialog>`）都被搬走，不是只剩一行',
  /<dialog id="multi-dialog"\n\s+class="settings-dialog multi-dialog"\n\s+aria-label="跨行起始标签">\n\s+<p>M<\/p>\n\s+<\/dialog>/.test(
    multilineComponent,
  ),
  multilineComponent.split('<template>')[1]?.slice(0, 300),
)
check(
  '跨行起始标签：宿主不留该 id',
  !/id="multi-dialog"/.test(fs.readFileSync(multilineFile, 'utf8')),
  fs.readFileSync(multilineFile, 'utf8').split('\n').slice(0, 14).join(' | '),
)

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ 模板切片自检失败 ${failures.length} 项（通过 ${passed}）：`)
  for (const f of failures) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✓ 模板切片自检通过：${passed} 项断言`)
