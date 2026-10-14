#!/usr/bin/env node
/**
 * Studio dependency direction guard (Phase 0).
 *
 * Rules:
 * - app/shared must not import app/editor or app/renderer
 * - platform must not import editor / renderer / 3d-studio
 * - app/** must not import runtime/** except legacy whitelist (prefer platform/)
 *
 * Exit 1 on violations. Whitelist shrinks over time — do not grow it.
 *
 * walk / import spec 提取 / `isPureReexport` 走 `ops/lib/scan.mjs`
 * （与主应用的方向门禁同一份实现；此前是逐字重复的两份）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectImportSpecs, isPureReexport, rel, under, walkSource } from '../../../../ops/lib/scan.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const studioRoot = path.resolve(__dirname, '../../src/studio')
const srcRoot = path.resolve(__dirname, '../../src')

/** app → runtime paths still allowed until Phase 1 callers are fully migrated. */
const APP_TO_RUNTIME_WHITELIST = new Set([
  // emptied after Phase 1; kept as schema for future exceptions
])

/**
 * 根（非 studio）→ studio：只允许 `@/studio`（子系统公开 barrel）。
 *
 * studio 是自带多入口/别名的嵌套子系统，根直达其内部会把内部拓扑泄漏成全仓耦合。
 * 存量白名单**只减不增**（脚本会检查过期条目）；key = `<相对 src 的路径>|<import spec>`。
 *
 * @type {Set<string>}
 */
const ROOT_TO_STUDIO_WHITELIST = new Set([
  // 已清零：认证视图挪到 src/views/auth/，studio 入口视图改用 `@/studio` 的懒加载器，
  // 根代码再无一处直达 studio 内部。
])

/** 白名单里确实被用到的条目（用于检测过期）。 */
const usedRootToStudio = new Set()

/** @type {{ file: string, rule: string, spec: string }[]} */
const violations = []

function resolveImport(fromFile, spec) {
  if (spec.startsWith('@app/')) {
    return path.join(studioRoot, 'app', spec.slice('@app/'.length))
  }
  if (spec.startsWith('@runtime/')) {
    return path.join(studioRoot, 'runtime', spec.slice('@runtime/'.length))
  }
  if (spec.startsWith('@/studio/')) {
    return path.join(studioRoot, spec.slice('@/studio/'.length))
  }
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return path.resolve(path.dirname(fromFile), spec)
  }
  return null
}

function checkFile(file) {
  const relPath = rel(studioRoot, file)
  const text = fs.readFileSync(file, 'utf8')
  // Compat barrels that only re-export are allowed during migration.
  if (isPureReexport(text)) return
  for (const { spec } of collectImportSpecs(text)) {
    const resolved = resolveImport(file, spec)
    if (!resolved) continue
    // strip extension guesses
    let targetRel = rel(studioRoot, resolved)
    if (!targetRel || targetRel.startsWith('..')) {
      // try with .ts
      for (const ext of ['.ts', '.vue', '/index.ts']) {
        const candidate = resolved + ext
        if (fs.existsSync(candidate)) {
          targetRel = rel(studioRoot, candidate)
          break
        }
      }
    }
    if (!targetRel || targetRel.startsWith('..')) continue

    // Rule: shared ↛ editor|renderer
    if (under(relPath, 'app/shared')) {
      if (under(targetRel, 'app/editor') || under(targetRel, 'app/renderer')) {
        violations.push({
          file: relPath,
          rule: 'shared must not import editor/renderer',
          spec,
        })
      }
    }

    // Rule: platform is a leaf
    if (under(relPath, 'platform')) {
      if (
        under(targetRel, 'app/editor') ||
        under(targetRel, 'app/renderer') ||
        under(targetRel, 'app/3d-studio') ||
        under(targetRel, 'app/display')
      ) {
        violations.push({
          file: relPath,
          rule: 'platform must not import creator/panel apps',
          spec,
        })
      }
    }

    // Rule: app ↛ runtime (except whitelist + runtime re-export shims we ignore if target is platform via re-export — still flag direct runtime imports)
    if (under(relPath, 'app') && under(targetRel, 'runtime')) {
      const key = `${relPath}→${targetRel}`
      const bare = targetRel.replace(/\.ts$/, '')
      if (
        !APP_TO_RUNTIME_WHITELIST.has(relPath) &&
        !APP_TO_RUNTIME_WHITELIST.has(key) &&
        !APP_TO_RUNTIME_WHITELIST.has(bare)
      ) {
        // Allow importing runtime re-export stubs only during migration if they only re-export platform —
        // still report so Phase 1 can clear them. Soft mode: only error when not already on platform path.
        violations.push({
          file: relPath,
          rule: 'app must not import runtime (use @/studio/platform/*)',
          spec,
        })
      }
    }
  }
}

for (const file of walkSource(studioRoot)) {
  checkFile(file)
}

/** 根（非 studio）→ studio：只允许走 `@/studio` 公开 barrel。 */
function checkRootFile(file) {
  const relPath = rel(srcRoot, file)
  if (under(relPath, 'studio')) return
  const text = fs.readFileSync(file, 'utf8')
  if (isPureReexport(text)) return
  for (const { spec } of collectImportSpecs(text)) {
    const reachesIn =
      spec.startsWith('@app/') || spec.startsWith('@runtime/') || spec.startsWith('@/studio/')
    if (!reachesIn) continue
    const key = `${relPath}|${spec}`
    if (ROOT_TO_STUDIO_WHITELIST.has(key)) {
      usedRootToStudio.add(key)
      continue
    }
    violations.push({
      file: relPath,
      rule: "根只能 import '@/studio'（子系统公开面），禁止直达 studio 内部（@app/* @runtime/* @/studio/<内部>）",
      spec,
    })
  }
}

for (const file of walkSource(srcRoot)) {
  checkRootFile(file)
}

const staleStudioWhitelist = [...ROOT_TO_STUDIO_WHITELIST].filter((k) => !usedRootToStudio.has(k))
if (staleStudioWhitelist.length) {
  console.error(`studio 边界白名单已过期（${staleStudioWhitelist.length} 条）：请从 ROOT_TO_STUDIO_WHITELIST 删除\n`)
  for (const key of staleStudioWhitelist) console.error(`  - ${key}`)
  process.exit(1)
}

if (violations.length) {
  console.error(`studio dependency violations: ${violations.length}\n`)
  for (const v of violations.slice(0, 80)) {
    console.error(`  ${v.file}\n    [${v.rule}] ${v.spec}`)
  }
  if (violations.length > 80) {
    console.error(`  … and ${violations.length - 80} more`)
  }
  process.exit(1)
}

console.log(
  `studio dependency check: ok (root→studio whitelist ${ROOT_TO_STUDIO_WHITELIST.size})`,
)
