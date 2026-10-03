/**
 * @file iaq.service.ts
 * @module environment
 * @description 室内空气质量综合指数（IAQ）计算服务。参考 RESET Air Standard / WELL Building Standard
 * 的多参数加权模型，对 PM2.5 / CO2 / TVOC / 温度偏差 / 湿度偏差加权求和，输出 0-100 的综合指数
 * （0=最优, 100=最差）与等级、各项得分、改善建议。
 *
 * 关键策略：
 *  - 各项得分按分段线性映射（如 PM2.5：0→0, 12→25, 35→50, 55→75, 150→100）
 *  - 缺省参数不参与加权，避免缺席项拉低总分
 *  - 等级映射：0-20 优 / 21-40 良 / 41-60 轻度 / 61-80 中度 / 81-100 重度
 *
 * 依赖：
 *  - AppConfigService：iaq 配置（权重 / 目标温湿度 / 阈值）
 */
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../shared/app-config/service';

/**
 * 室内空气质量综合指数 IAQ
 *
 * 参考 RESET Air Standard / WELL Building Standard 的多参数加权模型。
 * 烟威分数越高越差（0=最优, 100=最差）。
 *
 * 监控参数及权重：
 *   - PM2.5 (μg/m³)   → 权重 30%
 *   - CO2 (ppm)        → 权重 25%
 *   - TVOC (ppb)       → 权重 20%
 *   - 温度偏差 (°C)     → 权重 15%
 *   - 相对湿度偏差 (%)   → 权重 10%
 *
 * 每项得分范围 0-100：
 *   PM2.5:  0→0,  12→25, 35→50,  55→75, 150→100
 *   CO2:  400→0, 600→25, 800→50, 1000→75, 2000→100
 *   TVOC:   0→0, 200→25, 400→50,  600→75, 1000→100
 *   温度：偏差0→0, ±1→25, ±2→50, ±3→75, ±5→100（以默认目标温度为基准）
 *   湿度：偏差0→0, ±5→25, ±10→50, ±15→75, ±20→100（以默认目标湿度为基准）
 *
 * IAQ 等级：
 *   0-20   🟢 优
 *   21-40  🟡 良
 *   41-60  🟠 轻度污染
 *   61-80  🔴 中度污染
 *   81-100 ⚫ 重度污染
 */
@Injectable()
export class IaqService {
  private get cfg() {
    return this.appConfig.get('iaq');
  }

  private get weights() {
    const c = this.cfg;
    return {
      pm25: c.iaqWeightPm25 / 100,
      co2: c.iaqWeightCo2 / 100,
      tvoc: c.iaqWeightTvoc / 100,
      temp: c.iaqWeightTemp / 100,
      humidity: c.iaqWeightHumidity / 100,
    };
  }

  constructor(private readonly appConfig: AppConfigService) {}

  /**
   * 计算综合 IAQ 指数
   */
  compute(input: {
    pm25?: number | null;
    co2?: number | null;
    tvoc?: number | null;
    temperature?: number | null;
    humidity?: number | null;
  }) {
    const scores: Record<string, number> = {};
    let totalWeight = 0;
    let weightedSum = 0;

    if (input.pm25 != null) {
      scores.pm25 = this.scorePM25(input.pm25);
      weightedSum += scores.pm25 * this.weights.pm25;
      totalWeight += this.weights.pm25;
    }
    if (input.co2 != null) {
      scores.co2 = this.scoreCO2(input.co2);
      weightedSum += scores.co2 * this.weights.co2;
      totalWeight += this.weights.co2;
    }
    if (input.tvoc != null) {
      scores.tvoc = this.scoreTVOC(input.tvoc);
      weightedSum += scores.tvoc * this.weights.tvoc;
      totalWeight += this.weights.tvoc;
    }
    if (input.temperature != null) {
      scores.temp = this.scoreTemp(input.temperature);
      weightedSum += scores.temp * this.weights.temp;
      totalWeight += this.weights.temp;
    }
    if (input.humidity != null) {
      scores.humidity = this.scoreHumidity(input.humidity);
      weightedSum += scores.humidity * this.weights.humidity;
      totalWeight += this.weights.humidity;
    }

    if (totalWeight === 0) {
      return {
        iaq: null,
        grade: 'unknown',
        scores: {},
        readings: {
          pm25: input.pm25 ?? null,
          co2: input.co2 ?? null,
          tvoc: input.tvoc ?? null,
          temperature: input.temperature ?? null,
          humidity: input.humidity ?? null,
        },
        advice: ['缺少传感器数据'],
        timestamp: new Date().toISOString(),
      };
    }

    const iaq = Math.round(weightedSum / totalWeight);
    const grade = this.gradeIaq(iaq);

    const advice = this.getAdvice(iaq, input);

    return {
      iaq,
      grade,
      scores,
      readings: {
        pm25: input.pm25 ?? null,
        co2: input.co2 ?? null,
        tvoc: input.tvoc ?? null,
        temperature: input.temperature ?? null,
        humidity: input.humidity ?? null,
      },
      advice,
      timestamp: new Date().toISOString(),
    };
  }

  private scorePM25(v: number): number {
    if (v <= 0) return 0;
    if (v <= 12) return (v / 12) * 25;
    if (v <= 35) return 25 + ((v - 12) / 23) * 25;
    if (v <= 55) return 50 + ((v - 35) / 20) * 25;
    if (v <= 150) return 75 + ((v - 55) / 95) * 25;
    return 100;
  }

  private scoreCO2(v: number): number {
    if (v <= 400) return 0;
    if (v <= 600) return ((v - 400) / 200) * 25;
    if (v <= 800) return 25 + ((v - 600) / 200) * 25;
    if (v <= 1000) return 50 + ((v - 800) / 200) * 25;
    if (v <= 2000) return 75 + ((v - 1000) / 1000) * 25;
    return 100;
  }

  private scoreTVOC(v: number): number {
    if (v <= 0) return 0;
    if (v <= 200) return (v / 200) * 25;
    if (v <= 400) return 25 + ((v - 200) / 200) * 25;
    if (v <= 600) return 50 + ((v - 400) / 200) * 25;
    if (v <= 1000) return 75 + ((v - 600) / 400) * 25;
    return 100;
  }

  private scoreTemp(v: number): number {
    const dev = Math.abs(v - this.cfg.iaqTargetTemp);
    if (dev <= 0.5) return 0;
    if (dev <= 1) return ((dev - 0.5) / 0.5) * 25;
    if (dev <= 2) return 25 + ((dev - 1) / 1) * 25;
    if (dev <= 3) return 50 + ((dev - 2) / 1) * 25;
    if (dev <= 5) return 75 + ((dev - 3) / 2) * 25;
    return 100;
  }

  private scoreHumidity(v: number): number {
    const dev = Math.abs(v - this.cfg.iaqTargetHumidity);
    if (dev <= 2) return 0;
    if (dev <= 5) return ((dev - 2) / 3) * 25;
    if (dev <= 10) return 25 + ((dev - 5) / 5) * 25;
    if (dev <= 15) return 50 + ((dev - 10) / 5) * 25;
    if (dev <= 20) return 75 + ((dev - 15) / 5) * 25;
    return 100;
  }

  private gradeIaq(iaq: number): string {
    if (iaq <= 20) return '🟢 优';
    if (iaq <= 40) return '🟡 良';
    if (iaq <= 60) return '🟠 轻度污染';
    if (iaq <= 80) return '🔴 中度污染';
    return '⚫ 重度污染';
  }

  private getAdvice(iaq: number, input: Record<string, number | null | undefined>): string[] {
    const tips: string[] = [];
    if (iaq <= 20) return ['空气质量优秀，无需操作'];
    if (iaq > 60) tips.push('建议开启新风系统或空气净化器');
    if (input.co2 && input.co2 > 800) tips.push(`CO2 ${input.co2}ppm 偏高，请开窗通风`);
    if (input.pm25 && input.pm25 > 35) tips.push(`PM2.5 ${input.pm25}μg/m³ 超标，请减少室内污染源`);
    if (input.tvoc && input.tvoc > 400) tips.push('TVOC 偏高，检查装修材料/清洁剂释放');
    if (!tips.length) tips.push('空气质量可接受，继续保持');
    return tips;
  }
}
