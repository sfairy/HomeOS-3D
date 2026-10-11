#!/usr/bin/env node
/**
 * `check-import-refs.mjs` 的负向自检：**真的把副本改坏**，逐条确认每个分支都会拦、且拦的是对的那一条。
 *
 * ## 为什么需要它
 *
 * 引用完整性门禁是典型的「解析型门禁」，它最危险的死法不是误报，而是**悄悄变瞎**：
 * 提取 `from '…'` 的正则换了写法、判「是不是落在字符串/模板串里」的状态机算错、
 * walk 扫不到文件 —— 只要选择「匹配不到就跳过」，门禁就会永远打印「通过」，
 * 而真正的断链照样溜过去，从输出上完全看不出区别。
 *
 * 本仓库对这类门禁的既有做法（见 `ops/check_shared_contracts_selftest.py`）是：
 * **不复述门禁的判定逻辑**（那只会得到第三份会漂移的副本），而是构造真实输入，
 * 逐条确认每个分支都会报错。这里照做，并且额外包含一条「在**真实树副本**上注入断链」——
 * 合成小树只能证明「每个分支会拦」，只有真实树副本能证明门禁在真实数据规模上也没瞎。
 *
 * ## 断言口径
 *
 * 每条都断言「退出码」**和**「报出来的规则文本」：只看退出码会让「因为别的原因失败」蒙混过关。
 *
 * ## 用法
 *
 *     node scripts/_import_refs_selftest.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..')
const GATE = path.join(HERE, 'check-import-refs.mjs')

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  [PASS] ${label}`)
  } else {
    console.log(`  [FAIL] ${label}${detail ? `\n         ${detail}` : ''}`)
    failures.push(label)
  }
}

/** 建一棵临时树；`files` 是 `相对路径 → 内容`。 */
function mkTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-selftest-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  return root
}

function runGate(root) {
  const r = spawnSync(process.execPath, [GATE, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

/**
 * 每个合成树都塞够填充文件：门禁对「扫到的文件数过少」本身就有防瞎断言（S13），
 * 拿被测保护去挡测试用例的构造，只会让用例变成在测别的东西。
 *
 * 其中一条带**真实 import**：门禁还有第二道防瞎断言「一条 spec 都提不出来」（S15 专测它），
 * 而真实树里不存在「N 个文件全都零导入」的形态。S6/S7 只关心注释，别被那道断言误伤。
 */
const filler = Object.fromEntries(
  Array.from({ length: 6 }, (_, i) => [`src/filler${i}.ts`, `export const f${i} = ${i}\n`]),
)
filler['src/filler0.ts'] = `import fs from 'node:fs'\nexport const f0 = fs ? 0 : 1\n`

/** S15 专用：文件够多但**零导入**，模拟「提取器一条都没提到」的失效形态。 */
const silentFiller = Object.fromEntries(
  Array.from({ length: 6 }, (_, i) => [`src/quiet${i}.ts`, `export const q${i} = ${i}\n`]),
)

/** 断链（本次真实事故的形态）：多行 import + 相对路径指向已迁走的文件。 */
const SMOKE_BODY = `import { a } from '../src/present'
import {
  b,
} from '../src/gone/thing'
console.log(a, b)
`

const scenarios = [
  {
    name: 'S1 干净树（@/、相对、目录 index、裸包名混杂）',
    files: {
      ...filler,
      'src/main.ts': `import { f0 } from '@/filler0'\nimport { local } from './local'\nimport { barrel } from '@/shared/barrel'\nimport fs from 'node:fs'\nimport { ref } from 'vue'\nconsole.log(f0, local, barrel, fs, ref)\n`,
      'src/local.ts': 'export const local = 1\n',
      'src/shared/barrel/index.ts': 'export const barrel = 1\n',
      'scripts/tool.mjs': `import path from 'node:path'\nconsole.log(path)\n`,
    },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S2 `@/` 导入指向不存在的文件',
    files: {
      ...filler,
      'src/main.ts': `import { gone } from '@/does/not/exist'\nconsole.log(gone)\n`,
    },
    expect: { code: 1, includes: ['导入路径无法解析', '@/does/not/exist'] },
  },
  {
    name: 'S3 scripts/ 里相对导入指向不存在的文件（本次真实事故形态）',
    files: { ...filler, 'src/present.ts': 'export const a = 1\nexport const b = 2\n', 'scripts/smoke.ts': SMOKE_BODY },
    expect: { code: 1, includes: ['scripts/smoke.ts', '../src/gone/thing'] },
  },
  {
    name: 'S4 vite 查询串 `?raw` 且目标存在 → 放行（不能把查询串当路径）',
    files: { ...filler, 'src/main.ts': `import css from '@/styles/a.css?raw'\nconsole.log(css)\n`, 'src/styles/a.css': '.a{color:red}\n' },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S5 vite 查询串 `?raw` 但目标不存在 → 拦住（查询串不能用来绕过）',
    files: { ...filler, 'src/main.ts': `import css from '@/styles/missing.css?raw'\nconsole.log(css)\n` },
    expect: { code: 1, includes: ['导入路径无法解析', '@/styles/missing.css'] },
  },
  {
    name: 'S6 注释里的 `@/…` 指向不存在 → 拦住',
    files: { ...filler, 'src/main.ts': `/**\n * @dependencies @/composables/gone/thing\n */\nexport const a = 1\n` },
    expect: { code: 1, includes: ['注释中的 @/ 引用无法解析', '@/composables/gone/thing'] },
  },
  {
    name: 'S7 注释里的占位符写法（`@/foo/**`、`@/shared/<域>/utils/…`）→ 放行（防误报）',
    files: {
      ...filler,
      'src/main.ts': `/**\n * 见 @/foo/** 与 @/shared/<域>/utils/… 和 @/components/<x>\n */\nexport const a = 1\n`,
    },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S8 裸模块名（vue / node:fs / @homeos/shared）不在管辖内 → 放行',
    files: {
      ...filler,
      'src/main.ts': `import { ref } from 'vue'\nimport fs from 'node:fs'\nimport { x } from '@homeos/shared'\nimport y from '@lucide/vue'\nconsole.log(ref, fs, x, y)\n`,
    },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S10 codegen 模板串里的 spec（相对输出文件）→ 视为数据跳过，且计数可见',
    files: {
      ...filler,
      'scripts/codegen.mjs': `import fs from 'node:fs'\nconst out = \`import { x } from "../../runtime/output-thing";\nimport { y } from "@/runtime/output-thing";\n\`\nfs.writeFileSync('/dev/null', out)\n`,
    },
    expect: { code: 0, includes: ['另跳过 2 条落在字符串/模板串里的 spec'] },
  },
  {
    name: 'S11 `l.includes(\'from "./x"\')` 这类字符串里的假 import → 放行（那是数据）',
    files: {
      ...filler,
      'scripts/inject.mjs': `import fs from 'node:fs'\nconst i = fs.readFileSync('x', 'utf8').split('\\n').findIndex((l) => l.includes('from "./gone/thing"'))\nconsole.log(i)\n`,
    },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S12 TS/NodeNext 写法 `./x.js` 磁盘上是 `x.ts` → 放行',
    files: { ...filler, 'vite.config.ts': `import { log } from './logger.js'\nexport default log\n`, 'logger.ts': 'export const log = 1\n' },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S13 树规模异常（walk 失效形态）→ 自身断言报错，而非静默放行',
    files: { 'src/only.ts': 'export const a = 1\n' },
    expect: { code: 1, includes: ['门禁自身异常', 'walk 逻辑可能已失效'] },
  },
  {
    name: 'S16 文档（.md）里的悬空 `@/` → 拦住（反引号/代码块是正文，不是「数据」）',
    files: {
      ...filler,
      'src/NOTES.md': '见 `@/composables/gone/thing`：\n\n```ts\nimport { x } from \'@/also/gone\'\n```\n',
    },
    expect: { code: 1, includes: ['src/NOTES.md', '@/composables/gone/thing', '@/also/gone'] },
  },
  {
    name: 'S17 文档里的占位符 / 相对路径 → 放行（防误报；md 的 `./x` 相对文档，不解析）',
    files: {
      ...filler,
      'src/GUIDE.md': '见 @/foo/** 与 @/shared/<域>/utils/… ；实现见 `./sibling.ts`（不存在也放行）\n',
    },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
  {
    name: 'S15 提取结果为空（正则失效形态）→ 自身断言报错，而非静默放行',
    files: { ...silentFiller },
    expect: { code: 1, includes: ['门禁自身异常', '提取正则可能已失效'] },
  },
  {
    name: 'S18 样式表里悬空的 `@import` / `url()` → 拦住（`.css` 不进模块图，无编译器兜底）',
    files: {
      ...filler,
      'src/assets/a.css': `@import './gone.css';\n@import url("@/assets/also-gone.css");\n.x { background: url('nope.woff2'); }\n`,
    },
    expect: { code: 1, includes: ['src/assets/a.css', './gone.css', '@/assets/also-gone.css', 'nope.woff2'] },
  },
  {
    name: 'S19 样式表里**存在**的 `@import` / 裸 URL / data: → 放行（防误报）',
    files: {
      ...filler,
      'src/assets/base.css': ':root{--x:1}\n',
      'src/assets/b.css': `@import "./base.css";\n@import url("@/assets/base.css");\n.a{background:url(//cdn.example/x.png)}\n.b{background:url(data:image/svg+xml;base64,AAA)}\n`,
    },
    expect: { code: 0, includes: ['import reference check: ok'] },
  },
]

console.log('引用完整性门禁负向自检\n')

for (const s of scenarios) {
  const root = mkTree(s.files)
  try {
    const { code, out } = runGate(root)
    check(`${s.name} → exit ${s.expect.code}`, code === s.expect.code, `实际 exit=${code}\n         ${out.trim().split('\n')[0]}`)
    for (const needle of s.expect.includes) {
      check(`${s.name} → 报出「${needle}」`, out.includes(needle), `输出里没找到该串:\n         ${out.trim()}`)
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

// ── S14：唯一一条在**真实树副本**上跑的用例 ──
// 前面的合成小树能证明「每个分支会拦」；只有这条能证明门禁在真实数据规模上也没瞎。
// 副本必须**同深度**（<tmp>/homeos/frontend）：`src/views/SettingsView.vue` 会 `../../package.json`、
// `vite-plugin-embed-fallback.ts` 会 `../../packages/shared/…`（契约包在 monorepo 根），
// 深度一变这两条就会假报。
console.log('\nS14 真实树副本：先证明副本干净、再注入一条断链证明能拦')
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'refs-selftest-real-'))
  const root = path.join(tmp, 'homeos', 'frontend')
  try {
    const skip = new Set(['node_modules', 'dist', '.git', 'coverage'])
    fs.mkdirSync(root, { recursive: true })
    for (const entry of ['src', 'scripts']) {
      fs.cpSync(path.join(FRONTEND, entry), path.join(root, entry), {
        recursive: true,
        filter: (s) => !skip.has(path.basename(s)),
      })
    }
    for (const entry of fs.readdirSync(FRONTEND, { withFileTypes: true })) {
      if (entry.isFile()) fs.copyFileSync(path.join(FRONTEND, entry.name), path.join(root, entry.name))
    }
    const repoPackages = path.resolve(FRONTEND, '../../packages')
    if (fs.existsSync(repoPackages)) {
      fs.cpSync(repoPackages, path.join(tmp, 'packages'), {
        recursive: true,
        filter: (s) => !skip.has(path.basename(s)),
      })
    }
    // `ops/` 同理，而且是 P5 之后新增的一类：跨**应用**的构建工具放 `ops/` 而不是 `packages/`
    // （`ops/vite/build-helpers.ts`：两个 vite 配置共用的经典 IIFE / SPA 外壳断言；
    //   `ops/eslint/frontend-core.mjs`：两份 eslint 配置共用的规则核 —— 放进产品包会让浏览器
    //   构建图平白多出 vite/esbuild 依赖）。副本不带 `ops/`，这些**真 import** 就会被报成断链，
    //   于是这条用例从「证明门禁在真实规模下没瞎」退化成假阳性来源。
    const repoOps = path.resolve(FRONTEND, '../../ops')
    if (fs.existsSync(repoOps)) {
      fs.cpSync(repoOps, path.join(tmp, 'ops'), {
        recursive: true,
        filter: (s) => !skip.has(path.basename(s)),
      })
    }

    const control = runGate(root)
    check('S14a 真实树副本未被改坏 → 通过', control.code === 0, `实际 exit=${control.code}\n         ${control.out.trim().split('\n').slice(0, 5).join('\n         ')}`)

    const victim = path.join(root, 'src/main.ts')
    const original = fs.readFileSync(victim, 'utf8')
    fs.writeFileSync(victim, `${original}\nimport '@/__refs_selftest_missing__'\n`)
    const mutated = runGate(root)
    check('S14b 在真实树上注入一条 `@/` 断链 → 拦住', mutated.code === 1, `实际 exit=${mutated.code}`)
    check('S14c 报出的是注入的那条 spec', mutated.out.includes('@/__refs_selftest_missing__'), `输出:\n         ${mutated.out.trim().split('\n').slice(0, 6).join('\n         ')}`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

console.log(`\n${failures.length ? '引用完整性门禁自检失败' : '引用完整性门禁自检全部通过'}（${passed} 项断言）`)
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
