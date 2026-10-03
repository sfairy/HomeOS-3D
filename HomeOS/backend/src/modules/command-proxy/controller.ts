/**
 * 命令代理 REST 控制器
 *
 * 所属模块：command-proxy
 * 职责：
 *  - 暴露 HA 服务调用入口（services/call），完成后写入命令审计日志。
 *  - HA 连通性探测（ha/test-connection，校验容器内可达性）。
 *  - 实体历史查询（ha/history，限 1~168h、最多 15 个实体）。
 *  - HA 断连丢弃命令的查询与重试（ha/queue/dropped、ha/queue/retry）。
 *  - WebRTC 信令代理（client-config / ice-servers / negotiate / candidate / close）。
 *  - HA 媒体代理：图像代理（media-proxy）、流代理（stream-proxy，含 m3u8 重写）。
 *  - 各端点通过 authorization.util 做 role/白名单/儿童模式 ACL 校验。
 *
 * 关键依赖：CommandProxyService、CommandProxyAuditService、HaWebrtcSignalService、
 *           HaConnectorService、StateStoreService、ChildModeService、PrismaService。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { badRequest } from '../../common/utils/business-exception';
import { parseIntParam } from '../../common/crud/pagination.util';
import { CommandProxyService } from './service';
import { CommandProxyAuditService } from './audit.service';
import {
  CallServiceDto,
  WebRtcNegotiateDto,
  WebRtcCandidateDto,
  WebRtcCloseDto,
  HaTestConnectionDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { PrismaService } from '../../shared/prisma/service';
import { describeHaUrlForDeployError } from '../../shared/ha/rest-fetch.util';
import { ChildModeService } from '../child-mode/service';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  isHaM3u8Path,
  resolveHaMediaProxyCacheControl,
  rewriteHaM3u8ForProxy,
  validateHaStreamPath,
} from '../../shared/ha/media-path.util';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  assertCommandProxyAuthorized,
  assertWebRtcAuthorized,
  assertHaMediaPathAuthorized,
  assertHistoryAuthorized,
  type CommandProxyAuthUser,
} from './authorization.util';
import { HaConnectorService } from '../ha-connector/service';
import { HaWebrtcSignalService } from '../ha-connector/ha-webrtc-signal.service';
import { StateStoreService } from '../state-store/service';

type AuthRequest = Request & {
  user?: CommandProxyAuthUser & { userId?: string; username?: string };
};

@ApiTags('connect')
@ApiBearerAuth()
@Controller()
/**
 * 命令代理控制器（DI 角色：Controller）。
 * 各端点统一走 authorization.util 做 role / 白名单 / 儿童模式 ACL；HA 不可达时
 * 高风险控制被拦截，写入审计日志（成功/失败均记录）。
 */
export class CommandProxyController {
  private readonly logger = new Logger(CommandProxyController.name);

  constructor(
    private readonly commandProxy: CommandProxyService,
    private readonly prisma: PrismaService,
    private readonly childMode: ChildModeService,
    private readonly commandAudit: CommandProxyAuditService,
    private readonly haWebrtc: HaWebrtcSignalService,
    private readonly haConnector: HaConnectorService,
    private readonly stateStore: StateStoreService,
  ) {}

  private commandProxyTargetResolver() {
    return {
      getRegistry: () => this.haConnector.fetchEntityRegistry(),
      findEntityIds: (predicate: (attrs: Record<string, unknown>) => boolean) =>
        this.stateStore.scanEntities((e) => predicate(e.attributes ?? {})),
    };
  }

  @ApiOperation({ summary: '调用 HA 服务' })
  @Roles('admin', 'adult', 'child')
  @Post('services/call')
  /**
   * 调用 HA 服务：先做 ACL 校验（role/白名单/儿童模式 + 间接目标解析），
   * 执行成功/失败均写入命令审计日志，失败时原错误向上抛出。
   */
  async callService(@Body() dto: CallServiceDto, @Req() req: AuthRequest) {
    await assertCommandProxyAuthorized(
      dto,
      req.user,
      this.childMode,
      this.commandProxyTargetResolver(),
    );
    try {
      const result = await this.commandProxy.callService(dto);
      this.commandAudit.logCommandAudit(req.user, dto, true);
      return result;
    } catch (err) {
      this.commandAudit.logCommandAudit(req.user, dto, false, (err as Error).message);
      throw err;
    }
  }

  @ApiOperation({ summary: '查询命令审计日志' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('audit/commands')
  async getCommandAudit(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
    @Query('page') page?: string,
    @Query('entityId') entityId?: string,
    @Query('username') username?: string,
  ) {
    return this.commandAudit.listCommandAudit({ limit, skip, page, entityId, username });
  }

  @ApiOperation({ summary: '清除命令审计日志（admin）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('audit/commands')
  async clearCommandAudit(
    @Query('entityId') entityId?: string,
    @Query('username') username?: string,
  ) {
    return this.commandAudit.clearCommandAudit(entityId, username);
  }

  @ApiOperation({ summary: '探测 HA 连接（从服务端发起，校验容器内可达性）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('ha/test-connection')
  async testHaConnection(@Body() body: HaTestConnectionDto) {
    const url = body.url.trim();
    // 诊断型接口：地址校验问题以 { ok:false, message } 返回，而非抛 400。
    // 否则前端只能拿到通用错误，会把「地址不合法」误报成「连接失败」。
    const urlError = describeHaUrlForDeployError(url);
    if (urlError) {
      return { ok: false, message: urlError };
    }
    return this.commandProxy.testHaConnection(url, body.token.trim());
  }

  @ApiOperation({ summary: '获取实体历史数据' })
  @UseGuards(JwtAuthGuard)
  @Get('ha/history')
  /**
   * 查询 HA 实体历史：entity_ids 逗号分隔，限最多 15 个；hours 限 1~168h（默认 24）。
   * 越界返回 PROXY_ENTITY_IDS_MAX / PROXY_HOURS_RANGE 业务异常。
   */
  async getHistory(
    @Query('entity_ids') entityIds: string,
    @Query('hours') hours: string,
    @Req() req: AuthRequest,
  ) {
    if (!entityIds) {
      badRequest(API_ERROR.PROXY_ENTITY_IDS_REQUIRED);
    }
    const ids = entityIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length > 15) {
      badRequest(API_ERROR.PROXY_ENTITY_IDS_MAX);
    }
    assertHistoryAuthorized(ids, req.user, this.childMode);
    const h = parseIntParam(hours, 24);
    if (!Number.isFinite(h) || h < 1 || h > 168) {
      badRequest(API_ERROR.PROXY_HOURS_RANGE);
    }
    return this.commandProxy.fetchHistory(ids, h);
  }

  @ApiOperation({ summary: '最近丢弃的 HA 控制指令（可重试）' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult', 'child')
  @Get('ha/queue/dropped')
  getDroppedHaCommands() {
    return { dropped: this.haConnector.getDroppedCommands() };
  }

  @ApiOperation({ summary: '重试最近丢弃的 HA 控制指令' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'adult', 'child')
  @Post('ha/queue/retry')
  async retryDroppedHaCommands() {
    return this.haConnector.retryDroppedCommands();
  }

  @ApiOperation({ summary: '获取 HA WebRTC 客户端配置（ICE 等）' })
  @UseGuards(JwtAuthGuard)
  @Get('ha/webrtc/client-config')
  async webrtcClientConfig(@Query('entity_id') entityId: string, @Req() req: AuthRequest) {
    if (!entityId?.trim()) {
      badRequest(API_ERROR.PROXY_ENTITY_ID_REQUIRED);
    }
    assertWebRtcAuthorized(entityId.trim(), req.user, this.childMode);
    return this.haWebrtc.getClientConfig(entityId.trim());
  }

  @ApiOperation({ summary: '获取合并后的 WebRTC ICE/TURN 列表（go2rtc 等）' })
  @UseGuards(JwtAuthGuard)
  @Get('ha/webrtc/ice-servers')
  async webrtcIceServers() {
    return { iceServers: this.haWebrtc.getMergedIceServers() };
  }

  @ApiOperation({ summary: 'WebRTC SDP 协商（经 HomeOS 转发至 HA）' })
  @Roles('admin', 'adult', 'child')
  @Post('ha/webrtc/negotiate')
  async webrtcNegotiate(@Body() body: WebRtcNegotiateDto, @Req() req: AuthRequest) {
    assertWebRtcAuthorized(body.entity_id.trim(), req.user, this.childMode);
    return this.haWebrtc.negotiateOffer(body.entity_id.trim(), body.offer.trim());
  }

  @ApiOperation({ summary: '上报 WebRTC ICE candidate' })
  @Roles('admin', 'adult', 'child')
  @Post('ha/webrtc/candidate')
  async webrtcCandidate(@Body() body: WebRtcCandidateDto, @Req() req: AuthRequest) {
    assertWebRtcAuthorized(body.entity_id.trim(), req.user, this.childMode);
    await this.haWebrtc.addCandidate(body.entity_id.trim(), body.session_id.trim(), body.candidate);
    return { ok: true };
  }

  @ApiOperation({ summary: '关闭 WebRTC 会话（取消 HA 订阅）' })
  @Roles('admin', 'adult', 'child')
  @Post('ha/webrtc/close')
  async webrtcClose(@Body() body: WebRtcCloseDto, @Req() req: AuthRequest) {
    assertWebRtcAuthorized(body.entity_id.trim(), req.user, this.childMode);
    await this.haWebrtc.closeSession(Number(body.subscription_id));
    return { ok: true };
  }

  @ApiOperation({ summary: '获取 HA 摄像头 HLS 播放列表路径（camera/stream）' })
  @UseGuards(JwtAuthGuard)
  @Get('ha/camera-hls')
  async cameraHls(@Query('entity_id') entityId: string, @Req() req: AuthRequest) {
    if (!entityId?.trim()) {
      badRequest(API_ERROR.PROXY_ENTITY_ID_REQUIRED);
    }
    assertWebRtcAuthorized(entityId.trim(), req.user, this.childMode);
    return this.haWebrtc.getHlsStreamPath(entityId.trim());
  }

  @ApiOperation({ summary: '代理 HA 媒体图像' })
  @UseGuards(JwtAuthGuard)
  @Get('ha/media-proxy')
  async proxyMedia(@Query('path') path: string, @Req() req: AuthRequest, @Res() res: Response) {
    if (!path) {
      badRequest(API_ERROR.PROXY_PATH_REQUIRED);
    }
    assertHaMediaPathAuthorized(path, req.user, this.childMode);
    try {
      const { data, contentType } = await this.commandProxy.fetchMediaImage(path);
      res.set('Content-Type', contentType);
      res.set('Cache-Control', resolveHaMediaProxyCacheControl(path));
      res.send(data);
    } catch {
      res.status(502).send('网关错误：无法从 HA 获取图像');
    }
  }

  @ApiOperation({ summary: '流式代理 HA 媒体（MJPEG / HLS）' })
  @UseGuards(JwtAuthGuard)
  @Get('ha/stream-proxy')
  /**
   * 流式代理 HA 媒体：m3u8 播放列表需重写内部 URL 指向本代理（rewriteHaM3u8ForProxy）；
   * 其余流走 Node Readable 管道转发，禁用 X-Accel-Buffering 与缓存，客户端断连即销毁上游流。
   */
  async proxyStream(@Query('path') path: string, @Req() req: AuthRequest, @Res() res: Response) {
    if (!path) {
      badRequest(API_ERROR.PROXY_PATH_REQUIRED);
    }
    assertHaMediaPathAuthorized(path, req.user, this.childMode);
    try {
      const upstream = await this.commandProxy.openMediaStream(path);
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

      if (isHaM3u8Path(path, contentType)) {
        const text = await upstream.text();
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'no-cache');
        res.send(rewriteHaM3u8ForProxy(text, validateHaStreamPath(path)));
        return;
      }

      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'no-cache, no-store');
      res.set('X-Accel-Buffering', 'no');

      if (!upstream.body) {
        res.status(502).send('无法读取 HA 媒体流');
        return;
      }

      const nodeStream = Readable.fromWeb(
        upstream.body as unknown as import('stream/web').ReadableStream<Uint8Array>,
      );
      const onClose = () => {
        nodeStream.destroy();
      };
      req.on('close', onClose);
      res.on('close', onClose);
      try {
        await pipeline(nodeStream, res);
      } finally {
        req.off('close', onClose);
        res.off('close', onClose);
      }
    } catch {
      if (!res.headersSent) {
        res.status(502).send('网关错误：无法从 HA 获取媒体流');
      }
    }
  }
}
