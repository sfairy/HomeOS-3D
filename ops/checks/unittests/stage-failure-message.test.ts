/**
 * 舞台失败文案的回归测试。
 *
 * 这条文案有两个必须钉住的点：
 *
 * 1. 浏览器的模块加载失败原文**不得**透传给用户（墙屏上曾出现一整行英文 URL）；
 * 2. 判定顺序是「先模块加载、后图形能力」—— `stage-renderer-chunk` 这类 URL 里含
 *    `render`，顺序反了会把「网络失败」误报成「WebGL 不可用」，指向一个没用的修复动作。
 */

import { expect, test } from 'bun:test'

import {
  describeStageFailure,
  GRAPHICS_UNAVAILABLE_MESSAGE,
  MODULE_LOAD_FAILURE_MESSAGE,
} from '../../../homeos/frontend/src/studio/app/shared/util/stage-failure-message'

test('模块加载失败收敛成带动作建议的中文', () => {
  const browsers = [
    'Failed to fetch dynamically imported module: https://homelife.iepose.cn/api/v1/modules/interaction3d/core/stage.js?v=4bb8846c2f2d0a46',
    'Importing a module script failed.',
    'error loading dynamically imported module',
    'Unable to preload CSS for /api/v1/modules/interaction3d/core/stage.css',
    'Loading chunk 42 failed.',
  ]
  for (const raw of browsers) {
    expect(describeStageFailure(raw)).toBe(MODULE_LOAD_FAILURE_MESSAGE)
  }
})

test('原文里带 render 的 chunk 仍按模块加载处理（判定顺序不能反）', () => {
  const raw = 'Failed to fetch dynamically imported module: /chunks/app/renderer/panel-renderer-abc.js'
  expect(describeStageFailure(raw)).toBe(MODULE_LOAD_FAILURE_MESSAGE)
  expect(describeStageFailure(raw)).not.toBe(GRAPHICS_UNAVAILABLE_MESSAGE)
})

test('WebGL 不可用指向图形加速而不是重试', () => {
  expect(describeStageFailure("Cannot read properties of null (reading 'render')")).toBe(GRAPHICS_UNAVAILABLE_MESSAGE)
  expect(describeStageFailure('WebGL context lost')).toBe(GRAPHICS_UNAVAILABLE_MESSAGE)
})

test('后端返回的中文领域错误原样保留', () => {
  const chinese = '户型文件损坏，请重新导入。'
  expect(describeStageFailure(chinese)).toBe(chinese)
})

test('空输入返回空串，由调用方决定兜底文案', () => {
  expect(describeStageFailure('')).toBe('')
  expect(describeStageFailure(undefined)).toBe('')
  expect(describeStageFailure(null)).toBe('')
})

test('Error 实例与字符串走同一路径', () => {
  const error = new Error('Failed to fetch dynamically imported module: /x.js')
  expect(describeStageFailure(error)).toBe(MODULE_LOAD_FAILURE_MESSAGE)
})
