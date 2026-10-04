/**
 * Mock LLM 提供商（开发 / 未配置时回退）。
 *
 * 职责：在未配置真实 API Key 时提供一个“能跑通链路”的假 LLM。
 *  - 通过正则识别控制 / 查询意图，先调 search_entities 再调 control_device
 *  - 对工具结果做模板化回复，便于前端联调
 *  - 永远返回 isReady=true，保证未配置时智能管家仍可演示
 * 依赖：llm-provider.interface（接口）。
 */
import { getEntityDomain } from '@homeos/shared';
import { Injectable, Logger } from '@nestjs/common';
import type {
  LlmChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmToolSchema,
} from './llm-provider.interface';

/**
 * Mock LLM 提供商（@Injectable）。
 * 不需要凭证，isReady 永远为 true。
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockLLM');

  /** 始终就绪，未配置真实 Key 时作为兜底 */
  isReady(): boolean {
    return true;
  }

  /**
   * 模拟一次 LLM 对话。
   * 根据最后一条消息的 role 与工具名给出模板化回复或下一步工具调用，
   * 串起 search_entities → control_device 的演示链路。
   * @param messages 完整对话历史
   * @param _tools 可用工具 schema（mock 不真正使用）
   * @returns 文本回复或工具调用
   */
  async chat(
    messages: LlmMessage[],
    _tools: LlmToolSchema[],
    _opts?: { onToken?: (text: string) => void },
  ): Promise<LlmChatResult> {
    const firstUser = messages.find((m) => m.role === 'user')?.content ?? '';
    const last = messages[messages.length - 1];

    // 工具结果回填：根据 control_device 的返回内容给出成功 / 失败 / 拦截回复
    if (last?.role === 'tool' && last.name === 'control_device') {
      const blockedMatch = last.content.match(/"blocked"\s*:\s*true[^}]*"message"\s*:\s*"([^"]+)"/);
      if (blockedMatch) {
        return { content: `（Mock）${blockedMatch[1]}` };
      }
      const ok = /"success"\s*:\s*true/.test(last.content);
      return {
        content: ok
          ? `（Mock）好的，已经帮你处理「${this.extractNoun(firstUser)}」了。`
          : `（Mock）抱歉，「${this.extractNoun(firstUser)}」没有响应，请稍后再试。`,
      };
    }

    // search_entities 结果回填：找到实体则继续 control_device，否则告知未找到
    if (last?.role === 'tool' && last.name === 'search_entities') {
      const entityId = this.pickFirstEntityId(last.content);
      if (!entityId) {
        return {
          content: `（Mock）没有找到和「${this.extractNoun(firstUser)}」匹配的设备。`,
        };
      }
      if (this.isControlIntent(firstUser)) {
        const on = this.isTurnOn(firstUser);
        const domain = getEntityDomain(entityId);
        return {
          toolCalls: [
            this.call('control_device', {
              domain,
              service: on ? 'turn_on' : 'turn_off',
              entity_id: entityId,
            }),
          ],
        };
      }
      const state = this.pickFirstEntityState(last.content);
      return {
        content: `（Mock）${entityId} 当前状态是：${state ?? '未知'}。`,
      };
    }

    // 首轮：识别控制 / 查询意图，先发 search_entities
    if (this.isControlIntent(firstUser) || this.isQueryIntent(firstUser)) {
      return {
        toolCalls: [this.call('search_entities', { query: this.extractNoun(firstUser) })],
      };
    }

    return {
      content: `（Mock）我听到了：「${firstUser}」。换上真实大模型后我就能真正理解并执行了。`,
    };
  }

  /** 构造一次工具调用，id 固定为 mock_<name> */
  private call(name: string, args: Record<string, unknown>): LlmToolCall {
    return { id: `mock_${name}`, name, arguments: args };
  }

  /** 识别控制意图：开 / 关 / 调节等关键词（中英文） */
  private isControlIntent(t: string): boolean {
    return /(打开|关闭|开一?下|关一?下|开灯|关灯|turn on|turn off|开启|关掉|调|设为|设置)/i.test(
      t,
    );
  }

  /** 识别查询意图：状态 / 温度 / 是否等关键词 */
  private isQueryIntent(t: string): boolean {
    return /(状态|多少度|温度|查询|查一?下|怎么样|是否|开着吗|关着吗)/i.test(t);
  }

  /** 识别“打开”类意图（排除“关闭”等反向词） */
  private isTurnOn(t: string): boolean {
    return (
      /(打开|开启|开灯|turn on|开一?下)/i.test(t) && !/(关闭|关掉|关灯|turn off)/i.test(t)
    );
  }

  /** 从用户原话中抽取名词（去掉动词 / 语气词 / 修饰词），用于 mock 回复 */
  private extractNoun(t: string): string {
    return (
      t
        .replace(
          /(帮我|请|麻烦|一下|把|的|了|吗|呢|啊|打开|关闭|开启|关掉|开灯|关灯|查询|查看|状态|什么|怎么样|多少度|温度|是否|开着|关着|turn on|turn off)/gi,
          '',
        )
        .trim() || t
    );
  }

  /** 从 search_entities 的 JSON 结果中提取第一个 entity_id */
  private pickFirstEntityId(toolResult: string): string | null {
    const m = toolResult.match(/"entity_id"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  }

  /** 从 get_entity_state 的 JSON 结果中提取第一个 state 值 */
  private pickFirstEntityState(toolResult: string): string | null {
    const m = toolResult.match(/"state"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  }
}