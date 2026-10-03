/**
 * @file url.test.ts
 * @module @homeos/shared/ha
 * @brief Home Assistant URL 规范化与校验工具的单元测试。
 *
 * 职责：
 *  - 验证 normalizeHaUrl：去除尾部斜杠、null/undefined/空字符串统一返回空串；
 *  - 验证 isLocalhostHaUrl：识别 localhost / 127.0.0.1 等回环地址；
 *  - 验证 validateHaUrlForDeploy：拒绝空值与非 http(s) 协议、默认拒绝 localhost（可开关豁免）、接受局域网 http。
 *
 * 约定：
 *  - 部署场景下 URL 指向实际 Home Assistant 实例，避免 localhost 在容器/分离部署下不可达；
 *  - 校验失败返回错误字符串，通过返回 null。
 */
import { describe, expect, test } from 'bun:test'
import { isLocalhostHaUrl, normalizeHaUrl, validateHaUrlForDeploy } from '../../src/ha/url'

describe('normalizeHaUrl', () => {
  test('strips trailing slash', () => {
    expect(normalizeHaUrl('http://ha.local:8123/')).toBe('http://ha.local:8123')
  })
  test('empty input is empty string', () => {
    expect(normalizeHaUrl(null)).toBe('')
    expect(normalizeHaUrl(undefined)).toBe('')
    expect(normalizeHaUrl('')).toBe('')
  })
})

describe('isLocalhostHaUrl', () => {
  test('detects loopback hosts', () => {
    expect(isLocalhostHaUrl('http://localhost:8123')).toBe(true)
    expect(isLocalhostHaUrl('http://127.0.0.1:8123')).toBe(true)
  })
  test('lan url is not localhost', () => {
    expect(isLocalhostHaUrl('http://192.168.1.8:8123')).toBe(false)
  })
})

describe('validateHaUrlForDeploy', () => {
  test('rejects empty and bad protocol', () => {
    expect(validateHaUrlForDeploy('')).toBeTruthy()
    expect(validateHaUrlForDeploy('ftp://ha.local')).toBeTruthy()
  })
  test('rejects localhost unless allowed', () => {
    expect(validateHaUrlForDeploy('http://localhost:8123')).toBeTruthy()
    expect(validateHaUrlForDeploy('http://localhost:8123', { allowLocalhost: true })).toBeNull()
  })
  test('accepts lan http', () => {
    expect(validateHaUrlForDeploy('http://192.168.1.8:8123')).toBeNull()
  })
})
