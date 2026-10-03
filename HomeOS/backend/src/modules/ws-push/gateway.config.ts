/**
 * 所属模块：backend/modules/ws-push
 * 职责：
 *  - WS 网关配置常量（缓冲/心跳/路径前缀）；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { WS_PUSH_CRITICAL_DOMAINS as SHARED_WS_PUSH_CRITICAL_DOMAINS } from '@homeos/shared';
import { resolveWsMaxBufferBytes } from './ws-buffer.util';

/** 冷启动按需订阅时仍优先推送的关键 domain */
export const WS_PUSH_CRITICAL_DOMAINS = SHARED_WS_PUSH_CRITICAL_DOMAINS;

/**
 * 单客户端 websocket 写缓冲积压阈值：超过则视为客户端无法及时消费、建议全量重同步。
 * 取值需远高于正常洪峰批次堆积，避免误触发（每帧批推通常只占 1~数条缓冲）。
 */
export const WS_PUSH_BACKPRESSURE_WRITE_BUFFER = 512;

/**
 * WS_PUSH_MAX_HTTP_BUFFER_BYTES：常量。
 * - 语义：见定义处字面量；来源为硬编码预设/默认值；
 * - 跨端一致性：仅 backend 内部使用；如需跨端同步 packages/shared；
 * - 反射拼接：无反射使用，可 IDE 重构重命名
 */
export const WS_PUSH_MAX_HTTP_BUFFER_BYTES = resolveWsMaxBufferBytes();
