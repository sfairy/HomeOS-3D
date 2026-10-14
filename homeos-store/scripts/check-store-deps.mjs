#!/usr/bin/env node
/**
 * homeos-store 前端依赖方向门禁（与主应用 `homeos/frontend/scripts/gates/check-frontend-deps.mjs` 等价）。
 *
 * 为什么需要它
 * -----------
 * 商店前端此前只有一条规则（「扁平四层不得引 `views/**`」），而它的目录形态正好绕开了那条规则：
 * `views/admin/**` 与 `views/store/**` 是两片**互不相干的功能域**，却共享同一个 `components/`、
 * `stores/`、`utils/` 池，于是「域」的边界没有任何东西在守 —— 后台面板可以直接读前台的
 * store、前台的页面可以直接读后台的表格组件，谁也不会红。P2 把两片域收成
 * `features/admin` / `features/storefront` 之后，这条门禁负责把边界固定下来。
 *
 * 规则（全部先把 spec 归一化成「src 相对路径」再判定，别名 / 相对写法共用同一把钥匙）
 * -----------------------------------------------------------------------------
 * R1 分层方向：`shared/**` 不得回头依赖 `features/**`、`router/**`、`views/**` 或宿主文件
 *    （shared 是 DAG 的底：域可以用 shared，shared 不能反过来用域）。
 * R2 分层方向：`features/**` 不得依赖 `router/**`、`views/**` 或宿主文件
 *    （路由表与宿主页面是**组合根**，只能自上而下引用域）。
 * R3 域到域：`features/<A>/**` 不得深引用 `features/<B>/<子路径>`；跨域只允许
 *    `@store/features/<B>`（域根 barrel）。需要第二种口径时正确的动作是**加一条具名导出**，
 *    不是绕过 barrel。
 * R4 域内：非视图文件（`components/` `composables/` `stores/` `utils/`）不得 import 本域
 *    `views/**`（页面是域内的叶子，组件/状态不依赖页面）—— 这是老门禁那条规则的域内化。
 * R5 域内：`utils/**` 不得 import 同域 `stores/` `components/` `composables/`（纯函数层保持纯净）。
 * R6 宿主：`router/**`、`views/**`、`App.vue`、`main.ts`、`auth-bootstrap.ts` 可向下引用任何层；
 *    其中**懒加载**路由组件允许深引用域内 `views/*.vue`：经 barrel 转出会把所有路由页并进同一个
 *    chunk，直接毁掉路由级分包（商店首页首屏就是这么瘦下来的）。
 *
 * 白名单一律**只减不增**并带过期检测：条目一旦不再违规就必须删除。
 *
 * 用法：
 * ```bash
 * node scripts/check-store-deps.mjs                 # 门禁（CI 跑这条）
 * node scripts/check-store-deps.mjs --root=<dir>    # 供自检注入 fixture（相对 frontend/）
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectImportSpecs, isPureReexport, rel, under, walkSource } from '../../ops/lib/scan.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..', 'frontend')

const rootArg = process.argv.find((a) => a.startsWith('--root='))
const SRC = path.resolve(FRONTEND, rootArg ? rootArg.slice('--root='.length) : 'src')

const allowArg = process.argv.find((a) => a.startsWith('--allow='))
const ALLOW_FILE = allowArg ? path.resolve(allowArg.slice('--allow='.length)) : null
/** 允许清单：`{ layer: [], crossDomain: [], domainView: [], domainUtils: [] }`（缺省空）。 */
const allow = ALLOW_FILE && fs.existsSync(ALLOW_FILE)
  ? JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8'))
  : {}

const ALIAS = '@store/'

/** 宿主（组合根）：可向下引用任何层。 */
const HOST_FILES = new Set(['App.vue', 'main.ts', 'auth-bootstrap.ts'])

/**
 * 层违规存量白名单（key = `<引用方>|<归一化 target>`）。当前为空。
 * @type {Set<string>}
 */
const LAYER_WHITELIST = new Set(allow.layer ?? [])

/**
 * 域到域深引用存量白名单（key = `<引用方>|<归一化 target>`）。当前为空。
 * @type {Set<string>}
 */
const CROSS_DOMAIN_WHITELIST = new Set(allow.crossDomain ?? [])

/** 域内反向依赖（非视图 → 本域 views）存量白名单。当前为空。 */
const DOMAIN_VIEW_WHITELIST = new Set(allow.domainView ?? [])

/** 域内 utils → 上层（stores/components/composables）存量白名单。当前为空。 */
const DOMAIN_UTILS_WHITELIST = new Set(allow.domainUtils ?? [])

/**
 * 兼容 barrel 目录（迁移过渡态）：只允许放纯 re-export 桩，且只有它们能豁免规则。
 * 当前为空 —— P2 的域重排一次性搬完，没有留过渡桩。
 * @type {string[]}
 */
const COMPAT_BARREL_DIRS = []

/** 裸模块（vue / pinia / @homeos/shared/…）返回 null；其余归一化成 src 相对路径。 */
function normalizeSpec(fromRel, spec) {
  if (spec.startsWith(ALIAS)) {
    return spec.slice(ALIAS.length).replace(/\.(ts|vue|js)$/, '')
  }
  if (!spec.startsWith('.')) return null
  const fromDir = path.dirname(path.join(SRC, fromRel))
  const abs = path.resolve(fromDir, spec)
  const target = rel(SRC, abs)
  if (target.startsWith('..')) return null // src/ 之外（如 ../../../package.json），不归层规则管
  return target.replace(/\.(ts|vue|js)$/, '')
}

/** `features/<域>/…` → `<域>`；不在 features 下返回 null。 */
function domainOf(relPath) {
  if (!under(relPath, 'features')) return null
  const parts = relPath.split('/')
  return parts.length >= 2 ? parts[1] : null
}

const isHost = (relPath) => HOST_FILES.has(relPath) || under(relPath, 'router') || under(relPath, 'views')

/** @type {{ file: string, rule: string, spec: string, target: string }[]} */
const violations = []

const used = {
  layer: new Set(),
  crossDomain: new Set(),
  domainView: new Set(),
  domainUtils: new Set(),
}

const files = walkSource(SRC)

for (const file of files) {
  const fromRel = rel(SRC, file)
  const text = fs.readFileSync(file, 'utf8')

  const inCompatDir = COMPAT_BARREL_DIRS.some((dir) => under(fromRel, dir))
  if (inCompatDir) {
    if (isPureReexport(text)) continue
    violations.push({
      file: fromRel,
      rule: `兼容 barrel 目录（${COMPAT_BARREL_DIRS.join(' / ')}）只允许纯 re-export 桩`,
      spec: '（本文件有实际实现）',
      target: '',
    })
    continue
  }

  const fromDomain = domainOf(fromRel)
  const fromInDomainViews = !!fromDomain && under(fromRel, `features/${fromDomain}/views`)
  //: 域根 barrel 是**有意的出口**：它把本域页面按需转出给宿主（静态首屏页面），
  //: 这不是「反向依赖页面」，故 R4 对它豁免。
  const isDomainBarrel = !!fromDomain && fromRel === `features/${fromDomain}/index.ts`

  for (const { spec } of collectImportSpecs(text)) {
    const target = normalizeSpec(fromRel, spec)
    if (!target) continue

    const layerKey = `${fromRel}|${target}`
    if (LAYER_WHITELIST.has(layerKey)) {
      used.layer.add(layerKey)
      continue
    }
    const crossKey = layerKey
    const viewKey = layerKey
    const utilsKey = layerKey

    // R1/R2：分层方向 —— shared / features 不得引用更上层与组合根。
    // 注意「本域 views」不算向上：那是域内页面，由 R4 单独管（视图之间互相引用是正常的）。
    if (under(fromRel, 'shared') || fromDomain) {
      const toHost = under(target, 'router') || under(target, 'views') || HOST_FILES.has(target)
      const sharedToFeatures = under(fromRel, 'shared') && under(target, 'features')
      if (toHost || sharedToFeatures) {
        violations.push({
          file: fromRel,
          rule: sharedToFeatures
            ? 'R1 shared 不得回头依赖 features'
            : 'R2 shared/features 不得依赖组合根（router/views/宿主文件）',
          spec,
          target,
        })
        continue
      }
    }

    // R3：域到域必须走域根 barrel。
    const toDomain = domainOf(target)
    if (fromDomain && toDomain && fromDomain !== toDomain) {
      if (CROSS_DOMAIN_WHITELIST.has(crossKey)) {
        used.crossDomain.add(crossKey)
      } else if (target !== `features/${toDomain}`) {
        violations.push({
          file: fromRel,
          rule: `R3 域到域只允许走域根 barrel（@store/features/${toDomain}）`,
          spec,
          target,
        })
        continue
      }
    }

    // R4：非视图文件不得 import 本域 views/**（宿主与域根 barrel 除外）。
    if (
      fromDomain &&
      !fromInDomainViews &&
      !isDomainBarrel &&
      !isHost(fromRel) &&
      under(target, `features/${fromDomain}/views`)
    ) {
      if (DOMAIN_VIEW_WHITELIST.has(viewKey)) used.domainView.add(viewKey)
      else {
        violations.push({
          file: fromRel,
          rule: 'R4 非视图文件不得 import 本域 views/**',
          spec,
          target,
        })
        continue
      }
    }

    // R5：utils 保持纯净。
    if (fromDomain && under(fromRel, `features/${fromDomain}/utils`)) {
      const up =
        under(target, `features/${fromDomain}/stores`) ||
        under(target, `features/${fromDomain}/components`) ||
        under(target, `features/${fromDomain}/composables`)
      if (up) {
        if (DOMAIN_UTILS_WHITELIST.has(utilsKey)) used.domainUtils.add(utilsKey)
        else {
          violations.push({
            file: fromRel,
            rule: 'R5 域内 utils 不得 import stores/components/composables',
            spec,
            target,
          })
        }
      }
    }
  }
}

/** 过期白名单条目：还在清单里但已经没人踩 —— 必须删掉，否则门禁慢慢变瞎。 */
const stale = []
for (const [key, set] of [
  ['LAYER_WHITELIST', LAYER_WHITELIST],
  ['CROSS_DOMAIN_WHITELIST', CROSS_DOMAIN_WHITELIST],
  ['DOMAIN_VIEW_WHITELIST', DOMAIN_VIEW_WHITELIST],
  ['DOMAIN_UTILS_WHITELIST', DOMAIN_UTILS_WHITELIST],
]) {
  const usedSet =
    key === 'LAYER_WHITELIST'
      ? used.layer
      : key === 'CROSS_DOMAIN_WHITELIST'
        ? used.crossDomain
        : key === 'DOMAIN_VIEW_WHITELIST'
          ? used.domainView
          : used.domainUtils
  for (const entry of set) if (!usedSet.has(entry)) stale.push(`${key}: ${entry}`)
}

if (violations.length || stale.length) {
  if (violations.length) {
    console.error(`store 依赖方向违规：${violations.length} 处\n`)
    for (const v of violations) {
      console.error(`  ${v.file}\n    ${v.rule}\n    ${v.spec}  →  ${v.target}`)
    }
  }
  if (stale.length) {
    console.error(`\n过期白名单条目（已无违规仍挂在清单上，请删除）：${stale.length} 处`)
    for (const s of stale) console.error(`  ${s}`)
  }
  process.exit(1)
}

console.log(`store 依赖方向检查：ok（${files.length} 个源文件，5 条规则）`)
