/**
 * @file auth.dto.ts
 * @module backend/src/modules
 *
 * 认证模块的请求 DTO 集合：登录、首装、资料更新、用户管理与访客/MFA 流程的入参校验。
 * 所有字段级错误消息统一使用简体中文，通过 class-validator 装饰器声明约束。
 */
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  MinLength,
  MaxLength,
  IsIn,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { PASSWORD_POLICY_MESSAGE } from '../../../common/http-security/cookie-cors.util';

/** 密码强度正则：8–128 位且至少包含字母与数字 */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

/** 用户登录入参 */
export class LoginDto {
  @IsString({ message: 'username 须为字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 最长 64 字符' })
  username!: string;

  @IsString({ message: 'password 须为字符串' })
  @MinLength(8, { message: 'password 至少 8 位' })
  @MaxLength(128, { message: 'password 最长 128 字符' })
  password!: string;
}

/** 系统首装入参（仅在 User 表为空时可用，注册第一个管理员账户） */
export class SetupDto {
  @IsString({ message: 'username 须为字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 最长 64 字符' })
  username!: string;

  @IsString({ message: 'password 须为字符串' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  password!: string;
}

/** 用户自助更新个人资料入参（修改密码需校验当前密码） */
export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'username 须为字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 最长 64 字符' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'password 须为字符串' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;

  /** 修改 password 时必填，用于校验身份 */
  @IsOptional()
  @IsString({ message: 'currentPassword 须为字符串' })
  @MinLength(8, { message: 'currentPassword 至少 8 位' })
  @MaxLength(128, { message: 'currentPassword 最长 128 字符' })
  currentPassword?: string;
}

/** 管理员创建用户入参（可选角色与实体受限域） */
export class CreateUserDto {
  @IsString({ message: 'username 须为字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 最长 64 字符' })
  username!: string;

  @IsString({ message: 'password 须为字符串' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  password!: string;

  @IsOptional()
  @IsIn(['admin', 'adult', 'child', 'guest'], { message: 'role 取值无效' })
  role?: string;

  @IsOptional()
  @IsArray({ message: 'entityRestrictions 须为数组' })
  @IsString({ each: true, message: 'entityRestrictions 各元素须为字符串' })
  entityRestrictions?: string[];
}

/** 管理员更新用户入参（修改密码/角色/受限域将导致该用户其它会话失效） */
export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'username 须为字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 最长 64 字符' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'password 须为字符串' })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;

  @IsOptional()
  @IsIn(['admin', 'adult', 'child', 'guest'], { message: 'role 取值无效' })
  role?: string;

  @IsOptional()
  @IsArray({ message: 'entityRestrictions 须为数组' })
  @IsString({ each: true, message: 'entityRestrictions 各元素须为字符串' })
  entityRestrictions?: string[];
}

/** 签发访客 Token 入参（默认有效期 8 小时，可附受限域与场景白名单） */
export class GuestTokenDto {
  @IsOptional()
  @IsNumber({}, { message: 'validHours 须为数字' })
  @Min(1, { message: 'validHours 不能小于 1' })
  @Max(720, { message: 'validHours 不能大于 720' })
  validHours?: number;

  @IsOptional()
  @IsArray({ message: 'restrictions 须为数组' })
  @IsString({ each: true, message: 'restrictions 各元素须为字符串' })
  restrictions?: string[];

  @IsOptional()
  @IsArray({ message: 'allowedSceneIds 须为数组' })
  @IsString({ each: true, message: 'allowedSceneIds 各元素须为字符串' })
  allowedSceneIds?: string[];
}

/** 访客 Token 登录入参 */
export class GuestLoginDto {
  @IsString({ message: 'token 须为字符串' })
  @MinLength(8, { message: 'token 至少 8 位' })
  token!: string;
}

/** 访客分享短码兑换入参（一次性使用，兑换后短码即作废） */
export class GuestExchangeDto {
  @IsString({ message: 'code 须为字符串' })
  @MinLength(4, { message: 'code 至少 4 位' })
  @MaxLength(32, { message: 'code 最长 32 字符' })
  code!: string;
}

/** MFA 第二步登录入参（用户名/密码 + 6 位 TOTP 验证码） */
export class MfaVerifyDto {
  @IsString({ message: 'code 须为字符串' })
  @MinLength(6, { message: 'code 须为 6 位' })
  @MaxLength(6, { message: 'code 须为 6 位' })
  code!: string;

  @IsString({ message: 'username 须为字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 最长 64 字符' })
  username!: string;

  @IsString({ message: 'password 须为字符串' })
  @MinLength(8, { message: 'password 至少 8 位' })
  @MaxLength(128, { message: 'password 最长 128 字符' })
  password!: string;
}

/** 确认启用/关闭 MFA 入参（提交 6 位 TOTP 验证码） */
export class MfaSetupConfirmDto {
  @IsString({ message: 'code 须为字符串' })
  @MinLength(6, { message: 'code 须为 6 位' })
  @MaxLength(6, { message: 'code 须为 6 位' })
  code!: string;
}
