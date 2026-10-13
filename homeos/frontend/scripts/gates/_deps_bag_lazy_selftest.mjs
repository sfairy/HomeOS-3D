#!/usr/bin/env node
/**
 * `check-deps-bag-lazy.mjs` 的负向自检。
 *
 * 这条门禁最危险的死法不是「误报」，而是**悄悄变瞎** —— 判据只看字面量形态，一旦解析写错
 * （比如只扫单行、或把 `return {` 漏掉），它会一直打印「通过」，而 TDZ 照样在生产里炸。
 * 所以这里逐条**真的造出违规**确认会拦，并固定住两类反向证据：
 *
 *   1. 反向证据 A：合规形态（全访问器 / 带 spread / 嵌套对象成员）必须**不报**；
 *   2. 反向证据 B：非依赖袋形态（非 `*Deps` 名、带形参的 `*Deps(x)`）必须**不报**；
 *   3. 防瞎断言：真实源码树的袋数/成员数必须 > 0（否则解析器空转也会「全绿」）。
 *
 * 第 3 条尤其关键：本文件的用例都是合成源码，解析器一旦整体失效，合成用例会**全数误报**、
 * 于是「拦住了」看起来仍是对的 —— 只有真实树计数能把这种失效揪出来。
 *
 * 用法：node scripts/_deps_bag_lazy_selftest.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { GATE_NAME, bagLiterals, collectBagWrites, findBagViolations, findSetterGaps, findUnresolvedBagHosts } from './check-deps-bag-lazy.mjs'
import { check, report } from '../_smoke_harness.mjs'

/** 造一个依赖袋宿主片段（`body` 为袋字面量内部文本） */
const bagSrc = (body, { name = 'thingDeps', params = '', ret = '({', retClose = '})' } = {}) =>
  `function ${name}(${params}) {\n  return ${ret}\n${body}\n  ${retClose};\n}\nconst consumer = ${name}();\n`

function numbers(src) {
  const r = findBagViolations(src, 'case.ts')
  return { bags: r.bags, members: r.members, names: r.problems.map((p) => p.member), lines: r.problems.map((p) => p.line) }
}

// ---- 1. 必须拦：裸值成员的四种形态 ------------------------------------------------------
{
  const shorthand = numbers(bagSrc('    renderMarkerPositions,\n    navigationEditing,'))
  check('1a 裸值简写拦下', shorthand.names.join(',') === 'renderMarkerPositions,navigationEditing', JSON.stringify(shorthand))

  const kv = numbers(bagSrc('    optimisticState: optimisticRef.optimisticState,'))
  check('1b `k: expr` 拦下（单行属性值同样是急切求值）', kv.names.join(',') === 'optimisticState', JSON.stringify(kv))

  const multiline = numbers(bagSrc('    patchProjectionsFromChanges: (changes) =>\n      patchProjectionsFromChanges(changes, entities),'))
  check('1c 跨行属性值拦下（只按单行扫描会静默漏掉）', multiline.names.join(',') === 'patchProjectionsFromChanges', JSON.stringify(multiline))

  const inline = numbers(bagSrc('', { ret: '({', })) // 空袋
  check('1d 空袋不报', inline.members === 0 && inline.names.length === 0, JSON.stringify(inline))

  const oneLine = numbers('function aDeps() {\n  return ({ a, b, c, d });\n}\n')
  check('1e 单行多成员（生成器旧分支产物）全部拦下', oneLine.names.length === 4, JSON.stringify(oneLine))

  const retPlain = numbers('function bDeps() {\n  return {\n    x,\n    y,\n  };\n}\n')
  check('1f `return {`（无括号）也要认', retPlain.names.join(',') === 'x,y', JSON.stringify(retPlain))

  const report = findBagViolations(bagSrc('    renderMarkerPositions,'), 'x.ts')
  check('1g 报告带 文件/行号/袋名/成员名', report.problems[0].file === 'x.ts' && report.problems[0].bag === 'thingDeps' && report.problems[0].line === 3, JSON.stringify(report.problems))
}

// ---- 2. 反向证据 A：合规形态必须不报 ----------------------------------------------------
{
  const accessors = numbers(bagSrc('    get a() {\n      return a;\n    },\n    set a(v) {\n      a = v;\n    },'))
  check('2a 全访问器不报（含 get/set 对按两个成员计）', accessors.names.length === 0 && accessors.members === 2, JSON.stringify(accessors))

  const spread = numbers(bagSrc('    ...sharedDeps,\n    get a() {\n      return a;\n    },'))
  check('2b spread 成员不报', spread.names.length === 0, JSON.stringify(spread))

  // 嵌套对象成员：内层属性即使是裸值简写，也不是「袋的第一层成员」
  const nested = numbers(bagSrc('    get options() {\n      return { storage, scope };\n    },'))
  check('2c 访问器内层对象里的裸值简写不算违规（只判第一层）', nested.names.length === 0, JSON.stringify(nested))

  const tmpl = numbers(bagSrc('    get label() {\n      return `a,b,${nested}`;\n    },'))
  check('2d 模板串里的逗号不切块（不产生假成员）', tmpl.names.length === 0 && tmpl.members === 1, JSON.stringify(tmpl))

  const commented = numbers(bagSrc('    get a() {\n      return a;\n    }, // keep\n    get b() {\n      return b;\n    },'))
  check('2e 行尾注释不干扰成员计数', commented.names.length === 0 && commented.members === 2, JSON.stringify(commented))
}

// ---- 3. 反向证据 B：非依赖袋形态必须不报 ------------------------------------------------
{
  const paramed = numbers(bagSrc('    logger: deps.logger ?? { error: () => undefined },', { name: 'getListenerDeps', params: 'deps: any', ret: '{', retClose: '}' }))
  check('3a 带形参的 `*Deps(x)` 不认（手写派生适配器，无声明顺序问题）', paramed.bags === 0 && paramed.names.length === 0, JSON.stringify(paramed))

  const otherName = numbers('function collectThings() {\n  return {\n    a,\n    b,\n  };\n}\n')
  check('3b 非 `*Deps` 名不认（普通工厂不在判据范围内）', otherName.bags === 0, JSON.stringify(otherName))

  const innerFn = numbers('function thingsDeps() {\n  const helper = () => ({ a, b });\n  return {\n    get helper() {\n      return helper;\n    },\n  };\n}\n')
  check('3c 袋内**其它**函数的返回字面量不算袋成员（只认第一个 return）', innerFn.names.length === 0, JSON.stringify(innerFn))
}

// ---- 4. 防瞎断言：真实源码树 -------------------------------------------------------------
{
  const root = path.resolve(import.meta.dirname, '../..')
  const srcDir = path.join(root, 'src')
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/(^|\/)(node_modules|dist|\.git)\//.test(`${dir}/`)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) files.push(full)
    }
  }
  walk(srcDir)

  let bags = 0
  let members = 0
  const problems = []
  for (const f of files) {
    const r = findBagViolations(fs.readFileSync(f, 'utf8'), path.relative(root, f))
    bags += r.bags
    members += r.members
    problems.push(...r.problems)
  }

  check('4a 真实源码树解析出依赖袋（防「解析器空转 → 全绿」）', bags > 0, `bags=${bags}`)
  check('4b 真实源码树解析出袋成员（防「成员切块失效 → 无违规可报」）', members > 100, `members=${members}`)
  check('4c 真实源码树当前 0 违规', problems.length === 0, problems.map((p) => `${p.file}:${p.line} ${p.bag}.${p.member}`).join('; '))

  // 解析器本身：袋定位必须落在 `*Deps` 工厂上，且确实切出了字面量行范围
  // ⚠ 8a（stage.ts）已回滚，切片袋现存的宿主改成 home.ts（4 个袋），别再指向单体文件
  const sample = fs.readFileSync(path.join(srcDir, 'studio/app/editor/home.ts'), 'utf8')
  const ranges = bagLiterals(sample.split('\n'))
  check('4d 定位到 home.ts 的 4 个依赖袋', ranges.length === 4, JSON.stringify(ranges.map((r) => r.bag)))
  check('4e 袋字面量行范围有效（endLine 不早于 openLine）', ranges.every((r) => r.endLine >= r.openLine), JSON.stringify(ranges))
}

// ---- 5. 第二类：被写入的成员必须有 setter（且判定要按袋、不能在空转） ---------------------
{
  /** 造一个「宿主 + 一个消费者模块」的最小世界 */
  const world = (bagBody, consumerBody, { bagName = 'thingDeps', callee = 'applyThingCore' } = {}) => {
    const host = `import { ${callee} } from "./consumer";\n${bagSrc(bagBody, { name: bagName })}\nfunction forward() {\n  return ${callee}(${bagName}(), extra);\n}\n`
    const mods = new Map([['/w/consumer.ts', consumerBody]])
    return findSetterGaps(
      host,
      collectBagWrites(host, {
        resolveSpecifier: () => '/w/consumer.ts',
        readModule: (p) => mods.get(p) ?? null,
      }),
      'case.ts',
    )
  }
  const G = '    get widget() {\n      return widget;\n    },\n'
  const S = '    set widget(v: any) {\n      widget = v;\n    },\n'

  check('5a 消费者写了 deps.widget 而宿主只有 get → 拦下', world(G, 'export function applyThingCore(deps) { deps.widget = 1; }').length === 1)
  check('5b 同上但给了 set → 放行', world(G + S, 'export function applyThingCore(deps) { deps.widget = 1; }').length === 0)
  check('5c 消费者没写该成员 → 只给 get 也放行', world(G, 'export function applyThingCore(deps) { return deps.widget; }').length === 0)
  // 「同名成员属于别的袋」的回归用例：粗口径（全仓写入名）会误报，按袋判定不会
  check('5d 写入属别的袋、本袋只是同名 get → 不算违规', world(G, 'export function applyThingCore(deps) { deps.other = 1; }').length === 0)
  check('5e 自增/复合赋值也算写入', world(G, 'export function applyThingCore(deps) { deps.widget++; deps.widget ??= 2; }').length === 1)
  check('5f 核心名不含 `Core` 后缀也要能解析（entities.store 的真实形态）', world(G, 'export function applyEntityStateUpdate(deps) { deps.widget = 1; }', { callee: 'applyEntityStateUpdate' }).length === 1)

  // 防瞎：有袋却解析不到消费者 → 必须报「空转」，不能静默全绿
  const orphanHost = `${bagSrc('    get widget() {\n      return widget;\n    },')}\nfunction forward() {\n  return notImported(thingDeps());\n}\n`
  check('5g 有袋但消费者解析不出来 → 报空转', findUnresolvedBagHosts(orphanHost, new Map(), 'case.ts').length === 1)

  // 真实树：三个宿主都必须真解析出消费者（否则第二类检查在这些文件上是空转的）
  const root5 = path.resolve(import.meta.dirname, '../..')
  const readMod = (base) => {
    for (const c of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
      try {
        if (fs.statSync(c).isFile()) return fs.readFileSync(c, 'utf8')
      } catch {
        /* 继续 */
      }
    }
    return null
  }
  const ALIAS = [['@app/', 'src/studio/app/'], ['@runtime/', 'src/studio/runtime/'], ['@/', 'src/']]
  const resolve = (abs, spec) => {
    if (spec.startsWith('.')) return path.resolve(path.dirname(abs), spec)
    for (const [pre, dir] of ALIAS) if (spec.startsWith(pre)) return path.resolve(root5, dir + spec.slice(pre.length))
    return null
  }
  const hostReports = {}
  for (const rel of ['src/studio/app/editor/home.ts', 'src/stores/entities.store.ts']) {
    const abs = path.join(root5, rel)
    const text = fs.readFileSync(abs, 'utf8')
    const m = collectBagWrites(text, { resolveSpecifier: (s) => resolve(abs, s), readModule: readMod })
    hostReports[rel] = { bags: m.size, withWrites: [...m.values()].filter((v) => v.size > 0).length }
    check(`5h 真实树 ${rel} 解析到依赖袋（防第二类检查空转）`, m.size > 0, JSON.stringify(hostReports[rel]))
    check(`5i 真实树 ${rel} 无「缺 setter」违规`, findSetterGaps(text, m, rel).length === 0)
  }
  check('5j 真实树 home.ts 确有「被写入的袋」（防「写入扫描失效 → 无从违规」）', hostReports['src/studio/app/editor/home.ts'].withWrites > 0, JSON.stringify(hostReports))
}

report(`${GATE_NAME}自检`)
