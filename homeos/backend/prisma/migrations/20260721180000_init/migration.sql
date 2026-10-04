-- =============================================================================
-- HomeOS 数据库初始化（单条 baseline，2026-10-04 精简后重生成）
-- =============================================================================
-- 用途：空库 / 清卷后首次 prisma migrate deploy 的唯一迁移。
-- 内容：由 `prisma migrate diff --from-empty --to-schema prisma/schema.prisma`
--       生成，并手工补回无法由 Prisma 表达的 EventLog 分区 DDL，
--       包含当前 schema 全量模型（19）、索引、外键。
-- 说明：
--   1) 本 baseline 已移除联动四件套（automation / scene / script /
--      template-entity）、energy / environment、设备寿命与顾问等模型（43 → 21 model）；
--      其中 EventLog 与 DeviceUsageStat 已按使用需求恢复（19 → 21）。
--   2) EventLog 的按月 RANGE 分区无法由 Prisma schema 表达，故下方以手工 DDL
--      写入（PARTITION BY RANGE(createdAt) + BRIN 索引 + 初始月份分区），
--      未来分区创建 / 过期整月分区 DROP 由 PartitionMaintenanceService 维护。
--   3) 已并入原增量迁移 `20260921170000_add_alert_rule_title`（AlertRule.title）。
--   4) 已移除本地房间平行层 Area / AreaEntity（21 → 19 model）：房间目录统一由 HA
--      area_registry 提供（经 EntityAreaEnrichmentService 注入 area_id/area_name），
--      不再保留与 HA 重复的第二套房间真相源。
--   5) 已有数据卷必须清空后才能部署；不做旧库升级/自愈。
-- =============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'adult', 'child', 'guest');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('info', 'warn', 'danger');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "preferences" JSONB,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAudit" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestShareCode" (
    "code" TEXT NOT NULL,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestShareCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ProjectConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT 'default',
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "role" TEXT,
    "domain" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "level" "NotificationLevel" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "entityId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "deliveryChannels" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mode" TEXT,
    "entityId" TEXT,
    "detail" TEXT NOT NULL,
    "zones" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarthquakeAlertHistory" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "epicenter" TEXT NOT NULL,
    "magnitude" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "originTime" BIGINT NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "countdown" INTEGER NOT NULL,
    "localIntensity" DOUBLE PRECISION NOT NULL,
    "maxIntensity" TEXT,
    "alertKind" TEXT,
    "source" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarthquakeAlertHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT,
    "condition" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'warn',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "messageTemplate" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeMode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'home',
    "config" JSONB NOT NULL,
    "triggers" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "deviceSnapshot" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "exclusiveGroup" TEXT DEFAULT 'default',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeKv" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeKv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildModeRuntime" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "mediaUsedMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageDate" TEXT NOT NULL DEFAULT '',
    "overrideUntil" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildModeRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwayPatternBucket" (
    "id" TEXT NOT NULL,
    "dow" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "lightOnProb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwayPatternBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestPass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lockEntityId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "codeCipher" TEXT NOT NULL,
    "codeIv" TEXT NOT NULL,
    "codeTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- EventLog：实体状态变更时序日志（手工维护的分区表）
-- ---------------------------------------------------------------------------
-- 说明：Prisma schema 无法表达 PARTITION BY RANGE，故本段 DDL 手工写入基线；
--   - PARTITION BY RANGE (createdAt)：按月物理分区，便于整月 DROP 与跨月查询；
--   - 主键必须包含分区键 → (createdAt, id)；id 仍为 SERIAL 自增；
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "LoginAudit_createdAt_idx" ON "LoginAudit"("createdAt");

-- CreateIndex
CREATE INDEX "LoginAudit_username_idx" ON "LoginAudit"("username");

-- CreateIndex
CREATE INDEX "GuestShareCode_expiresAt_idx" ON "GuestShareCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectConfig_projectId_key" ON "ProjectConfig"("projectId");

-- CreateIndex
CREATE INDEX "CommandAudit_createdAt_idx" ON "CommandAudit"("createdAt");

-- CreateIndex
CREATE INDEX "CommandAudit_entityId_idx" ON "CommandAudit"("entityId");

-- CreateIndex
CREATE INDEX "CommandAudit_userId_idx" ON "CommandAudit"("userId");

-- CreateIndex
CREATE INDEX "CommandAudit_username_createdAt_idx" ON "CommandAudit"("username", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_idx" ON "SecurityEvent"("type");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "EarthquakeAlertHistory_savedAt_idx" ON "EarthquakeAlertHistory"("savedAt" DESC);

-- CreateIndex
CREATE INDEX "EarthquakeAlertHistory_eventId_idx" ON "EarthquakeAlertHistory"("eventId");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "AlertRule_entityId_idx" ON "AlertRule"("entityId");

-- CreateIndex
CREATE INDEX "AlertRule_createdAt_idx" ON "AlertRule"("createdAt");

-- CreateIndex
CREATE INDEX "HomeMode_isActive_idx" ON "HomeMode"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AwayPatternBucket_dow_hour_key" ON "AwayPatternBucket"("dow", "hour");

-- CreateIndex
CREATE INDEX "GuestPass_active_expiresAt_idx" ON "GuestPass"("active", "expiresAt");

-- CreateIndex
CREATE INDEX "GuestPass_lockEntityId_idx" ON "GuestPass"("lockEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "WebPushSubscription_createdAt_idx" ON "WebPushSubscription"("createdAt");

-- AddForeignKey
ALTER TABLE "LoginAudit" ADD CONSTRAINT "LoginAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandAudit" ADD CONSTRAINT "CommandAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- DeviceUsageStat：日窗口 + 实体；实体+日唯一
CREATE INDEX "DeviceUsageStat_day_idx" ON "DeviceUsageStat"("day");
CREATE INDEX "DeviceUsageStat_entityId_idx" ON "DeviceUsageStat"("entityId");
CREATE UNIQUE INDEX "DeviceUsageStat_entityId_day_key" ON "DeviceUsageStat"("entityId", "day");
