/**
 * @file service.ts
 * @module system
 * @description 系统域核心服务。提供系统信息查询（版本号、健康状态、数据库体积），
 * 启动时缓存版本号并确保 Prisma 数据目录存在。MoviePilot 代理已拆至 MoviePilotProxyService。
 * 另提供跨端网络与远程访问信息（内外网地址 / 公网 IPv4·IPv6 / 端口回退），供设置页回填与原生端漫游。
 *
 * 依赖：
 *  - PrismaService：数据库体积查询与目录初始化
 *  - loadAppVersion：从 package.json / 构建产物加载版本号
 *  - getProcessMemoryHealth：进程内存健康摘要
 *  - HttpService：公网 IP 探针
 *  - UiConfigService：读取 layout.externalUrl（远程访问地址）
 */
import { getErrorMessage } from '../../common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../shared/prisma/service';
import { UiConfigService } from '../ui-config/service';
import { loadAppVersion } from '../../common/platform/version.util';
import { getProcessMemoryHealth } from '../../common/observability/process-memory.util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** 公网 IPv4 探针候选（按顺序尝试，全部失败返回 null） */
const PUBLIC_IPV4_PROBES = [
  'http://ip.3322.net',
  'http://ddns.oray.com/checkip',
  'http://members.3322.org/dyndns/getip',
  'https://api4.ipify.org?format=json',
];
/** 公网 IPv6 探针候选（按顺序尝试，全部失败返回 null） */
const PUBLIC_IPV6_PROBES = ['https://api6.ipify.org?format=json', 'https://v6.ident.me'];
/** 探针超时（ms）：设置页需要快速反馈，宁可返回 null 也不长时间挂起 */
const PROBE_TIMEOUT_MS = 2500;
/**
 * 探针 User-Agent：部分 DDNS 检查服务会拒绝浏览器 UA，
 * 用 curl 的 UA 以拿到裸 IP 文本。
 */
const PROBE_USER_AGENT = 'curl/8.7.1';

/** 网络信息响应结构 */
interface NetworkInfo {
  /** 后端监听端口 */
  port: number;
  /** 前端访问端口（生产由后端托管 SPA，此处走回退链） */
  frontendPort: number;
  /** 后端端口（与 port 同源，保留字段以对齐前端展示） */
  backendPort: number;
  /** 本机内网 IP（IPv4 优先） */
  localIp: string;
  /** 内网访问地址 */
  internalUrl: string;
  /** 远程访问地址（layout.externalUrl） */
  externalUrl: string;
  /** 公网 IPv4（探针失败为 null） */
  publicIpv4: string | null;
  /** 公网 IPv6（探针失败为 null） */
  publicIpv6: string | null;
  /** 本机原生 IPv6（公网探针失败时的回退展示） */
  localIpv6: string | null;
  /** 采集时间戳（ISO 8601） */
  timestamp: string;
}

/**
 * 系统服务
 * 提供系统信息查询（版本号、健康状态、数据库体积）。
 * MoviePilot 代理已拆至 MoviePilotProxyService。
 */
@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private cachedVersion: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly uiConfig: UiConfigService,
  ) {
    this.ensurePrismaAndAssets();
    this.cachedVersion = loadAppVersion();
  }

  /**
   * 确保 Prisma 数据库目录存在
   * 在服务启动时自动创建必要的目录结构
   */
  private ensurePrismaAndAssets() {
    try {
      const prismaDataPath = path.join(process.cwd(), 'prisma', 'data');
      fs.mkdirSync(prismaDataPath, { recursive: true });
    } catch (e: unknown) {
      this.logger.warn(`创建 prisma 数据目录失败:${getErrorMessage(e)}`);
    }
  }

  /**
   * 获取系统版本信息（启动时缓存）
   */
  async getSystemInfo() {
    return {
      version: this.cachedVersion || 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  async getHealth() {
    const memHealth = getProcessMemoryHealth();
    const uptime = process.uptime();
    const cpuUsage = process.cpuUsage();

    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const uptimeStr = h > 0 ? `${h}h${m}m` : `${m}m`;

    // process.cpuUsage() 为微秒；单核平均占用% = (user+system) / uptime / 1e4
    const cpuPct = Math.min(
      100,
      Math.round((cpuUsage.user + cpuUsage.system) / Math.max(uptime, 1) / 10000),
    );
    const dbSize = await this.getDbSizeLabel();

    return {
      cpu: cpuPct,
      memory: memHealth.memory,
      memoryMb: memHealth.memoryMb,
      memoryLimitMb: memHealth.memoryLimitMb,
      rssMb: memHealth.rssMb,
      heapUsedMb: memHealth.heapUsedMb,
      heapTotalMb: memHealth.heapTotalMb,
      dbSize,
      uptime: uptimeStr,
      version: this.cachedVersion || 'unknown',
    };
  }

  private async getDbSizeLabel(): Promise<string> {
    try {
      const rows = await this.prisma.$queryRaw<{ size: string }[]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) AS size
      `;
      return rows[0]?.size || '—';
    } catch (err: unknown) {
      this.logger.debug(`查询数据库大小失败: ${getErrorMessage(err)}`);
      return '--';
    }
  }

  /* ── 跨端网络与远程访问 ── */

  /**
   * 读取远程访问地址（layout.externalUrl）。
   * 容错：配置缺失 / 解析失败返回空串，绝不抛错（设置页需稳定返回）。
   * @returns 远程访问地址
   */
  async getExternalUrl(): Promise<string> {
    try {
      const data = await this.uiConfig.getConfig();
      const { layout } = this.uiConfig.parseLayoutField(data.layout);
      const url = layout?.externalUrl;
      return url == null ? '' : String(url).trim();
    } catch (e: unknown) {
      this.logger.warn(`读取 externalUrl 失败: ${getErrorMessage(e)}`);
      return '';
    }
  }

  /**
   * 探测公网 IP。按候选列表顺序尝试，任一成功即返回；全部失败返回 null。
   * 永不抛错，避免设置页因网络不可达而 5xx。
   * @param family 4=IPv4，6=IPv6
   * @returns 公网 IP 字符串或 null
   */
  private async probePublicIp(family: 4 | 6): Promise<string | null> {
    const probes = family === 6 ? PUBLIC_IPV6_PROBES : PUBLIC_IPV4_PROBES;
    for (const url of probes) {
      try {
        const res = await this.http.axiosRef.get(url, {
          timeout: PROBE_TIMEOUT_MS,
          headers: { 'User-Agent': PROBE_USER_AGENT },
          // 探针失败不应抛异常，交给下面的解析逻辑判断
          validateStatus: () => true,
          family,
        });
        const ip = this.extractIp(res?.data, family);
        if (ip) return ip;
      } catch (e: unknown) {
        this.logger.debug(
          `公网 IPv${family} 探针失败 ${url}: ${getErrorMessage(e)}`,
        );
      }
    }
    return null;
  }

  /**
   * 从探针响应体提取 IP。
   * 兼容纯文本（DDNS 检查服务）与 JSON（ipify / ident.me）。
   * @param data 响应体
   * @param family 期望的协议族
   * @returns 归一化后的 IP，或 null
   */
  private extractIp(data: unknown, family: 4 | 6): string | null {
    let raw = '';
    if (typeof data === 'string') {
      raw = data.trim();
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      raw = String(obj.ip ?? obj.address ?? obj.query ?? '').trim();
    }
    if (!raw) return null;
    // 纯文本响应可能带 HTML 包装，抓第一个符合协议族的 token
    const match =
      family === 6
        ? raw.match(/[0-9a-fA-F:]{4,}/)
        : raw.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
    if (!match) return null;
    const ip = match[0];
    if (family === 4 && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return null;
    if (family === 6 && !ip.includes(':')) return null;
    return ip;
  }

  /**
   * 读取本机原生公网 IPv6（网卡地址）。
   * 过滤回环、link-local（fe80::）与 ULA（fc00::/7，即 fc / fd 开头）地址。
   * @returns IPv6 地址或 null
   */
  private getLocalIpv6(): string | null {
    try {
      const nets = os.networkInterfaces();
      for (const list of Object.values(nets)) {
        for (const net of list ?? []) {
          const family = String(net.family);
          if (family !== 'IPv6' && family !== '6') continue;
          if (net.internal) continue;
          const addr = String(net.address || '').split('%')[0].toLowerCase();
          if (!addr.includes(':')) continue;
          if (addr.startsWith('fe80:')) continue;
          if (addr.startsWith('fc') || addr.startsWith('fd')) continue;
          return addr;
        }
      }
    } catch (e: unknown) {
      this.logger.warn(`读取本机 IPv6 失败: ${getErrorMessage(e)}`);
    }
    return null;
  }

  /**
   * 读取本机内网 IPv4（优先 192.168.x / 10.x / 172.16-31.x 私有网段）。
   * @returns 内网 IP，缺失时返回 '127.0.0.1'
   */
  private getLocalIp(): string {
    try {
      const candidates: string[] = [];
      const nets = os.networkInterfaces();
      for (const list of Object.values(nets)) {
        for (const net of list ?? []) {
          const family = String(net.family);
          if (family !== 'IPv4' && family !== '4') continue;
          if (net.internal) continue;
          candidates.push(String(net.address || ''));
        }
      }
      const isPrivate = (ip: string) =>
        /^192\.168\./.test(ip) ||
        /^10\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      return candidates.find(isPrivate) ?? candidates[0] ?? '127.0.0.1';
    } catch {
      return '127.0.0.1';
    }
  }

  /**
   * 解析前端访问端口。
   *
   * HomeOS 生产环境下 SPA 由后端直接托管（Caddy 8443 / 发布 8126 映射到后端 8501），
   * 并不存在独立的前端端口，因此这里按回退链推导：
   * `FRONTEND_PORT → HTTPS_PORT → HTTP_PORT → 请求 Host 端口 → 后端端口`。
   * @param req 可选请求对象（用于取 Host 端口）
   * @returns 前端访问端口
   */
  private resolveFrontendPort(req?: { headers?: Record<string, unknown> }): number {
    const env = process.env;
    const explicit = Number(env.FRONTEND_PORT || env.HTTPS_PORT || env.HTTP_PORT || 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const host = String((req?.headers?.host as string) || '');
    const hostPort = Number(host.split(':')[1] || 0);
    if (Number.isFinite(hostPort) && hostPort > 0) return hostPort;
    return this.resolveBackendPort();
  }

  /** 后端监听端口（PORT 环境变量，缺省 8501） */
  private resolveBackendPort(): number {
    const port = Number(process.env.PORT || 8501);
    return Number.isFinite(port) && port > 0 ? port : 8501;
  }

  /**
   * 汇总跨端网络与远程访问信息。
   * 公网 IPv4 / IPv6 并行探测，各自失败即返回 null（接口永不 5xx）。
   * @param req 可选请求对象，用于推导前端端口
   * @returns 网络信息
   */
  async getNetworkInfo(req?: { headers?: Record<string, unknown> }): Promise<NetworkInfo> {
    const port = this.resolveBackendPort();
    const frontendPort = this.resolveFrontendPort(req);
    const localIp = this.getLocalIp();
    const localIpv6 = this.getLocalIpv6();
    const [publicIpv4, publicIpv6] = await Promise.all([
      this.probePublicIp(4).catch(() => null),
      this.probePublicIp(6).catch(() => null),
    ]);
    return {
      port,
      frontendPort,
      backendPort: port,
      localIp,
      internalUrl: `http://${localIp}:${frontendPort}`,
      externalUrl: await this.getExternalUrl(),
      publicIpv4,
      publicIpv6,
      localIpv6,
      timestamp: new Date().toISOString(),
    };
  }
}
