#!/usr/bin/env node
/**
 * CSS 冗余声明清理（只做可证明不改变层叠结果的删除）。
 *
 * 同一文件、同一嵌套上下文（@media/@supports/父规则链）内，选择器相同的两条规则：
 * 前一条中被后一条以同名属性、不低于其重要性覆盖的声明必然不生效，删除之；
 * 删空的规则整条移除（完全重复的规则因此只留最后一份）。
 * 后一条的值若可能在某些浏览器里解析失败（厂商前缀、dvh/svh/lvh、color-mix 等），
 * 前一条就是它的回退，保留不动。@keyframes 内部不处理。
 *
 * 用法：node ops/perf/css-redundancy.mjs [--write] <file.css ...>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const postcss = require('postcss')

const FALLBACK_SENSITIVE = /-webkit-|-moz-|-ms-|\b\d*\.?\d+(?:d|s|l)v[hwib]\b|color-mix\(|\blight-dark\(|\banchor\(/i

const args = process.argv.slice(2)
const write = args.includes('--write')
const files = args.filter((arg) => !arg.startsWith('--'))

function contextKey(node) {
  const chain = []
  for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    if (parent.type === 'atrule') chain.push(`@${parent.name} ${parent.params}`)
    else if (parent.type === 'rule') chain.push(parent.selector)
  }
  return chain.reverse().join(' >> ')
}

function insideKeyframes(node) {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true
  return false
}

const merge = args.includes('--merge')
const RISKY_SELECTOR = /-webkit-|-moz-|-ms-|:has\(|:host|::part|::slotted/i
const PROPERTY_FAMILIES = [
  ['top', 'right', 'bottom', 'left', 'inset'],
  ['width', 'height', 'inline-size', 'block-size', 'min', 'max', 'aspect-ratio'],
  ['font', 'line-height'],
  ['place', 'align', 'justify'],
  ['gap', 'row-gap', 'column-gap', 'grid'],
]

function propertyFamily(prop) {
  if (prop.startsWith('--')) return prop
  const head = prop.replace(/^-(webkit|moz|ms)-/, '').split('-')[0]
  const family = PROPERTY_FAMILIES.find((members) => members.includes(head) || members.includes(prop))
  return family ? family[0] : head
}

const declarations = (rule) => rule.nodes.filter((child) => child.type === 'decl')
const blockKey = (rule) =>
  declarations(rule)
    .map((decl) => `${decl.prop.toLowerCase()}:${decl.value.replace(/\s+/g, ' ').trim()}${decl.important ? '!' : ''}`)
    .join(';')
const familiesOf = (rule) => new Set(declarations(rule).map((decl) => propertyFamily(decl.prop.toLowerCase())))

/**
 * 声明块完全相同的两条规则合并为选择器列表，放在后一条的位置。
 * 前一条的选择器因此后移，只有当二者之间（任意上下文）没有任何规则声明同族属性时才合并。
 */
function mergeIdenticalBlocks(root) {
  const ordered = []
  root.walkRules((rule) => {
    if (!insideKeyframes(rule)) ordered.push(rule)
  })
  const mergeable = (rule) =>
    rule.parent &&
    rule.nodes.length > 0 &&
    rule.nodes.every((child) => child.type === 'decl') &&
    !RISKY_SELECTOR.test(rule.selector) &&
    !rule.nodes.some((child) => child.type === 'rule')
  let merged = 0
  for (let index = 0; index < ordered.length; index++) {
    const earlier = ordered[index]
    if (!mergeable(earlier)) continue
    const key = blockKey(earlier)
    const context = contextKey(earlier)
    const families = familiesOf(earlier)
    if (families.has('all')) continue
    for (let next = index + 1; next < ordered.length; next++) {
      const candidate = ordered[next]
      if (!candidate.parent) continue
      if (mergeable(candidate) && contextKey(candidate) === context && blockKey(candidate) === key) {
        const selectors = [...new Set([...earlier.selectors, ...candidate.selectors])]
        candidate.selector = selectors.join(',\n')
        earlier.remove()
        merged++
        break
      }
      const candidateFamilies = familiesOf(candidate)
      if (candidateFamilies.has('all') || [...families].some((family) => candidateFamilies.has(family))) break
    }
  }
  return merged
}

const selectorKey = (rule) =>
  rule.selectors
    .map((selector) => selector.replace(/\s+/g, ' ').trim())
    .sort()
    .join(',')

let totalDecls = 0
let totalRules = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const root = postcss.parse(source, { from: file })
  const rules = []
  root.walkRules((rule) => {
    if (!insideKeyframes(rule)) rules.push(rule)
  })
  const laterByKey = new Map()
  let removedDecls = 0
  let removedRules = 0
  for (let index = rules.length - 1; index >= 0; index--) {
    const rule = rules[index]
    const key = contextKey(rule) + ' :: ' + selectorKey(rule)
    const later = laterByKey.get(key)
    if (later) {
      rule.each((child) => {
        if (child.type !== 'decl') return
        const prop = child.prop.toLowerCase()
        const override = later.get(prop)
        if (!override) return
        if (child.important && !override.important) return
        if (FALLBACK_SENSITIVE.test(override.value) || FALLBACK_SENSITIVE.test(child.value)) return
        child.remove()
        removedDecls++
      })
    }
    const merged = later || new Map()
    rule.each((child) => {
      if (child.type !== 'decl') return
      const prop = child.prop.toLowerCase()
      const existing = merged.get(prop)
      if (!existing || (child.important && !existing.important)) merged.set(prop, child)
    })
    laterByKey.set(key, merged)
    if (!rule.nodes.some((child) => child.type !== 'comment')) {
      rule.remove()
      removedRules++
    }
  }
  if (merge) removedRules += mergeIdenticalBlocks(root)
  root.walkAtRules(/^(media|supports)$/i, (atRule) => {
    if (Array.isArray(atRule.nodes) && !atRule.nodes.some((child) => child.type !== 'comment')) {
      atRule.remove()
      removedRules++
    }
  })
  totalDecls += removedDecls
  totalRules += removedRules
  if (removedDecls || removedRules) {
    console.log(`${file}: -${removedDecls} 条声明，-${removedRules} 条规则`)
    if (write) writeFileSync(file, root.toString())
  }
}
console.log(`合计：-${totalDecls} 条声明，-${totalRules} 条规则${write ? '（已写回）' : '（预览）'}`)
