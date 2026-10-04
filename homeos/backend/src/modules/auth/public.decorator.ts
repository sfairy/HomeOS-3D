/**
 * @file public.decorator.ts
 * @module backend/src/modules
 *
 * 公开访问装饰器：把路由标记为无需 JWT 认证。
 * 全局 JwtAuthGuard 检测到 IS_PUBLIC_KEY 时直接放行，常用于登录、状态查询等端点。
 */
import { SetMetadata } from '@nestjs/common';

/** Reflector 读取公开访问标记的 key */
export const IS_PUBLIC_KEY = 'isPublic';

/** 标记路由无需 JWT（全局 JwtAuthGuard 生效时跳过认证） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
