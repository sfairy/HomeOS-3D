/**
 * 告警规则消息模板格式化工具。
 *
 * 所属模块：common/alert-support。
 * 职责：将告警规则触发时产生的事件变量（entity / state / name 等）与用户自定义模板
 *   或默认模板拼接，产出最终展示给用户的消息文本。
 * 关键依赖：voice-alert.util 中的 `applyAlertTemplate`（负责 `{{key}}` 占位符替换）。
 */
import { applyAlertTemplate } from './voice-alert.util';

/** 默认告警规则消息模板：使用 {{name}}/{{entity}}/{{state}} 占位符 */
const DEFAULT_ALERT_RULE_MESSAGE = '[规则] {{name}}: {{entity}} = {{state}}';

/**
 * 根据模板与变量生成告警规则消息。
 *
 * 支持的插值变量（`{{key}}`）：
 * - `{{state}}` / `{{value}}` / `{{val}}`：实体当前状态 / 数值（三者互为别名）
 * - `{{name}}` / `{{friendly_name}}`：实体友好名
 * - `{{entity}}` / `{{entity_id}}`：实体 ID
 * - `{{unit}}`：数值型传感器单位（如 m/s、%）
 * - `{{rule}}`：规则名称
 *
 * @param template 用户自定义模板；为空或仅空白时回退到 DEFAULT_ALERT_RULE_MESSAGE
 * @param vars 模板变量集合，字段之间允许互为回退（如 name 缺失时使用 friendly_name）
 * @returns 替换占位符并 trim 后的消息字符串
 *
 * 实现要点：
 * - 先构造 merged 对象，把多种来源的等价变量归一化（entity / entity_id、name / friendly_name、
 *   state / value / val 等），避免模板中引用任一别名时缺失。
 * - 空模板 / 空白模板回退默认模板，保证始终有可读输出。
 */
export function formatAlertRuleMessage(
  template: string | undefined | null,
  vars: {
    entity?: string;
    entity_id?: string;
    state?: string;
    name?: string;
    friendly_name?: string;
    value?: string;
    rule?: string;
    /** 数值型传感器单位（如 m/s、%），供 {{unit}} 插值 */
    unit?: string;
  },
): string {
  // 归一化变量：互为别名的字段互相回退，确保模板内任一占位符都能取到值
  const merged = {
    entity: vars.entity ?? vars.entity_id ?? '',
    entity_id: vars.entity_id ?? vars.entity ?? '',
    state: vars.state ?? '',
    name: vars.name ?? vars.friendly_name ?? vars.entity_id ?? '',
    friendly_name: vars.friendly_name ?? vars.name ?? '',
    value: vars.value ?? vars.state ?? '',
    rule: vars.rule ?? '',
    // val 为 {{value}} 的数值别名（参考编译包 interpolateTemplate 的 {{val}} 语义）
    val: vars.value ?? vars.state ?? '',
    unit: vars.unit ?? '',
  };
  // 空模板 / 空白模板回退默认模板
  const raw = String(template || '').trim() || DEFAULT_ALERT_RULE_MESSAGE;
  return applyAlertTemplate(raw, merged);
}