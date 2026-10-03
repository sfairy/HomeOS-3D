/**
 * 昼夜节律 / 自适应温控 / 语音 / 影音场景 控制器
 *
 * 模块：system/lifestyle
 * 职责：
 *  - 从原 SystemController 拆出，路由前缀 system/（保持向后兼容）
 *  - 昼夜节律照明（circadian）：状态 / 应用 / 启停 / 各房间状态
 *  - 自适应温控（adaptive-climate）：推荐 / override 学习记录 / 应用
 *  - 语音（voice）：STT 状态 / 转写 / 对话 / 元信息 / 预设 / 执行 / TTS 播报
 *  - 影音场景（media-scene）：预设列表 / 应用 / 播放列表 / 多房间同步
 *
 * 鉴权：JwtAuthGuard 通用；admin 专属接口叠加 RolesGuard + @Roles('admin')。
 */
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { CircadianLightingService } from '../../environment/circadian-lighting.service';
import { AdaptiveClimateService } from '../../environment/adaptive-climate.service';
import { MediaSceneService } from './media-scene.service';
import {
  CircadianApplyDto,
  AdaptiveClimateApplyDto,
  VoiceTranscribeDto,
  VoiceTextDto,
  VoiceSpeakDto,
  VoiceSpeakMultipleDto,
  MediaSceneApplyDto,
  MediaPlaylistStartDto,
  MediaPlayerRefDto,
  MediaGroupPlayersDto,
} from '../dto/lifestyle.dto';
import { VoiceService } from '../../awareness/voice.service';

/**
 * 昼夜节律 / 自适应温控 / 语音 / 影音场景 控制器（从 SystemController 拆出）
 *
 * 注入的 4 个 Service 由各自模块 / SystemLifestyleModule 提供。
 */
@ApiTags('orchestrate')
@ApiBearerAuth()
@Controller('system')
export class SystemLifestyleController {
  /**
   * @param circadian       昼夜节律照明服务
   * @param adaptiveClimate 自适应温控服务
   * @param mediaScene      影音场景服务
   * @param voice           语音服务
   */
  constructor(
    private readonly circadian: CircadianLightingService,
    private readonly adaptiveClimate: AdaptiveClimateService,
    private readonly mediaScene: MediaSceneService,
    private readonly voice: VoiceService,
  ) {}

  /** 获取昼夜节律照明状态 */
  @UseGuards(JwtAuthGuard)
  @Get('lighting/circadian/status')
  circadianStatus() {
    return this.circadian.getStatus();
  }

  /** 应用昼夜节律照明到指定灯（admin） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('lighting/circadian/apply')
  circadianApply(@Body() body: CircadianApplyDto) {
    return this.circadian.apply(body?.lights);
  }

  /** 启用昼夜节律照明（admin） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('lighting/circadian/enable')
  async circadianEnable() {
    return this.circadian.enable();
  }

  /** 停用昼夜节律照明（admin） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('lighting/circadian/disable')
  circadianDisable() {
    return this.circadian.disable();
  }

  /** 获取自适应温控推荐方案 */
  @UseGuards(JwtAuthGuard)
  @Get('climate/adaptive/recommend')
  adaptiveClimateRecommend() {
    return this.adaptiveClimate.recommend();
  }

  @ApiOperation({ summary: '获取自适应温控用户 override 学习记录' })
  @UseGuards(JwtAuthGuard)
  @Get('climate/adaptive/overrides')
  adaptiveClimateOverrides() {
    return this.adaptiveClimate.listOverrides();
  }

  @ApiOperation({ summary: '获取昼夜节律各房间状态' })
  @UseGuards(JwtAuthGuard)
  @Get('lighting/circadian/rooms')
  circadianRooms() {
    return this.circadian.getRoomStatus();
  }

  /** 应用自适应温控方案到指定实体（admin） */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('climate/adaptive/apply')
  adaptiveClimateApply(@Body() body: AdaptiveClimateApplyDto) {
    return this.adaptiveClimate.apply(body?.entityIds);
  }
  @ApiOperation({ summary: '语音识别状态与 HA STT 实体' })
  @UseGuards(JwtAuthGuard)
  @Get('voice/stt-status')
  async getVoiceSttStatus() {
    // 返回 STT 状态 + 可用 provider 列表 + 自动探测到的 STT 实体
    const providers = await this.voice.listSttProviders();
    const detected = await this.voice.autoDetectSttEntity();
    return { ...this.voice.getSttStatus(), providers, detectedEntityId: detected };
  }

  @ApiOperation({ summary: 'HA 语音转文字（Whisper/Cloud STT）' })
  @Roles('admin', 'adult', 'child')
  @Post('voice/transcribe')
  async transcribeVoice(@Body() body: VoiceTranscribeDto) {
    return this.voice.transcribe(body.audio || '', body.format || 'webm');
  }

  @ApiOperation({ summary: 'HA Assistant 对话处理（可选 NLU）' })
  @Roles('admin', 'adult', 'child')
  @Post('voice/conversation')
  processVoiceConversation(@Body() body: VoiceTextDto) {
    return this.voice.processConversation(body.text || '');
  }

  @ApiOperation({ summary: '语音模块元信息（房间、STT/TTS、命令数）' })
  @UseGuards(JwtAuthGuard)
  @Get('voice/meta')
  getVoiceMeta() {
    return this.voice.getVoiceMeta();
  }

  @ApiOperation({ summary: '全屋智能默认语音命令模板' })
  @UseGuards(JwtAuthGuard)
  @Get('voice/presets')
  getVoicePresets() {
    return { presets: this.voice.getCommandPresets() };
  }

  @ApiOperation({ summary: '执行语音指令（全屋/分房间 + HA Assistant）' })
  @Roles('admin', 'adult', 'child')
  @Post('voice/execute')
  executeVoiceCommand(
    @Body() body: VoiceTextDto,
    @Req() req: { user?: { role?: string; restrictions?: string[] } },
  ) {
    // 传入用户角色 / 限制，由 voice 服务按权限路由到不同执行链路
    return this.voice.executeCommand(body.text || '', req.user);
  }

  @ApiOperation({ summary: 'TTS 语音播报（统一后端链路）' })
  @Roles('admin', 'adult')
  @Post('voice/speak')
  speakVoice(@Body() body: VoiceSpeakDto) {
    return this.voice.speak(body.message || '', body.mediaPlayer);
  }

  @ApiOperation({ summary: 'TTS 语音播报到多个音箱' })
  @Roles('admin', 'adult')
  @Post('voice/speak-multiple')
  speakVoiceMultiple(@Body() body: VoiceSpeakMultipleDto) {
    return this.voice.speakMultiple(body.message || '', body.mediaPlayers);
  }

  @ApiOperation({ summary: '获取影音场景预设列表' })
  @UseGuards(JwtAuthGuard)
  @Get('media/scene/presets')
  listMediaScenePresets() {
    return { presets: this.mediaScene.listPresets() };
  }

  @ApiOperation({ summary: '应用影音场景预设' })
  @Roles('admin', 'adult')
  @Post('media/scene')
  applyMediaScene(@Body() body: MediaSceneApplyDto) {
    return this.mediaScene.applyScene(body.preset, {
      mediaPlayers: body.mediaPlayers,
      lights: body.lights,
    });
  }

  @ApiOperation({ summary: '开始播放列表' })
  @Roles('admin', 'adult')
  @Post('media/playlist/start')
  startPlaylist(@Body() body: MediaPlaylistStartDto) {
    return this.mediaScene.startPlaylist(body.player, body.items);
  }

  /** 切换到下一首（admin / adult） */
  @Roles('admin', 'adult')
  @Post('media/playlist/next')
  nextTrack(@Body() body: MediaPlayerRefDto) {
    return this.mediaScene.next(body.player);
  }

  /** 获取指定播放器的当前播放列表 */
  @UseGuards(JwtAuthGuard)
  @Get('media/playlist')
  getPlaylist(@Query('player') player: string) {
    return this.mediaScene.getPlaylist(player);
  }

  @ApiOperation({ summary: '多房间媒体同步播放' })
  @Roles('admin', 'adult')
  @Post('media/group/sync')
  mediaGroupSync(@Body() body: MediaGroupPlayersDto) {
    return this.mediaScene.groupSync(body.players);
  }

  /** 解除多房间同步（admin / adult） */
  @Roles('admin', 'adult')
  @Post('media/group/unjoin')
  mediaGroupUnjoin(@Body() body: MediaGroupPlayersDto) {
    return this.mediaScene.unjoin(body.players);
  }
}