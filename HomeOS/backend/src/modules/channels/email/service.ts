/**
 * @file email.service.ts
 * @module ChannelsModule
 *
 * Email 通道适配服务：实现 ChannelProvider 接口，
 * 负责通过 SMTP 发送邮件通知。
 *
 * 支持标准 SMTP 协议，支持 TLS 加密。
 */
import { getErrorMessage } from '../../../common/utils';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as nodemailer from 'nodemailer';

/** 转义 HTML 特殊字符，防邮件正文注入（正文可能含 HA 实体 friendly_name） */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
import { ChannelConfigService } from '../channel-config.service';
import type { ChannelMessage, ChannelProvider } from '../channel-provider.interface';
import { HOMEOS_EVENTS } from '../../../shared/homeos-events';

/**
 * Email 通道服务（可注入）。
 *
 * 实现 ChannelProvider 接口，由 ChannelsService 调度。
 * 内部维护 SMTP 配置与 transporter 实例，
 * 通过 reload() 在配置变更时重新初始化（含 SYSTEM_CONFIG_UPDATED 热重载）。
 */
@Injectable()
export class EmailService implements ChannelProvider, OnModuleInit, OnModuleDestroy {
  /** 通道名称，对应 ChannelKind */
  readonly name = 'email';
  private readonly logger = new Logger(EmailService.name);
  /** SMTP 传输器实例 */
  private transporter: nodemailer.Transporter | null = null;
  /** 是否启用 */
  private enabled = false;
  /** 发件人地址 */
  private fromAddress = '';
  /** 收件人地址列表 */
  private toAddresses: string[] = [];
  /** 消息处理回调，由 ChannelsService 注册 */
  private messageHandler?: (msg: ChannelMessage) => void | Promise<void>;

  /** 稳定引用：配置变更时热重载 SMTP */
  private readonly onSystemConfigUpdated = async () => {
    this.logger.log('检测到配置更新,正在热重载 Email 通道...');
    this.channelConfigService.invalidateCache();
    await this.reload();
  };

  constructor(
    private readonly channelConfigService: ChannelConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 模块初始化：注册热重载并执行首次配置加载。
   */
  async onModuleInit(): Promise<void> {
    this.eventEmitter.on(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
    await this.reload();
  }

  onModuleDestroy(): void {
    this.eventEmitter.off(HOMEOS_EVENTS.SYSTEM_CONFIG_UPDATED, this.onSystemConfigUpdated);
  }

  /**
   * 重新加载 Email 通道配置并初始化 transporter。
   */
  async reload(): Promise<void> {
    const cfg = await this.channelConfigService.getEmailConfig();
    this.enabled = cfg?.enabled ?? false;

    if (!this.enabled || !cfg?.smtpHost || !cfg?.smtpUser || !cfg?.smtpPassword) {
      this.logger.warn('Email 通道配置不完整或已禁用');
      this.transporter = null;
      this.fromAddress = '';
      this.toAddresses = [];
      return;
    }

    this.fromAddress = cfg.fromAddress || cfg.smtpUser;
    this.toAddresses = (cfg.toAddresses || '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    if (this.toAddresses.length === 0) {
      this.logger.warn('Email 收件人列表为空');
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: cfg.smtpHost,
        port: cfg.smtpPort || 587,
        secure: cfg.tlsEnabled ?? true,
        auth: {
          user: cfg.smtpUser,
          pass: cfg.smtpPassword,
        },
      });

      // 测试连接
      await this.transporter.verify();
      this.logger.log('Email 通道已热重载');
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.error(`Email 通道初始化失败: ${msg}`);
      this.transporter = null;
    }
  }

  /**
   * 查询通道运行状态（供 /channels/status 接口使用）。
   */
  async getStatus(): Promise<{
    enabled: boolean;
    configured: boolean;
    fromAddress: string;
    toAddressCount: number;
    error?: string;
  }> {
    if (!this.enabled) {
      return {
        enabled: false,
        configured: false,
        fromAddress: '',
        toAddressCount: 0,
      };
    }

    try {
      if (this.transporter) {
        await this.transporter.verify();
        return {
          enabled: true,
          configured: true,
          fromAddress: this.fromAddress,
          toAddressCount: this.toAddresses.length,
        };
      }
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      return {
        enabled: true,
        configured: false,
        fromAddress: this.fromAddress,
        toAddressCount: this.toAddresses.length,
        error: msg,
      };
    }

    return {
      enabled: true,
      configured: false,
      fromAddress: this.fromAddress,
      toAddressCount: this.toAddresses.length,
    };
  }

  /**
   * 注册消息处理回调。
   * Email 通道不接收用户消息（单向通知），此方法为空实现。
   */
  onMessage(handler: (msg: ChannelMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * 发送邮件通知。
   * @param to 目标邮箱地址（若为空则使用配置中的收件人列表）
   * @param text 邮件正文内容
   */
  async sendText(to: string | number, text: string, subject?: string): Promise<void> {
    if (!this.enabled || !this.transporter) {
      this.logger.warn('Email 通道未启用或未配置');
      return;
    }

    const recipients = typeof to === 'string' && to.trim()
      ? [to.trim()]
      : this.toAddresses;

    if (recipients.length === 0) {
      this.logger.warn('无收件人地址');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: recipients,
        // 标题可由调用方定制（告警规则自定义标题）；缺省回退系统默认主题
        subject: String(subject ?? '').trim() || 'HomeOS 通知',
        text: text,
        // 转义 HTML：text 可来自 HA 实体 friendly_name，防止注入 <script> 等标签
        html: `<pre>${escapeHtml(text)}</pre>`,
      });
      this.logger.log(`已向 ${recipients.length} 个收件人发送邮件通知`);
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      this.logger.error(`发送邮件失败: ${msg}`);
    }
  }
}
