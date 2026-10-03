/**
 * 智能管家配置服务。
 *
 * 所属模块：backend/modules/agent
 * 职责：读取并缓存 LLM 配置（provider / apiKey / apiBase / model / language / systemPrompt），
 *  以及 HA 场景 / 脚本语音控制允许清单（layout.agentConfig.sceneVoiceControl，默认全禁）。
 *  读取顺序：数据库 ProjectConfig.layout.agentConfig → .env 回退 → 默认 mock。
 *  监听 SYSTEM_CONFIG_UPDATED 事件自动失效缓存，下次 getConfig 重新读 DB。
 * 依赖：PrismaService（DB）、ConfigService（.env）、EventEmitter2（事件）。
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { isMaskedValue, CONFIG_MASK_PLACEHOLDER } from '../../shared/app-config/config-mask.util';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';

/** LLM 运行配置：包含 provider 与凭证等敏感字段，供 ResolvingLlmProvider 初始化提供商 */
interface AgentLlmConfig {
  /** 提供商名：deepseek / mock */
  provider: string;
  /** API Key，未配置时为空串（仅运行时内部使用，勿经 API 下发） */
  apiKey: string;
  /** API 基地址，如 https://api.deepseek.com */
  apiBase: string;
  /** 模型名，如 deepseek-chat */
  model: string;
  /** 语言代码，zh / en，决定快路径模板与系统提示 */
  language: string;
  /** 用户自定义系统提示，追加到默认 systemPrompt 之后 */
  systemPrompt?: string;
}

/** 对外可安全暴露的 Agent 配置摘要（不含明文 Key） */
interface AgentPublicConfig {
  provider: string;
  apiBase: string;
  model: string;
  language: string;
  systemPrompt?: string;
  /** 是否已配置可用 API Key（DB 明文或 .env） */
  apiKeyConfigured: boolean;
}

/**
 * HA 场景 / 脚本的语音控制允许清单。
 * 默认全禁（fail-closed）：`scene.*` / `script.*` 内部动作无法静态审计，
 * 只有用户在设置里显式启用并逐个勾选实体后，语音 / LLM 链路才允许触发。
 */
interface SceneVoiceControlConfig {
  /** 是否启用场景语音控制总开关 */
  enabled: boolean;
  /** 允许语音触发的实体 ID 白名单（scene.* / script.*） */
  allow: string[];
}

/**
 * Agent 配置服务（@Injectable）。
 * 实现 OnModuleInit，在模块初始化时订阅配置更新事件。
 */
@Injectable()
export class AgentConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentConfigService.name);
  /** 内存缓存，命中则直接返回，避免每次都查 DB */
  private cachedConfig: AgentLlmConfig | null = null;
  /** 场景语音控制允许清单缓存（随配置更新事件失效） */
  private cachedSceneVoiceControl: SceneVoiceControlConfig | null = null;

  /** 稳定引用：供 on/off 对称注销 */
  private readonly onSystemConfigUpdated = () => {
    this.logger.log('检测到配置更新,正在使 Agent 配置缓存失效');
    this.invalidateCache();
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly appConfig: AppConfigService,
  ) {}

  /** 模块初始化：订阅系统配置更新事件，使缓存失效 */
  onModuleInit(): void {
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  /** 强制下次 getConfig 重新读 DB / .env */
  invalidateCache(): void {
    this.cachedConfig = null;
    this.cachedSceneVoiceControl = null;
  }

  /**
   * 获取当前生效的 LLM 配置（带缓存）——内部直读明文 Key。
   * 优先级：DB 配置（含 apiKey）→ .env 配置（含 apiKey）→ 默认 mock。
   * DB 中若存了脱敏占位符则跳过该字段，继续回退 .env，避免鉴权失败。
   */
  async getConfig(): Promise<AgentLlmConfig> {
    return this.getRuntimeConfig();
  }

  /**
   * 运行时明文配置（供 LLM / MCP / 通道内部使用，永不返回给前端）。
   */
  async getRuntimeConfig(): Promise<AgentLlmConfig> {
    if (this.cachedConfig) return this.cachedConfig;

    const db = await this.readFromDb();
    if (db && db.apiKey && !this.isUnconfiguredKey(db.apiKey)) {
      this.logger.log(`使用数据库配置:提供商=${db.provider},模型=${db.model}`);
      this.cachedConfig = db;
      return db;
    }

    const env = this.readFromEnv();
    if (env.apiKey && !this.isUnconfiguredKey(env.apiKey)) {
      this.logger.log(`使用 .env 回退配置:提供商=${env.provider},模型=${env.model}`);
      // DB 有非密钥字段时合并（provider/model 等），密钥用 env
      if (db) {
        this.cachedConfig = {
          provider: db.provider || env.provider,
          apiKey: env.apiKey,
          apiBase: db.apiBase || env.apiBase,
          model: db.model || env.model,
          language: db.language || env.language,
          systemPrompt: db.systemPrompt,
        };
        return this.cachedConfig;
      }
      this.cachedConfig = env;
      return env;
    }

    this.logger.log('未配置 API Key,默认使用 mock 提供商');
    this.cachedConfig = {
      provider: 'mock',
      apiKey: '',
      apiBase: db?.apiBase || '',
      model: db?.model || '',
      language: db?.language || env.language,
      systemPrompt: db?.systemPrompt,
    };
    return this.cachedConfig;
  }

  /**
   * 对外安全摘要：不含明文 apiKey，仅暴露 apiKeyConfigured。
   */
  async getPublicConfig(): Promise<AgentPublicConfig> {
    const cfg = await this.getRuntimeConfig();
    return {
      provider: cfg.provider,
      apiBase: cfg.apiBase,
      model: cfg.model,
      language: cfg.language,
      systemPrompt: cfg.systemPrompt,
      apiKeyConfigured: Boolean(cfg.apiKey && !this.isUnconfiguredKey(cfg.apiKey)),
    };
  }

  /**
   * 当前激活 display profile（与 HA / UI 保存目标一致）。
   */
  private resolveActiveProjectId(): string {
    return String(this.appConfig.get('profiles')?.activeProfileId || '').trim() || 'default';
  }

  /**
   * 读取 MCP 网关专用密钥（明文，仅服务端校验用）。
   */
  async getMcpGatewaySecret(): Promise<string> {
    try {
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      if (!config?.layout) return '';
      const layout = config.layout as { agentConfig?: Record<string, unknown> };
      const agent = layout?.agentConfig;
      const secret = agent?.mcpGatewaySecret;
      if (secret == null || this.isUnconfiguredKey(secret)) return '';
      return String(secret).trim();
    } catch {
      return '';
    }
  }

  /** MCP 网关绑定的 HomeOS 用户 ID（控制类工具走该用户 ACL） */
  async getMcpActorUserId(): Promise<string> {
    try {
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      if (!config?.layout) return '';
      const layout = config.layout as { agentConfig?: Record<string, unknown> };
      const id = layout?.agentConfig?.mcpActorUserId;
      return id == null ? '' : String(id).trim();
    } catch {
      return '';
    }
  }

  /**
   * 读取 HA 场景 / 脚本的语音控制允许清单（layout.agentConfig.sceneVoiceControl）。
   *
   * fail-closed 语义：任何读取失败、字段缺失或格式非法都退化为「未启用 + 空清单」，
   * 由调用方据此拒绝 scene.* / script.* 的语音触发。
   * @returns 允许清单配置（含 enabled 与 allow 数组）
   */
  async getSceneVoiceControl(): Promise<SceneVoiceControlConfig> {
    if (this.cachedSceneVoiceControl) return this.cachedSceneVoiceControl;
    const fallback: SceneVoiceControlConfig = { enabled: false, allow: [] };
    try {
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      const layout = (config?.layout ?? null) as { agentConfig?: Record<string, unknown> } | null;
      const raw = layout?.agentConfig?.sceneVoiceControl as
        | { enabled?: unknown; allow?: unknown }
        | undefined;
      if (!raw || typeof raw !== 'object') {
        this.cachedSceneVoiceControl = fallback;
        return fallback;
      }
      const allow = Array.isArray(raw.allow)
        ? raw.allow
            .map((id) => String(id ?? '').trim())
            .filter((id) => id.startsWith('scene.') || id.startsWith('script.'))
        : [];
      const resolved: SceneVoiceControlConfig = { enabled: raw.enabled === true, allow };
      this.cachedSceneVoiceControl = resolved;
      return resolved;
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      this.logger.warn(`读取场景语音控制配置失败,按全禁处理: ${msg}`);
      return fallback;
    }
  }

  /**
   * 获取当前语言代码。
   * @returns 语言代码，默认 zh
   */
  async getLanguage(): Promise<string> {
    const cfg = await this.getConfig();
    return cfg.language || 'zh';
  }

  /**
   * 判断 apiKey 是否属于“未配置 / 脱敏占位”状态。
   * 命中掩码占位符或被脱敏的值都视为未配置。
   * @param apiKey 待校验的值
   * @returns true 表示未配置
   */
  private isUnconfiguredKey(apiKey: unknown): boolean {
    if (apiKey == null || apiKey === '') return true;
    const key = String(apiKey);
    return key === CONFIG_MASK_PLACEHOLDER || isMaskedValue(key);
  }

  /**
   * 从数据库 ProjectConfig.layout.agentConfig 读取配置。
   * 仅当 apiKey 非空且非脱敏占位符时才返回有效配置，否则返回 null。
   * @returns 配置对象或 null
   */
  private async readFromDb(): Promise<AgentLlmConfig | null> {
    try {
      const config = await this.prisma.projectConfig.findUnique({
        where: { projectId: this.resolveActiveProjectId() },
      });
      if (!config || !config.layout) return null;
      const layout = config.layout as { agentConfig?: Record<string, unknown> };
      const agent = layout?.agentConfig;
      if (!agent || this.isUnconfiguredKey(agent.apiKey)) {
        if (agent && this.isUnconfiguredKey(agent.apiKey) && agent.apiKey) {
          this.logger.warn(
            '数据库 agentConfig.apiKey 为掩码/占位符,视为未配置',
          );
        }
        return null;
      }
      return {
        provider: String(agent.provider || 'deepseek'),
        apiKey: String(agent.apiKey),
        apiBase: String(agent.apiBase || 'https://api.deepseek.com'),
        model: String(agent.model || 'deepseek-v4-flash'),
        language: String(agent.language || 'zh'),
        systemPrompt: agent.systemPrompt ? String(agent.systemPrompt) : undefined,
      };
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      this.logger.warn(`从数据库读取 Agent 配置失败: ${msg}`);
      return null;
    }
  }

  /**
   * 从 .env 环境变量读取回退配置。
   * 读取 LLM_PROVIDER / DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL / LLM_LANG。
   * @returns 环境变量配置对象
   */
  private readFromEnv(): AgentLlmConfig {
    const provider = (this.configService.get<string>('LLM_PROVIDER') || 'mock').toLowerCase();
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY') || '';
    const apiBase =
      this.configService.get<string>('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
    const model = this.configService.get<string>('DEEPSEEK_MODEL') || 'deepseek-chat';
    const language = this.configService.get<string>('LLM_LANG') || 'zh';
    return { provider, apiKey, apiBase, model, language };
  }
}