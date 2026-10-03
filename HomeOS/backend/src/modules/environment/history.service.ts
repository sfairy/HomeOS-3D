/**
 * @file history.service.ts
 * @module environment
 * @description 环境数据历史记录服务。每 15 分钟快照各房间温湿度 / 露点 / PM2.5 / CO2 / TVOC / IAQ / 霉菌风险
 * 到 EnvironmentRecord 表，并提供日均值趋势、CSV 导出与基于最新读数的季节性建议。
 *
 * 关键策略：
 *  - 仅 HA WS 主节点执行快照写入，避免多实例重复落库
 *  - pm25/co2/tvoc 随快照落库；季节性建议继续用内存最新读数即时生成
 *  - 趋势查询走 SQL GROUP BY day，避免大 take 内存聚合
 *
 * 依赖：
 *  - PrismaService：EnvironmentRecord 表读写
 *  - HaWsLeaderService：leader 选举（仅主节点写入）
 *  - JobRegistryService：周期快照任务监控
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';

/**
 * 环境数据历史记录服务
 * 每 15 分钟快照一次各房间的温湿度/空气数据到 DB。
 *
 * pm25/co2/tvoc 随快照落库，支撑空气质量历史趋势（seasonalTips 继续用内存最新读数）。
 */
@Injectable()
export class EnvironmentHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnvironmentHistoryService.name);
  private timer: NodeJS.Timeout | null = null;
  private latestReadings = new Map<
    string,
    {
      temperature?: number;
      humidity?: number;
      dewPoint?: number;
      pm25?: number;
      co2?: number;
      tvoc?: number;
      iaqScore?: number;
      moldRisk?: string;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly haLeader: HaWsLeaderService,
    private readonly jobs: JobRegistryService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.jobs.run(
        'environment-history',
        { description: '环境数据历史快照（每 15 分钟）', intervalMs: 15 * 60 * 1000 },
        () => this.snapshot(),
      );
    }, 15 * 60 * 1000);
    this.logger.log('环境数据历史记录已启动 (每15分钟)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * 更新最新读数（由外部事件触发）。
   * pm25/co2/tvoc 仅内存缓存（供 seasonalTips）；持久化见 snapshot。
   */
  updateReading(
    room: string,
    data: {
      temperature?: number;
      humidity?: number;
      dewPoint?: number;
      pm25?: number;
      co2?: number;
      tvoc?: number;
      iaqScore?: number;
      moldRisk?: string;
    },
  ) {
    const existing = this.latestReadings.get(room) || {};
    this.latestReadings.set(room, { ...existing, ...data });
  }

  /** 近 N 天每日均值趋势（温湿度 + 空气质），可选指定房间；SQL GROUP BY day，避免大 take 内存聚合 */
  async trend(days = 7, room?: string) {
    const since = new Date(Date.now() - days * 86400_000);
    type TrendRow = {
      date: string;
      avgTemperature: number | null;
      avgHumidity: number | null;
      avgIaq: number | null;
      avgPm25: number | null;
      avgCo2: number | null;
      avgTvoc: number | null;
    };
    /** 与历史 JS 实现一致：保留一位小数；全 NULL 桶为 null */
    const round1 = (n: number | null | undefined) => {
      if (n == null) return null;
      const v = Number(n);
      return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
    };

    // date_trunc + to_char 对齐原 toISOString().slice(0,10)（按存储时间戳日历日）
    const rows = room
      ? await this.prisma.$queryRaw<TrendRow[]>`
          SELECT to_char(date_trunc('day', "recordedAt"), 'YYYY-MM-DD') AS date,
                 AVG("temperature") AS "avgTemperature",
                 AVG("humidity") AS "avgHumidity",
                 AVG("iaqScore") AS "avgIaq",
                 AVG("pm25") AS "avgPm25",
                 AVG("co2") AS "avgCo2",
                 AVG("tvoc") AS "avgTvoc"
          FROM "EnvironmentRecord"
          WHERE "recordedAt" >= ${since} AND "room" = ${room}
          GROUP BY 1
          ORDER BY 1 ASC
        `
      : await this.prisma.$queryRaw<TrendRow[]>`
          SELECT to_char(date_trunc('day', "recordedAt"), 'YYYY-MM-DD') AS date,
                 AVG("temperature") AS "avgTemperature",
                 AVG("humidity") AS "avgHumidity",
                 AVG("iaqScore") AS "avgIaq",
                 AVG("pm25") AS "avgPm25",
                 AVG("co2") AS "avgCo2",
                 AVG("tvoc") AS "avgTvoc"
          FROM "EnvironmentRecord"
          WHERE "recordedAt" >= ${since}
          GROUP BY 1
          ORDER BY 1 ASC
        `;

    return rows.map((r) => ({
      date: r.date,
      avgTemperature: round1(r.avgTemperature),
      avgHumidity: round1(r.avgHumidity),
      avgIaq: round1(r.avgIaq),
      avgPm25: round1(r.avgPm25),
      avgCo2: round1(r.avgCo2),
      avgTvoc: round1(r.avgTvoc),
    }));
  }

  /** 导出环境趋势 CSV */
  async exportTrendCsv(days = 30, room?: string): Promise<string> {
    const rows = await this.trend(days, room);
    const header = '日期,平均温度(℃),平均湿度(%),平均IAQ,平均PM2.5(μg/m³),平均CO₂(ppm),平均TVOC(μg/m³)';
    const body = rows
      .map(
        (r) =>
          `${r.date},${r.avgTemperature ?? ''},${r.avgHumidity ?? ''},${r.avgIaq ?? ''},${r.avgPm25 ?? ''},${r.avgCo2 ?? ''},${r.avgTvoc ?? ''}`,
      )
      .join('\n');
    return `${header}\n${body}`;
  }

  /** 季节性环境健康提醒（基于最新读数动态生成，月份作 fallback） */
  seasonalTips() {
    const month = new Date().getMonth() + 1;
    const tips: string[] = [];
    let season: '春' | '夏' | '秋' | '冬';
    if (month >= 3 && month <= 5) season = '春';
    else if (month >= 6 && month <= 8) season = '夏';
    else if (month >= 9 && month <= 11) season = '秋';
    else season = '冬';

    let maxHumidity = 0;
    let minHumidity = Infinity;
    let maxPm25 = 0;
    let maxCo2 = 0;
    let highMoldRooms = 0;
    const hasReadings = this.latestReadings.size > 0;
    /** 合理室内温区（℃）：用于「室温偏高/偏低」；之外视为错绑或非室温传感器 */
    const INDOOR_TEMP_MIN = -15;
    const INDOOR_TEMP_MAX = 42;
    const indoorTemps: number[] = [];
    const outlierTemps: { room: string; t: number }[] = [];

    for (const [room, r] of this.latestReadings.entries()) {
      if (r.humidity != null) {
        maxHumidity = Math.max(maxHumidity, r.humidity);
        minHumidity = Math.min(minHumidity, r.humidity);
      }
      if (r.temperature != null) {
        if (r.temperature > INDOOR_TEMP_MAX || r.temperature < INDOOR_TEMP_MIN) {
          outlierTemps.push({ room, t: r.temperature });
        } else {
          indoorTemps.push(r.temperature);
        }
      }
      if (r.pm25 != null) maxPm25 = Math.max(maxPm25, r.pm25);
      if (r.co2 != null) maxCo2 = Math.max(maxCo2, r.co2);
      if (r.moldRisk === 'high' || r.moldRisk === 'medium') highMoldRooms++;
      if (r.moldRisk === 'high') tips.push(`[${room}] 霉菌风险偏高，建议立即除湿通风`);
    }

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const maxIndoor = indoorTemps.length ? Math.max(...indoorTemps) : null;
    const minIndoor = indoorTemps.length ? Math.min(...indoorTemps) : null;
    const maxTempSnapshot = [...indoorTemps, ...outlierTemps.map((o) => o.t)];
    const minTempSnapshot = maxTempSnapshot.length ? Math.min(...maxTempSnapshot) : null;
    const maxTempAll = maxTempSnapshot.length ? Math.max(...maxTempSnapshot) : null;

    if (hasReadings) {
      if (maxPm25 > 75) tips.push(`PM2.5 偏高(${maxPm25}μg/m³)，建议开启空气净化`);
      else if (maxPm25 > 35) tips.push(`PM2.5 轻度污染(${maxPm25}μg/m³)，可适当通风或净化`);
      if (maxCo2 > 1500) tips.push(`CO₂ 浓度过高(${maxCo2}ppm)，请开窗通风`);
      else if (maxCo2 > 1000) tips.push(`CO₂ 偏高(${maxCo2}ppm)，建议加强换气`);
      if (maxHumidity > 70) tips.push(`检测到湿度偏高(${maxHumidity}%)，建议除湿，防止霉菌滋生`);
      if (minHumidity < Infinity && minHumidity < 30)
        tips.push(`检测到湿度偏低(${minHumidity}%)，建议加湿`);

      // 异常读数（水管/设备温度、华氏未换算残留、湿度误绑等）不作为「室温」
      if (outlierTemps.length) {
        const worst = outlierTemps.reduce((a, b) => (b.t > a.t ? b : a));
        tips.push(
          `检测到异常温度[${worst.room}](${round1(worst.t)}℃)，请检查该房间温度传感器绑定或单位`,
        );
      }
      if (maxIndoor != null && maxIndoor > 28) {
        tips.push(`室温偏高(${round1(maxIndoor)}℃)，注意降温`);
      }
      if (minIndoor != null && minIndoor < 16) {
        tips.push(`室温偏低(${round1(minIndoor)}℃)，注意保暖`);
      }
      if (highMoldRooms > 1) tips.push(`多个房间(${highMoldRooms})存在防潮风险，建议全屋除湿`);
    }

    // 月份 fallback（无实时读数或补充通用建议）
    if (!hasReadings || tips.length < 2) {
      switch (season) {
        case '春':
          tips.push('春季多过敏原，建议定期开启新风/空气净化，并注意回南天防潮');
          break;
        case '夏':
          tips.push('夏季高温高湿，注意防暑降温，空调温度建议 26℃ 以兼顾舒适与节能');
          break;
        case '秋':
          tips.push('秋季干燥，建议加湿至 40%-60%，注意补水');
          break;
        case '冬':
          tips.push('冬季注意通风换气，避免 CO₂ 累积；取暖设备注意防一氧化碳');
          break;
      }
    }

    const uniqueTips = [...new Set(tips)];
    return {
      season,
      month,
      tips: uniqueTips,
      reason: hasReadings ? 'ok' : 'no_sensors',
      snapshot: hasReadings
        ? {
            maxHumidity: maxHumidity || null,
            minHumidity: minHumidity < Infinity ? minHumidity : null,
            maxTemp: maxTempAll,
            minTemp: minTempSnapshot,
            maxPm25: maxPm25 || null,
            maxCo2: maxCo2 || null,
          }
        : null,
    };
  }

  private async snapshot() {
    if (!this.haLeader.isHaWsLeader()) return;
    if (this.latestReadings.size === 0) return;
    const now = new Date();
    const records = [...this.latestReadings.entries()].map(([room, r]) => ({
      room,
      temperature: r.temperature,
      humidity: r.humidity,
      dewPoint: r.dewPoint,
      pm25: r.pm25,
      co2: r.co2,
      tvoc: r.tvoc,
      iaqScore: r.iaqScore,
      moldRisk: r.moldRisk,
      recordedAt: now,
    }));

    try {
      await this.prisma.environmentRecord.createMany({ data: records });
      this.logger.log(`环境快照已保存: ${records.length} 个房间`);
    } catch (err) {
      this.logger.warn(`环境快照保存失败: ${(err as Error).message}`);
    }
  }
}
