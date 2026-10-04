/**
 * 系统通用请求 DTO
 *
 * 职责：定义系统初始化向导、环境指标计算、备份导入与配置导入等接口的请求体校验结构，
 *  配合 class-validator 进行入参校验。
 */
import { IsString, IsOptional, IsArray, IsNumber, IsBoolean, IsObject, IsIn } from 'class-validator';

// ── 初始化设置 ── ────────────────────

/**
 * 初始化阶段校验实体请求体。
 * 可选传入待校验的实体 ID 列表，由服务端检查其在 HA 中是否可用。
 */
export class ValidateSetupEntitiesDto {
  /** 待校验的实体 ID 列表（可选） */
  @IsOptional()
  @IsArray({ message: 'entityIds 须为数组' })
  @IsString({ each: true, message: 'entityIds 每项须为字符串' })
  entityIds?: string[];
}


/**
 * 降低初始化安防等级请求体。
 * 用于在向导中根据用户反馈（recordFeedback）降低默认安防严格度。
 */
export class ReduceSetupSecurityDto {
  /** 是否记录用户反馈（可选） */
  @IsOptional()
  @IsBoolean({ message: 'recordFeedback 须为布尔值' })
  recordFeedback?: boolean;

  /** 触发降低的来源标识（可选） */
  @IsOptional()
  @IsString({ message: 'source 须为字符串' })
  source?: string;
}

/**
 * 完成首装向导请求体。
 * learningPeriodDays 可选：覆盖能源学习期天数；缺省时沿用已存配置（默认 7）。
 */
export class CompleteSetupWizardDto {
  /** 能源学习期天数（可选，0-90） */
  @IsOptional()
  @IsNumber({}, { message: 'learningPeriodDays 须为数字' })
  learningPeriodDays?: number;
}

// ── 备份 ── ────────────────────

/**
 * 打包备份导入请求体。
 * 支持以 merge/replace 两种模式导入应用配置，并可选导入 ui/appConfig/users 等分区
 * （分区名支持别名 layout→ui、config→appConfig，服务端做白名单校验）。
 */
export class ImportBundleBackupDto {
  /** 打包备份数据（可选） */
  @IsOptional()
  bundle?: unknown;

  /** 应用配置数据（可选） */
  @IsOptional()
  data?: unknown;

  /** 应用配置导入模式：合并 / 替换 */
  @IsOptional()
  @IsIn(['merge', 'replace'], { message: 'appConfigMode 须为 merge 或 replace' })
  appConfigMode?: 'merge' | 'replace';

  /** 是否确认导入（可选） */
  @IsOptional()
  @IsBoolean({ message: 'confirm 须为布尔值' })
  confirm?: boolean;

  /** 待导入的分区列表；省略时默认 ui+appConfig（不含 users） */
  @IsOptional()
  @IsArray({ message: 'sections 须为数组' })
  @IsIn(['ui', 'appConfig', 'users'], {
    each: true,
    message: 'sections 每项须为 ui / appConfig / users',
  })
  sections?: Array<'ui' | 'appConfig' | 'users'>;
}

/**
 * 应用配置导入请求体。
 * config 为配置对象，mode 控制合并或替换，confirm 用于二次确认。
 */
export class ImportAppConfigDto {
  /** 配置结构版本号（可选） */
  @IsOptional()
  @IsNumber({}, { message: 'schemaVersion 须为数字' })
  schemaVersion?: number;

  /** 待导入的配置对象 */
  @IsObject({ message: 'config 须为对象' })
  config!: Record<string, unknown>;

  /** 导入模式：合并 / 替换（可选） */
  @IsOptional()
  @IsIn(['merge', 'replace'], { message: 'mode 须为 merge 或 replace' })
  mode?: 'merge' | 'replace';

  /** 是否确认导入（可选） */
  @IsOptional()
  @IsBoolean({ message: 'confirm 须为布尔值' })
  confirm?: boolean;
}
