/**
 * 解析型 LLM 提供商（运行时切换）。
 *
 * 所属模块：backend/modules/agent/providers
 * 职责：作为 LLM_PROVIDER Token 的实际实现，在 mock 与 DeepseekLlmProvider 间按配置切换。
 *  - onModuleInit 时先 refresh 一次，并订阅 SYSTEM_CONFIG_UPDATED 事件
 *  - chat 时若仍为 mock 则再 refresh 一次（兜底配置刚保存的场景）
 *  refresh 会先使 AgentConfigService 缓存失效，避免读到旧 mock
 * 依赖：AgentConfigService（配置）、EventEmitter2（事件）、DeepseekLlmProvider / MockLlmProvider（具体实现）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';
import { AgentConfigService } from '../config.service';
import type {
  LlmChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolSchema,
} from './llm-provider.interface';
import { DeepseekLlmProvider } from './deepseek-llm.provider';
import { MockLlmProvider } from './mock-llm.provider';
import { UnavailableLlmProvider } from './unavailable-llm.provider';

function isMockAllowed(): boolean {
  const flag = process.env.AGENT_ALLOW_MOCK?.trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** 按最新 agentConfig / 环境变量解析 LLM，配置变更后自动切换 */
@Injectable()
export class ResolvingLlmProvider implements LlmProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ResolvingLLM');
  /** 当前实际持有的提供商实现，默认 mock */
  private inner: LlmProvider = new MockLlmProvider();
  private readonly unavailable = new UnavailableLlmProvider();

  /** 稳定引用：供 on/off 对称注销 */
  private readonly onSystemConfigUpdated = () => {
    void this.refresh();
  };

  constructor(
    private readonly agentConfig: AgentConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 模块初始化：刷新一次并订阅配置变更事件 */
  onModuleInit(): void {
    void this.refresh();
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  /** 透出当前内部提供商名 */
  get name(): string {
    return this.inner.name;
  }

  /** 透出当前内部提供商的就绪状态 */
  isReady(): boolean {
    return this.inner.isReady();
  }

  /**
   * 执行一次对话。若当前仍是 mock 则再刷新一次，兜底“配置刚保存但事件尚未触发”的场景。
   * @param messages 对话历史
   * @param tools 可用工具
   * @returns 内部提供商的返回
   */
  async chat(
    messages: LlmMessage[],
    tools: LlmToolSchema[],
    opts?: { onToken?: (text: string) => void },
  ): Promise<LlmChatResult> {
    if (this.inner.name === 'mock' || this.inner.name === 'unavailable') {
      await this.refresh();
    }
    return this.inner.chat(messages, tools, opts);
  }

  /**
   * 重新读取配置并切换内部提供商。
   * - 配置了 provider != mock 且 apiKey 非空 → 使用 DeepseekLlmProvider（复用已有实例 / 新建）
   * - 否则 → 回退到 MockLlmProvider（开发/AGENT_ALLOW_MOCK=true）或 UnavailableLlmProvider
   */
  async refresh(): Promise<void> {
    // 先清缓存，避免与 SYSTEM_CONFIG_UPDATED 监听顺序竞态读到旧 mock
    this.agentConfig.invalidateCache();
    const cfg = await this.agentConfig.getConfig();
    if (cfg.provider !== 'mock' && cfg.apiKey) {
      if (this.inner instanceof DeepseekLlmProvider) {
        // 已是 DeepSeek 实例，原地更新配置即可
        this.inner.updateConfig({
          apiKey: cfg.apiKey,
          baseUrl: cfg.apiBase,
          model: cfg.model,
        });
      } else {
        // 从 mock 切到 DeepSeek，新建实例
        this.inner = new DeepseekLlmProvider({
          apiKey: cfg.apiKey,
          baseUrl: cfg.apiBase,
          model: cfg.model,
        });
      }
      this.logger.log(`LLM 提供商已就绪:${cfg.provider},模型=${cfg.model}`);
      return;
    }

    if (!isMockAllowed()) {
      this.inner = this.unavailable;
      this.logger.warn('LLM 未配置且 AGENT_ALLOW_MOCK=false,智能管家不可用');
      return;
    }

    this.inner = new MockLlmProvider();
    this.logger.log('LLM 提供商:mock(模拟)');
  }
}
