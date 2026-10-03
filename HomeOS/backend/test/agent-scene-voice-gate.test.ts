/**
 * HA 场景 / 脚本语音控制白名单闸门的回归测试。
 *
 * 背景：`scene.*` / `script.*` 的内部动作无法静态审计（可能含撤防、开阀、开门等危险联动），
 * 因此采取 fail-closed 策略——默认全禁，只有用户在「场景语音控制」里显式启用并逐个勾选后，
 * 才允许语音 / LLM 触发；`automation.*` 永久拦截。
 *
 * 这里锁死两个容易踩的坑：
 *  1) 闸门必须按**整个域**拦截，不能只列 turn_on / activate / run。否则同域的
 *     `script.toggle`（脚本关闭时 toggle 即执行）、`script.turn_off`、`script.reload`、
 *     `scene.apply` 会全部落到 blocked=false，把「默认全禁」打穿。
 *  2) `scene` / `script` 之外的高危域（lock / alarm_control_panel / automation）不受闸门影响，
 *     对它们传白名单不能成为放行手段。
 */
import { describe, expect, test } from 'bun:test';
import {
  isHighRisk,
  isSceneVoiceAllowed,
  type SceneVoiceControlGate,
} from '../src/modules/agent/tools/high-risk-denylist';

/** 构造闸门：`allow` 统一小写（与线上读路径一致） */
function gate(enabled: boolean, allow: string[] = []): SceneVoiceControlGate {
  return { enabled, allow: new Set(allow.map((id) => id.toLowerCase())) };
}

/** 未启用 + 空清单 = 线上默认值 */
const DISABLED = gate(false);
/** 已启用但只勾选了回家场景 */
const ENABLED_GOHOME = gate(true, ['scene.gohome']);

describe('isHighRisk scene / script 白名单闸门', () => {
  test('默认全禁：scene / script 的任意服务都被拦截', () => {
    const services = ['turn_on', 'activate', 'apply', 'turn_off', 'toggle', 'reload', 'run'];
    for (const service of services) {
      expect(isHighRisk('scene', service, 'scene.any', undefined, DISABLED).blocked).toBe(true);
      expect(isHighRisk('script', service, 'script.any', undefined, DISABLED).blocked).toBe(true);
    }
  });

  test('未传闸门（旧调用点）同样全禁', () => {
    expect(isHighRisk('scene', 'turn_on', 'scene.gohome').blocked).toBe(true);
    expect(isHighRisk('script', 'toggle', 'script.gohome').blocked).toBe(true);
  });

  test('script.toggle / turn_off / reload / scene.apply 不再漏网', () => {
    // 这四项曾是 blocked=false 的绕过路径
    expect(isHighRisk('script', 'toggle', 'script.evil', undefined, ENABLED_GOHOME).blocked).toBe(
      true,
    );
    expect(isHighRisk('script', 'turn_off', 'script.evil', undefined, ENABLED_GOHOME).blocked).toBe(
      true,
    );
    expect(isHighRisk('script', 'reload', 'script.evil', undefined, ENABLED_GOHOME).blocked).toBe(
      true,
    );
    expect(isHighRisk('scene', 'apply', 'scene.evil', undefined, ENABLED_GOHOME).blocked).toBe(
      true,
    );
  });

  test('启用且勾选后才放行，且大小写不敏感', () => {
    expect(isHighRisk('scene', 'turn_on', 'scene.gohome', undefined, ENABLED_GOHOME).blocked).toBe(
      false,
    );
    expect(isHighRisk('scene', 'apply', 'Scene.GoHome', undefined, ENABLED_GOHOME).blocked).toBe(
      false,
    );
    expect(isHighRisk('script', 'turn_on', 'script.party', undefined, gate(true, ['script.party'])).blocked).toBe(
      false,
    );
  });

  test('总开关关闭时即使实体在清单内也拦截', () => {
    expect(
      isHighRisk('scene', 'turn_on', 'scene.gohome', undefined, gate(false, ['scene.gohome']))
        .blocked,
    ).toBe(true);
  });

  test('automation 永久拦截，勾选清单不能放行', () => {
    expect(
      isHighRisk('automation', 'trigger', 'automation.x', undefined, gate(true, ['automation.x']))
        .blocked,
    ).toBe(true);
  });

  test('闸门不影响其它域：门锁始终拦截、灯光正常放行', () => {
    expect(
      isHighRisk('lock', 'unlock', 'lock.front', undefined, gate(true, ['lock.front'])).blocked,
    ).toBe(true);
    expect(isHighRisk('light', 'turn_on', 'light.a', undefined, DISABLED).blocked).toBe(false);
  });
});

describe('isSceneVoiceAllowed', () => {
  test('只看 scene / script 域，其它域一律 false', () => {
    expect(isSceneVoiceAllowed('lock', 'lock.front', gate(true, ['lock.front']))).toBe(false);
    expect(isSceneVoiceAllowed('automation', 'automation.x', gate(true, ['automation.x']))).toBe(
      false,
    );
  });

  test('空实体 ID / 空清单 / 缺省闸门都返回 false', () => {
    expect(isSceneVoiceAllowed('scene', '', ENABLED_GOHOME)).toBe(false);
    expect(isSceneVoiceAllowed('scene', 'scene.gohome', gate(true))).toBe(false);
    expect(isSceneVoiceAllowed('scene', 'scene.gohome')).toBe(false);
  });
});
