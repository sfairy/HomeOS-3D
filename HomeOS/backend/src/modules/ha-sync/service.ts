/**
 * HA 配置同步服务（从 Home Assistant 导入场景 / 自动化 / 脚本 / 模板 / Blueprint）。
 *
 * 所属模块：ha-sync
 * 职责：
 * - 作为 ha-sync 模块的领域服务，对外暴露发现、导入、YAML 校验三类 API。
 * - 自身仅做依赖组装（logger/haConnector/restClient/prisma/appConfig），具体实现委托给 internals.ts。
 * - 通过 discoverDeps / templateDiscoverDeps / yamlValidateDeps 三种依赖包屏蔽内部函数对 service 字段的直接访问。
 *
 * 关键依赖：HaConnectorService（WebSocket + 实体注册表）、HaRestClientService（check_config）、
 * AppConfigService（haConfigDir / 并发度）、PrismaService（持久化）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { HaConnectorService } from '../ha-connector/service';
import { HaRestClientService } from '../ha-connector/ha-rest-client.service';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { resolveHaConfigDir } from '../../shared/orchestrator/ha-sync.internals';
import { API_ERROR } from '../../common/errors/api-error-messages';
import {
  discoverAutomationsFromHa,
  discoverScenesFromHa,
  discoverScriptsFromHa,
  discoverTemplatesFromHa,
  discoverAutomationBlueprints,
  readAutomationBlueprintYaml,
  blueprintYamlToDraft,
  validateYaml as validateYamlHelper,
  validateScriptYaml as validateScriptYamlHelper,
  validateTemplateYaml as validateTemplateYamlHelper,
  validateAutomationYaml as validateAutomationYamlHelper,
  type HaSyncDiscoverDeps,
  type HaBlueprintImportRow,
} from './internals';

/**
 * HA 场景导入数据结构
 * 从 HA 获取的场景实体，包含解析后的实体配置 JSON
 */
export interface HaSceneImport {
  entity_id: string;
  name: string;
  entities: string;
  ha_config_id?: string;
}

/**
 * HA 自动化导入数据结构
 * 从 HA 获取的自动化实体，包含自动生成的 YAML 模板
 */
export interface HaAutomationImport {
  entity_id: string;
  name: string;
  state: string;
  last_triggered: string | null;
  mode: string;
  yaml?: string;
  ha_config_id?: string;
  /** Config API 无法读取完整配置时为 true，应走 syncFromHA */
  incomplete?: boolean;
}

/**
 * HA 脚本导入数据结构
 * 从 HA 获取的脚本实体，包含自动生成的 YAML 模板
 */
export interface HaScriptImport {
  entity_id: string;
  name: string;
  state: string;
  last_triggered: string | null;
  yaml?: string;
  ha_config_id?: string;
}

/**
 * HA 同步服务
 *
 * 核心职责：
 * 1. 从 Home Assistant 发现并导入场景、自动化、脚本
 * 2. 将 HA 实体的原始状态转换为 HomeOS 可用的结构化数据
 * 3. 提供 YAML 配置验证功能
 *
 * 工作流程：
 * - 发现阶段：通过 HA WebSocket 查询指定域（scene/automation/script）的实体
 * - 解析阶段：提取 entity_id、friendly_name、attributes 等关键字段
 * - 转换阶段：根据实体类型（灯/窗帘/空调等）生成对应的控制参数配置
 */
@Injectable()
export class HaSyncService {
  private readonly logger = new Logger(HaSyncService.name);

  constructor(
    private readonly haConnector: HaConnectorService,
    private readonly haRestClient: HaRestClientService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** 解析 HA 配置目录绝对路径（含环境变量与挂载点规范化） */
  private getHaConfigDir() {
    return resolveHaConfigDir(this.appConfig.get('automation').haConfigDir);
  }

  /** 导入阶段的并发度（来自 AppConfigService，控制对 HA Config API 的并发压力） */
  private get importConfigConcurrency() {
    return this.appConfig.get('automation').haImportConfigConcurrency;
  }

  /** 组装场景/自动化/脚本发现所需的依赖包 */
  private get discoverDeps(): HaSyncDiscoverDeps {
    return {
      logger: this.logger,
      haConnector: this.haConnector,
      importConfigConcurrency: this.importConfigConcurrency,
    };
  }

  /** 组装模板实体发现所需的依赖包（额外注入 getHaConfigDir 用于 YAML 源解析） */
  private get templateDiscoverDeps() {
    return {
      logger: this.logger,
      haConnector: this.haConnector,
      importConfigConcurrency: this.importConfigConcurrency,
      getHaConfigDir: () => this.getHaConfigDir(),
    };
  }

  /** 组装 YAML 校验所需的依赖包（仅 HaRestClientService） */
  private get yamlValidateDeps() {
    return { haRestClient: this.haRestClient };
  }

  /**
   * 获取 HA 连接状态
   */
  async getHAStatus() {
    return this.haConnector.getStatus();
  }

  // ──────────────────── 场景发现 ────────────────────

  /**
   * 从 HA 导入场景
   * 通过 WebSocket API 查询所有 scene 域实体，
   * 解析每个场景中关联的实体配置（灯光亮度、温度等），
   * 以结构化 JSON 格式返回。
   * @returns 场景导入数据数组
   */
  async importScenesFromHA(): Promise<HaSceneImport[]> {
    return discoverScenesFromHa(this.discoverDeps, API_ERROR.HA_DISCOVER_SCENES_FAILED);
  }

  // ──────────────────── 自动化发现 ────────────────────

  /**
   * 从 HA 导入自动化
   * 通过 WebSocket API 查询所有 automation 域实体，
   * 自动生成包含 trigger/condition/action 结构的 YAML 模板。
   * @returns 自动化导入数据数组
   */
  async importAutomationsFromHA(): Promise<HaAutomationImport[]> {
    return discoverAutomationsFromHa(this.discoverDeps, API_ERROR.HA_DISCOVER_AUTOMATIONS_FAILED);
  }

  // ──────────────────── 脚本发现 ────────────────────

  /**
   * 从 HA 导入脚本
   * 通过 WebSocket API 查询所有 script 域实体，
   * 自动生成包含 sequence 框架的 YAML 模板。
   * @returns 脚本导入数据数组
   */
  async importScriptsFromHA(): Promise<HaScriptImport[]> {
    return discoverScriptsFromHa(this.discoverDeps, API_ERROR.HA_DISCOVER_SCRIPTS_FAILED);
  }

  // ──────────────────── 模板实体发现 ────────────────────

  /**
   * 从 HA 发现 template 平台实体（经实体注册表过滤，避免误收录 MQTT/Zigbee 等）
   * @param forceRefresh - true 时强制刷新实体注册表
   * @param options.resolveYaml - true 时解析 YAML 源并填充 yaml/yaml_source/yaml_complete
   */
  async importTemplatesFromHA(forceRefresh = false, options?: { resolveYaml?: boolean }) {
    return discoverTemplatesFromHa(this.templateDiscoverDeps, forceRefresh, options);
  }

  /**
   * 从 HA 配置目录扫描 automation Blueprint 清单。
   * 返回的行不含 YAML 内容，仅含 id/name/description/filename/inputKeys 供前端选择。
   */
  async importAutomationBlueprintsFromHA(): Promise<HaBlueprintImportRow[]> {
    return discoverAutomationBlueprints(this.getHaConfigDir());
  }

  /**
   * 加载指定 Blueprint 的可编辑草案 YAML。
   * 流程：读取原始 YAML → 扫描 Blueprint 清单匹配 name → 调用 blueprintYamlToDraft 替换 !input。
   * @returns null 表示 Blueprint 未找到或 HA 配置目录未挂载
   */
  async loadAutomationBlueprintDraft(
    filename: string,
  ): Promise<{ yaml: string; name: string } | null> {
    const cfgDir = this.getHaConfigDir();
    const raw = await readAutomationBlueprintYaml(cfgDir, filename);
    if (!raw) return null;
    const list = await discoverAutomationBlueprints(cfgDir);
    const row = list.find((r) => r.filename === filename || r.id === filename);
    const name = row?.name || filename.replace(/\.ya?ml$/i, '');
    return { yaml: blueprintYamlToDraft(raw, name), name };
  }

  // ──────────────────── YAML 验证 ────────────────────

  /** 联动器脚本 YAML：本地结构校验 + 可选 HA check_config */
  async validateScriptYaml(yamlStr: string): Promise<{ valid: boolean; message: string }> {
    return validateScriptYamlHelper(this.yamlValidateDeps, yamlStr);
  }

  /** 联动器模板实体 YAML：本地结构校验 */
  async validateTemplateYaml(yamlStr: string): Promise<{ valid: boolean; message: string }> {
    return validateTemplateYamlHelper(this.yamlValidateDeps, yamlStr);
  }

  /** 联动器自动化 YAML：本地结构校验 + 可选 HA check_config */
  async validateAutomationYaml(yamlStr: string): Promise<{ valid: boolean; message: string }> {
    return validateAutomationYamlHelper(this.yamlValidateDeps, yamlStr);
  }

  /** 通用 YAML 校验：直接提交至 HA check_config，不经过本地结构校验 */
  async validateYaml(yaml: string): Promise<{ valid: boolean; message: string }> {
    return validateYamlHelper(this.yamlValidateDeps, yaml);
  }
}
