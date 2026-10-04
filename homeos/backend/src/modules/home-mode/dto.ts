/**
 * 家庭模式模块 DTO 定义。
 *
 * 职责：声明家庭模式相关接口的请求体校验 DTO，借助 class-validator 装饰器
 *  自动产出校验规则与中文错误提示。覆盖预设安装、批量排序、创建与更新场景。
 */
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 一键安装家庭模式预设包的请求体 */
export class InstallPresetDto {
  /** 实体 ID 覆盖映射（preset key → 实际 entity_id） */
  @IsOptional()
  @IsObject({ message: 'entityOverrides 须为对象' })
  entityOverrides?: Record<string, string>;

  /** 是否合并到同名已有模式（true 更新，false 新建副本） */
  @IsOptional()
  @IsBoolean({ message: 'merge 须为布尔值' })
  merge?: boolean;
}

/** 单条模式排序项 */
class ReorderModeItemDto {
  /** 模式 ID */
  @IsString({ message: 'id 须为字符串' })
  id!: string;

  /** 目标排序序号 */
  @IsNumber({}, { message: 'sortOrder 须为数字' })
  sortOrder!: number;
}

/** 批量调整模式排序的请求体 */
export class ReorderModesDto {
  /** 排序项数组 */
  @IsArray({ message: 'items 须为数组' })
  @ValidateNested({ each: true })
  @Type(() => ReorderModeItemDto)
  items!: ReorderModeItemDto[];
}

/** 创建家庭模式的请求体 */
export class CreateHomeModeDto {
  /** 模式名称 */
  @IsString({ message: 'name 须为字符串' })
  name!: string;

  /** 图标标识 */
  @IsOptional()
  @IsString({ message: 'icon 须为字符串' })
  icon?: string;

  /** 动作配置数组（entity / scene / script / notify / security） */
  @IsArray({ message: 'config 须为数组' })
  config!: unknown[];

  /** 触发器数组（time / lock_unlock / state / all_leave 等） */
  @IsOptional()
  @IsArray({ message: 'triggers 须为数组' })
  triggers?: unknown[];

  /** 排序序号 */
  @IsOptional()
  @IsNumber({}, { message: 'sortOrder 须为数字' })
  sortOrder?: number;

  /** 互斥组（同组切换时恢复旧模式快照） */
  @IsOptional()
  @IsString({ message: 'exclusiveGroup 须为字符串' })
  exclusiveGroup?: string;

  /** 优先级（数值越大优先级越高，触发器同组冲突时择优） */
  @IsOptional()
  @IsNumber({}, { message: 'priority 须为数字' })
  priority?: number;
}

/** 更新家庭模式的请求体（所有字段可选） */
export class UpdateHomeModeDto {
  /** 模式名称 */
  @IsOptional()
  @IsString({ message: 'name 须为字符串' })
  name?: string;

  /** 图标标识 */
  @IsOptional()
  @IsString({ message: 'icon 须为字符串' })
  icon?: string;

  /** 动作配置数组 */
  @IsOptional()
  @IsArray({ message: 'config 须为数组' })
  config?: unknown[];

  /** 触发器数组 */
  @IsOptional()
  @IsArray({ message: 'triggers 须为数组' })
  triggers?: unknown[];

  /** 排序序号 */
  @IsOptional()
  @IsNumber({}, { message: 'sortOrder 须为数字' })
  sortOrder?: number;

  /** 互斥组 */
  @IsOptional()
  @IsString({ message: 'exclusiveGroup 须为字符串' })
  exclusiveGroup?: string;

  /** 优先级 */
  @IsOptional()
  @IsNumber({}, { message: 'priority 须为数字' })
  priority?: number;
}
