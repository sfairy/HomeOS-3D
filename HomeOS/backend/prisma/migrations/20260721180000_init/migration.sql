-- =============================================================================
-- HomeOS 数据库初始化（单条 baseline，2026-08-08 压平）
-- =============================================================================
-- 用途：空库 / 清卷后首次 prisma migrate deploy 的唯一迁移。
-- 包含：当前 schema 全量模型、索引、外键；EventLog 按月 RANGE 分区 + BRIN。
-- 已并入：AlertRule(entityId/createdAt) 索引；EarthquakeAlertHistory.alertKind/source；
--         SecurityEvent(type, createdAt)、EnvironmentRecord(room, recordedAt)、
--         WaterRecord(entityId, recordedAt) 时序复合索引。
-- 注意：
--   1) 已有数据卷必须清空后才能部署；不做旧库升级/自愈。
--   2) EventLog 的 PARTITION BY 无法由 Prisma schema 表达，故手工写入；
--      后续月份分区创建与过期分区 DROP 由 PartitionMaintenanceService 负责。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
-- 确保 public schema 存在（PostgreSQL 默认已有，幂等）
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "UserRole" AS ENUM ('admin', 'adult', 'child', 'guest');
CREATE TYPE "NotificationLevel" AS ENUM ('info', 'warn', 'danger');
CREATE TYPE "RecommendationStatus" AS ENUM ('pending', 'adopted', 'dismissed');

-- ###########################################################################
-- 一、身份与配置
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- User：系统用户（默认单用户，支持多账号）
-- ---------------------------------------------------------------------------
CREATE TABLE "User" (
    "id" TEXT NOT NULL,                              -- UUID 主键
    "username" TEXT NOT NULL,                        -- 登录用户名（唯一）
    "password" TEXT NOT NULL,                        -- bcrypt 哈希密码
    "role" "UserRole" NOT NULL DEFAULT 'admin',      -- 角色：admin / adult / child / guest
    "preferences" JSONB,                             -- 用户偏好（温度、色温、夜模等）
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,       -- JWT 版本；递增可吊销已签发令牌
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,-- 连续登录失败次数
    "lockedUntil" TIMESTAMP(3),                      -- 账户锁定截止时间
    "totpSecret" TEXT,                               -- TOTP 密钥（管理员 MFA，可选）
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,    -- 是否启用 TOTP
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- LoginAudit：登录成功/失败审计
-- ---------------------------------------------------------------------------
CREATE TABLE "LoginAudit" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,                        -- 尝试登录的用户名（即使用户不存在也记录）
    "userId" TEXT,                                   -- 命中用户时的 FK；删除用户后置 NULL
    "ip" TEXT,                                       -- 客户端 IP
    "success" BOOLEAN NOT NULL,                      -- 是否登录成功
    "reason" TEXT,                                   -- 失败原因（密码错误/锁定/MFA 等）
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAudit_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- GuestShareCode：访客分享短码 → 会话 payload（库内不存明文 token）
-- ---------------------------------------------------------------------------
CREATE TABLE "GuestShareCode" (
    "code" TEXT NOT NULL,                            -- 短码主键（兑换时使用）
    "payload" JSONB,                                 -- 签发 JWT 所需的会话载荷
    "expiresAt" TIMESTAMP(3) NOT NULL,               -- 过期时间（清理/校验用）
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestShareCode_pkey" PRIMARY KEY ("code")
);

-- ---------------------------------------------------------------------------
-- ProjectConfig：前端布局与项目级配置（平面图、设备位置、HA 连接等）
-- ---------------------------------------------------------------------------
CREATE TABLE "ProjectConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT 'default',     -- 项目标识；默认 default
    "layout" JSONB NOT NULL,                         -- 布局 JSON（设备坐标、HA 配置等）
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectConfig_pkey" PRIMARY KEY ("id")
);

-- ###########################################################################
-- 二、事件日志（按月分区，写入量最大）
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- EventLog：实体状态变更时序日志
-- ---------------------------------------------------------------------------
-- 设计要点：
--   - PARTITION BY RANGE (createdAt)：按月物理分区，便于整月 DROP 与跨月查询。
--   - 主键必须包含分区键 → (createdAt, id)；id 仍为 SERIAL 自增。
--   - Prisma schema 无法表达 PARTITION BY，故本 DDL 手工维护。
--   - 父表索引会传播到各分区；BRIN(createdAt) 适合时间范围扫描，勿再加 btree(createdAt)。
CREATE TABLE "EventLog" (
    "id" SERIAL NOT NULL,                            -- 自增行号（与 createdAt 组成复合主键）
    "entityId" TEXT NOT NULL,                        -- HA 实体 ID，如 light.living_room
    "domain" TEXT NOT NULL DEFAULT '',               -- 从 entityId 解析的 domain（按域过滤/统计）
    "oldState" JSONB,                                -- 变更前完整状态快照
    "newState" JSONB,                                -- 变更后完整状态快照
    "stateDiff" TEXT,                                -- 变更摘要，如 on→off / 23.5→24.0
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, -- 事件时间（分区键）

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("createdAt","id")
) PARTITION BY RANGE ("createdAt");

-- ###########################################################################
-- 三、联动器：自动化 / 场景 / 脚本 / 模板实体
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Automation：自动化规则（YAML + 流程编辑器图）
-- ---------------------------------------------------------------------------
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,                            -- 显示名称
    "yaml" TEXT NOT NULL,                            -- YAML 配置（可由 geekGraph compile）
    "geekGraph" JSONB,                               -- 流程编辑器图 JSON（编辑源真相）
    "enabled" BOOLEAN NOT NULL DEFAULT true,         -- 是否启用
    "haConfigId" TEXT,                               -- HA config API id（如 homeos_xxx）
    "runOnHa" BOOLEAN NOT NULL DEFAULT false,        -- true=HA 执行，本地引擎跳过
    "haSyncedAt" TIMESTAMP(3),                       -- 上次同步到 HA 的时间
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AutomationVariable：自动化持久变量（全局 / 本规则，对齐米家语义）
-- ---------------------------------------------------------------------------
CREATE TABLE "AutomationVariable" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,                             -- 程序标识，建议 [a-zA-Z0-9_]+
    "name" TEXT NOT NULL,                            -- 显示名
    "scope" TEXT NOT NULL DEFAULT 'global',          -- global | rule
    "ruleId" TEXT,                                   -- scope=rule 时绑定的自动化 ID；global 为 NULL
    "type" TEXT NOT NULL DEFAULT 'string',           -- number | string
    "value" TEXT NOT NULL DEFAULT '',               -- 当前值（字符串存储）
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationVariable_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Scene：场景（实体状态快照 / 动作列表）
-- ---------------------------------------------------------------------------
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entities" JSONB NOT NULL,                       -- 实体状态映射或动作列表（执行真相）
    "yaml" TEXT,                                     -- HA 导入/粘贴的 YAML 原文
    "geekSceneGraph" JSONB,                          -- 场景编辑器图 JSON
    "haConfigId" TEXT,                               -- HA scene config id
    "runOnHa" BOOLEAN NOT NULL DEFAULT false,        -- true=HA scene.turn_on 执行
    "overlay" BOOLEAN NOT NULL DEFAULT false,        -- true=叠加执行（可 cancel 恢复快照）
    "haSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- SceneSchedule：场景定时（每场景至多一行）
-- ---------------------------------------------------------------------------
CREATE TABLE "SceneSchedule" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,                         -- FK → Scene（级联删除）
    "sceneName" TEXT NOT NULL DEFAULT '',
    "cron" TEXT,                                     -- 5 段 cron（优先于 at）
    "at" TEXT,                                       -- 每日时刻 HH:mm
    "days" JSONB,                                    -- 星期过滤 0-6，仅 at 生效
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneSchedule_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- SceneExecution：场景执行历史
-- ---------------------------------------------------------------------------
CREATE TABLE "SceneExecution" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,                         -- FK → Scene（级联删除）
    "sceneName" TEXT NOT NULL,                       -- 冗余名称，方便列表查询
    "success" BOOLEAN NOT NULL,                      -- 是否全部成功
    "executed" INTEGER NOT NULL,                     -- 成功执行的设备数
    "total" INTEGER NOT NULL,                        -- 目标设备总数
    "errors" JSONB NOT NULL DEFAULT '[]',            -- 错误列表
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SceneExecution_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AutomationExecution：自动化触发与 trace 历史
-- ---------------------------------------------------------------------------
CREATE TABLE "AutomationExecution" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,                    -- FK → Automation（级联删除）
    "name" TEXT NOT NULL,                            -- 触发时的规则名
    "success" BOOLEAN NOT NULL DEFAULT true,
    "trace" JSONB NOT NULL DEFAULT '[]',             -- 执行步骤 trace
    "error" TEXT,                                    -- 顶层错误信息
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- CommandAudit：设备控制审计（谁、何时、对哪个实体调用了什么服务）
-- ---------------------------------------------------------------------------
CREATE TABLE "CommandAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,                                   -- FK → User；用户删除后置 NULL
    "username" TEXT,                                 -- 冗余用户名（便于检索）
    "role" TEXT,                                     -- 操作时的角色
    "domain" TEXT NOT NULL,                          -- HA domain（light / switch 等）
    "service" TEXT NOT NULL,                         -- 服务名（turn_on 等）
    "entityId" TEXT NOT NULL,                        -- 目标实体
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandAudit_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- ScriptExecution：脚本执行历史
-- ---------------------------------------------------------------------------
CREATE TABLE "ScriptExecution" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,                        -- FK → Script（级联删除）
    "scriptName" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "executed" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptExecution_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Script：可执行脚本序列
-- ---------------------------------------------------------------------------
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yaml" TEXT NOT NULL,                            -- YAML 脚本定义
    "geekGraph" JSONB,                               -- 脚本编辑器图 JSON
    "haConfigId" TEXT,                               -- HA script config id
    "runOnHa" BOOLEAN NOT NULL DEFAULT false,        -- true=HA script.turn_on 执行
    "haSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- TemplateEntity：自定义模板实体（虚拟/组合实体）
-- ---------------------------------------------------------------------------
CREATE TABLE "TemplateEntity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,                            -- 模板实体名称
    "type" TEXT NOT NULL,                            -- 家电类型或 yaml_import
    "yaml" TEXT NOT NULL,                            -- template: YAML 定义
    "slotMapping" JSONB,                             -- 槽位 → entity_id（编辑回显）
    "haConfigId" TEXT,                               -- HA unique_id
    "haEntityId" TEXT,                               -- HA 运行中 entity_id
    "haConfigEntryId" TEXT,                          -- UI Template Helper 的 config entry id
    "yamlSource" TEXT,                               -- homeos | config_entry | configuration_yaml | stub
    "yamlComplete" BOOLEAN NOT NULL DEFAULT true,    -- 导入/解析是否含完整 YAML
    "contentHash" TEXT,                              -- yaml 内容哈希（漂移检测）
    "haSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateEntity_pkey" PRIMARY KEY ("id")
);

-- ###########################################################################
-- 四、通知 / 安防 / 地震 / 告警规则
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- Notification：系统通知
-- ---------------------------------------------------------------------------
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "level" "NotificationLevel" NOT NULL DEFAULT 'info', -- info / warn / danger
    "message" TEXT NOT NULL,                         -- 通知正文
    "entityId" TEXT,                                 -- 关联实体（可选）
    "source" TEXT NOT NULL DEFAULT 'system',         -- 来源模块
    "read" BOOLEAN NOT NULL DEFAULT false,           -- 是否已读
    "deliveredAt" TIMESTAMP(3),                      -- LAN 推送送达时间
    "deliveryChannels" JSONB NOT NULL DEFAULT '[]',  -- in_app / socket / tts 等
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- SecurityEvent：安防事件（布防/撤防/告警/紧急等）
-- ---------------------------------------------------------------------------
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,                            -- arm / disarm / alarm / emergency / safety
    "mode" TEXT,                                     -- armed_home / armed_away / armed_night / disarmed
    "entityId" TEXT,                                 -- 触发传感器实体
    "detail" TEXT NOT NULL,                          -- 事件描述
    "zones" JSONB NOT NULL DEFAULT '[]',             -- 涉及区域
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- EarthquakeAlertHistory：地震预警（EEW）触发记录
-- ---------------------------------------------------------------------------
CREATE TABLE "EarthquakeAlertHistory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,                         -- 上游事件 ID
    "epicenter" TEXT NOT NULL,                       -- 震中描述
    "magnitude" DOUBLE PRECISION NOT NULL,            -- 震级
    "depth" DOUBLE PRECISION NOT NULL,               -- 震源深度 km
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "originTime" BIGINT NOT NULL,                     -- 发震时刻（epoch ms）
    "distance" DOUBLE PRECISION NOT NULL,            -- 距本地点 km
    "countdown" INTEGER NOT NULL,                    -- 预警倒计时秒
    "localIntensity" DOUBLE PRECISION NOT NULL,      -- 本地预估烈度
    "maxIntensity" TEXT,                             -- 最大烈度描述
    "alertKind" TEXT,                                -- early | confirmation；旧记录可为空
    "source" TEXT,                                   -- wolfx | sc_eew | cenc_eew | usgs | test
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarthquakeAlertHistory_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AlertRule：自定义告警规则
-- ---------------------------------------------------------------------------
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT,                                 -- 关联实体（可选）
    "condition" TEXT NOT NULL,                       -- 触发条件表达式
    "level" TEXT NOT NULL DEFAULT 'warn',            -- info / warn / danger
    "channels" JSONB NOT NULL DEFAULT '[]',          -- 推送通道列表
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,   -- 冷却分钟，防刷屏
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "messageTemplate" TEXT,                          -- {{entity}} {{state}} 等模板
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- ###########################################################################
-- 五、家庭模式 / 设备健康 / 能耗相关
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- HomeMode：家庭运行模式（在家/离家/睡眠等）
-- ---------------------------------------------------------------------------
CREATE TABLE "HomeMode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,                            -- 模式名称
    "icon" TEXT NOT NULL DEFAULT 'home',
    "config" JSONB NOT NULL,                         -- 模式动作列表
    "triggers" JSONB,                                -- 自动触发条件
    "isActive" BOOLEAN NOT NULL DEFAULT false,       -- 当前是否激活
    "deviceSnapshot" JSONB,                          -- 激活前设备快照（deactivate 恢复）
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "exclusiveGroup" TEXT DEFAULT 'default',         -- 互斥组：同组切换时恢复快照
    "priority" INTEGER NOT NULL DEFAULT 50,          -- 触发/手动切换优先级
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeMode_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- DeviceLifespan：设备寿命（开关次数 / 运行时长 / 健康分）
-- ---------------------------------------------------------------------------
CREATE TABLE "DeviceLifespan" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,                        -- HA 实体 ID（唯一）
    "friendlyName" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "switchCount" INTEGER NOT NULL DEFAULT 0,        -- 累计开关次数
    "totalRuntimeSeconds" INTEGER NOT NULL DEFAULT 0,-- 累计运行秒数
    "avgCycleSeconds" INTEGER NOT NULL DEFAULT 0,    -- 平均单次运行时长
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3),
    "healthScore" INTEGER NOT NULL DEFAULT 100,      -- 健康分 0–100
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceLifespan_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- EnergyBaseline：功率滚动读数基线（突增检测）
-- ---------------------------------------------------------------------------
CREATE TABLE "EnergyBaseline" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,                        -- 功率传感器实体（唯一）
    "readings" JSONB NOT NULL,                       -- 最近功率读数数组
    "lastAlert" BIGINT NOT NULL DEFAULT 0,           -- 上次告警时间戳
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyBaseline_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- EnergyCandidateEntity：能源计量候选实体白名单
-- ---------------------------------------------------------------------------
-- 由 EventLog 写入管线增量维护（sensor + energy/power_meter/kwh/electricity）。
-- 使能耗查询走 entityId IN + 时间范围，避免 ILIKE 全表扫描。
CREATE TABLE "EnergyCandidateEntity" (
    "entityId" TEXT NOT NULL,                        -- HA 实体 ID（主键）
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,               -- 最近一次相关事件时间

    CONSTRAINT "EnergyCandidateEntity_pkey" PRIMARY KEY ("entityId")
);

-- ---------------------------------------------------------------------------
-- ScheduleItem：日程提醒（垃圾回收/家务/服药等）
-- ---------------------------------------------------------------------------
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,                            -- recycle / cleaning / medication / …
    "label" TEXT NOT NULL,                           -- 显示标签
    "icon" TEXT NOT NULL DEFAULT '📅',
    "frequency" TEXT NOT NULL DEFAULT 'weekly',      -- daily / weekly / biweekly / monthly / custom
    "dayOfWeek" INTEGER NOT NULL DEFAULT 0,          -- 0=周日
    "customDays" JSONB NOT NULL DEFAULT '[]',        -- 每月自定义日期
    "time" TEXT NOT NULL DEFAULT '07:00',            -- 提醒时间 HH:MM
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "priority" TEXT NOT NULL DEFAULT 'normal',       -- normal（受 DND）| danger（绕过 DND）
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- SystemConfig：系统运行参数（AppConfig 统一 JSON 落库）
-- ---------------------------------------------------------------------------
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',           -- AppConfig 单例，固定 default
    "data" JSONB NOT NULL,                           -- { notification, security, energy, … }
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- RuntimeKv：运行时快照（安防面板 / 场景叠加 / 客户端电量等），与 AppConfig 分离
-- ---------------------------------------------------------------------------
CREATE TABLE "RuntimeKv" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeKv_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- ChildModeRuntime：儿童模式运行时（配置在 AppConfig.childMode）
-- ---------------------------------------------------------------------------
CREATE TABLE "ChildModeRuntime" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mediaUsedMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageDate" TEXT NOT NULL DEFAULT '',
    "overrideUntil" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildModeRuntime_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AdvisorCooldown：智能建议去重冷却
-- ---------------------------------------------------------------------------
CREATE TABLE "AdvisorCooldown" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,                        -- 去重键（唯一）
    "cooldownUntil" BIGINT NOT NULL,                -- 冷却截止时间戳 ms
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisorCooldown_pkey" PRIMARY KEY ("id")
);

-- ###########################################################################
-- 六、环境 / 用水 / 电价 / 使用统计 / 学习基线
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- EnvironmentRecord：环境历史快照（温湿度 + 空气质量）
-- ---------------------------------------------------------------------------
CREATE TABLE "EnvironmentRecord" (
    "id" TEXT NOT NULL,
    "room" TEXT NOT NULL,                            -- 房间名
    "temperature" DOUBLE PRECISION,                  -- 温度 ℃
    "humidity" DOUBLE PRECISION,                     -- 湿度 %
    "dewPoint" DOUBLE PRECISION,                     -- 露点 ℃
    "pm25" DOUBLE PRECISION,                         -- PM2.5 μg/m³
    "co2" DOUBLE PRECISION,                          -- CO₂ ppm
    "tvoc" DOUBLE PRECISION,                         -- TVOC μg/m³
    "iaqScore" INTEGER,                              -- IAQ 综合指数
    "moldRisk" TEXT,                                 -- low / medium / high
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvironmentRecord_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- WaterRecord：用水监测（流量 / 累计 / 异常标记）
-- ---------------------------------------------------------------------------
CREATE TABLE "WaterRecord" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,                        -- 水表传感器实体
    "flowRate" DOUBLE PRECISION,                     -- 当前流量 L/min
    "totalUsage" DOUBLE PRECISION,                   -- 累计用量 m³
    "anomaly" TEXT,                                  -- leak / overflow / continuous_flow
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaterRecord_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- PricingConfig：阶梯电价与用量锚点（单行）
-- ---------------------------------------------------------------------------
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tiers" JSONB NOT NULL,                          -- 阶梯电价档位数组
    "monthUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,-- 当月用电量 kWh
    "yearUsage" DOUBLE PRECISION NOT NULL DEFAULT 0, -- 年度用电量 kWh
    "daysInMonth" INTEGER NOT NULL DEFAULT 30,
    "currentDay" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- DeviceUsageStat：设备日使用统计（顾问 usage 持久化）
-- ---------------------------------------------------------------------------
CREATE TABLE "DeviceUsageStat" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "day" TEXT NOT NULL,                             -- YYYY-MM-DD
    "onCount" INTEGER NOT NULL DEFAULT 0,            -- 当日开启次数
    "totalRuntimeMs" BIGINT NOT NULL DEFAULT 0,      -- 当日累计运行毫秒
    "lastOn" TIMESTAMP(3),                           -- 最近一次开启时刻
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceUsageStat_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- EnergyHourlyBaseline：能耗 hour×dow 同时段基线
-- ---------------------------------------------------------------------------
CREATE TABLE "EnergyHourlyBaseline" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,                         -- 0–23
    "dow" INTEGER NOT NULL,                          -- 0=周日
    "avgKwh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyHourlyBaseline_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- ActivityBaseline：房间作息活跃度基线（从 EventLog 学习）
-- ---------------------------------------------------------------------------
CREATE TABLE "ActivityBaseline" (
    "id" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "dow" INTEGER NOT NULL,
    "activityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityBaseline_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AdaptiveOverride：用户手动 override 学习（温控/照明偏移）
-- ---------------------------------------------------------------------------
CREATE TABLE "AdaptiveOverride" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,                           -- 房间 id 或 global
    "kind" TEXT NOT NULL,                            -- climate | light
    "offset" DOUBLE PRECISION NOT NULL DEFAULT 0,    -- 学习到的偏移量
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdaptiveOverride_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AwayPatternBucket：离家模拟 — 开灯概率（dow×hour）
-- ---------------------------------------------------------------------------
CREATE TABLE "AwayPatternBucket" (
    "id" TEXT NOT NULL,
    "dow" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "lightOnProb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwayPatternBucket_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Recommendation：习惯学习推荐（场景/自动化草案）
-- ---------------------------------------------------------------------------
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,                            -- automation | scene
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,                        -- 草案内容
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,     -- 推荐分数
    "status" "RecommendationStatus" NOT NULL DEFAULT 'pending', -- pending | adopted | dismissed
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- ###########################################################################
-- 七、访客门锁 / Web Push / 房间映射 / 能耗聚合
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- GuestPass：访客门锁临时密码（AES-GCM 密文落库）
-- ---------------------------------------------------------------------------
CREATE TABLE "GuestPass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,                            -- 访客备注名
    "lockEntityId" TEXT NOT NULL,                    -- 门锁实体
    "slot" INTEGER NOT NULL,                         -- 门锁密码槽位
    "codeCipher" TEXT NOT NULL,                      -- 密文
    "codeIv" TEXT NOT NULL,                          -- IV
    "codeTag" TEXT NOT NULL,                         -- GCM tag
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,               -- 到期后撤销
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestPass_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- WebPushSubscription：浏览器 Web Push 订阅（重启后仍可推送）
-- ---------------------------------------------------------------------------
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,                        -- Push 服务端点（唯一）
    "p256dh" TEXT NOT NULL,                          -- 客户端公钥
    "auth" TEXT NOT NULL,                            -- 认证密钥
    "userAgent" TEXT,
    "label" TEXT,                                    -- 用户可读标签
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Area：用户自定义房间（移动端 Rooms；可关联 HA area）
-- ---------------------------------------------------------------------------
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🏠',
    "backgroundUrl" TEXT,                            -- 房间背景图
    "haAreaId" TEXT,                                 -- 可选关联 HA area_registry.area_id
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- AreaEntity：房间 ↔ HA 实体映射（支持拖拽排序）
-- ---------------------------------------------------------------------------
CREATE TABLE "AreaEntity" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,                          -- FK → Area（级联删除）
    "entityId" TEXT NOT NULL,                        -- HA 实体 ID
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AreaEntity_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- EnergyUsageDaily / Monthly：能耗日/月聚合
-- ---------------------------------------------------------------------------
-- 由 EventLog 写入管线增量累计正向 kWh；Redis 不可用时供趋势查询。
CREATE TABLE "EnergyUsageDaily" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "day" TEXT NOT NULL,                             -- YYYY-MM-DD（Asia/Shanghai）
    "kwh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnergyUsageMonthly" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "month" TEXT NOT NULL,                           -- YYYY-MM（Asia/Shanghai）
    "kwh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergyUsageMonthly_pkey" PRIMARY KEY ("id")
);

-- ###########################################################################
-- 八、索引
-- ###########################################################################

-- User：用户名唯一
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- LoginAudit：按时间 / 用户名检索
CREATE INDEX "LoginAudit_createdAt_idx" ON "LoginAudit"("createdAt");
CREATE INDEX "LoginAudit_username_idx" ON "LoginAudit"("username");

-- GuestShareCode：过期清理扫描
CREATE INDEX "GuestShareCode_expiresAt_idx" ON "GuestShareCode"("expiresAt");

-- ProjectConfig：projectId 唯一
CREATE UNIQUE INDEX "ProjectConfig_projectId_key" ON "ProjectConfig"("projectId");

-- EventLog：实体+时间、域+时间（父表索引，传播到各分区）
CREATE INDEX "EventLog_entityId_createdAt_idx" ON "EventLog"("entityId", "createdAt");
CREATE INDEX "EventLog_domain_createdAt_idx" ON "EventLog"("domain", "createdAt");
-- BRIN：分区内时间范围检索；勿再加 btree(createdAt)
CREATE INDEX "EventLog_createdAt_brin_idx" ON "EventLog" USING BRIN ("createdAt");

-- ---------------------------------------------------------------------------
-- EventLog 初始分区：空库创建当月 + 下月
-- ---------------------------------------------------------------------------
-- 命名：EventLog_YYYYMM；后续由 PartitionMaintenanceService 维护（创建未来月、DROP 过期月）。
DO $tag$
DECLARE
  m        text;
  start_ts text;
  end_ts   text;
BEGIN
  FOR i IN 0..1 LOOP
    m := to_char(date_trunc('month', CURRENT_DATE) + i * interval '1 month', 'YYYYMM');
    start_ts := to_char(date_trunc('month', CURRENT_DATE) + i * interval '1 month', 'YYYY-MM-DD') || ' 00:00:00';
    end_ts := to_char(date_trunc('month', CURRENT_DATE) + (i + 1) * interval '1 month', 'YYYY-MM-DD') || ' 00:00:00';
    IF to_regclass(format('"EventLog_%s"', m)) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE "EventLog_%s" PARTITION OF "EventLog" FOR VALUES FROM (%L) TO (%L)',
        m,
        start_ts,
        end_ts
      );
    END IF;
  END LOOP;
END $tag$;

-- Automation / Scene / Script：HA 配置 id 查找
CREATE INDEX "Automation_haConfigId_idx" ON "Automation"("haConfigId");

-- AutomationVariable：scope+key 查询、按规则；唯一性用部分索引（global/rule 分开，ruleId 可空）
CREATE INDEX "AutomationVariable_scope_key_idx" ON "AutomationVariable"("scope", "key");
CREATE INDEX "AutomationVariable_ruleId_idx" ON "AutomationVariable"("ruleId");
CREATE UNIQUE INDEX "AutomationVariable_global_key_key" ON "AutomationVariable"("key") WHERE "scope" = 'global';
CREATE UNIQUE INDEX "AutomationVariable_rule_key_key" ON "AutomationVariable"("ruleId", "key") WHERE "scope" = 'rule';

CREATE INDEX "Scene_haConfigId_idx" ON "Scene"("haConfigId");
CREATE UNIQUE INDEX "SceneSchedule_sceneId_key" ON "SceneSchedule"("sceneId");
CREATE INDEX "SceneSchedule_enabled_idx" ON "SceneSchedule"("enabled");

-- 执行历史：按归属 id / 时间
CREATE INDEX "SceneExecution_sceneId_idx" ON "SceneExecution"("sceneId");
CREATE INDEX "SceneExecution_executedAt_idx" ON "SceneExecution"("executedAt");
CREATE INDEX "AutomationExecution_automationId_idx" ON "AutomationExecution"("automationId");
CREATE INDEX "AutomationExecution_executedAt_idx" ON "AutomationExecution"("executedAt");

-- CommandAudit：时间、实体、用户、用户名+时间（管理端前缀检索）
CREATE INDEX "CommandAudit_createdAt_idx" ON "CommandAudit"("createdAt");
CREATE INDEX "CommandAudit_entityId_idx" ON "CommandAudit"("entityId");
CREATE INDEX "CommandAudit_userId_idx" ON "CommandAudit"("userId");
CREATE INDEX "CommandAudit_username_createdAt_idx" ON "CommandAudit"("username", "createdAt");

CREATE INDEX "ScriptExecution_scriptId_idx" ON "ScriptExecution"("scriptId");
CREATE INDEX "ScriptExecution_executedAt_idx" ON "ScriptExecution"("executedAt");
CREATE INDEX "Script_haConfigId_idx" ON "Script"("haConfigId");
CREATE INDEX "TemplateEntity_haConfigId_idx" ON "TemplateEntity"("haConfigId");

-- Notification：最新列表 / 未读列表
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- SecurityEvent / Earthquake / AlertRule / HomeMode
CREATE INDEX "SecurityEvent_type_idx" ON "SecurityEvent"("type");
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");
CREATE INDEX "EarthquakeAlertHistory_savedAt_idx" ON "EarthquakeAlertHistory"("savedAt" DESC);
CREATE INDEX "EarthquakeAlertHistory_eventId_idx" ON "EarthquakeAlertHistory"("eventId");
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");
CREATE INDEX "AlertRule_entityId_idx" ON "AlertRule"("entityId");
CREATE INDEX "AlertRule_createdAt_idx" ON "AlertRule"("createdAt");
CREATE INDEX "HomeMode_isActive_idx" ON "HomeMode"("isActive");
-- 同互斥组仅一条激活（Prisma 无法表达 WHERE）
CREATE UNIQUE INDEX "HomeMode_active_per_group_idx" ON "HomeMode"("exclusiveGroup") WHERE "isActive" = true;

-- 唯一：一实体一行
CREATE UNIQUE INDEX "DeviceLifespan_entityId_key" ON "DeviceLifespan"("entityId");
CREATE UNIQUE INDEX "EnergyBaseline_entityId_key" ON "EnergyBaseline"("entityId");

-- AdvisorCooldown：去重键唯一；按截止时间清理
CREATE UNIQUE INDEX "AdvisorCooldown_dedupKey_key" ON "AdvisorCooldown"("dedupKey");
CREATE INDEX "AdvisorCooldown_cooldownUntil_idx" ON "AdvisorCooldown"("cooldownUntil");

-- Environment / Water：按房间或实体 + 时间（含复合索引，规模化时序查询）
CREATE INDEX "EnvironmentRecord_room_idx" ON "EnvironmentRecord"("room");
CREATE INDEX "EnvironmentRecord_recordedAt_idx" ON "EnvironmentRecord"("recordedAt");
CREATE INDEX "EnvironmentRecord_room_recordedAt_idx" ON "EnvironmentRecord"("room", "recordedAt");
CREATE INDEX "WaterRecord_entityId_idx" ON "WaterRecord"("entityId");
CREATE INDEX "WaterRecord_recordedAt_idx" ON "WaterRecord"("recordedAt");
CREATE INDEX "WaterRecord_entityId_recordedAt_idx" ON "WaterRecord"("entityId", "recordedAt");

-- DeviceUsageStat：日窗口 + 实体；实体+日唯一
CREATE INDEX "DeviceUsageStat_day_idx" ON "DeviceUsageStat"("day");
CREATE INDEX "DeviceUsageStat_entityId_idx" ON "DeviceUsageStat"("entityId");
CREATE UNIQUE INDEX "DeviceUsageStat_entityId_day_key" ON "DeviceUsageStat"("entityId", "day");

-- 学习基线唯一键
CREATE INDEX "EnergyHourlyBaseline_entityId_idx" ON "EnergyHourlyBaseline"("entityId");
CREATE UNIQUE INDEX "EnergyHourlyBaseline_entityId_hour_dow_key" ON "EnergyHourlyBaseline"("entityId", "hour", "dow");
CREATE INDEX "ActivityBaseline_room_idx" ON "ActivityBaseline"("room");
CREATE UNIQUE INDEX "ActivityBaseline_room_hour_dow_key" ON "ActivityBaseline"("room", "hour", "dow");
CREATE UNIQUE INDEX "AdaptiveOverride_scope_kind_key" ON "AdaptiveOverride"("scope", "kind");
CREATE UNIQUE INDEX "AwayPatternBucket_dow_hour_key" ON "AwayPatternBucket"("dow", "hour");

-- Recommendation：状态 / 时间 / 去重查询
CREATE INDEX "Recommendation_status_idx" ON "Recommendation"("status");
CREATE INDEX "Recommendation_createdAt_idx" ON "Recommendation"("createdAt");
CREATE INDEX "Recommendation_type_status_title_idx" ON "Recommendation"("type", "status", "title");

-- GuestPass：活跃且未过期列表；按门锁
CREATE INDEX "GuestPass_active_expiresAt_idx" ON "GuestPass"("active", "expiresAt");
CREATE INDEX "GuestPass_lockEntityId_idx" ON "GuestPass"("lockEntityId");

-- WebPush：endpoint 唯一；按创建时间
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE INDEX "WebPushSubscription_createdAt_idx" ON "WebPushSubscription"("createdAt");

-- Area / AreaEntity
CREATE UNIQUE INDEX "Area_haAreaId_key" ON "Area"("haAreaId");
CREATE INDEX "Area_sortOrder_idx" ON "Area"("sortOrder");
CREATE INDEX "AreaEntity_entityId_idx" ON "AreaEntity"("entityId");
CREATE INDEX "AreaEntity_areaId_sortOrder_idx" ON "AreaEntity"("areaId", "sortOrder");
CREATE UNIQUE INDEX "AreaEntity_areaId_entityId_key" ON "AreaEntity"("areaId", "entityId");

-- 能耗聚合：窗口扫描 + 实体过滤；实体+日/月唯一
CREATE INDEX "EnergyUsageDaily_day_idx" ON "EnergyUsageDaily"("day");
CREATE INDEX "EnergyUsageDaily_entityId_idx" ON "EnergyUsageDaily"("entityId");
CREATE UNIQUE INDEX "EnergyUsageDaily_entityId_day_key" ON "EnergyUsageDaily"("entityId", "day");
CREATE INDEX "EnergyUsageMonthly_month_idx" ON "EnergyUsageMonthly"("month");
CREATE INDEX "EnergyUsageMonthly_entityId_idx" ON "EnergyUsageMonthly"("entityId");
CREATE UNIQUE INDEX "EnergyUsageMonthly_entityId_month_key" ON "EnergyUsageMonthly"("entityId", "month");

-- ###########################################################################
-- 九、外键
-- ###########################################################################

-- 登录审计 → 用户：用户删除后审计保留，userId 置空
ALTER TABLE "LoginAudit" ADD CONSTRAINT "LoginAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 场景/自动化/脚本执行史：父记录删除时级联清理历史
ALTER TABLE "SceneExecution" ADD CONSTRAINT "SceneExecution_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SceneSchedule" ADD CONSTRAINT "SceneSchedule_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationVariable" ADD CONSTRAINT "AutomationVariable_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 命令审计 → 用户：用户删除后审计保留
ALTER TABLE "CommandAudit" ADD CONSTRAINT "CommandAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScriptExecution" ADD CONSTRAINT "ScriptExecution_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 房间实体映射：删除房间时级联删除映射行
ALTER TABLE "AreaEntity" ADD CONSTRAINT "AreaEntity_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
