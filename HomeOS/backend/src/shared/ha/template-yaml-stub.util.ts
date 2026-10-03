/**
 * @file template-yaml-stub.util.ts
 * @module shared/ha
 *
 * HA Template YAML 占位 stub 与 trigger 推断工具：
 *  - stubTemplateYamlFromEntity：从实体运行态生成占位 YAML
 *  - inferTriggerEntityId / extractTriggerEntityIdFromYaml：trigger entity 推断
 *
 * 外部依赖：
 *  - ../orchestrator/yaml.util：YAML 序列化
 *  - ./entity-registry.util：HaEntityRegistryEntry 类型
 *  - @homeos/shared：getEntityDomain
 */
import { dumpOrchestratorYaml } from '../orchestrator/yaml.util';
import type { HaEntityRegistryEntry } from './entity-registry.util';
import { getEntityDomain } from '@homeos/shared';

/**
 * 从 HA 运行中实体生成可导入的 configuration.yaml 片段（占位 state）。
 *
 * @param entityId 实体 ID
 * @param name 实体名称
 * @param uniqueId 实体 unique_id
 * @returns 占位 YAML 字符串（含使用说明注释）
 *
 * 当 HA 未返回 configuration.yaml 原文时作为兜底，生成最小可导入的 template 片段。
 * state 字段为占位文本，提示用户粘贴完整定义。
 */
export function stubTemplateYamlFromEntity(
  entityId: string,
  name: string,
  uniqueId: string,
): string {
  const platform = getEntityDomain(entityId) || 'sensor';
  const item: Record<string, unknown> = {
    unique_id: uniqueId,
    name,
  };
  item.state = '>-\n  # 占位：HA 未返回 configuration.yaml 原文，请粘贴完整 trigger/state 定义';
  const body = dumpOrchestratorYaml({ template: [{ [platform]: [item] }] });
  return (
    '# 以下为占位片段，非 HA configuration.yaml 原文。\n' +
    '# 若模板含 trigger: 段（如基于功率判断的传感器），请在「高级运行参数 → automation.haConfigDir」\n' +
    '# 或环境变量 HA_CONFIG_DIR 指向 HA 配置目录后重新导入，或在编辑模式中手动粘贴原文。\n' +
    body
  );
}

// 功率/电量传感器关键词正则（中英文）：power / electric / energy / dian / 功率 / 电流
const POWER_SENSOR_RE = /power|electric|energy|dian|功率|电流/i;
// 强信号功率传感器正则：匹配明确的功率字段命名
const POWER_SENSOR_STRONG_RE = /electric_power|_power_|power_p_/i;

/**
 * 从注册表推断 trigger 模板的功率/状态触发实体。
 *
 * @param templateEntry template 实体的注册表项
 * @param registry 全量实体注册表
 * @returns 推断的触发器 entity_id；无法推断返回空字符串
 *
 * 算法：
 *  1. 优先在同设备（device_id 相同）的 sensor 中找最佳功率传感器
 *  2. 同设备无匹配时，检查 template 实体名 / unique_id 是否含功率 / 状态相关关键词
 *  3. 关键词命中则在全局注册表中找强信号功率传感器（POWER_SENSOR_STRONG_RE）
 */
export function inferTriggerEntityId(
  templateEntry: HaEntityRegistryEntry,
  registry: HaEntityRegistryEntry[],
): string {
  if (!templateEntry?.entity_id || !registry?.length) return '';

  const selfId = templateEntry.entity_id;
  // 同设备兄弟姐妹实体：device_id 相同、domain 为 sensor、排除自身
  const siblings = templateEntry.device_id
    ? registry.filter(
        (e) =>
          e.device_id === templateEntry.device_id &&
          e.entity_id.startsWith('sensor.') &&
          e.entity_id !== selfId,
      )
    : [];

  // 优先级 1：同设备功率传感器
  const powerOnDevice = pickBestPowerSensor(siblings);
  if (powerOnDevice) return powerOnDevice;

  // 检查 template 实体名是否含功率 / 状态 / 电视 等关键词
  const hay =
    `${templateEntry.unique_id || ''} ${templateEntry.name || ''} ${selfId}`.toLowerCase();
  if (!/power|state|电视|tv|dian/.test(hay)) return '';

  // 优先级 2：全局强信号功率传感器（非 template 平台）
  const globalCandidates = registry.filter(
    (e) =>
      e.entity_id.startsWith('sensor.') &&
      e.platform !== 'template' &&
      e.entity_id !== selfId &&
      POWER_SENSOR_STRONG_RE.test(e.entity_id),
  );
  return pickBestPowerSensor(globalCandidates) || '';
}

/**
 * 从候选 sensor 列表中挑选最佳功率传感器（评分最高者）。
 *
 * @param candidates 候选 sensor 注册表项数组
 * @returns 最佳候选的 entity_id；无有效候选返回空字符串
 *
 * 评分规则：
 *  - 强信号命名（POWER_SENSOR_STRONG_RE）：+10
 *  - 一般功率命名（POWER_SENSOR_RE）：+5
 *  - 名称含功率关键词：+3
 *  - electric_power 命名：+8
 */
function pickBestPowerSensor(candidates: HaEntityRegistryEntry[]): string {
  if (!candidates.length) return '';
  const scored = candidates
    .map((e) => {
      let score = 0;
      if (POWER_SENSOR_STRONG_RE.test(e.entity_id)) score += 10;
      if (POWER_SENSOR_RE.test(e.entity_id)) score += 5;
      if (POWER_SENSOR_RE.test(e.name || '')) score += 3;
      if (/electric_power/.test(e.entity_id)) score += 8;
      return { id: e.entity_id, score };
    })
    .sort((a, b) => b.score - a.score);
  // 最高分必须 > 0 才视为有效候选
  if (scored[0].score <= 0) return '';
  return scored[0].id;
}

/**
 * 从 YAML 文本提取 trigger 段 entity_id。
 *
 * @param yamlStr YAML 文本
 * @returns trigger 段的 entity_id；未找到返回空字符串
 *
 * 匹配模式：platform: state 后续行中的 entity_id 字段。
 */
export function extractTriggerEntityIdFromYaml(yamlStr: string): string {
  if (!yamlStr?.trim()) return '';
  const m = yamlStr.match(
    /platform:\s*state[^\n]*\n\s*entity_id:\s*['"]?([a-z][a-z0-9_]*\.[a-z0-9_]+)['"]?/i,
  );
  return m?.[1] || '';
}
