/**
 * 生活方式相关请求 DTO
 *
 * 职责：定义昼夜节律光照、自适应气候、语音转写/播报、媒体场景与播放列表等
 *  生活方式接口的请求体校验结构（均配合 class-validator 进行入参校验）。
 * 依赖：class-validator（装饰器校验）、class-transformer（嵌套类型转换）。
 */
import { IsString, IsOptional, IsArray, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 媒体场景预设：电影 / 音乐 / 游戏 / 派对 / 睡眠 / 早晨 */
const MEDIA_SCENE_PRESETS = ['movie', 'music', 'gaming', 'party', 'sleep', 'morning'] as const;



/**
 * 语音转写请求体。
 * audio 为音频数据，format 指定音频格式（如 wav/mp3）。
 */
export class VoiceTranscribeDto {
  /** 音频数据（可选） */
  @IsOptional()
  @IsString({ message: 'audio 须为字符串' })
  audio?: string;

  /** 音频格式标识（可选） */
  @IsOptional()
  @IsString({ message: 'format 须为字符串' })
  format?: string;
}

/**
 * 语音识别文本请求体（用于直接提交已转写文本做意图解析）。
 */
export class VoiceTextDto {
  /** 待解析的语音文本（可选） */
  @IsOptional()
  @IsString({ message: 'text 须为字符串' })
  text?: string;
}

/**
 * 单个媒体播放器语音播报请求体。
 */
export class VoiceSpeakDto {
  /** 待播报的文本消息（可选） */
  @IsOptional()
  @IsString({ message: 'message 须为字符串' })
  message?: string;

  /** 目标媒体播放器实体 ID（可选） */
  @IsOptional()
  @IsString({ message: 'mediaPlayer 须为字符串' })
  mediaPlayer?: string;
}

/**
 * 多个媒体播放器语音播报请求体。
 * message 为播报内容，mediaPlayers 为目标播放器列表。
 */
export class VoiceSpeakMultipleDto {
  /** 待播报的文本消息（可选） */
  @IsOptional()
  @IsString({ message: 'message 须为字符串' })
  message?: string;

  /** 目标媒体播放器实体 ID 列表（可选） */
  @IsOptional()
  @IsArray({ message: 'mediaPlayers 须为数组' })
  @IsString({ each: true, message: 'mediaPlayers 每项须为字符串' })
  mediaPlayers?: string[];
}

/**
 * 媒体场景应用请求体。
 * preset 指定场景预设，可选附加播放器与灯光列表。
 */
export class MediaSceneApplyDto {
  /** 媒体场景预设（必须为 MEDIA_SCENE_PRESETS 之一） */
  @IsIn(MEDIA_SCENE_PRESETS, { message: 'preset 无效' })
  preset!: (typeof MEDIA_SCENE_PRESETS)[number];

  /** 参与场景的媒体播放器列表（可选） */
  @IsOptional()
  @IsArray({ message: 'mediaPlayers 须为数组' })
  @IsString({ each: true, message: 'mediaPlayers 每项须为字符串' })
  mediaPlayers?: string[];

  /** 参与场景的灯光列表（可选） */
  @IsOptional()
  @IsArray({ message: 'lights 须为数组' })
  @IsString({ each: true, message: 'lights 每项须为字符串' })
  lights?: string[];
}

/**
 * 媒体播放列表单条条目。
 */
class MediaPlaylistItemDto {
  /** 媒体内容 ID（如歌曲 URL 或标识） */
  @IsString({ message: 'mediaContentId 须为字符串' })
  mediaContentId!: string;

  /** 媒体内容类型（如 music/mp3） */
  @IsString({ message: 'mediaContentType 须为字符串' })
  mediaContentType!: string;

  /** 条目标题（可选） */
  @IsOptional()
  @IsString({ message: 'title 须为字符串' })
  title?: string;
}

/**
 * 媒体播放列表启动请求体。
 * player 指定播放器，items 为待播放的条目列表（嵌套校验）。
 */
export class MediaPlaylistStartDto {
  /** 目标媒体播放器实体 ID */
  @IsString({ message: 'player 须为字符串' })
  player!: string;

  /** 播放列表条目（每项按 MediaPlaylistItemDto 校验） */
  @IsArray({ message: 'items 须为数组' })
  @ValidateNested({ each: true })
  @Type(() => MediaPlaylistItemDto)
  items!: MediaPlaylistItemDto[];
}

/**
 * 单个媒体播放器引用请求体。
 */
export class MediaPlayerRefDto {
  /** 目标媒体播放器实体 ID */
  @IsString({ message: 'player 须为字符串' })
  player!: string;
}

/**
 * 媒体播放器分组请求体。
 * players 为需要编入同一组的播放器实体 ID 列表。
 */
export class MediaGroupPlayersDto {
  /** 待分组的媒体播放器实体 ID 列表 */
  @IsArray({ message: 'players 须为数组' })
  @IsString({ each: true, message: 'players 每项须为字符串' })
  players!: string[];
}
