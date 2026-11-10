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
  totalDecls += removedDecls
  totalRules += removedRules
  if (removedDecls || removedRules) {
    console.log(`${file}: -${removedDecls} 条声明，-${removedRules} 条规则`)
    if (write) writeFileSync(file, root.toString())
  }
}
console.log(`合计：-${totalDecls} 条声明，-${totalRules} 条规则${write ? '（已写回）' : '（预览）'}`)
