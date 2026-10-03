/**
 * 语言模板服务（热更新）。
 *
 * 所属模块：backend/modules/agent
 * 职责：根据 AgentConfigService 当前语言（zh / en）选择对应的 LangTemplate，
 *  并在 SYSTEM_CONFIG_UPDATED 事件后自动刷新，使快路径正则、纠正口令、系统提示随配置切换。
 * 依赖：AgentConfigService（取 language）、EventEmitter2（监听配置变更）、lang-templates（模板源）。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { AgentConfigService } from './config.service';
import { getLangTemplate, type LangTemplate } from './lang-templates';

/** 语言模板热更新：配置变更后快路径 / 纠正口令 / 系统提示同步切换 */
@Injectable()
export class LangTemplateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangTemplateService.name);
  /** 当前生效的语言模板，默认 zh */
  private template: LangTemplate = getLangTemplate('zh');

  /** 稳定引用：供 on/off 对称注销 */
  private readonly onSystemConfigUpdated = () => {
    void this.refresh();
  };

  constructor(
    private readonly agentConfig: AgentConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** 模块初始化：先刷新一次，再订阅配置变更事件 */
  onModuleInit(): void {
    void this.refresh();
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  /** 获取当前生效的语言模板（含正则、口令、系统提示） */
  get current(): LangTemplate {
    return this.template;
  }

  /**
   * 重新读取语言并刷新模板。
   * 调用场景：模块初始化、SYSTEM_CONFIG_UPDATED 事件。
   */
  async refresh(): Promise<void> {
    const lang = await this.agentConfig.getLanguage();
    this.template = getLangTemplate(lang);
    this.logger.log(`Agent 语言模板已就绪:${lang}`);
  }
}