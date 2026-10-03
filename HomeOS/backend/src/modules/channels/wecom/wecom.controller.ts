/**
 * @file wecom.controller.ts
 * @module ChannelsModule
 *
 * 企业微信回调控制器：URL 验证（GET）与加密消息回调（POST）。
 * 路由：/api/v1/channels/wecom/callback
 *
 * 职责：
 * - GET /callback：企微首次配置回调时回传 echostr，校验签名并解密后原样回显
 * - POST /callback：接收企微用户消息，校验签名 + AES 解密 + 解析 XML 后委托 WecomService 处理
 *
 * 依赖：WecomService（提供 token/aesKey 与消息分发）、wecom.crypto（签名计算与解密）、
 *       fast-xml-parser（XML 解析）、@Public（回调接口免 JWT 鉴权）
 */
import { getErrorMessage } from '../../../common/utils';
import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { Public } from '../../auth/public.decorator';
import { WecomService } from './wecom.service';
import { computeMsgSignature, decryptWecom } from './wecom.crypto';

/** 恒定时间比较企微签名；长度不等直接判不匹配（timingSafeEqual 要求等长 Buffer） */
function safeEqualSignature(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@ApiTags('channels')
@Controller('channels/wecom')
/**
 * WecomController：Nest @Controller REST 控制器。
 * - 处理路由前缀下的端点（HTTP 方法 + 路径 + DTO 校验）；
 * - 鉴权：默认 JwtAuthGuard + 角色守卫（@Roles 装饰器按方法细化）；
 * - 主要调用：同域 Service + 跨域编排工具；
 * @class WecomController
 */
export class WecomController {
  private readonly logger = new Logger(WecomController.name);
  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    processEntities: false,
  });

  constructor(private readonly wecomService: WecomService) {}

  /**
   * 企微 URL 验证（GET）：校验 msg_signature 后用 aesKey 解密 echostr 并回显明文。
   * @remarks 配置缺失返回 500，签名失败返回 403，解密失败返回 500。
   */
  @Public()
  @Get('callback')
  @ApiOperation({ summary: '企业微信 URL 验证' })
  async verifyUrl(
    @Query('msg_signature') msgSignature: string,
    @Query('timestamp') timestamp: string,
    @Query('nonce') nonce: string,
    @Query('echostr') echostr: string,
    @Res() res: Response,
  ) {
    const { token, aesKey } = this.wecomService.getSecurityConfig();
    if (!token || !aesKey) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('配置缺失');
    }
    const localSignature = computeMsgSignature({
      token,
      timestamp,
      nonce,
      encrypt: echostr,
    });
    if (!safeEqualSignature(localSignature, msgSignature)) {
      this.logger.warn('企微 URL 验证签名失败');
      return res.status(HttpStatus.FORBIDDEN).send('禁止访问');
    }
    try {
      const { msg } = decryptWecom({ aesKey, cipherTextBase64: echostr });
      return res.status(HttpStatus.OK).send(msg);
    } catch (error: unknown) {
      const m = getErrorMessage(error);
      this.logger.error(`解密 echostr 失败: ${m}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('解密失败');
    }
  }

  /**
   * 企微消息回调（POST）：校验签名 → AES 解密 → 解析 XML → 委托 WecomService 处理文本消息。
   * @remarks 无论如何都先回 `success` 给企微（避免企微重试），消息处理异步进行。
   *          仅 MsgType=text 的消息会转发到 Agent；其余类型仅记日志。
   */
  @Public()
  @Post('callback')
  @ApiOperation({ summary: '企业微信消息回调' })
  async handleCallback(
    @Query('msg_signature') msgSignature: string,
    @Query('timestamp') timestamp: string,
    @Query('nonce') nonce: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { token, aesKey } = this.wecomService.getSecurityConfig();
    if (!token || !aesKey) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('配置缺失');
    }
    try {
      const rawBody = await this.getRawBody(req);
      if (!rawBody) {
        return res.status(HttpStatus.BAD_REQUEST).send('请求无效');
      }
      const parsedXml = this.xmlParser.parse(rawBody);
      const root = parsedXml?.xml ?? parsedXml;
      const encrypt = root?.Encrypt;
      if (!encrypt) {
        return res.status(HttpStatus.BAD_REQUEST).send('无效的 XML');
      }
      const localSignature = computeMsgSignature({
        token,
        timestamp,
        nonce,
        encrypt: String(encrypt),
      });
      if (!safeEqualSignature(localSignature, msgSignature)) {
        return res.status(HttpStatus.FORBIDDEN).send('禁止访问');
      }
      const { msg: decryptedXml } = decryptWecom({
        aesKey,
        cipherTextBase64: String(encrypt),
      });
      const innerXml = this.xmlParser.parse(decryptedXml);
      const innerRoot = innerXml?.xml ?? innerXml;
      const fromUser = innerRoot?.FromUserName;
      const content = innerRoot?.Content;
      const msgType = innerRoot?.MsgType;
      if (msgType === 'text' && fromUser && content) {
        this.wecomService.handleIncomingMessage(String(fromUser), String(content)).catch((err) => {
          this.logger.error(
            `异步处理企微消息失败: ${getErrorMessage(err)}`,
          );
        });
      }
      return res.status(HttpStatus.OK).send('success');
    } catch (error: unknown) {
      const m = getErrorMessage(error);
      this.logger.error(`处理企微 POST 回调失败: ${m}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('内部错误');
    }
  }

  /**
   * 提取原始请求体字符串。
   * @remarks 优先读取 Nest rawBody 中间件挂载的 Buffer，回退到 string/Buffer 形式的 body。
   *          企微回调为 XML，必须绕过 body-parser 的 JSON 解析，直接取原始文本。
   */
  private getRawBody(req: Request): Promise<string> {
    const existing = (req as Request & { rawBody?: Buffer | string }).rawBody;
    if (existing) {
      return Promise.resolve(typeof existing === 'string' ? existing : existing.toString('utf8'));
    }
    if (typeof req.body === 'string') return Promise.resolve(req.body);
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
    return Promise.resolve('');
  }
}
