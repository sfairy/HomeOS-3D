#!/usr/bin/env node
/**
 * 主应用（非 studio）依赖方向守卫。
 *
 * - components|stores|utils|composables ↛ @/views/**、@/features/**
 * - utils ↛ @/composables|@/stores|@/components（白名单只减不增）
 * - composables ↛ @/components（白名单只减不增）
 * - 域到域只能走域根 barrel `@/features/<域>`，禁止跨域深引用（views → features 允许）
 *
 * 违反白名单则退出 1。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectImportSpecs, isPureReexport, rel as relPath, under, walkSource } from '../../../../ops/lib/scan.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../../src')

/** @type {Set<string>} paths relative to src/ — must stay empty (shrink-only). */
const UTILS_LAYER_WHITELIST = new Set([])

/** @type {Set<string>} */
const COMPOSABLES_COMPONENTS_WHITELIST = new Set([
  'composables/shell/useFloatingHub.ts',
])

/**
 * 层违规存量白名单（key = `<引用方相对路径>|<归一化 target>`）。
 * key 用归一化后的 target，故两种导入写法命中同一条；每条须写明原因与归属批次，修好即报错。
 *
 * @type {Set<string>}
 */
const LAYER_WHITELIST = new Set([
  // 当前为空 —— P2 entity/device 批已把 `utils/entity/popup-registry.ts` 桩拆成两层：
  // 纯判定「entity_id → 弹窗种类」下沉 `@/shared/entity/utils/popup-registry.util`，
  // 「种类 → 懒加载组件」映射留在 `@/components/entities/popup-registry`，分层倒置消除。
  // 后续如遇过渡期需要，在此登记；条目一旦不再违规就必须删除（下方会检查过期）。
])

/**
 * 域边界存量白名单（key = `<引用方相对路径>|<import spec>`）；有过期检测，故只减不增。
 * 只约束域到域（`features/a/**` ↛ `features/b/<子路径>`），views → features 允许。
 *
 * @type {Set<string>}
 */
const CROSS_DOMAIN_WHITELIST = new Set([
  // 当前为空 —— P2 试点已把唯一的跨域深引用（settings → security 组件）改走域根 barrel。
  // 后续迁移新域时如需过渡，在此登记；条目一旦不再违规就必须删除（下方会检查过期）。
])

/**
 * 兼容 barrel 目录（迁移过渡态）。
 *
 * 这些目录里的文件是「纯 re-export 桩」，因此被 ESLint 的层规则整体放行（见 eslint.config.js）。
 * 为防放行被滥用，这里**强制**这些目录只允许纯 re-export —— 一旦有人塞进真实实现就报错。
 *
 * 当前为空 —— 最后一个兼容 barrel（`composables/security`，5 个桩）已清除：4 个真源本在
 * `features/security/composables/`，调用方改走域根 barrel；`useSecurityPanelStatus` 带 store
 * 依赖，真源改落 `@/composables/security/useSecurityPanelStatus`（不再是桩）。机制保留，供将来过渡。
 *
 * @type {string[]}
 */
const COMPAT_BARREL_DIRS = []

/**
 * 具名导入捕获：`import X ...` / `import X, { Y } ...` / `import X, * as N ...`。
 * 用于「域 barrel 没有 default」这条规则 —— 需要同时覆盖别名与相对路径两种写法，
 * 所以只抓「有默认绑定 + spec」，spec 随后走 normalizeSpec 归一化。
 */
const DEFAULT_IMPORT_RE =
  /\bimport\s+([A-Za-z_$][\w$]*)\s*(?:,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?\s*from\s*['"]([^'"]+)['"]/g

/** @type {{ file: string, rule: string, spec: string }[]} */
const violations = []

/** 白名单里确实被用到的条目（用于检测过期条目）。 */
const usedCrossDomain = new Set()

/** 层白名单里确实被用到的条目（用于检测过期条目）。 */
const usedLayerWhitelist = new Set()

/** composables→components 白名单里确实被用到的条目（用于检测过期条目）。 */
const usedComposablesComponents = new Set()


/**
 * 把 import spec 归一化成「相对 src/ 的路径 + 层名」。
 *
 * 这是本门禁的关键修复：**相对导入过去被整个跳过**（老代码 `if (!spec.startsWith('@/')) continue`），
 * 导致 `@/utils/*` 里用 `../../components/...` 绕过层规则、`utils/registry/widget-registry` 这类
 * deprecated shim 长期隐形。现在相对路径按文件目录解析后走同一套层规则。
 *
 * @returns {{ target: string, alias: string } | null} 裸模块名（vue/pinia/three…）返回 null
 */
function normalizeSpec(rel, spec) {
  if (spec.startsWith('@/')) {
    return { target: spec.slice(2), alias: spec }
  }
  if (!spec.startsWith('.')) return null
  const fromDir = path.dirname(path.join(srcRoot, rel))
  const abs = path.resolve(fromDir, spec)
  const target = path.relative(srcRoot, abs).split(path.sep).join('/')
  if (target.startsWith('..')) return null // 指向 src/ 之外（如 ../../package.json），不归层规则管
  return { target, alias: spec }
}

/** `target`（src 相对路径）是否落在某个层/目录下。 */
function targetUnder(target, prefix) {
  return target === prefix || target.startsWith(`${prefix}/`)
}

/** `features/<域>/...` → `<域>`；不在 features 下则为 null。 */
function domainOf(rel) {
  if (!under(rel, 'features')) return null
  const parts = rel.split('/')
  return parts.length >= 2 ? parts[1] : null
}

/**
 * 「叶子/下层」位置判定 —— 这些模块要保持纯净（别把 Vue 运行时拖进来），
 * 所以只能**深路径**引用 shared 域，不能 import 域 barrel。
 *
 * 关键：`shared/utils/**` 与 `shared/<域>/{utils,constants,types}/**` 也算叶子。
 * utils 池迁到 `shared/` 之后，纯叶子池已经不在根级 `utils/` 了；只认根级前缀会让这条规则
 * 对**最大的一批消费者**静默失效（补门禁时实测：`shared/utils/**` 可以随便 import
 * `@/shared/status` 而不报错）。所以这里按「位置」而不是「根级桶名」来判定。
 */
function isLeafConsumer(rel) {
  // 根级 stores/constants/types/utils：保留旧前缀做兜底（若哪天又冒出根级同名桶，规则不会静默失效）。
  if (under(rel, 'stores') || under(rel, 'constants') || under(rel, 'types') || under(rel, 'utils')) {
    return true
  }
  if (under(rel, 'shared/utils')) return true
  // P3：根级 `constants/` 与 `types/` 已并入 `shared/`，新前缀必须一并认作叶子 ——
  // 否则「最大的一批纯常量 / 纯类型消费者」会静默失去「勿 import 域 barrel」这条约束。
  if (under(rel, 'shared/constants') || under(rel, 'shared/types')) return true
  return /^shared\/[^/]+\/(utils|constants|types)\//.test(rel)
}

function checkFile(file) {
  const rel = relPath(srcRoot, file)
  if (under(rel, 'studio')) return
  const text = fs.readFileSync(file, 'utf8')
  // 兼容 barrel 目录：只允许放纯 re-export 桩，且只有它们能豁免层规则。
  // 注意**不能**用「任意文件只要是纯 re-export 就放行」—— 那会让
  // `shared/utils/registry/widget-registry.ts` 这种 `export * from '../../components/...'`
  // 的 shim 整块隐形（本轮 utils 迁移就是这么踩到的）。
  const inCompatDir = COMPAT_BARREL_DIRS.some((dir) => under(rel, dir))
  if (inCompatDir) {
    if (isPureReexport(text)) return
    violations.push({
      file: rel,
      rule: `兼容 barrel 目录（${COMPAT_BARREL_DIRS.join(' / ')}）只允许纯 re-export 桩`,
      spec: '（本文件有实际实现）',
    })
    return
  }
  for (const { spec } of collectImportSpecs(text)) {
    const norm = normalizeSpec(rel, spec)
    if (!norm) continue
    const { target } = norm

    // 层违规存量白名单：命中则整条边跳过（key 用归一化 target，别名 / 相对写法同一把钥匙）。
    const layerKey = `${rel}|${target}`
    if (LAYER_WHITELIST.has(layerKey)) {
      usedLayerWhitelist.add(layerKey)
      continue
    }

    if (
      (under(rel, 'components') ||
        under(rel, 'stores') ||
        under(rel, 'utils') ||
        under(rel, 'composables')) &&
      (targetUnder(target, 'views') || targetUnder(target, 'features'))
    ) {
      violations.push({
        file: rel,
        rule: 'lower layers must not import views/features',
        spec,
      })
    }

    // shared 是 DAG 的底：共享域被 stores/composables/utils 反向依赖，
    // 所以它自己绝不能再回头依赖这些上层（否则「共享域」立刻变回分层倒置）。
    // P3 起根级 `constants/`、`types/` 已并入 `shared/`，不再是「过渡期放行的叶子池」——
    // 它们现在受本规则约束（唯一一处 `types/floating-hub` 引 store 类型已改为结构化声明）。
    // 仍不在禁止之列的只有 `services/`（HTTP/WS 客户端，方向向下）。（根级 `utils/` 桶已在 P2 utils 收尾批清零。）
    if (
      under(rel, 'shared') &&
      (targetUnder(target, 'stores') ||
        targetUnder(target, 'composables') ||
        targetUnder(target, 'components') ||
        targetUnder(target, 'views') ||
        targetUnder(target, 'features') ||
        targetUnder(target, 'layouts'))
    ) {
      violations.push({
        file: rel,
        rule: 'shared 禁止反向依赖 stores/composables/components/views/features/layouts',
        spec,
      })
    }

    // 叶子/下层消费者只能用 shared 的**深路径**，不能 import 域 barrel：
    // barrel 会带上域内 composables 层（如 `useUtilityMeter` 依赖 vue），
    // 把运行时塞进本该纯净的常量 / 状态模块。
    if (isLeafConsumer(rel) && /^shared\/[^/]+$/.test(target)) {
      violations.push({
        file: rel,
        rule: '叶子/下层消费者请走深路径 @/shared/<域>/{utils,constants,types}/…，勿 import 域 barrel',
        spec,
      })
    }

    if (
      under(rel, 'utils') &&
      (targetUnder(target, 'composables') ||
        targetUnder(target, 'stores') ||
        targetUnder(target, 'components'))
    ) {
      if (!UTILS_LAYER_WHITELIST.has(rel)) {
        violations.push({
          file: rel,
          rule: 'utils must not import composables/stores/components',
          spec,
        })
      }
    }

    if (under(rel, 'composables') && targetUnder(target, 'components')) {
      if (!COMPOSABLES_COMPONENTS_WHITELIST.has(rel)) {
        violations.push({
          file: rel,
          rule: 'composables must not import components',
          spec,
        })
      } else {
        usedComposablesComponents.add(rel)
      }
    }

    // 域边界：域引用别的域只能走域根 barrel，禁止深引用。
    // 规则只约束域到域：`views/` 等非域引用方按 DAG 允许 import `features/`，不在此列。
    if (targetUnder(target, 'features')) {
      const srcDomain = domainOf(rel)
      if (!srcDomain) continue // 非域内引用方（views/、components/ 等），放行
      const rest = target.slice('features/'.length)
      const [targetDomain, ...subPath] = rest.split('/')
      if (!targetDomain || subPath.length === 0) continue // 根 barrel，放行
      if (srcDomain === targetDomain) continue // 域内自引用，放行
      const key = `${rel}|${spec}`
      if (CROSS_DOMAIN_WHITELIST.has(key)) {
        usedCrossDomain.add(key)
      } else {
        violations.push({
          file: rel,
          rule: `跨域深引用：只能 import @/features/${targetDomain}（域根 barrel）`,
          spec,
        })
      }
    }
  }

  // 域根 barrel 是具名再导出，无 default。默认导入会让打包器报 MISSING_EXPORT，
  // 而 tsc 因 esModuleInterop 不报 —— 必须在门禁里拦住（相对路径写法一并覆盖）。
  DEFAULT_IMPORT_RE.lastIndex = 0
  let dm
  while ((dm = DEFAULT_IMPORT_RE.exec(text))) {
    const binding = dm[1]
    const n = normalizeSpec(rel, dm[2])
    if (!n || !/^features\/[^/]+$/.test(n.target)) continue
    violations.push({
      file: rel,
      rule: `域 barrel 无 default：请改用具名导入（如 import { ${binding} } from '${n.alias}'）`,
      spec: dm[2],
    })
  }
}

for (const file of walkSource(srcRoot, ['studio'])) {
  checkFile(file)
}

// 过期白名单条目：已经是合规写法（或 import 已删）却还挂着 → 必须清掉，白名单只减不增。
const stale = [...CROSS_DOMAIN_WHITELIST].filter((key) => !usedCrossDomain.has(key))
if (stale.length) {
  console.error(`域边界白名单已过期（${stale.length} 条）：请从 CROSS_DOMAIN_WHITELIST 删除\n`)
  for (const key of stale) console.error(`  - ${key}`)
  process.exit(1)
}

const staleLayer = [...LAYER_WHITELIST].filter((key) => !usedLayerWhitelist.has(key))
if (staleLayer.length) {
  console.error(`层违规白名单已过期（${staleLayer.length} 条）：请从 LAYER_WHITELIST 删除\n`)
  for (const key of staleLayer) console.error(`  - ${key}`)
  process.exit(1)
}

const staleComposablesComponents = [...COMPOSABLES_COMPONENTS_WHITELIST].filter(
  (rel) => !usedComposablesComponents.has(rel),
)
if (staleComposablesComponents.length) {
  console.error(
    `composables→components 白名单已过期（${staleComposablesComponents.length} 条）：请从 COMPOSABLES_COMPONENTS_WHITELIST 删除\n`,
  )
  for (const rel of staleComposablesComponents) console.error(`  - ${rel}`)
  process.exit(1)
}

if (violations.length) {
  console.error(`frontend dependency violations: ${violations.length}\n`)
  for (const v of violations.slice(0, 80)) {
    console.error(`  ${v.file}\n    [${v.rule}] ${v.spec}`)
  }
  if (violations.length > 80) {
    console.error(`  … and ${violations.length - 80} more`)
  }
  process.exit(1)
}

console.log(
  `frontend dependency check: ok (utils whitelist ${UTILS_LAYER_WHITELIST.size}, composables→components whitelist ${COMPOSABLES_COMPONENTS_WHITELIST.size}, cross-domain whitelist ${CROSS_DOMAIN_WHITELIST.size}, layer whitelist ${LAYER_WHITELIST.size})`,
)
