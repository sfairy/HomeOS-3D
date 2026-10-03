/**
 * 通知模块 - 数据传输对象（DTO）
 *
 * 职责：定义通知设置、用户偏好、告警规则等接口的请求体校验结构。
 * 使用 class-validator 装饰器对入参进行校验，由 NestJS ValidationPipe 自动执行。
 */
import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsIn,
  IsArray,
  IsNumber,
} from 'class-validator';

/**
 * 更新通知设置 DTO（全屋级别）。
 * 包含免打扰时段与各类通知总开关，写入系统配置。
 * 所有字段均为可选，仅更新提供的字段。
 */
export class UpdateNotificationSettingsDto {
  /** 免打扰开始时段（0-23 小时） */
  @IsOptional()
  @IsNumber({}, { message: 'dndStart 须为数字' })
  dndStart?: number;

  /** 免打扰结束时段（0-23 小时） */
  @IsOptional()
  @IsNumber({}, { message: 'dndEnd 须为数字' })
  dndEnd?: number;

  /** 全局通知总开关 */
  @IsOptional()
  @IsBoolean({ message: 'globalNotifyEnabled 须为布尔值' })
  globalNotifyEnabled?: boolean;

  /** 重要通知开关 */
  @IsOptional()
  @IsBoolean({ message: 'importantNotifyEnabled 须为布尔值' })
  importantNotifyEnabled?: boolean;

  /** 设备离线通知开关 */
  @IsOptional()
  @IsBoolean({ message: 'offlineNotifyEnabled 须为布尔值' })
  offlineNotifyEnabled?: boolean;

  /** 低电量通知开关 */
  @IsOptional()
  @IsBoolean({ message: 'lowBatteryNotifyEnabled 须为布尔值' })
  lowBatteryNotifyEnabled?: boolean;
}

/**
 * 更新当前用户通知偏好 DTO（用户级别）。
 * 写入 User.preferences.notification，仅影响当前用户。
 */
export class UpdateUserNotificationPreferencesDto {
  /** 全局通知总开关 */
  @IsOptional()
  @IsBoolean({ message: 'globalNotifyEnabled 须为布尔值' })
  globalNotifyEnabled?: boolean;

  /** 重要通知开关 */
  @IsOptional()
  @IsBoolean({ message: 'importantNotifyEnabled 须为布尔值' })
  importantNotifyEnabled?: boolean;

  /** 设备离线通知开关 */
  @IsOptional()
  @IsBoolean({ message: 'offlineNotifyEnabled 须为布尔值' })
  offlineNotifyEnabled?: boolean;

  /** 低电量通知开关 */
  @IsOptional()
  @IsBoolean({ message: 'lowBatteryNotifyEnabled 须为布尔值' })
  lowBatteryNotifyEnabled?: boolean;
}

/**
 * 告警规则条件模拟测试 DTO。
 * 用于在规则编辑时预演条件求值，不会真正发送通知。
 */
export class TestAlertRuleDto {
  /** 条件表达式（如 `state === 'on'`） */
  @IsString({ message: 'condition 须为字符串' })
  condition!: string;

  /** 实体 ID（可选，用于上下文） */
  @IsOptional()
  @IsString({ message: 'entityId 须为字符串' })
  entityId?: string;

  /** 模拟的实体状态值 */
  @IsOptional()
  @IsString({ message: 'state 须为字符串' })
  state?: string;

  /** 模拟的实体属性 */
  @IsOptional()
  @IsObject({ message: 'attributes 须为对象' })
  attributes?: Record<string, unknown>;
}

/** 告警级别枚举值：info / warn / danger */
const ALERT_LEVELS = ['info', 'warn', 'danger'] as const;

/**
 * 创建告警规则 DTO。
 * 定义一条告警规则的完整字段，包括触发条件、级别、投递渠道与冷却时长。
 */
export class CreateAlertRuleDto {
  /** 规则 ID（可选，通常由服务端生成） */
  @IsOptional()
  @IsString({ message: 'id 须为字符串' })
  id?: string;

  /** 规则名称（必填） */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 绑定的实体 ID（可选，缺省匹配所有实体） */
  @IsOptional()
  @IsString({ message: 'entityId 须为字符串' })
  entityId?: string;

  /** 触发条件表达式（必填） */
  @IsString({ message: 'condition 须为字符串' })
  condition!: string;

  /** 告警级别：info / warn / danger */
  @IsIn(ALERT_LEVELS, { message: 'level 须为 info / warn / danger' })
  level!: (typeof ALERT_LEVELS)[number];

  /** 投递渠道列表（如 in_app / socket / tts） */
  @IsArray({ message: 'channels 须为数组' })
  @IsString({ each: true, message: 'channels 每项须为字符串' })
  channels!: string[];

  /** 冷却时长（分钟），冷却期内同一规则不重复触发 */
  @IsNumber({}, { message: 'cooldownMinutes 须为数字' })
  cooldownMinutes!: number;

  /** 是否启用 */
  @IsBoolean({ message: 'enabled 须为布尔值' })
  enabled!: boolean;

  /** 消息模板（可选，支持 ${entity_id} / ${state} 等占位符） */
  @IsOptional()
  @IsString({ message: 'messageTemplate 须为字符串' })
  messageTemplate?: string;

  /** 外部推送标题（可选；为空时由 Email/WebPush/企微 使用内置标题兜底） */
  @IsOptional()
  @IsString({ message: 'title 须为字符串' })
  title?: string;

  /** 上一次的条件表达式（由服务端在条件变更时回填，用于修订历史） */
  @IsOptional()
  @IsString({ message: 'previousCondition 须为字符串' })
  previousCondition?: string;
}

/**
 * 更新告警规则 DTO（部分更新）。
 * 所有字段可选，仅更新提供的字段。
 */
export class UpdateAlertRuleDto {
  /** 规则名称 */
  @IsOptional()
  @IsString({ message: 'name 须为字符串' })
  name?: string;

  /** 绑定的实体 ID */
  @IsOptional()
  @IsString({ message: 'entityId 须为字符串' })
  entityId?: string;

  /** 触发条件表达式 */
  @IsOptional()
  @IsString({ message: 'condition 须为字符串' })
  condition?: string;

  /** 告警级别：info / warn / danger */
  @IsOptional()
  @IsIn(ALERT_LEVELS, { message: 'level 须为 info / warn / danger' })
  level?: (typeof ALERT_LEVELS)[number];

  /** 投递渠道列表 */
  @IsOptional()
  @IsArray({ message: 'channels 须为数组' })
  @IsString({ each: true, message: 'channels 每项须为字符串' })
  channels?: string[];

  /** 冷却时长（分钟） */
  @IsOptional()
  @IsNumber({}, { message: 'cooldownMinutes 须为数字' })
  cooldownMinutes?: number;

  /** 是否启用 */
  @IsOptional()
  @IsBoolean({ message: 'enabled 须为布尔值' })
  enabled?: boolean;

  /** 消息模板 */
  @IsOptional()
  @IsString({ message: 'messageTemplate 须为字符串' })
  messageTemplate?: string;

  /** 外部推送标题（为空时由各通道内置标题兜底） */
  @IsOptional()
  @IsString({ message: 'title 须为字符串' })
  title?: string;

  /** 上一次的条件表达式（由服务端回填） */
  @IsOptional()
  @IsString({ message: 'previousCondition 须为字符串' })
  previousCondition?: string;
}
