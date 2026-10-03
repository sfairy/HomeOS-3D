/**
 * 智能管家对话 DTO 定义。
 *
 * 所属模块：backend/modules/agent
 * 职责：定义 `POST /agent/chat` 请求体的校验规则，含本轮用户消息与可选的多轮历史上下文。
 * 依赖：class-validator（校验装饰器）、class-transformer（嵌套类型转换）。
 */
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * 单条对话历史项。
 * 用于把上一轮的对话上下文带给 LLM，避免每轮都重新解释用户意图。
 */
export class ChatHistoryItemDto {
  /** 消息角色：user 表示用户原话，assistant 表示管家上一轮回复 */
  @IsIn(['user', 'assistant'], { message: 'role 须为 user 或 assistant' })
  role!: 'user' | 'assistant';

  /** 消息文本内容，最长 2000 字符，不允许为空 */
  @IsString({ message: 'content 须为字符串' })
  @IsNotEmpty({ message: 'content 不能为空' })
  @MaxLength(2000, { message: 'content 最长 2000 字符' })
  content!: string;
}

/**
 * `/agent/chat` 接口的请求体。
 * - `message`：本轮用户输入，最长 500 字符。
 * - `history`：可选的多轮上下文（不含本轮 message），最多 16 条。
 */
export class ChatDto {
  /** 本轮用户输入的指令或问题，最长 500 字符 */
  @IsString({ message: 'message 须为字符串' })
  @IsNotEmpty({ message: 'message 不能为空' })
  @MaxLength(500, { message: 'message 最长 500 字符' })
  message!: string;

  /** 多轮上下文（不含本轮 message），最多 16 条 */
  @IsOptional()
  @IsArray({ message: 'history 须为数组' })
  @ArrayMaxSize(16, { message: 'history 最多 16 条' })
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  history?: ChatHistoryItemDto[];

  /**
   * 连续对话会话 ID：同一会话的多轮指令携带相同 sessionId，
   * 由服务端保存上下文，使后续指令能基于上一轮实体 / 意图补全（如「开灯」后「再调暗一点」）。
   */
  @IsOptional()
  @IsString({ message: 'sessionId 须为字符串' })
  @MaxLength(64, { message: 'sessionId 最长 64 字符' })
  sessionId?: string;
}
