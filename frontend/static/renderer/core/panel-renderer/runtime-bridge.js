/*
 * 区块三：运行期桥接（WebSocket、订阅、状态缓存、动作派发）。
 *
 * connectRuntime 是入口：连上后按文档里登记过的实体分批订阅，把推送分发给已渲染的控件，
 * 并把「点了按钮到 HA 确认之间」的那段时间用乐观状态顶上（applyOptimisticToggle）。
 * 历史曲线的拉取与重试（图表历史缓存）也挂在同一条链上。
 *
 * 本区块是唯一持有连接与重试计时器的地方；它不改文档、不建选中框，
 * 需要改 DOM 时一律转调 document-core.js 的刷新方法。
 */

import {
  coverComponentIsDream,
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  presenceMotionEventConfig,
  renderAirConditionerAirflowLayer,
  renderRegisteredComponent
} from "../registry.js?v=2609251754";
import { apiErrorMessage } from "../../../utils/api-error.js?v=2609251754";
import { entityDomainFromId } from "../../../utils/entities.js?v=2609251754";
import { resolveStateEntry } from "../../../utils/state-entry.js?v=2609251754";
import { relatedPopupContext } from "../../../shared/related-entities.js?v=2609251754";
import {
  entityPowerIsOn,
  entityPowerTarget,
  entityToggleCommand,
  optimisticToggleState
} from "../entity-power.js?v=2609251754";
import {
  ICON_VISIBILITY_VIRTUAL_KIND,
  isVirtualEntityId,
  parseVirtualEntityId
} from "../../../shared/virtual-entities.js?v=2609251754";
import { airflowLayerGeometry } from "../../geometry/transform-geometry.js?v=2609251754";
import { effectFadeDuration } from "../../geometry/effect-geometry.js?v=2609251754";
import { entityMetadataIsAvailable } from "../entity-metadata.js?v=2609251754";
import { relatedVacuumBatteryEntity } from "../../controls/vacuum-runtime.js?v=2609251754";
import {
  coverToggleServiceForComponent,
  relatedAirerCurrentPositionSensor,
  relatedAirerLightEntity,
  relatedAirerMotorActionEntities,
  relatedAirerMotorSpeedSensor,
  relatedAirerPositionNumberEntity,
  relatedCoverMotorReverseEntity,
  relatedDeviceDomainEntity,
  relatedDeviceEntity,
  relatedWaterHeaterEntities,
  runtimeCoverStateIsActive,
  runtimeEntityStateIsActive
} from "../../controls/cover-runtime.js?v=2609251754";
// 电机方向（读控件配置）在 cover-direction.js：它能被 registry.js 与 cover-runtime.js
// 同时 import（叶子模块，不成环）。本文件只做转出，公开面不变。
import { coverMotorIsReversedForComponent } from "../../controls/cover-direction.js?v=2609251754";
import {
  HISTORY_FETCH_TIMEOUT_MS,
  cacheHistorySeries,
  historyRequestStillRelevant,
  historySeriesCacheKey
} from "../runtime-caches.js?v=2609251754";
import {
  collectComponents,
  collectEntityIds,
  lineChartRuntimeStateNeedsHydration,
  syncedLineChartProperties
} from "../runtime-document.js?v=2609251754";
import {
  OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS,
  RUNTIME_SUBSCRIPTION_ENTITY_LIMIT,
  componentDialogTitle,
  createOptimisticToggleTimeoutError,
  isSupportedComponentAction
} from "./primitives.js?v=2609251754";

export const runtimeBridgeMethods = {
  /**
   * 连接运行期通道并订阅当前页需要的实体。
   * 订阅集合不等于「页面上写到的实体」，还要补齐一批隐式依赖：弹窗里引用的实体、人体传感器配套的「无人 移动」实体、扫地机的状态传感器与清扫模式、窗帘的电机反向开关与晾衣机的位置实体等 —— 漏订一个，对应
   * 控件就会永远停在旧状态。force 为 true 时跳过「订阅集合没变就不重连」的短路，用于息屏 / 网络恢复与补数据重试。
   */
  connectRuntime({ force: forceReconnect = false } = {}) {
    if (!this.document || this.destroyed) {
      this.disconnectRuntime();
      return;
    }
    const activePageDefinition = this.page || this.document.pages?.[0];
    const sharedComponentByIdMap = new Map(
      (this.document.sharedComponents || []).map(sharedComponentRecord => [
        sharedComponentRecord.id,
        sharedComponentRecord
      ])
    );
    const runtimeComponents = [
      ...(activePageDefinition?.sharedComponentIds || [])
        .map(sharedComponentIdentifier => sharedComponentByIdMap.get(sharedComponentIdentifier))
        .filter(Boolean),
      ...(activePageDefinition?.components || [])
    ];
    const subscriptionEntityIds = collectEntityIds(runtimeComponents);
    // 弹窗是「脱离页面」的一块内容：它的实体可能这一页根本没用过，
    // 不在这里补进订阅集合，弹窗里的控件就只会有初始状态。
    const activePopupDefinition = this.activePopupId
      ? (this.document.customPopups || []).find(
          customPopupDefinition => String(customPopupDefinition.id || "") === this.activePopupId
        )
      : null;
    for (const activePopupModule of activePopupDefinition?.modules || []) {
      if (activePopupModule.entityId && !isVirtualEntityId(activePopupModule.entityId)) {
        subscriptionEntityIds.add(activePopupModule.entityId);
      }
    }
    // 人体传感器的 event 实体只报「有人移动」，配套的 sensor 才报「无人移动」；
    // 订阅必须覆盖到配套实体，否则界面会一直停在「有人」。
    for (const eventEntityId of [...subscriptionEntityIds]) {
      if (this.entityMetadata.get(eventEntityId)?.domain !== "event") {
        continue;
      }
      const presenceComponentDefinition = collectComponents(
        runtimeComponents,
        componentDefinition =>
          componentDefinition.type === "presence-sensor" &&
          componentDefinition.bindings?.entity?.entityId === eventEntityId
      )[0];
      if (!presenceComponentDefinition) {
        continue;
      }
      const presenceCompanionConfig = presenceMotionEventConfig(
        eventEntityId,
        this.states.get(eventEntityId),
        this.entityMetadata,
        this.states,
        presenceComponentDefinition.properties
      );
      for (const companionPresenceEntityId of presenceCompanionConfig.companionEntityIds) {
        subscriptionEntityIds.add(companionPresenceEntityId);
      }
    }
    // 扫地机的工作状态传感器单独存在，其 vacuum 本体不在订阅集合里时也要一起补上，
    // 否则详情里的「清扫中」不会随任务变化。
    for (const sensorEntityId of [...subscriptionEntityIds]) {
      const sensorMetadata = this.entityMetadata.get(sensorEntityId);
      if (
        sensorMetadata?.domain !== "sensor" ||
        !sensorMetadata.deviceId ||
        !["state", "status", "task_status"].includes(sensorMetadata.translationKey)
      ) {
        continue;
      }
      const vacuumMetadata = [...this.entityMetadata.values()].find(
        metadataEntry =>
          metadataEntry.deviceId === sensorMetadata.deviceId &&
          metadataEntry.domain === "vacuum" &&
          entityMetadataIsAvailable(metadataEntry)
      );
      if (vacuumMetadata?.entityId) {
        subscriptionEntityIds.add(vacuumMetadata.entityId);
      }
    }
    for (const vacuumEntity of [...subscriptionEntityIds]) {
      if (this.entityMetadata.get(vacuumEntity)?.domain !== "vacuum") {
        continue;
      }
      const vacuumObjectId = vacuumEntity.slice(vacuumEntity.indexOf(".") + 1);
      // 清扫模式是 select 实体，不订它就点不动模式切换。
      const vacuumModeEntity = relatedDeviceEntity(
        this.entityMetadata,
        vacuumEntity,
        "select",
        "cleaning_mode",
        "select." + vacuumObjectId + "_cleaning_mode"
      );
      if (vacuumModeEntity?.entityId) {
        subscriptionEntityIds.add(vacuumModeEntity.entityId);
      }
      const vacuumBatteryRelatedEntity = relatedVacuumBatteryEntity(
        this.entityMetadata,
        this.states,
        vacuumEntity
      );
      if (vacuumBatteryRelatedEntity?.entityId) {
        subscriptionEntityIds.add(vacuumBatteryRelatedEntity.entityId);
      }
    }
    for (const coverEntityId of [...subscriptionEntityIds]) {
      if (
        (this.entityMetadata.get(coverEntityId)?.domain ||
          entityDomainFromId(coverEntityId)) !== "cover"
      ) {
        continue;
      }
      const coverMotorReverseEntity = relatedCoverMotorReverseEntity(
        this.entityMetadata,
        coverEntityId
      );
      if (coverMotorReverseEntity?.entityId) {
        subscriptionEntityIds.add(coverMotorReverseEntity.entityId);
      }
      const airerLightRelatedEntity = relatedAirerLightEntity(this.entityMetadata, coverEntityId);
      if (airerLightRelatedEntity?.entityId) {
        subscriptionEntityIds.add(airerLightRelatedEntity.entityId);
      }
      const airerPositionRelatedEntity = relatedAirerPositionNumberEntity(
        this.entityMetadata,
        coverEntityId
      );
      if (airerPositionRelatedEntity?.entityId) {
        subscriptionEntityIds.add(airerPositionRelatedEntity.entityId);
      }
      const airerPositionSensorEntity = relatedAirerCurrentPositionSensor(
        this.entityMetadata,
        coverEntityId
      );
      if (airerPositionSensorEntity?.entityId) {
        subscriptionEntityIds.add(airerPositionSensorEntity.entityId);
      }
      const airerMotorSpeedEntity = relatedAirerMotorSpeedSensor(
        this.entityMetadata,
        coverEntityId
      );
      if (airerMotorSpeedEntity?.entityId) {
        subscriptionEntityIds.add(airerMotorSpeedEntity.entityId);
      }
      const airerActionEntityMap = relatedAirerMotorActionEntities(
        this.entityMetadata,
        coverEntityId
      );
      for (const airerActionEntity of Object.values(airerActionEntityMap)) {
        if (airerActionEntity?.entityId) {
          subscriptionEntityIds.add(airerActionEntity.entityId);
        }
      }
    }
    for (const climateEntityId of [...subscriptionEntityIds]) {
      const climateMetadata = this.entityMetadata.get(climateEntityId);
      if (!["climate", "fan"].includes(String(climateMetadata?.domain || ""))) {
        continue;
      }
      const climateLightEntity = relatedDeviceDomainEntity(
        this.entityMetadata,
        climateEntityId,
        "light"
      );
      if (climateLightEntity?.entityId) {
        subscriptionEntityIds.add(climateLightEntity.entityId);
      }
    }
    for (const waterHeaterRelatedId of [...subscriptionEntityIds]) {
      if (this.entityMetadata.get(waterHeaterRelatedId)?.domain === "water_heater") {
        for (const waterHeaterRelatedEntity of relatedWaterHeaterEntities(
          this.entityMetadata,
          waterHeaterRelatedId
        )) {
          subscriptionEntityIds.add(waterHeaterRelatedEntity.entityId);
        }
      }
    }
    for (const profiledEntityId of [...subscriptionEntityIds]) {
      const profileEntry = this.deviceProfile(profiledEntityId);
      if (profileEntry) {
        for (const profileRoleName of [
          "climate",
          "cover",
          "fan",
          "light",
          "power",
          "mode",
          "temperature",
          "humidity",
          "pm25",
          "hcho",
          "pm10",
          "filterLife",
          "filterLeftTime",
          "airQuality",
          "backrest",
          "leg",
          "waist",
          "memory1",
          "memory2"
        ]) {
          const profileRoleEntityId = profileEntry.roles?.[profileRoleName];
          if (profileRoleEntityId) {
            subscriptionEntityIds.add(profileRoleEntityId);
          }
        }
      }
    }
    const subscriptionEntityList = [...subscriptionEntityIds];
    if (!subscriptionEntityList.length) {
      this.disconnectRuntime();
      this.runtimeHydrationRetryAttempt = 0;
      return;
    }
    if (subscriptionEntityList.length > RUNTIME_SUBSCRIPTION_ENTITY_LIMIT) {
      this.disconnectRuntime();
      const entityCountText = String(subscriptionEntityList.length);
      if (this.runtimeEntityLimitSignature !== entityCountText) {
        this.runtimeEntityLimitSignature = entityCountText;
        this.options.onError?.(
          new Error(
            "当前项目需要实时订阅 " +
              subscriptionEntityList.length +
              " 个实体，已超过 " +
              RUNTIME_SUBSCRIPTION_ENTITY_LIMIT +
              " 个上限。请减少统计或控件中绑定的实体。"
          )
        );
      }
      return;
    }
    this.runtimeEntityLimitSignature = "";
    const subscriptionSignature = JSON.stringify([...subscriptionEntityList].sort());
    const existingSubscription = this.runtimeSubscription;
    const isSocketConnecting = this.socket?.readyState === WebSocket.CONNECTING;
    const isSocketOpen = this.socket?.readyState === WebSocket.OPEN;
    if (
      !forceReconnect &&
      existingSubscription &&
      (isSocketConnecting ||
        (isSocketOpen && existingSubscription.signature === subscriptionSignature))
    ) {
      existingSubscription.entityIds = subscriptionEntityList;
      existingSubscription.runtimeComponents = runtimeComponents;
      existingSubscription.signature = subscriptionSignature;
      if (isSocketOpen) {
        this.scheduleRuntimeHydrationRetry(existingSubscription, this.socketGeneration);
      }
      return;
    }
    if (existingSubscription?.signature !== subscriptionSignature) {
      this.runtimeHydrationRetryAttempt = 0;
    }
    this.disconnectRuntime();
    const socketGenerationId = this.socketGeneration;
    const runtimeSubscription = {
      entityIds: subscriptionEntityList,
      runtimeComponents: runtimeComponents,
      signature: subscriptionSignature
    };
    this.runtimeSubscription = runtimeSubscription;
    const webSocketProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const runtimeSocket = new WebSocket(
      webSocketProtocol + "://" + window.location.host + "/api/v1/ws/runtime"
    );
    this.socket = runtimeSocket;
    runtimeSocket.addEventListener("open", () => {
      if (socketGenerationId === this.socketGeneration) {
        if (this.reconnectAttempt > 0) {
          window.HABridgeLog?.report("success", "实时连接", "实时状态连接已恢复", {
            phase: "websocket-reconnected",
            path: "/api/v1/ws/runtime"
          });
        }
        this.reconnectAttempt = 0;
        // 订阅请求已发出（服务端仍可能随后以 4400 拒绝，那时会再报一次不可用）。
        this.options.onRuntimeAvailabilityChange?.(true);
        runtimeSocket.send(
          JSON.stringify({
            type: "subscribe",
            entityIds: runtimeSubscription.entityIds
          })
        );
      }
    });
    runtimeSocket.addEventListener("message", socketMessageEvent => {
      if (socketGenerationId !== this.socketGeneration) {
        return;
      }
      const { entityIds: subscribedEntityIds } = runtimeSubscription;
      let socketMessage;
      try {
        socketMessage = JSON.parse(socketMessageEvent.data);
      } catch (socketMessageError) {
        window.HABridgeLog?.error(
          socketMessageError,
          {
            phase: "websocket-message",
            path: "/api/v1/ws/runtime"
          },
          "实时状态消息格式异常"
        );
        return;
      }
      if (socketMessage.type === "snapshot") {
        const snapshotStates = socketMessage.states || [];
        const snapshotEntityIds = new Set(
          snapshotStates.map(snapshotState => String(snapshotState?.entityId || "")).filter(Boolean)
        );
        for (const staleEntityId of subscribedEntityIds) {
          if (!snapshotEntityIds.has(staleEntityId)) {
            if (this.states.has(staleEntityId)) {
              this.removedRuntimeEntityIds.add(staleEntityId);
            }
            this.states.delete(staleEntityId);
          }
        }
        for (const snapshotEntityState of snapshotStates) {
          if (this.optimisticStateIsConfirmed(snapshotEntityState.entityId, snapshotEntityState)) {
            this.rememberLightVisualState(snapshotEntityState.entityId, snapshotEntityState);
            this.removedRuntimeEntityIds.delete(snapshotEntityState.entityId);
            this.states.set(snapshotEntityState.entityId, snapshotEntityState);
            this.applyRuntimeStateHandlers(
              snapshotEntityState.entityId,
              resolveStateEntry(snapshotEntityState)
            );
          }
        }
        this.options.onRuntimeStateChange?.(snapshotStates);
        this.tryOpenPendingEntityDetails();
        for (const refreshedState of snapshotStates) {
          this.refreshVacuumMapEntity(refreshedState.entityId);
        }
        if (this.detailsStateSync?.handlers) {
          for (const [detailsHandlerEntityId, handlerCallbacks] of this.detailsStateSync.handlers) {
            const handlerEntityState = this.states.get(detailsHandlerEntityId);
            if (handlerEntityState) {
              for (const stateHandlerCallback of handlerCallbacks) {
                stateHandlerCallback(resolveStateEntry(handlerEntityState));
              }
            }
          }
        } else {
          const dialogEntityState = this.detailsStateSync
            ? this.states.get(this.detailsStateSync.entityId)
            : null;
          if (this.detailsStateSync && dialogEntityState) {
            this.detailsStateSync.apply(resolveStateEntry(dialogEntityState));
          }
        }
        this.refreshRuntimeComponents([...snapshotEntityIds, ...this.removedRuntimeEntityIds]);
        this.scheduleRuntimeHydrationRetry(runtimeSubscription, socketGenerationId);
      } else if (socketMessage.type === "state_removed") {
        const removedEntityId = String(socketMessage.entityId || "");
        if (!removedEntityId) {
          return;
        }
        const removedStateUpdate = {
          type: "state_changed",
          entityId: removedEntityId,
          domain: entityDomainFromId(removedEntityId),
          state: "unavailable",
          attributes: {},
          available: false
        };
        this.removedRuntimeEntityIds.add(removedEntityId);
        this.states.delete(removedEntityId);
        this.options.onRuntimeStateChange?.([]);
        this.tryOpenPendingEntityDetails();
        if (this.detailsStateSync?.handlers?.has(removedEntityId)) {
          for (const removedStateHandler of this.detailsStateSync.handlers.get(removedEntityId)) {
            removedStateHandler(removedStateUpdate);
          }
        } else if (this.detailsStateSync?.entityId === removedEntityId) {
          this.detailsStateSync.apply(removedStateUpdate);
        }
        this.applyRuntimeStateHandlers(removedEntityId, removedStateUpdate);
        this.refreshRuntimeComponents([removedEntityId]);
        for (const affectedRuntimeComponentId of this.runtimeEntityComponentIndex.get(
          removedEntityId
        ) || []) {
          const affectedComponentEntry = this.componentRecords.get(affectedRuntimeComponentId);
          if (["line-chart", "camera", "vacuum-map"].includes(affectedComponentEntry?.type)) {
            this.refreshRuntimeComponent(affectedRuntimeComponentId);
          }
        }
        this.refreshVacuumMapEntity(removedEntityId);
      } else if (socketMessage.type === "resync_required") {
        if (socketGenerationId === this.socketGeneration && !this.destroyed) {
          this.connectRuntime({
            force: true
          });
        }
      } else if (socketMessage.type === "state_changed") {
        if (!this.optimisticStateIsConfirmed(socketMessage.entityId, socketMessage)) {
          return;
        }
        this.rememberLightVisualState(socketMessage.entityId, socketMessage);
        this.removedRuntimeEntityIds.delete(socketMessage.entityId);
        this.states.set(socketMessage.entityId, socketMessage);
        this.options.onRuntimeStateChange?.([socketMessage]);
        this.tryOpenPendingEntityDetails();
        this.refreshVacuumMapEntity(socketMessage.entityId);
        if (this.detailsStateSync?.handlers?.has(socketMessage.entityId)) {
          for (const changedStateHandler of this.detailsStateSync.handlers.get(
            socketMessage.entityId
          )) {
            changedStateHandler(resolveStateEntry(socketMessage));
          }
        } else if (this.detailsStateSync?.entityId === socketMessage.entityId) {
          this.detailsStateSync.apply(resolveStateEntry(socketMessage));
        }
        this.applyRuntimeStateHandlers(
          socketMessage.entityId,
          resolveStateEntry(socketMessage)
        );
        this.scheduleRuntimeRender(socketMessage.entityId);
      }
    });
    runtimeSocket.addEventListener("close", socketCloseEvent => {
      if (socketGenerationId !== this.socketGeneration || this.destroyed) {
        return;
      }
      this.socket = null;
      this.runtimeSubscription = null;
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      window.HABridgeLog?.report(
        "warning",
        "实时连接",
        "实时状态连接已断开（" +
          socketCloseEvent.code +
          "）" +
          ([4400, 4401, 4403].includes(socketCloseEvent.code) ? "" : "，正在重连"),
        {
          code: socketCloseEvent.code,
          phase: "websocket-disconnected",
          path: "/api/v1/ws/runtime"
        }
      );
      if (socketCloseEvent.code === 4401) {
        const isDisplayPath = window.location.pathname.startsWith("/display/");
        window.location.assign(
          isDisplayPath
            ? "/pair?next=" +
                encodeURIComponent("" + window.location.pathname + window.location.search)
            : "/login"
        );
        return;
      }
      if (socketCloseEvent.code === 4403) {
        window.location.replace("/license");
        return;
      }
      if (socketCloseEvent.code === 4400) {
        const closeReasonMessage =
          socketCloseEvent.reason === "too many entities"
            ? "当前项目的实时订阅实体超过 " +
              RUNTIME_SUBSCRIPTION_ENTITY_LIMIT +
              " 个，已停止重连。请减少统计或控件中绑定的实体。"
            : "实时状态订阅请求无效，已停止自动重连。";
        // 这一条是「永久停止」：渲染层不会再重连，画面会停在最后一帧。
        // 除了进日志，还要让宿主页面有机会把「画面可能已过期」显示出来
        // （展示页据此挂常驻横幅，见 display.js 的 onRuntimeAvailabilityChange）。
        this.options.onRuntimeAvailabilityChange?.(false, closeReasonMessage);
        this.options.onError?.(new Error(closeReasonMessage));
        return;
      }
      const reconnectDelayMs = Math.min(2 ** this.reconnectAttempt * 1000, 15000);
      this.reconnectAttempt += 1;
      this.reconnectTimer = window.setTimeout(() => this.connectRuntime(), reconnectDelayMs);
    });
    runtimeSocket.addEventListener("error", () => {
      if (runtimeSocket.readyState === WebSocket.OPEN) {
        runtimeSocket.close();
      }
    });
  },
  /**
   * 断开运行期订阅并作废当前连接。
   * socketGeneration 递增是关键作废手段：断开是异步的，旧连接之后仍可能派发消息或错误，
   * 靠代数比对全部丢弃，避免旧连接影响新订阅。
   */
  disconnectRuntime() {
    this.socketGeneration += 1;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    window.clearTimeout(this.runtimeHydrationRetryTimer);
    this.runtimeHydrationRetryTimer = null;
    const staleSocket = this.socket;
    this.socket = null;
    this.runtimeSubscription = null;
    if (!staleSocket || staleSocket.readyState >= WebSocket.CLOSING) {
      return;
    }
    if (staleSocket.readyState !== WebSocket.CONNECTING) {
      staleSocket.close();
      return;
    }
    let socketCloseTimer;
    /**
     * 取消「等待旧 socket 关闭」的兜底定时器与事件监听。
     * 被 closePendingSocket 与 socket 自身的 close 事件共用：后者覆盖「连接在超时前就
     * 自己失败」的情况，避免定时器空转。
     */
    const cancelSocketCloseWait = () => {
      window.clearTimeout(socketCloseTimer);
      staleSocket.removeEventListener("open", closePendingSocket);
      staleSocket.removeEventListener("close", cancelSocketCloseWait);
    };
    /**
     * 清理等待逻辑并关闭旧的运行期 socket。
     * 调用方已排除非 CONNECTING 的状态：连接中的 socket 直接 close 会被浏览器忽略，必须
     * 等它 open 之后（或超时兜底）再关；close() 前再确认一次状态，避免重复关闭。
     */
    const closePendingSocket = () => {
      cancelSocketCloseWait();
      if (staleSocket.readyState < WebSocket.CLOSING) {
        staleSocket.close();
      }
    };
    staleSocket.addEventListener("open", closePendingSocket, {
      once: true
    });
    staleSocket.addEventListener("close", cancelSocketCloseWait, {
      once: true
    });
    socketCloseTimer = window.setTimeout(closePendingSocket, 12000);
  },
  /**
   * 给「状态尚未补齐」的折线图实体安排一次补数据重连。
   * 只针对折线图：其它控件拿到当前状态就能画，折线图还要历史序列，缺失会一直空着。
   * 指数退避（500ms 起、封顶 10s）最多 5 次，每轮都用连接代数校验，重连或销毁后放弃本轮。
   */
  scheduleRuntimeHydrationRetry(subscription, generationId) {
    /**
     * 判断本次订阅里是否还有折线图实体缺数据（决定要不要继续补数据重试）。
     * 只盯折线图：其它控件拿到当前状态就能渲染，只有折线图依赖历史序列，缺失会一直空着；
     * 是否缺数据交给 lineChartRuntimeStateNeedsHydration 判定。
     */
    const needsHydration = () => {
      const { entityIds: hydrationEntityIds, runtimeComponents: hydrationComponents } =
        subscription;
      const chartEntityIds = new Set(
        collectComponents(
          hydrationComponents,
          hydrationComponent => hydrationComponent.type === "line-chart"
        )
          .map(chartComponent => String(chartComponent.bindings?.entity?.entityId || ""))
          .filter(Boolean)
      );
      return (
        hydrationEntityIds.filter(
          hydrationEntityId =>
            chartEntityIds.has(hydrationEntityId) &&
            lineChartRuntimeStateNeedsHydration(this.states.get(hydrationEntityId))
        ).length > 0
      );
    };
    if (!needsHydration()) {
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      this.runtimeHydrationRetryAttempt = 0;
      return;
    }
    if (this.runtimeHydrationRetryTimer || !(this.runtimeHydrationRetryAttempt < 5)) {
      return;
    }
    this.runtimeHydrationRetryAttempt += 1;
    // 退避公式 2^(n-1) × 500ms：第 1 次 500ms、第 2 次 1s……封顶 10s，
    // 兼顾「刚断就恢复」与「别一直重连」。
    const hydrationRetryDelayMs = Math.min(
      10000,
      2 ** (this.runtimeHydrationRetryAttempt - 1) * 500
    );
    this.runtimeHydrationRetryTimer = window.setTimeout(() => {
      this.runtimeHydrationRetryTimer = null;
      if (generationId === this.socketGeneration && !this.destroyed) {
        if (needsHydration()) {
          this.connectRuntime({
            force: true
          });
        } else {
          this.runtimeHydrationRetryAttempt = 0;
        }
      }
    }, hydrationRetryDelayMs);
  },
  /**
   * 注册「实体状态变化 → 回调」的运行期处理器。
   * 同一实体可挂多个处理器（被多个控件引用），因此按实体存 Set；传入 scope 组件 ID 后
   * 组件销毁时会自动注销，避免控件层忘记解绑导致泄漏。
   */
  registerRuntimeStateHandler(handlerEntityId, stateHandler, handlerScopeComponentId = null) {
    const runtimeStateHandlerKey = String(handlerEntityId || "");
    if (!runtimeStateHandlerKey || typeof stateHandler != "function") {
      return;
    }
    if (!this.runtimeStateHandlers.has(runtimeStateHandlerKey)) {
      this.runtimeStateHandlers.set(runtimeStateHandlerKey, new Set());
    }
    this.runtimeStateHandlers.get(runtimeStateHandlerKey).add(stateHandler);
    /**
     * 注销回调的闭包：把处理器从该实体的集合里删掉，集合空了顺带清掉这个键。
     */
    const removeRuntimeStateHandler = () => {
      const entityStateHandlers = this.runtimeStateHandlers.get(runtimeStateHandlerKey);
      entityStateHandlers?.delete(stateHandler);
      if (entityStateHandlers?.size === 0) {
        this.runtimeStateHandlers.delete(runtimeStateHandlerKey);
      }
    };
    if (handlerScopeComponentId) {
      this.registerComponentCleanup(handlerScopeComponentId, removeRuntimeStateHandler);
    } else {
      this.cleanups.push(removeRuntimeStateHandler);
    }
  },
  /**
   * 注册历史曲线刷新回调（定时轮询与手动刷新都会触发）。
   */
  registerHistoryChartRefresher(refresherCallback, refresherComponentId = null) {
    if (typeof refresherCallback != "function") {
      return;
    }
    this.historyChartRefreshers.add(refresherCallback);
    /**
     * 注销回调的闭包：把刷新回调从集合里移除。
     */
    const removeHistoryChartRefresher = () => this.historyChartRefreshers.delete(refresherCallback);
    if (refresherComponentId) {
      this.registerComponentCleanup(refresherComponentId, removeHistoryChartRefresher);
    } else {
      this.cleanups.push(removeHistoryChartRefresher);
    }
  },
  /**
   * 把某实体的状态更新派发给它登记的全部处理器。
   */
  applyRuntimeStateHandlers(handlerEntityIdInput, entityStateUpdate) {
    for (const registeredStateHandler of this.runtimeStateHandlers.get(
      String(handlerEntityIdInput || "")
    ) || []) {
      registeredStateHandler(entityStateUpdate);
    }
  },
  /**
   * 合并短时间内的状态推送，延迟统一刷新。
   * 一次状态变化常带来十几个实体更新，逐个刷新会连续触发重排；这里把实体 ID 攒进集合、
   * 只保留一个定时器（重设即重新计时），抖动窗口内的刷新压成一次。
   */
  scheduleRuntimeRender(scheduledEntityId, renderDelayMs = 120) {
    if (!this.destroyed && !!this.document && !!scheduledEntityId) {
      this.runtimeRenderEntityIds.add(String(scheduledEntityId));
      // clearTimeout + 重新 setTimeout 是刻意的防抖：窗口内再来一个实体就整体顺延，
      // 避免连续推送把刷新拆成很多帧。
      window.clearTimeout(this.runtimeRenderTimer);
      this.runtimeRenderTimer = window.setTimeout(
        () => {
          this.runtimeRenderTimer = 0;
          const pendingEntityIds = [...this.runtimeRenderEntityIds];
          this.runtimeRenderEntityIds.clear();
          if (!this.destroyed) {
            this.refreshRuntimeComponents(pendingEntityIds);
          }
        },
        Math.max(0, Number(renderDelayMs) || 0)
      );
    }
  },
  /**
   * 请求刷新历史曲线（请求键由文档代数、页面路径、弹窗 ID 与弹窗代数组装）。
   * 交给 HistoryRefreshCoordinator 去重：多个图表、定时轮询与可见性恢复可能同时触发，
   * 协调器保证同一请求键同时只跑一趟。
   */
  refreshHistorySeries() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") {
      return;
    }
    const historyRequestKey = [
      this.historyDocumentGeneration,
      this.page?.path || "",
      this.activePopupId || "",
      this.historyPopupGeneration
    ].join(":");
    return this.historyRefreshCoordinator.request(historyRequestKey, () =>
      this.refreshHistorySeriesPass()
    );
  },
  /**
   * 历史曲线刷新失败后的重试（指数退避 1s 起、封顶 8s，最多 4 次）。
   *
   * 已有重试排队或页面隐藏时不再安排：隐藏状态下刷新本来就会被跳过，排了只是空跑。
   */
  scheduleHistoryRetry() {
    if (
      this.destroyed ||
      document.visibilityState === "hidden" ||
      this.historyRetryTimer ||
      this.historyRetryAttempt >= 4
    ) {
      return;
    }
    const retryAttempt = this.historyRetryAttempt;
    // 退避 1s / 2s / 4s / 8s：太密会把后端打满，太疏则用户等不到图表出现。
    const retryDelayMs = Math.min(8000, 2 ** retryAttempt * 1000);
    this.historyRetryAttempt += 1;
    this.historyRetryTimer = window.setTimeout(() => {
      this.historyRetryTimer = 0;
      this.refreshHistorySeries();
    }, retryDelayMs);
  },
  /**
   * 实际拉取历史数据并驱动各图表刷新（一轮）。
   * 开工前记下文档代数与弹窗代数，请求返回后逐项校验：期间换过文档或弹窗的结果一律丢弃，
   * 否则上一份文档的数据会画进当前图表。
   */
  async refreshHistorySeriesPass() {
    if (!this.document || this.destroyed || document.visibilityState === "hidden") {
      return;
    }
    const documentGeneration = this.historyDocumentGeneration;
    const popupGeneration = this.historyPopupGeneration;
    const historyPagePath = this.page?.path || "";
    const historyRequestsByEntityId = new Map();
    /**
     * 收集一批组件里需要历史数据的实体及其请求参数，写入 historyRequestsByEntityId。
     * 只有折线图与存在感传感器需要历史：前者默认 600s 采样 / 24h，后者 300s / 24h；间隔夹在 30s~24h、时长夹在 1h~168h —— 太密会把后端打满，区间太短则图表没内容。同一实体被多处引用时合并为一条请求，并保留 shared /
     * 页面 / 弹窗等来源信息，供返回时判断这批数据是否仍属于当前上下文。
     */
    const collectHistoryRequests = (historySourceComponents, requestContext) => {
      const historyComponents = collectComponents(
        historySourceComponents,
        historyComponent =>
          historyComponent.type === "line-chart" || historyComponent.type === "presence-sensor"
      );
      for (const historyComponentEntry of historyComponents) {
        const historyEntityId = historyComponentEntry.bindings?.entity?.entityId;
        if (!historyEntityId) {
          continue;
        }
        const isPresenceHistory = historyComponentEntry.type === "presence-sensor";
        const componentIntervalSeconds = Math.max(
          30,
          Math.min(
            86400,
            Number(
              isPresenceHistory ? 300 : historyComponentEntry.properties?.updateInterval || 600
            )
          )
        );
        const componentHistoryHours = Math.max(
          1,
          Math.min(
            168,
            Number(
              isPresenceHistory
                ? historyComponentEntry.properties?.historyHours || 24
                : historyComponentEntry.properties?.hours || 24
            )
          )
        );
        const existingHistoryRequest = historyRequestsByEntityId.get(historyEntityId);
        historyRequestsByEntityId.set(historyEntityId, {
          interval: Math.min(
            existingHistoryRequest?.interval ?? componentIntervalSeconds,
            componentIntervalSeconds
          ),
          hours: Math.max(
            existingHistoryRequest?.hours ?? componentHistoryHours,
            componentHistoryHours
          ),
          documentGeneration: documentGeneration,
          shared: !!existingHistoryRequest?.shared || !!requestContext.shared,
          pagePath: existingHistoryRequest?.pagePath ?? requestContext.pagePath ?? null,
          popupId: existingHistoryRequest?.popupId ?? requestContext.popupId ?? null,
          popupGeneration: popupGeneration
        });
      }
    };
    collectHistoryRequests(this.document.sharedComponents || [], {
      shared: true
    });
    collectHistoryRequests(this.page?.components || [], {
      pagePath: historyPagePath
    });
    const activePopup = this.activePopupId
      ? (this.document.customPopups || []).find(
          popupCandidate => String(popupCandidate.id || "") === this.activePopupId
        )
      : null;
    const popupChartComponents = [];
    for (const popupChartModuleEntry of activePopup?.modules || []) {
      if (popupChartModuleEntry.type === "line-chart" && popupChartModuleEntry.entityId) {
        popupChartComponents.push({
          type: "line-chart",
          bindings: {
            entity: {
              entityId: popupChartModuleEntry.entityId
            }
          },
          properties: syncedLineChartProperties(
            this.document,
            this.page,
            popupChartModuleEntry.entityId,
            popupChartModuleEntry.properties
          )
        });
      }
    }
    collectHistoryRequests(popupChartComponents, {
      popupId: this.activePopupId || null
    });
    const requestStartedAt = Date.now();
    let didUpdateSeries = false;
    let didFailHistory = false;
    const pendingHistoryRequests = [...historyRequestsByEntityId];
    /**
     * 取当前的历史请求上下文，用于判断在途请求的返回值是否已经过期。
     * 文档代数、页面路径、弹窗 ID、弹窗代数任一变化都意味着用户已切走，这批历史数据不能再画进当前图表。
     */
    const currentHistoryContext = () => ({
      documentGeneration: this.historyDocumentGeneration,
      pagePath: this.page?.path || "",
      popupId: this.activePopupId || null,
      popupGeneration: this.historyPopupGeneration
    });
    /**
     * 串行拉取排队中的历史请求，并把结果写进历史序列缓存。
     * 用 while + shift 串行而非并发：历史查询对后端较重，一页可能有十几个图表，并发会瞬间
     * 打满后端；每轮开头校验请求是否仍属当前上下文；缓存新鲜（距抓取不超 interval 秒）则跳过。
     */
    const fetchHistoryRequest = async () => {
      while (pendingHistoryRequests.length) {
        const [requestEntityId, requestOptions] = pendingHistoryRequests.shift();
        if (
          this.destroyed ||
          !historyRequestStillRelevant(requestOptions, currentHistoryContext())
        ) {
          continue;
        }
        const cachedSeries = this.historySeries.get(requestEntityId);
        const persistedSeries = this.historySeriesCache.get(
          historySeriesCacheKey(requestEntityId, requestOptions.hours)
        );
        const bestSeries = [cachedSeries, persistedSeries]
          .filter(
            seriesCandidate =>
              seriesCandidate &&
              seriesCandidate.hours === requestOptions.hours &&
              Array.isArray(seriesCandidate.points) &&
              seriesCandidate.points.length > 0
          )
          .sort((leftSeries, rightSeries) => rightSeries.fetchedAt - leftSeries.fetchedAt)[0];
        if (
          bestSeries &&
          requestStartedAt - bestSeries.fetchedAt < requestOptions.interval * 1000
        ) {
          if (cachedSeries !== bestSeries) {
            this.historySeries.set(requestEntityId, bestSeries);
            didUpdateSeries = true;
          }
          continue;
        }
        if (this.historyFetches.has(requestEntityId)) {
          continue;
        }
        this.historyFetches.add(requestEntityId);
        const historyAbortController =
          typeof AbortController == "function" ? new AbortController() : null;
        const historyTimeoutTimer = window.setTimeout(
          () => historyAbortController?.abort(),
          HISTORY_FETCH_TIMEOUT_MS
        );
        try {
          const historyResponse = await fetch(
            "/api/v1/ha/history?entityId=" +
              encodeURIComponent(requestEntityId) +
              "&hours=" +
              requestOptions.hours,
            {
              credentials: "same-origin",
              headers: {
                Accept: "application/json"
              },
              ...(historyAbortController
                ? {
                    signal: historyAbortController.signal
                  }
                : {})
            }
          );
          if (!historyResponse.ok) {
            didFailHistory = true;
            continue;
          }
          const historyPayload = await historyResponse.json();
          if (!historyRequestStillRelevant(requestOptions, currentHistoryContext())) {
            continue;
          }
          const historySeriesEntry = {
            points: Array.isArray(historyPayload.points) ? historyPayload.points : [],
            hours: requestOptions.hours,
            fetchedAt: Date.now()
          };
          this.historySeries.set(requestEntityId, historySeriesEntry);
          cacheHistorySeries(this.historySeriesCache, requestEntityId, historySeriesEntry);
          didUpdateSeries = true;
          if (!historySeriesEntry.points.length) {
            didFailHistory = true;
          }
        } catch (historyFetchError) {
          if (historyFetchError?.name === "AbortError") {
            window.HABridgeLog?.report("warning", "网络请求", "历史曲线请求超时", {
              entityId: requestEntityId,
              phase: "history-timeout",
              path: "/api/v1/ha/history",
              durationMs: HISTORY_FETCH_TIMEOUT_MS
            });
          }
          didFailHistory = true;
        } finally {
          window.clearTimeout(historyTimeoutTimer);
          this.historyFetches.delete(requestEntityId);
        }
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(2, pendingHistoryRequests.length)
        },
        () => fetchHistoryRequest()
      )
    );
    if (didFailHistory && !this.destroyed) {
      this.scheduleHistoryRetry();
    } else {
      this.historyRetryAttempt = 0;
    }
    if (didUpdateSeries && !this.destroyed) {
      this.detailsStateSync?.refreshHistory?.();
      for (const refreshChart of this.historyChartRefreshers) {
        refreshChart();
      }
    }
  },
  /**
   * 判断某实体的乐观态是否已被真实状态确认，确认后清除乐观标记。
   * 三个出口：无乐观态 / 乐观态超有效期 / 真实状态与期望一致，均算确认。
   * 灯效控件多一层：亮度等可视属性未到位时不算确认，否则会先按默认亮度闪一帧。
   */
  optimisticStateIsConfirmed(optimisticEntityIdInput, optimisticStateUpdate) {
    const pendingOptimistic = this.pendingOptimisticStates.get(
      String(optimisticEntityIdInput || "")
    );
    if (!pendingOptimistic) {
      return true;
    }
    // 过期即视为确认：HA 长时间没回推送时不能一直卡在乐观态上。
    if (Date.now() >= pendingOptimistic.expiresAt) {
      this.pendingOptimisticStates.delete(String(optimisticEntityIdInput || ""));
      return true;
    }
    const affectedEffectComponent = [...this.componentRecords.values()].find(
      componentRecordEntry => {
        const componentBoundEntityId = componentRecordEntry.bindings?.entity?.entityId;
        return (
          componentBoundEntityId &&
          this.powerEntityId(componentRecordEntry, componentBoundEntityId) ===
            String(optimisticEntityIdInput)
        );
      }
    );
    if (
      entityPowerIsOn(
        String(optimisticEntityIdInput || ""),
        resolveStateEntry(optimisticStateUpdate),
        affectedEffectComponent || {}
      ) === pendingOptimistic.desiredActive
    ) {
      if (
        pendingOptimistic.desiredActive === true &&
        affectedEffectComponent?.type === "icon-button-effect" &&
        iconButtonEffectLightVisualAwaiting(affectedEffectComponent, {
          states: new Map([
            [
              String(optimisticEntityIdInput || ""),
              resolveStateEntry(optimisticStateUpdate)
            ]
          ])
        })
      ) {
        return false;
      } else {
        this.rememberLightVisualState?.(optimisticEntityIdInput, optimisticStateUpdate);
        this.pendingOptimisticStates.delete(String(optimisticEntityIdInput || ""));
        return true;
      }
    } else {
      return false;
    }
  },
  /**
   * 刷新开关类控件的可视状态（含乐观态与状态未落定时的过渡态）。
   * cover 域单独处理：窗帘 / 晾衣机的「开」看位置到达而非 state，梦幻帘另有一套口径；
   * 编辑器强制预览态优先级最高，用于属性面板实时预览。
   */
  updateOptimisticToggleVisuals(entityIdFilter, componentIdFilter = null) {
    for (const [componentId, componentRecord] of this.componentRecords) {
      const componentBoundEntity = componentRecord.bindings?.entity?.entityId;
      // 用电源实体而不是绑定实体去取状态：浴室取暖器这类设备的开关在 light 兄弟实体上，
      // 拿绑定实体的状态永远画不出开态。
      const resolvedPowerEntityId = componentBoundEntity
        ? this.powerEntityId(componentRecord, componentBoundEntity)
        : "";
      if (
        !componentBoundEntity ||
        (componentIdFilter
          ? !componentIdFilter.has(componentId)
          : resolvedPowerEntityId !== entityIdFilter) ||
        ![
          "icon-button-effect",
          "icon-button",
          "device-button",
          "navigation-button",
          "air-conditioner"
        ].includes(componentRecord.type)
      ) {
        continue;
      }
      const entityState = this.states.get(resolvedPowerEntityId);
      // cover 域走位置判断，不能按 on/off 处理，所以先分出这一支。
      const isCoverEntity = String(resolvedPowerEntityId || "").startsWith("cover.");
      const isDreamCurtain =
        isCoverEntity &&
        coverComponentIsDream(
          componentRecord,
          resolvedPowerEntityId,
          entityState,
          this.entityMetadata
        );
      const poweredComponent = this.runtimePowerComponent(componentRecord, componentBoundEntity);
      const isActiveState = isCoverEntity
        ? isDreamCurtain
          ? runtimeEntityStateIsActive(entityState)
          : runtimeCoverStateIsActive(entityState)
        : entityPowerIsOn(resolvedPowerEntityId, entityState, poweredComponent);
      // 预览态优先于真实状态：属性面板勾选「开」时即使实体是关的也要画成开。
      const componentPreviewState = this.componentPreviewStates.get(componentId) || "auto";
      const nextActiveState =
        componentPreviewState === "on"
          ? true
          : componentPreviewState === "off"
            ? false
            : isCoverEntity &&
                coverMotorIsReversedForComponent(componentRecord)
              ? !isActiveState
              : isActiveState;
      const toggleHostElement = this.componentHosts.get(componentId);
      this.cleanupRenderedComponent(componentId);
      if (toggleHostElement && componentRecord.type === "icon-button-effect") {
        const existingEffectLayerElement = toggleHostElement.querySelector(
          ":scope > .hb-icon-button-effect"
        );
        const effectRenderContext = {
          document: this.document,
          page: this.page,
          states: this.states,
          history: this.historySeries,
          entityMetadata: this.entityMetadata,
          deviceMetadata: this.deviceMetadata,
          entityTranslations: this.entityTranslations,
          renderNamespace: this.renderNamespace,
          editable: !!this.options.editable,
          liveMedia: this.options.liveMedia !== false,
          previewState: this.componentPreviewStates.get(componentId) || "auto",
          isIconVisible: effectIconEntityId => this.iconVisibilityState(effectIconEntityId),
          navigate: effectPagePath => this.navigate(effectPagePath),
          invalidate: () => this.updateOptimisticToggleVisuals("", new Set([componentId])),
          cleanup: effectCleanupCallback =>
            this.registerComponentCleanup(componentId, effectCleanupCallback)
        };
        const renderedEffectElement = renderRegisteredComponent(
          poweredComponent,
          effectRenderContext
        );
        const effectComponentScale = Number(this.document.canvas.componentScale || 1);
        if (effectComponentScale !== 1) {
          renderedEffectElement.style.width = 100 / effectComponentScale + "%";
          renderedEffectElement.style.height = 100 / effectComponentScale + "%";
          renderedEffectElement.style.transform = "scale(" + effectComponentScale + ")";
          renderedEffectElement.style.transformOrigin = "top left";
        }
        if (existingEffectLayerElement) {
          existingEffectLayerElement.replaceWith(renderedEffectElement);
        } else {
          toggleHostElement.prepend(renderedEffectElement);
        }
      }
      if (
        toggleHostElement &&
        ["icon-button", "device-button", "navigation-button"].includes(componentRecord.type)
      ) {
        const existingButtonElement =
          componentRecord.type === "navigation-button"
            ? toggleHostElement.querySelector(":scope > .hb-navigation-button")
            : toggleHostElement.querySelector(":scope > .hb-icon-button");
        const buttonRenderContext = {
          document: this.document,
          page: this.page,
          states: this.states,
          history: this.historySeries,
          entityMetadata: this.entityMetadata,
          deviceMetadata: this.deviceMetadata,
          entityTranslations: this.entityTranslations,
          renderNamespace: this.renderNamespace,
          editable: !!this.options.editable,
          liveMedia: this.options.liveMedia !== false,
          previewState: this.componentPreviewStates.get(componentId) || "auto",
          isIconVisible: buttonIconEntityId => this.iconVisibilityState(buttonIconEntityId),
          navigate: buttonPagePath => this.navigate(buttonPagePath),
          invalidate: () => this.updateOptimisticToggleVisuals("", new Set([componentId])),
          cleanup: buttonCleanupCallback =>
            this.registerComponentCleanup(componentId, buttonCleanupCallback)
        };
        const renderedButtonElement = renderRegisteredComponent(
          poweredComponent,
          buttonRenderContext
        );
        const buttonComponentScale = Number(this.document.canvas.componentScale || 1);
        if (buttonComponentScale !== 1) {
          renderedButtonElement.style.width = 100 / buttonComponentScale + "%";
          renderedButtonElement.style.height = 100 / buttonComponentScale + "%";
          renderedButtonElement.style.transform = "scale(" + buttonComponentScale + ")";
          renderedButtonElement.style.transformOrigin = "top left";
        }
        if (existingButtonElement) {
          existingButtonElement.replaceWith(renderedButtonElement);
        } else {
          toggleHostElement.prepend(renderedButtonElement);
        }
        if (componentRecord.type === "device-button") {
          const actionHitboxElement = toggleHostElement.querySelector(
            ":scope > .hb-runtime-action-hitbox"
          );
          if (actionHitboxElement) {
            actionHitboxElement.hidden = !this.updateDeviceButtonSelectionBounds(
              toggleHostElement,
              componentRecord,
              actionHitboxElement
            );
          }
        }
      }
      if (toggleHostElement && componentRecord.type === "air-conditioner") {
        const climateRenderContext = {
          document: this.document,
          page: this.page,
          states: this.states,
          history: this.historySeries,
          entityMetadata: this.entityMetadata,
          deviceMetadata: this.deviceMetadata,
          entityTranslations: this.entityTranslations,
          renderNamespace: this.renderNamespace,
          editable: !!this.options.editable,
          liveMedia: this.options.liveMedia !== false,
          previewState: this.componentPreviewStates.get(componentId) || "auto",
          isIconVisible: climateIconEntityId => this.iconVisibilityState(climateIconEntityId),
          navigate: climatePagePath => this.navigate(climatePagePath),
          invalidate: () => this.updateOptimisticToggleVisuals("", new Set([componentId])),
          cleanup: climateCleanupCallback =>
            this.registerComponentCleanup(componentId, climateCleanupCallback)
        };
        const existingClimateElement = toggleHostElement.querySelector(
          ":scope > .hb-air-conditioner"
        );
        const renderedClimateElement = renderRegisteredComponent(
          poweredComponent,
          climateRenderContext
        );
        const climateComponentScale = Number(this.document.canvas.componentScale || 1);
        if (climateComponentScale !== 1) {
          renderedClimateElement.style.width = 100 / climateComponentScale + "%";
          renderedClimateElement.style.height = 100 / climateComponentScale + "%";
          renderedClimateElement.style.transform = "scale(" + climateComponentScale + ")";
          renderedClimateElement.style.transformOrigin = "top left";
        }
        if (existingClimateElement) {
          existingClimateElement.replaceWith(renderedClimateElement);
        } else {
          toggleHostElement.prepend(renderedClimateElement);
        }
        this.componentAirflowLayers.get(componentId)?.remove();
        this.componentAirflowLayers.delete(componentId);
        const createdAirflowLayer = renderAirConditionerAirflowLayer(
          poweredComponent,
          climateRenderContext
        );
        if (createdAirflowLayer) {
          const isGrouped = toggleHostElement.parentElement !== this.canvas;
          const airflowGeometry = airflowLayerGeometry(componentRecord, {
            grouped: isGrouped
          });
          const airflowZIndex = Number(
            toggleHostElement.style.getPropertyValue("--hb-component-z") ||
              componentRecord.position?.zIndex ||
              1
          );
          createdAirflowLayer.dataset.airflowFor = componentId;
          createdAirflowLayer.hidden = componentRecord.style?.visible === false;
          Object.assign(createdAirflowLayer.style, {
            left: airflowGeometry.left + "px",
            top: airflowGeometry.top + "px",
            width: airflowGeometry.width + "px",
            height: airflowGeometry.height + "px",
            zIndex: String(airflowZIndex),
            transform:
              "rotate(" + airflowGeometry.rotation + "deg) scale(" + airflowGeometry.scale + ")"
          });
          if (isGrouped) {
            toggleHostElement.append(createdAirflowLayer);
          } else {
            this.canvas.insertBefore(createdAirflowLayer, toggleHostElement);
          }
          this.componentAirflowLayers.set(componentId, createdAirflowLayer);
          if (
            this.options.editable &&
            this.selectedComponentIds.size === 1 &&
            this.selectedComponentId === componentId &&
            this.componentSelectionLayers.get(componentId) === "airflow"
          ) {
            this.syncSelection();
          }
        }
      }
      if (componentRecord.type !== "icon-button-effect") {
        continue;
      }
      const cachedEffectLayerElement = this.componentEffectLayers.get(componentId);
      this.syncEffectLayerLightVisual(componentRecord, cachedEffectLayerElement);
      this.setEffectLayerActive(
        cachedEffectLayerElement,
        nextActiveState,
        effectFadeDuration(componentRecord)
      );
    }
  },
  /**
   * 写下乐观的开关状态并立即刷新界面，返回可撤销的还原函数。
   * 交互路径先让界面响应，再等 HA 推送确认；8 秒内没等到就自动回滚，
   * 既不让界面长期停在错误状态，也给慢设备留余量。
   */
  applyOptimisticToggle(toggleEntityIdInput, toggleComponent = null) {
    const optimisticEntityId = toggleEntityIdInput;
    const resolvedPowerTargetEntityId = this.powerEntityId(toggleComponent, optimisticEntityId);
    const coverEntityState = this.states.get(resolvedPowerTargetEntityId);
    // 状态缓存里可能存的是 `{newState, oldState}` 包装（推送时的原始载荷），
    // 也可能直接是状态对象，两种形状都要兼容。
    const currentEntityState = resolveStateEntry(coverEntityState, {
      entityId: resolvedPowerTargetEntityId,
      attributes: {}
    });
    const isCoverDomainEntity = String(resolvedPowerTargetEntityId || "").startsWith("cover.");
    const coverIsDream =
      isCoverDomainEntity &&
      coverComponentIsDream(
        toggleComponent,
        resolvedPowerTargetEntityId,
        coverEntityState,
        this.entityMetadata
      );
    const optimisticComponent = this.runtimePowerComponent(toggleComponent, optimisticEntityId);
    const optimisticActiveState = !(isCoverDomainEntity
      ? coverIsDream
        ? runtimeEntityStateIsActive(coverEntityState)
        : runtimeCoverStateIsActive(coverEntityState)
      : entityPowerIsOn(resolvedPowerTargetEntityId, coverEntityState, optimisticComponent));
    // 窗帘类乐观态直接改 state 与 current_position（HA 的 cover 约定字段），
    // 梦幻帘没有位置概念，因此不加 current_position。
    const optimisticState = isCoverDomainEntity
      ? {
          ...currentEntityState,
          state: optimisticActiveState ? "open" : "closed",
          ...(coverIsDream
            ? {}
            : {
                attributes: {
                  ...(currentEntityState.attributes || {}),
                  current_position: optimisticActiveState ? 100 : 0
                }
              })
        }
      : optimisticToggleState(resolvedPowerTargetEntityId, currentEntityState, optimisticComponent);
    if (optimisticActiveState && String(resolvedPowerTargetEntityId || "").startsWith("light.")) {
      const lightVisualEntry = this.cachedLightVisualState(resolvedPowerTargetEntityId);
      if (lightVisualEntry?.attributes) {
        optimisticState.attributes = {
          ...(optimisticState.attributes || {}),
          ...lightVisualEntry.attributes
        };
      }
    }
    const nextStoredState = coverEntityState?.newState
      ? {
          ...coverEntityState,
          newState: optimisticState
        }
      : optimisticState;
    const optimisticEntityKey = String(resolvedPowerTargetEntityId || "");
    const pendingOptimisticEntry = {
      desiredActive: optimisticActiveState,
      expiresAt: Date.now() + OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS
    };
    this.pendingOptimisticStates.set(optimisticEntityKey, pendingOptimisticEntry);
    /**
     * 把界面与状态缓存还原成「确认过的那一份」（`undefined` = 本来就没有这条状态）。
     */
    const restoreConfirmedState = () => {
      if (coverEntityState === undefined) {
        this.states.delete(resolvedPowerTargetEntityId);
      } else {
        this.states.set(resolvedPowerTargetEntityId, coverEntityState);
      }
      this.updateOptimisticToggleVisuals(resolvedPowerTargetEntityId);
    };
    const expiryTimer = window.setTimeout(() => {
      if (this.pendingOptimisticStates.get(optimisticEntityKey) !== pendingOptimisticEntry) {
        return;
      }
      this.pendingOptimisticStates.delete(optimisticEntityKey);
      if (this.states.get(resolvedPowerTargetEntityId) !== nextStoredState) {
        return;
      }
      restoreConfirmedState();
      // 回滚必须说出来：界面自己变回去、用户只看到「点了没反应」会反复点，
      // 而事实是命令已发出、设备 / HA 未回报状态，这条一次性提示是它唯一的出口。
      // 只在真的回滚了这一支上报（手动撤销或 HA 推送到达时回滚函数已被清掉）。
      this.options.onError?.(createOptimisticToggleTimeoutError(resolvedPowerTargetEntityId));
    }, OPTIMISTIC_TOGGLE_CONFIRM_TIMEOUT_MS);
    this.states.set(resolvedPowerTargetEntityId, nextStoredState);
    this.updateOptimisticToggleVisuals(resolvedPowerTargetEntityId);
    return () => {
      window.clearTimeout(expiryTimer);
      if (this.pendingOptimisticStates.get(optimisticEntityKey) === pendingOptimisticEntry) {
        this.pendingOptimisticStates.delete(optimisticEntityKey);
      }
      if (this.states.get(resolvedPowerTargetEntityId) === nextStoredState) {
        restoreConfirmedState();
      }
    };
  },
  /**
   * 解析组件真正该用的「电源实体」，即开关语义挂在哪一个实体上。
   * 三级回退：实体画像的电源目标 → 浴室取暖器挂同设备照明实体的约定 → 组件自身绑定实体；
   * 第三级兜底，保证任何情况下都返回可用实体。
   */
  powerEntityId(
    powerComponent,
    requestedEntityId = powerComponent?.bindings?.entity?.entityId || ""
  ) {
    const normalizedEntityId = this.runtimeEntityId(requestedEntityId);
    const entityProfile =
      this.deviceProfile(normalizedEntityId) || this.deviceProfile(requestedEntityId);
    const resolvedPowerTarget = entityPowerTarget(
      normalizedEntityId,
      powerComponent,
      entityProfile
    );
    if (resolvedPowerTarget !== normalizedEntityId) {
      return this.runtimeEntityId(resolvedPowerTarget);
    }
    // 浴室取暖器的开关能力在 HA 里落在同设备的 light 实体上（本体只有 climate），
    // 这是设备侧的字段约定，只能按「同设备 + light 域 + 元数据可用」来找。
    const relatedContext = relatedPopupContext(
      powerComponent,
      this.entityMetadata,
      this.deviceMetadata,
      this.states
    );
    if (
      powerComponent?.type !== "air-conditioner" &&
      relatedContext?.deviceType === "bath-heater"
    ) {
      const siblingLight = relatedContext.siblings?.find(
        relatedEntity =>
          relatedEntity.domain === "light" && entityMetadataIsAvailable(relatedEntity)
      );
      if (siblingLight?.entityId) {
        return this.runtimeEntityId(siblingLight.entityId);
      }
    }
    return normalizedEntityId;
  },
  /**
   * 返回把绑定重指向电源实体的组件副本，供运行期刷新使用。
   * 电源实体与绑定实体一致时原样返回；不一致时把原实体 ID 记进
   * properties.runtimePowerEntityId —— 状态推送按电源实体来，但文案与其它绑定仍按原实体。
   */
  runtimePowerComponent(
    runtimeComponent,
    componentEntityId = runtimeComponent?.bindings?.entity?.entityId || ""
  ) {
    const profiledRuntimeComponent = this.profiledComponent(runtimeComponent, componentEntityId);
    const runtimeEntityKey = this.runtimeEntityId(componentEntityId);
    const powerEntityIdValue = this.powerEntityId(profiledRuntimeComponent, componentEntityId);
    if (
      !powerEntityIdValue ||
      (powerEntityIdValue === runtimeEntityKey && runtimeEntityKey === componentEntityId)
    ) {
      return profiledRuntimeComponent;
    } else {
      return {
        ...profiledRuntimeComponent,
        bindings: {
          ...(profiledRuntimeComponent.bindings || {}),
          entity: {
            entityId: powerEntityIdValue
          }
        },
        properties: {
          ...(profiledRuntimeComponent.properties || {}),
          runtimePowerEntityId: powerEntityIdValue
        }
      };
    }
  },
  /**
   * 切换到指定页面并重渲染、重订阅。
   *
   * 目标页不存在时静默忽略：跳转目标可能来自旧版文档的按钮配置，不该因此报错。
   */
  navigate(targetPagePath) {
    const targetPage = this.document?.pages.find(
      candidatePage => candidatePage.path === targetPagePath
    );
    if (targetPage) {
      this.page = targetPage;
      // 切页会重建全部控件，上一页遗留的补数据重试必须清掉，否则它会拿旧页的
      // 实体 ID 去订阅，把新页的订阅额度挤占掉。
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      this.runtimeHydrationRetryAttempt = 0;
      this.preloadStaticImages();
      this.renderComponents();
      this.connectRuntime();
      this.refreshHistorySeries();
      this.options.onPageChange?.(targetPage);
    }
  },
  /**
   * 图标显隐虚拟实体的作用域键。
   * 按页面区分，不同页面的同一开关互不影响；缺页面信息时退化成 "current-page"。
   */
  iconVisibilityPageKey() {
    return String(this.page?.path || this.page?.id || "current-page");
  },
  /**
   * 当前页图标按钮的显隐状态（缺省视为显示）。
   * 只把显式 false 当作隐藏：状态未写入时按可见渲染，否则首帧图标会空一下再出现。
   */
  iconVisibilityState() {
    return this.virtualEntityStates.get(this.iconVisibilityPageKey()) !== false;
  },
  /**
   * 切换「虚拟实体」的开关状态（目前只用于图标按钮的整体显隐）。
   * 虚拟实体是渲染器自造的（virtual.xxx），不来自 HA，只存在本实例的状态缓存里。
   * @throws {Error} 不是图标显隐类虚拟实体，或当前页没有图标按钮（效果）控件。
   */
  toggleVirtualEntity(virtualEntityId) {
    const parsedVirtualEntity = parseVirtualEntityId(virtualEntityId);
    // 只接受图标显隐这一类虚拟实体；别的虚拟实体语义不同，混进来会写坏状态。
    if (!parsedVirtualEntity || parsedVirtualEntity.kind !== ICON_VISIBILITY_VIRTUAL_KIND) {
      throw new Error("虚拟实体不存在。");
    }
    if (
      ![...this.componentRecords.values()].some(
        recordEntry => recordEntry.type === "icon-button-effect"
      )
    ) {
      throw new Error("当前页面没有图标按钮（效果）。");
    }
    const iconVisibilityPageId = this.iconVisibilityPageKey();
    const nextIconVisibility = !this.iconVisibilityState();
    this.virtualEntityStates.set(iconVisibilityPageId, nextIconVisibility);
    this.states.set(virtualEntityId, {
      entityId: virtualEntityId,
      state: nextIconVisibility ? "on" : "off",
      attributes: {}
    });
    this.renderComponents(true);
  },
  /**
   * 切换效果层的激活态并在需要时播一次淡变。
   * 先读 offsetWidth 强制回流，否则「加过渡类又立刻换激活类」会被并入同一次样式计算，
   * 过渡不生效。
   */
  setEffectLayerActive(layerHostElement, isActive, fadeDurationSeconds = 0) {
    if (!layerHostElement) {
      return;
    }
    if (isActive) {
      this.runtimeEffectImageLoader.promote(
        layerHostElement.querySelector(":scope > img[data-effect-source]")
      );
    }
    const isActiveChanging = layerHostElement.classList.contains("active") !== isActive;
    window.clearTimeout(layerHostElement.hbTransitionTimer);
    layerHostElement.classList.remove("is-transitioning");
    if (isActiveChanging && fadeDurationSeconds > 0) {
      layerHostElement.classList.add("is-transitioning");
      // 这行看着多余，实则是强制同步布局（reflow），必须保留。
      layerHostElement.offsetWidth;
    }
    layerHostElement.classList.toggle("active", isActive);
    if (isActiveChanging && fadeDurationSeconds > 0) {
      layerHostElement.hbTransitionTimer = window.setTimeout(
        () => {
          layerHostElement.classList.remove("is-transitioning");
          layerHostElement.hbTransitionTimer = null;
        },
        fadeDurationSeconds * 1000 + 80
      );
    }
  },
  /**
   * 按实体灯效状态同步效果层的不透明度与滤镜。
   * 最终透明度 = 用户设定的不透明度 × 灯效状态推出的系数；awaiting-light-visual 标记
   * 用于状态未到达时先不显示，避免闪一帧默认亮度。
   */
  syncEffectLayerLightVisual(effectComponent, layerElement) {
    if (!layerElement || effectComponent?.type !== "icon-button-effect") {
      return;
    }
    const effectProperties = effectComponent.properties || {};
    const effectEntityId = String(effectComponent?.bindings?.entity?.entityId || "");
    layerElement.classList.toggle(
      "awaiting-light-visual",
      iconButtonEffectLightVisualAwaiting(effectComponent, {
        editable: this.options.editable,
        states: this.states,
        pendingOptimisticState: this.pendingOptimisticStates.get(effectEntityId)
      })
    );
    const lightVisualState = iconButtonEffectLightVisualState(effectComponent, {
      states: this.states
    });
    const effectOpacityValue = Number(effectProperties.effectOpacity ?? 1);
    const clampedOpacityRatio = Number.isFinite(effectOpacityValue)
      ? Math.max(0, Math.min(1, effectOpacityValue))
      : 1;
    layerElement.style.setProperty(
      "--hb-effect-image-opacity",
      String(clampedOpacityRatio * lightVisualState.opacity)
    );
    const effectImageElement = layerElement.querySelector(":scope > img");
    if (effectImageElement) {
      effectImageElement.style.filter = lightVisualState.filter;
    }
  },
  /**
   * 取灯具最近一次确认过的可视状态（先内存缓存，再本地存储）。
   * 走本地存储是为了整页刷新后仍按上次亮度 / 色温绘制；超过 30 天（2592000000ms）
   * 的缓存直接丢弃，避免用户换灯后一直沿用旧属性。
   */
  cachedLightVisualState(lightEntityIdInput) {
    const lightEntityId = String(lightEntityIdInput || "");
    // 只认 light 域：其它域的实体没有亮度/色温语义，缓存了也没人用。
    if (!lightEntityId.startsWith("light.")) {
      return null;
    }
    const cachedLightVisual = this.confirmedLightVisualStates.get(lightEntityId);
    if (cachedLightVisual) {
      return cachedLightVisual;
    }
    try {
      const storedVisualState = JSON.parse(
        window.localStorage?.getItem("homeos:light-visual:" + lightEntityId) || "null"
      );
      if (
        !storedVisualState?.attributes ||
        // 30 天过期：跨季换灯或改配置后，旧属性继续生效只会让人以为控件坏了。
        Date.now() - Number(storedVisualState.at || 0) > 2592000000
      ) {
        return null;
      }
      const cachedVisualEntry = {
        entityId: lightEntityId,
        state: "on",
        attributes: storedVisualState.attributes
      };
      this.confirmedLightVisualStates.set(lightEntityId, cachedVisualEntry);
      return cachedVisualEntry;
    } catch {
      return null;
    }
  },
  /**
   * 记住灯具最后一次「亮着」的可视属性，供下次开机或状态缺失时还原外观。
   * 只在含亮度或色温的更新里记录：关灯推送通常缺省这些属性，照记会把上次亮度覆盖成空值。
   */
  rememberLightVisualState(visualEntityIdInput, visualStateUpdate) {
    const visualEntityId = String(visualEntityIdInput || "");
    const newEntityState = resolveStateEntry(visualStateUpdate);
    if (!visualEntityId.startsWith("light.") || !newEntityState?.attributes) {
      return;
    }
    const stateAttributes = newEntityState.attributes;
    /**
     * 判断状态属性是否为可用数值：非 null/undefined/空串且能转成有限数。
     * 关机或离线时亮度/色温可能是 "" 或 null，Number() 会得到 0 或 NaN，
     * 因此既排除空值又做 Number.isFinite 校验，避免无效值写进缓存。
     */
    const attributeHasNumericValue = attributeName =>
      stateAttributes[attributeName] !== null &&
      stateAttributes[attributeName] !== undefined &&
      stateAttributes[attributeName] !== "" &&
      Number.isFinite(Number(stateAttributes[attributeName]));
    if (
      !attributeHasNumericValue("brightness") &&
      !attributeHasNumericValue("color_temp_kelvin") &&
      !attributeHasNumericValue("color_temp")
    ) {
      return;
    }
    const cachedAttributes = {
      ...(this.cachedLightVisualState(visualEntityId)?.attributes || {})
    };
    for (const attributeKey of [
      "brightness",
      "color_temp_kelvin",
      "color_temp",
      "color_mode",
      "supported_color_modes"
    ]) {
      if (
        stateAttributes[attributeKey] !== null &&
        stateAttributes[attributeKey] !== undefined &&
        stateAttributes[attributeKey] !== ""
      ) {
        cachedAttributes[attributeKey] = Array.isArray(stateAttributes[attributeKey])
          ? [...stateAttributes[attributeKey]]
          : stateAttributes[attributeKey];
      }
    }
    const persistedVisualEntry = {
      entityId: visualEntityId,
      state: "on",
      attributes: cachedAttributes
    };
    this.confirmedLightVisualStates.set(visualEntityId, persistedVisualEntry);
    try {
      // 写本地存储放进 try：隐私模式或配额用尽会直接抛错，
      // 缓存失败不该影响灯效渲染这条主路径。
      window.localStorage?.setItem(
        "homeos:light-visual:" + visualEntityId,
        JSON.stringify({
          at: Date.now(),
          attributes: cachedAttributes
        })
      );
    } catch {}
  },
  /**
   * 给控件绑定运行期动作（单击 / 双击 / 长按）。三种手势共用一个指针序列、靠定时器区分：单击要等一个双击
   * 判定窗口才能确定不是双击，长按要在阈值时刻先触发，触发过长按后还要抑制随之而来的 click，否则一次操作 会发两个请求；toggle 动作派发前先写乐观态让界面即时响应。逻辑动作类型不受支持时会被过滤成 null，
   * 因此「有动作配置」不等于「动作可用」。
   */
  bindRuntimeActions(runtimeActionElement, runtimeActionComponent) {
    let clickResetTimer = null;
    let doubleTapTimer = null;
    let holdTimer = null;
    let isHoldTriggered = false;
    let activePointerState = null;
    let lastTapRecord = null;
    // 长按 / 双击之后的 click 抑制截止时间：这两个手势触发后浏览器仍会补一个 click，
    // 不抑制就会重复执行单击动作。
    let suppressClickUntilMs = 0;
    let rollbackToggle = null;
    let previousToggleState;
    const tapAction = isSupportedComponentAction(
      runtimeActionComponent,
      runtimeActionComponent.actions?.tap
    )
      ? runtimeActionComponent.actions.tap
      : null;
    const doubleTapAction = isSupportedComponentAction(
      runtimeActionComponent,
      runtimeActionComponent.actions?.doubleTap
    )
      ? runtimeActionComponent.actions.doubleTap
      : null;
    const holdAction = isSupportedComponentAction(
      runtimeActionComponent,
      runtimeActionComponent.actions?.hold
    )
      ? runtimeActionComponent.actions.hold
      : null;
    const isTapActionEnabled = !!tapAction?.type && tapAction.type !== "none";
    const hasDoubleTapAction = !!doubleTapAction?.type && doubleTapAction.type !== "none";
    const hasHoldAction = !!holdAction?.type && holdAction.type !== "none";
    /**
     * 通知外部「按钮被按下」以播放按键音（编辑态在构造时的委托里已被过滤）。
     */
    const notifyRuntimeButtonPress = () => {
      this.options.onRuntimeButtonPress?.(runtimeActionElement);
    };
    // 单击的 toggle 先落乐观态：等 HA 回推送再变色会有明显延迟感。
    // 虚拟实体不走这里 —— 它本来就在本地，没有网络往返。
    const applyTapToggleOptimistic = () => {
      if (rollbackToggle || tapAction?.type !== "toggle") {
        return;
      }
      const tapEntityId = runtimeActionComponent.bindings?.entity?.entityId;
      if (tapEntityId && !isVirtualEntityId(tapEntityId)) {
        previousToggleState = this.states.get(
          this.powerEntityId(runtimeActionComponent, tapEntityId)
        );
        rollbackToggle = this.applyOptimisticToggle(tapEntityId, runtimeActionComponent);
      }
    };
    /**
     * 撤销单击 toggle 的乐观态（双击 / 长按抢走了这次手势时用）。
     */
    const rollbackOptimisticToggle = () => {
      rollbackToggle?.();
      rollbackToggle = null;
      previousToggleState = undefined;
    };
    /**
     * 提交单击动作：把乐观回滚句柄交给 runAction，由它在调用失败时还原界面状态。
     *
     * 先清空本地句柄再派发，避免 runAction 内部同步失败时回滚到已失效的引用。
     */
    const commitTapAction = () => {
      const pendingRollbackToggle = rollbackToggle;
      const pendingPreviousToggleState = previousToggleState;
      rollbackToggle = null;
      previousToggleState = undefined;
      if (isTapActionEnabled) {
        this.runAction(runtimeActionComponent, tapAction, {
          optimisticAlreadyApplied: !!pendingRollbackToggle,
          optimisticRollback: pendingRollbackToggle,
          optimisticPreviousState: pendingPreviousToggleState
        });
      }
    };
    // touch-action 设为 manipulation：去掉移动端 300ms 的点击延迟，
    // 同时保留滚动能力（不设 none，否则控件会变成滚动死区）。
    runtimeActionElement.style.touchAction = "manipulation";
    runtimeActionElement.addEventListener("contextmenu", contextMenuEvent =>
      contextMenuEvent.preventDefault()
    );
    runtimeActionElement.addEventListener("selectstart", selectStartEvent =>
      selectStartEvent.preventDefault()
    );
    runtimeActionElement.addEventListener("dragstart", dragStartEvent =>
      dragStartEvent.preventDefault()
    );
    runtimeActionElement.addEventListener("pointerdown", pointerDownEvent => {
      isHoldTriggered = false;
      activePointerState = {
        pointerId: pointerDownEvent.pointerId,
        pointerType: pointerDownEvent.pointerType || "mouse",
        x: pointerDownEvent.clientX,
        y: pointerDownEvent.clientY,
        moved: false
      };
      if (hasHoldAction) {
        holdTimer = window.setTimeout(() => {
          isHoldTriggered = true;
          lastTapRecord = null;
          window.clearTimeout(doubleTapTimer);
          notifyRuntimeButtonPress();
          this.runAction(runtimeActionComponent, holdAction);
        }, 400);
      }
    });
    /**
     * 取消长按定时器（指针移动超过阈值、抬起或手势结束时都会调用）。
     */
    const clearHoldTimer = () => window.clearTimeout(holdTimer);
    runtimeActionElement.addEventListener("pointermove", pointerMoveEvent => {
      if (
        !!activePointerState &&
        activePointerState.pointerId === pointerMoveEvent.pointerId &&
        !(
          Math.hypot(
            pointerMoveEvent.clientX - activePointerState.x,
            pointerMoveEvent.clientY - activePointerState.y
          ) <= 18
        )
      ) {
        activePointerState.moved = true;
        clearHoldTimer();
      }
    });
    runtimeActionElement.addEventListener("pointerup", pointerUpEvent => {
      clearHoldTimer();
      const completedPointerState =
        activePointerState?.pointerId === pointerUpEvent.pointerId ? activePointerState : null;
      activePointerState = null;
      if (
        !completedPointerState ||
        completedPointerState.pointerType === "mouse" ||
        completedPointerState.moved ||
        isHoldTriggered
      ) {
        return;
      }
      pointerUpEvent.preventDefault();
      suppressClickUntilMs = performance.now() + 700;
      if (isTapActionEnabled || hasDoubleTapAction) {
        notifyRuntimeButtonPress();
      }
      const pointerUpTimeMs = performance.now();
      if (
        hasDoubleTapAction &&
        lastTapRecord &&
        pointerUpTimeMs - lastTapRecord.time <= 180 &&
        Math.hypot(
          pointerUpEvent.clientX - lastTapRecord.x,
          pointerUpEvent.clientY - lastTapRecord.y
        ) <= 34
      ) {
        window.clearTimeout(doubleTapTimer);
        rollbackOptimisticToggle();
        lastTapRecord = null;
        this.runAction(runtimeActionComponent, doubleTapAction);
        return;
      }
      lastTapRecord = {
        time: pointerUpTimeMs,
        x: pointerUpEvent.clientX,
        y: pointerUpEvent.clientY
      };
      if (hasDoubleTapAction) {
        applyTapToggleOptimistic();
        window.clearTimeout(doubleTapTimer);
        doubleTapTimer = window.setTimeout(() => {
          commitTapAction();
          lastTapRecord = null;
        }, 180);
      } else {
        if (isTapActionEnabled) {
          this.runAction(runtimeActionComponent, tapAction);
        }
        lastTapRecord = null;
      }
    });
    runtimeActionElement.addEventListener("pointercancel", () => {
      clearHoldTimer();
      activePointerState = null;
    });
    runtimeActionElement.addEventListener("click", () => {
      if (!(performance.now() < suppressClickUntilMs) && !isHoldTriggered) {
        if (isTapActionEnabled || hasDoubleTapAction) {
          notifyRuntimeButtonPress();
        }
        if (hasDoubleTapAction) {
          applyTapToggleOptimistic();
          window.clearTimeout(clickResetTimer);
          clickResetTimer = window.setTimeout(() => {
            commitTapAction();
          }, 180);
        } else if (isTapActionEnabled) {
          this.runAction(runtimeActionComponent, tapAction);
        }
      }
    });
    runtimeActionElement.addEventListener("dblclick", () => {
      window.clearTimeout(clickResetTimer);
      rollbackOptimisticToggle();
      if (hasDoubleTapAction) {
        this.runAction(runtimeActionComponent, doubleTapAction);
      }
    });
    this.cleanups.push(() => {
      window.clearTimeout(clickResetTimer);
      window.clearTimeout(doubleTapTimer);
      window.clearTimeout(holdTimer);
      rollbackOptimisticToggle();
    });
  },
  /**
   * 运行动作的统一入口：派发并吞掉异步错误。
   * 动作派发是「点了就得有反应」的路径，不能把异常抛回事件处理器；出错统一写全局日志，
   * 附带组件与实体信息，便于在展示页定位是哪块控件出了问题。
   */
  runAction(runActionComponent, runActionConfig, runActionOptions = {}) {
    if (!!runActionConfig?.type && runActionConfig.type !== "none") {
      this.dispatchAction(runActionComponent, runActionConfig, runActionOptions).catch(
        runActionError => {
          window.HABridgeLog?.error(runActionError, {
            componentId: runActionComponent.id,
            entityId: runActionComponent.bindings?.entity?.entityId || "",
            phase: "component-action"
          });
          this.options.onError?.(runActionError);
        }
      );
    }
  },
  /**
   * 在编辑态预览动作效果（目前只支持 more-info，即预览弹窗）。
   */
  previewAction(previewActionComponent, previewActionConfig) {
    // 只预览弹窗：toggle 之类的写操作在编辑态直接发出去会真的改动设备状态。
    if (previewActionConfig?.type === "more-info") {
      this.showActionPopup(previewActionComponent, previewActionConfig, {
        preview: true
      });
    }
  },
  /**
   * 为某个实体构造一个「用于弹窗的组件」。
   * 目标实体往往不是设备拿到状态的最优实体（如净化器开关挂在 fan、浴霸开关挂在 light），
   * 因此按设备画像的角色重定向到主实体，保证弹窗开关与列表状态同源。
   */
  popupComponentForEntity(requestedTargetEntityId, popupLabelText = "") {
    let resolvedEntityId = String(requestedTargetEntityId || "");
    let entityDomainName = entityDomainFromId(resolvedEntityId);
    const entityDeviceProfile = this.deviceProfile(resolvedEntityId);
    if (
      entityDeviceProfile?.deviceType === "air-purifier" &&
      entityDeviceProfile.roles?.fan &&
      entityDomainName !== "fan"
    ) {
      resolvedEntityId = entityDeviceProfile.roles.fan;
      entityDomainName = "fan";
    }
    const climateRoleEntityId =
      entityDeviceProfile?.roles?.climate || entityDeviceProfile?.roles?.fan || "";
    if (
      ["air-conditioner", "bath-heater"].includes(entityDeviceProfile?.deviceType) &&
      climateRoleEntityId &&
      !["climate", "light"].includes(entityDomainName)
    ) {
      resolvedEntityId = climateRoleEntityId;
      entityDomainName = entityDomainFromId(resolvedEntityId);
    }
    const metadataRecord = this.entityMetadata.get(resolvedEntityId);
    if (
      entityDomainName === "sensor" &&
      metadataRecord?.deviceId &&
      ["state", "status", "task_status"].includes(metadataRecord.translationKey)
    ) {
      const vacuumMetadataRecord = [...this.entityMetadata.values()].find(
        metadataCandidate =>
          metadataCandidate.deviceId === metadataRecord.deviceId &&
          metadataCandidate.domain === "vacuum" &&
          entityMetadataIsAvailable(metadataCandidate)
      );
      if (vacuumMetadataRecord?.entityId) {
        resolvedEntityId = vacuumMetadataRecord.entityId;
        entityDomainName = "vacuum";
      }
    }
    const popupComponentType =
      entityDeviceProfile?.deviceType === "electric-bed"
        ? "electric-bed"
        : entityDeviceProfile?.deviceType === "air-purifier" && entityDomainName === "fan"
          ? "air-purifier"
          : (["air-conditioner", "bath-heater"].includes(entityDeviceProfile?.deviceType) &&
                ["climate", "fan"].includes(entityDomainName)) ||
              entityDomainName === "climate"
            ? "air-conditioner"
            : entityDomainName === "water_heater"
              ? "water-heater"
              : entityDomainName === "camera"
                ? "camera"
                : entityDomainName === "media_player"
                  ? "media-player"
                  : ["fan", "select", "number", "input_number"].includes(entityDomainName)
                    ? "device-button"
                    : ["light", "switch", "input_boolean"].includes(entityDomainName)
                      ? "icon-button"
                      : entityDomainName === "sensor"
                        ? "line-chart"
                        : entityDomainName === "vacuum"
                          ? "vacuum-control"
                          : "device-button";
    return {
      id: "popup-" + resolvedEntityId,
      type: popupComponentType,
      bindings: {
        entity: {
          entityId: resolvedEntityId
        }
      },
      properties: {
        label: popupLabelText || "",
        ...(["air-conditioner", "bath-heater"].includes(entityDeviceProfile?.deviceType)
          ? {
              deviceType: entityDeviceProfile.deviceType
            }
          : {}),
        ...(entityDeviceProfile?.deviceType === "air-purifier"
          ? {
              deviceType: "air-purifier"
            }
          : {}),
        ...(entityDeviceProfile?.deviceType === "electric-bed"
          ? {
              deviceType: "electric-bed"
            }
          : {}),
        ...(entityDeviceProfile?.coverKind
          ? {
              coverKind: entityDeviceProfile.coverKind
            }
          : {})
      },
      actions: {}
    };
  },
  /**
   * 按动作声明的来源打开弹窗。
   * 三种来源：custom 打开文档里的组合弹窗（配置的弹窗已删除时报错而非静默无反应）、
   * entity 打开指定实体、current 打开控件自身绑定的实体。
   */
  showActionPopup(popupSourceComponent, popupActionConfig, { preview: popupPreview = false } = {}) {
    const popupSourceKind = popupActionConfig?.data?.popupSource || "current";
    if (popupSourceKind === "custom") {
      // 按 ID 找文档里的组合弹窗；找不到说明配置引用了已删除的弹窗，下面会抛错提示。
      const matchedCustomPopup = (this.document?.customPopups || []).find(
        customPopupEntry => customPopupEntry.id === popupActionConfig.data?.popupId
      );
      if (!matchedCustomPopup) {
        throw new Error("选择的组合弹窗不存在。");
      }
      this.showCustomPopup(matchedCustomPopup, {
        preview: popupPreview
      });
      return;
    }
    const sourceEntityId = popupSourceComponent?.bindings?.entity?.entityId;
    const usesSourceComponent =
      entityDomainFromId(sourceEntityId) === "cover" ||
      ["camera", "line-chart", "air-conditioner", "icon-button"].includes(
        popupSourceComponent?.type
      );
    let targetPopupComponent =
      popupSourceKind === "entity"
        ? this.popupComponentForEntity(
            popupActionConfig.data?.entityId,
            componentDialogTitle(
              popupSourceComponent,
              popupActionConfig.data?.title || popupActionConfig.data?.entityId
            )
          )
        : usesSourceComponent
          ? popupSourceComponent
          : this.popupComponentForEntity(
              sourceEntityId,
              componentDialogTitle(popupSourceComponent, "")
            );
    if (
      popupSourceKind !== "entity" &&
      targetPopupComponent !== popupSourceComponent &&
      popupSourceComponent?.properties?.relatedEntities
    ) {
      targetPopupComponent = {
        ...targetPopupComponent,
        properties: {
          ...(targetPopupComponent.properties || {}),
          relatedEntities: structuredClone(popupSourceComponent.properties.relatedEntities)
        }
      };
    }
    if (!targetPopupComponent?.bindings?.entity?.entityId) {
      throw new Error("该弹窗没有可用实体。");
    }
    if (targetPopupComponent.type === "camera") {
      this.showCameraPreview(targetPopupComponent, {
        preview: popupPreview
      });
    } else {
      this.showEntityDetails(targetPopupComponent, {
        preview: popupPreview
      });
    }
  },
  /**
   * 执行一次控件动作（toggle / navigate / more-info），返回值可 await。
   * 开关类动作会把乐观态的回滚函数一路带下去：HA 拒绝或超时后由调用方回滚界面，
   * 避免界面与真实状态长期不一致。
   */
  async dispatchAction(
    dispatchComponent,
    dispatchConfig,
    {
      optimisticAlreadyApplied: optimisticAlreadyApplied = false,
      optimisticRollback: optimisticRollback = null,
      optimisticPreviousState: optimisticPreviousState
    } = {}
  ) {
    if (dispatchConfig.type === "toggle") {
      const dispatchEntityId = dispatchComponent.bindings?.entity?.entityId;
      if (!dispatchEntityId) {
        throw new Error("该控件没有关联实体。");
      }
      if (isVirtualEntityId(dispatchEntityId)) {
        this.toggleVirtualEntity(dispatchEntityId);
        return;
      }
      const powerTargetEntityId =
        typeof this.powerEntityId == "function"
          ? this.powerEntityId(dispatchComponent, dispatchEntityId)
          : dispatchEntityId;
      const powerTargetDomain = entityDomainFromId(powerTargetEntityId);
      if (["button", "script"].includes(powerTargetDomain)) {
        const buttonToggleCommand = entityToggleCommand(
          powerTargetEntityId,
          this.states.get(powerTargetEntityId),
          dispatchComponent
        );
        await this.callEntityService(
          buttonToggleCommand.domain,
          buttonToggleCommand.service,
          powerTargetEntityId,
          buttonToggleCommand.data
        );
        return;
      }
      const baseEntityState = optimisticAlreadyApplied
        ? optimisticPreviousState
        : this.states.get(powerTargetEntityId);
      const rollbackToggleAction = optimisticAlreadyApplied
        ? optimisticRollback || (() => {})
        : this.applyOptimisticToggle(powerTargetEntityId, dispatchComponent);
      try {
        if (powerTargetDomain === "cover") {
          const optimisticStatesSnapshot = new Map(this.states);
          if (baseEntityState === undefined) {
            optimisticStatesSnapshot.delete(powerTargetEntityId);
          } else {
            optimisticStatesSnapshot.set(powerTargetEntityId, baseEntityState);
          }
          await this.callEntityService(
            "cover",
            coverToggleServiceForComponent(
              dispatchComponent,
              this.entityMetadata,
              optimisticStatesSnapshot,
              powerTargetEntityId
            ),
            powerTargetEntityId
          );
        } else if (["climate", "fan", "water_heater", "media_player"].includes(powerTargetDomain)) {
          const resolvedPowerComponent =
            typeof this.runtimePowerComponent == "function"
              ? this.runtimePowerComponent(dispatchComponent, dispatchEntityId)
              : dispatchComponent;
          const runtimeToggleCommand = entityToggleCommand(
            powerTargetEntityId,
            baseEntityState,
            resolvedPowerComponent
          );
          await this.callEntityService(
            runtimeToggleCommand.domain,
            runtimeToggleCommand.service,
            powerTargetEntityId,
            runtimeToggleCommand.data
          );
        } else {
          await this.callEntityService("homeassistant", "toggle", powerTargetEntityId);
        }
      } catch (toggleActionError) {
        rollbackToggleAction();
        throw toggleActionError;
      }
      return;
    }
    if (dispatchConfig.type === "more-info") {
      this.showActionPopup(dispatchComponent, dispatchConfig);
      return;
    }
    if (dispatchConfig.type === "navigate") {
      if (
        !dispatchConfig.target ||
        !this.document?.pages?.some(
          documentPageRecord => documentPageRecord.path === dispatchConfig.target
        )
      ) {
        throw new Error("跳转的页面不存在。");
      }
      this.navigate(dispatchConfig.target);
    }
  },
  /**
   * 调用 Home Assistant 服务（设备控制的唯一出口）。走本机后端转发接口，浏览器不直连 HA，令牌与会话留在后端；
   * hbLogContext 是全局日志约定的字段，出错时能直接看出是哪块屏幕的哪个实体。
   * @throws {Error} 后端返回非 2xx 时抛出，文案优先取后端的 detail。
   */
  async callEntityService(serviceDomain, serviceName, serviceEntityId, serviceData = {}) {
    const serviceResponse = await fetch("/api/v1/ha/services/call", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        domain: serviceDomain,
        service: serviceName,
        entityId: serviceEntityId,
        data: serviceData
      }),
      hbLogContext: {
        entityId: serviceEntityId,
        service: serviceDomain + "." + serviceName,
        phase: "device-control"
      }
    });
    if (!serviceResponse.ok) {
      const serviceErrorBody = await serviceResponse.json().catch(() => ({}));
      // 文案归一交给 utils/api-error.js。
      const entityServiceError = new Error(
        apiErrorMessage(serviceErrorBody, "实体操作失败。")
      );
      throw (
        window.HABridgeLog?.linkError(entityServiceError, serviceResponse) || entityServiceError
      );
    }
  }
};
