#!/usr/bin/env node
/**
 * `scripts/check-store-deps.mjs` 的自检：正/负用例都过一遍，确认门禁既拦得住、又不误伤。
 *
 * 为什么这条自检必须在链上
 * ----------------------
 * 域边界门禁最危险的失败方向都是**静默**的：
 *
 *   1. 口径缩小（漏相对写法 / 漏副作用 import）→ 域边界照旧被绕开，门禁却打绿；
 *   2. 口径放大（把「域根 barrel 转出本域页面」「宿主懒加载路由组件」也判违规）→
 *      有人给整条门禁加白名单，从此形同不存在；
 *   3. 白名单过期不报 → 条目越堆越多，最后没人敢删。
 *
 * 所以这里用**注入 fixture** 的方式驱动真脚本（不是复刻一份判定逻辑），每个方向各留一条用例。
 *
 * 用法：`node scripts/_store_deps_selftest.mjs`
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(HERE, 'check-store-deps.mjs')

let passed = 0
/** @type {string[]} */
const failures = []

function check(label, condition, detail = '') {
  if (condition) passed += 1
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-deps-'))
const srcDir = path.join(tmp, 'src')
const allowFile = path.join(tmp, 'allow.json')

/** 以 `src/` 相对路径写一批 fixture。 */
function reset(files) {
  fs.rmSync(srcDir, { recursive: true, force: true })
  fs.mkdirSync(srcDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(srcDir, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, body, 'utf8')
  }
}

function runGate() {
  const args = [GATE, `--root=${SRC_REL}`]
  if (fs.existsSync(allowFile)) args.push(`--allow=${allowFile}`)
  try {
    const out = execFileSync(process.execPath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: HERE,
    })
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

//: fixture 目录每次都在 `src/` 下，门禁按 `--root=` 解析相对 `frontend/`，所以这里给绝对路径。
const SRC_REL = srcDir

// 0. 空树不崩
reset({})
check('空 src 不崩且打绿', runGate().code === 0)

// 1. 合规树：域 → shared、宿主 → 域（静态走 barrel + 懒加载深引用）
reset({
  'main.ts': 'import "@store/shared/utils/a"\n',
  'shared/utils/a.ts': 'export const a = 1\n',
  'router/index.ts': 'import { A } from "@store/features/alpha"\nconst L = () => import("@store/features/alpha/views/Lazy.vue")\n',
  'features/alpha/index.ts': 'export { A } from "./components/A.vue"\n',
  'features/alpha/components/A.vue': 'import { a } from "@store/shared/utils/a"\n',
  'features/alpha/views/Lazy.vue': '<script setup lang="ts">\nimport { a } from "@store/shared/utils/a"\n</script>\n',
})
check('合规树打绿（域→shared、宿主→域 barrel、宿主懒加载深引用）', runGate().code === 0, runGate().out)

// 2. R1：shared 回头依赖 features
reset({
  'shared/utils/a.ts': 'import { b } from "@store/features/beta/stores/b"\n',
  'features/beta/stores/b.ts': 'export const b = 1\n',
})
let r = runGate()
check('R1 拦住 shared → features', r.code === 1 && r.out.includes('R1'), r.out)

// 3. R2：features 依赖组合根
reset({
  'features/alpha/stores/s.ts': 'import { serverAuthState } from "@store/shared/stores/session"\nimport { r } from "@store/router/index"\n',
  'shared/stores/session.ts': 'export const serverAuthState = 1\n',
  'router/index.ts': 'export const r = 1\n',
})
r = runGate()
check('R2 拦住 features → router', r.code === 1 && r.out.includes('R2'), r.out)

// 4. R2：features 依赖顶层 views（宿主页面）
reset({
  'features/alpha/stores/s.ts': 'import SetupView from "@store/views/SetupView.vue"\n',
  'views/SetupView.vue': '<template><div /></template>\n',
})
r = runGate()
check('R2 拦住 features → views', r.code === 1 && r.out.includes('R2'), r.out)

// 5. R3：域到域深引用（别名写法）
reset({
  'features/alpha/stores/s.ts': 'import { b } from "@store/features/beta/stores/b"\n',
  'features/beta/stores/b.ts': 'export const b = 1\n',
})
r = runGate()
check('R3 拦住域到域深引用（别名写法）', r.code === 1 && r.out.includes('R3'), r.out)

// 6. R3：域到域深引用（相对写法）—— 归一化后必须与别名写法同罪
reset({
  'features/alpha/stores/s.ts': 'import { b } from "../../beta/stores/b"\n',
  'features/beta/stores/b.ts': 'export const b = 1\n',
})
r = runGate()
check('R3 拦住域到域深引用（相对写法）', r.code === 1 && r.out.includes('R3'), r.out)

// 7. R3 的合法例外：域到域走域根 barrel
reset({
  'features/alpha/stores/s.ts': 'import { b } from "@store/features/beta"\n',
  'features/beta/index.ts': 'export { b } from "./stores/b"\n',
  'features/beta/stores/b.ts': 'export const b = 1\n',
})
check('域到域走域根 barrel 打绿', runGate().code === 0, runGate().out)

// 8. R4：域内非视图文件 import 本域 views
reset({
  'features/alpha/components/A.vue': 'import V from "@store/features/alpha/views/Page.vue"\n',
  'features/alpha/views/Page.vue': '<template><div /></template>\n',
})
r = runGate()
check('R4 拦住域内组件 → 本域 views', r.code === 1 && r.out.includes('R4'), r.out)

// 9. R4 的合法例外：域根 barrel 转出本域页面（有意的出口）
reset({
  'features/alpha/index.ts': 'export { default as Page } from "./views/Page.vue"\n',
  'features/alpha/views/Page.vue': '<template><div /></template>\n',
})
check('域根 barrel 转出本域页面打绿', runGate().code === 0, runGate().out)

// 10. R5：域内 utils → 同域 stores
reset({
  'features/alpha/utils/u.ts': 'import { s } from "@store/features/alpha/stores/s"\n',
  'features/alpha/stores/s.ts': 'export const s = 1\n',
})
r = runGate()
check('R5 拦住域内 utils → stores', r.code === 1 && r.out.includes('R5'), r.out)

// 11. 裸模块与 src 之外的相对路径不参与判定
reset({
  'shared/utils/a.ts': 'import fs from "node:fs"\nimport vue from "vue"\nimport { x } from "@homeos/shared/utils/x"\nimport pkg from "../../package.json"\n',
})
check('裸模块 / src 外路径不误伤', runGate().code === 0, runGate().out)

// 12. 白名单：登记后放行，且**被用到**时不算过期
reset({
  'features/alpha/stores/s.ts': 'import { b } from "@store/features/beta/stores/b"\n',
  'features/beta/stores/b.ts': 'export const b = 1\n',
})
fs.writeFileSync(
  allowFile,
  JSON.stringify({ crossDomain: ['features/alpha/stores/s.ts|features/beta/stores/b'] }, null, 2),
)
check('白名单登记后放行', runGate().code === 0, runGate().out)

// 13. 白名单过期检测：条目不再被踩 → 报错（否则清单只增不减）
reset({ 'features/alpha/stores/s.ts': 'export const s = 1\n' })
r = runGate()
check('过期白名单条目报错', r.code === 1 && r.out.includes('过期白名单'), r.out)

// 14. 兼容 barrel 目录机制（当前为空）：这里只验证「非纯 re-export 的 barrel 目录」判定可用
//     —— 通过临时改写脚本常量代价过高，改为断言默认没有豁免目录（防有人悄悄开一个口子）。
const gateText = fs.readFileSync(GATE, 'utf8')
check('兼容 barrel 目录清单默认为空', /COMPAT_BARREL_DIRS = \[\]/.test(gateText))

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\nstore 依赖门禁自检失败：${failures.length} 项`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}

console.log(`store 依赖门禁自检通过：${passed} 项（规则拦截 / 合法例外 / 白名单生效与过期）`)
