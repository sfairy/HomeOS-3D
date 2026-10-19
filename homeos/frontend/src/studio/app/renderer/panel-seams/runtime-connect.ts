import { EVENT_LOG_WALL_AUTO_ENTITY_LIMIT, isEventLogWallDomain } from "../controls/event-log-runtime";
import type { PanelRenderer } from "../panel-renderer";
import { collectComponents as collectComponents2, collectEntityIds as collectEntityIds2, lineChartRuntimeStateNeedsHydration as lineChartRuntimeStateNeedsHydration2 } from "../panel-document";
import { entityMetadataIsAvailable as entityMetadataIsAvailable2 } from "../entity-metadata";
import { isVirtualEntityId as isVirtualEntityId2 } from "../../shared/virtual-entities";
import { maxRuntimeEntitySubscriptions } from "../renderer-helpers";
import { navigateInShell } from "@/studio/platform/shell-navigation";
import { presenceMotionEventConfig as presenceMotionEventConfig2 } from "../registry";
import { relatedAirerCurrentPositionSensor as relatedAirerCurrentPositionSensor2, relatedAirerLightEntity as relatedAirerLightEntity2, relatedAirerMotorActionEntities as relatedAirerMotorActionEntities2, relatedAirerMotorSpeedSensor as relatedAirerMotorSpeedSensor2, relatedAirerPositionNumberEntity as relatedAirerPositionNumberEntity2, relatedCoverMotorReverseEntity as relatedCoverMotorReverseEntity2, relatedDeviceDomainEntity as relatedDeviceDomainEntity2, relatedDeviceEntity as relatedDeviceEntity2, relatedWaterHeaterEntities as relatedWaterHeaterEntities2 } from "../controls/cover-runtime";
import { relatedVacuumBatteryEntity as relatedVacuumBatteryEntity2, relatedVacuumStatusEntities as relatedVacuumStatusEntities2 } from "../controls/vacuum-runtime";

export function connectRuntime(this: PanelRenderer, { force: isForcedConnect = false } = {}) {
    if (!this.document || this.destroyed) {
      this.disconnectRuntime();
      return;
    }
    const page = this.page || this.document.pages?.[0],
      sharedComponentsById = new Map(
        (this.document.sharedComponents || []).map((sharedComponent: any) => [
          sharedComponent.id,
          sharedComponent,
        ]),
      ),
      pageComponents = [
        ...(page?.sharedComponentIds || [])
          .map((isForcedConnectSharedComponentId: any) =>
            sharedComponentsById.get(isForcedConnectSharedComponentId),
          )
          .filter(Boolean),
        ...(page?.components || []),
      ],
      runtimeEntityIdSet = collectEntityIds2(pageComponents),
      activePopupEntry = this.activePopupId
        ? (this.document.customPopups || []).find(
            (popupModule: any) => String(popupModule.id || "") === this.activePopupId,
          )
        : null;
    for (const eventLogWallComponent of collectComponents2(
      pageComponents,
      (componentCandidate) => componentCandidate.type === "event-log-wall",
    )) {
      const eventLogWallProperties = eventLogWallComponent.properties || {};
      if (eventLogWallProperties.enabled === false) continue;
      if (String(eventLogWallProperties.watchScope || "auto") === "manual") {
        for (const manualEventLogWallEntityId of Array.isArray(eventLogWallProperties.entityIds)
          ? eventLogWallProperties.entityIds
          : [])
          manualEventLogWallEntityId &&
            !isVirtualEntityId2(manualEventLogWallEntityId) &&
            runtimeEntityIdSet.add(String(manualEventLogWallEntityId));
        continue;
      }
      const eventLogWallAutoBudget = Math.min(
        EVENT_LOG_WALL_AUTO_ENTITY_LIMIT,
        Math.max(0, maxRuntimeEntitySubscriptions - runtimeEntityIdSet.size),
      );
      let eventLogWallAutoCount = 0;
      for (const [eventLogWallAutoEntityId, eventLogWallAutoMetadata] of this.entityMetadata) {
        if (eventLogWallAutoCount >= eventLogWallAutoBudget) break;
        if (isVirtualEntityId2(eventLogWallAutoEntityId)) continue;
        if (
          !isEventLogWallDomain(eventLogWallAutoMetadata?.domain || eventLogWallAutoEntityId)
        )
          continue;
        runtimeEntityIdSet.add(eventLogWallAutoEntityId);
        eventLogWallAutoCount += 1;
      }
    }
    for (const moduleRecord of activePopupEntry?.modules || [])
      moduleRecord.entityId &&
        !isVirtualEntityId2(moduleRecord.entityId) &&
        runtimeEntityIdSet.add(moduleRecord.entityId);
    for (const eventEntityId of [...runtimeEntityIdSet]) {
      if (this.entityMetadata.get(eventEntityId)?.domain !== "event") continue;
      const presenceComponentRecord = collectComponents2(
        pageComponents,
        (presenceComponentCandidate) =>
          presenceComponentCandidate.type === "presence-sensor" &&
          presenceComponentCandidate.bindings?.entity?.entityId === eventEntityId,
      )[0];
      if (!presenceComponentRecord) continue;
      const presenceMotionConfig = presenceMotionEventConfig2(
        eventEntityId,
        this.states.get(eventEntityId),
        this.entityMetadata,
        this.states,
        presenceComponentRecord.properties,
      );
      for (const motionCompanionEntityId of presenceMotionConfig.companionEntityIds)
        runtimeEntityIdSet.add(motionCompanionEntityId);
    }
    for (const candidateSensorEntityId of [...runtimeEntityIdSet]) {
      const sensorMetadata = this.entityMetadata.get(candidateSensorEntityId);
      if (
        sensorMetadata?.domain !== "sensor" ||
        !sensorMetadata.deviceId ||
        !["state", "status", "task_status"].includes(sensorMetadata.translationKey)
      )
        continue;
      const vacuumMetadata = [...this.entityMetadata.values()].find(
        (vacuumMetadataCandidate) =>
          vacuumMetadataCandidate.deviceId === sensorMetadata.deviceId &&
          vacuumMetadataCandidate.domain === "vacuum" &&
          entityMetadataIsAvailable2(vacuumMetadataCandidate),
      );
      vacuumMetadata?.entityId && runtimeEntityIdSet.add(vacuumMetadata.entityId);
    }
    for (const vacuumRuntimeEntityId of [...runtimeEntityIdSet]) {
      if (this.entityMetadata.get(vacuumRuntimeEntityId)?.domain !== "vacuum") continue;
      const slice7 = vacuumRuntimeEntityId.slice(vacuumRuntimeEntityId.indexOf(".") + 1),
        cleaningModeEntity = relatedDeviceEntity2(
          this.entityMetadata,
          vacuumRuntimeEntityId,
          "select",
          "cleaning_mode",
          "select." + slice7 + "_cleaning_mode",
        );
      cleaningModeEntity?.entityId && runtimeEntityIdSet.add(cleaningModeEntity.entityId);
      const batteryEntity = relatedVacuumBatteryEntity2(
        this.entityMetadata,
        this.states,
        vacuumRuntimeEntityId,
      );
      batteryEntity?.entityId && runtimeEntityIdSet.add(batteryEntity.entityId);
      for (const statusEntityRecord of relatedVacuumStatusEntities2(
        this.entityMetadata,
        vacuumRuntimeEntityId,
      ))
        runtimeEntityIdSet.add(statusEntityRecord.entityId);
    }
    for (const coverEntityId of [...runtimeEntityIdSet]) {
      if (
        (this.entityMetadata.get(coverEntityId)?.domain ||
          String(coverEntityId || "").split(".", 1)[0]) !== "cover"
      )
        continue;
      const motorReverseEntity = relatedCoverMotorReverseEntity2(
        this.entityMetadata,
        coverEntityId,
      );
      motorReverseEntity?.entityId && runtimeEntityIdSet.add(motorReverseEntity.entityId);
      const airerLightEntity = relatedAirerLightEntity2(this.entityMetadata, coverEntityId);
      airerLightEntity?.entityId && runtimeEntityIdSet.add(airerLightEntity.entityId);
      const airerPositionEntity = relatedAirerPositionNumberEntity2(
        this.entityMetadata,
        coverEntityId,
      );
      airerPositionEntity?.entityId && runtimeEntityIdSet.add(airerPositionEntity.entityId);
      const airerCurrentPositionEntity = relatedAirerCurrentPositionSensor2(
        this.entityMetadata,
        coverEntityId,
      );
      airerCurrentPositionEntity?.entityId &&
        runtimeEntityIdSet.add(airerCurrentPositionEntity.entityId);
      const airerMotorSpeedEntity = relatedAirerMotorSpeedSensor2(
        this.entityMetadata,
        coverEntityId,
      );
      airerMotorSpeedEntity?.entityId && runtimeEntityIdSet.add(airerMotorSpeedEntity.entityId);
      const airerMotorActionEntities = relatedAirerMotorActionEntities2(
        this.entityMetadata,
        coverEntityId,
      );
      for (const motorActionEntity of Object.values(airerMotorActionEntities))
        motorActionEntity?.entityId && runtimeEntityIdSet.add(motorActionEntity.entityId);
    }
    for (const climateEntityId of [...runtimeEntityIdSet]) {
      const climateMetadata = this.entityMetadata.get(climateEntityId);
      if (!["climate", "fan"].includes(String(climateMetadata?.domain || ""))) continue;
      const relatedLightEntity = relatedDeviceDomainEntity2(
        this.entityMetadata,
        climateEntityId,
        "light",
      );
      relatedLightEntity?.entityId && runtimeEntityIdSet.add(relatedLightEntity.entityId);
    }
    for (const isForcedConnectWaterHeaterEntityId of [...runtimeEntityIdSet])
      if (this.entityMetadata.get(isForcedConnectWaterHeaterEntityId)?.domain === "water_heater") {
        for (const waterHeaterEntity of relatedWaterHeaterEntities2(
          this.entityMetadata,
          isForcedConnectWaterHeaterEntityId,
        ))
          runtimeEntityIdSet.add(waterHeaterEntity.entityId);
      }
    for (const profileEntityId of [...runtimeEntityIdSet]) {
      const entityDeviceProfile = this.deviceProfile(profileEntityId);
      if (entityDeviceProfile)
        for (const profileRole of [
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
          "memory2",
        ]) {
          const profileRoleEntityId = entityDeviceProfile.roles?.[profileRole];
          profileRoleEntityId && runtimeEntityIdSet.add(profileRoleEntityId);
        }
    }
    const collectedEntityIds = [...runtimeEntityIdSet];
    if (!collectedEntityIds.length) {
      (this.disconnectRuntime(), (this.runtimeHydrationRetryAttempt = 0));
      return;
    }
    if (collectedEntityIds.length > maxRuntimeEntitySubscriptions) {
      this.disconnectRuntime();
      const entityCountText = String(collectedEntityIds.length);
      this.runtimeEntityLimitSignature !== entityCountText &&
        ((this.runtimeEntityLimitSignature = entityCountText),
        this.options.onError?.(
          new Error(
            "当前项目需要实时订阅 " +
              collectedEntityIds.length +
              " 个实体，已超过 " +
              maxRuntimeEntitySubscriptions +
              " 个上限。请减少统计或控件中绑定的实体。",
          ),
        ));
      return;
    }
    this.runtimeEntityLimitSignature = "";
    const entitySignature = JSON.stringify([...collectedEntityIds].sort()),
      runtimeSubscription = this.runtimeSubscription,
      isSocketConnecting = this.socket?.readyState === WebSocket.CONNECTING,
      isSocketOpen = this.socket?.readyState === WebSocket.OPEN;
    if (
      !isForcedConnect &&
      runtimeSubscription &&
      (isSocketConnecting || (isSocketOpen && runtimeSubscription.signature === entitySignature))
    ) {
      ((runtimeSubscription.entityIds = collectedEntityIds),
        (runtimeSubscription.runtimeComponents = pageComponents),
        (runtimeSubscription.signature = entitySignature),
        isSocketOpen &&
          this.scheduleRuntimeHydrationRetry(runtimeSubscription, this.socketGeneration));
      return;
    }
    (runtimeSubscription?.signature !== entitySignature && (this.runtimeHydrationRetryAttempt = 0),
      this.disconnectRuntime());
    const socketGeneration = this.socketGeneration,
      runtimeSubscriptionOptions = {
        entityIds: collectedEntityIds,
        runtimeComponents: pageComponents,
        signature: entitySignature,
      };
    this.runtimeSubscription = runtimeSubscriptionOptions;
    const webSocketProtocol = window.location.protocol === "https:" ? "wss" : "ws",
      webSocket = new WebSocket(
        webSocketProtocol + "://" + window.location.host + "/api/v1/ws/runtime",
      );
    ((this.socket = webSocket),
      webSocket.addEventListener("open", () => {
        socketGeneration === this.socketGeneration &&
          (this.reconnectAttempt > 0 &&
            window.HomeOSLog?.report!("success", "实时连接", "实时状态连接已恢复", {
              phase: "websocket-reconnected",
              path: "/api/v1/ws/runtime",
            })!,
          (this.reconnectAttempt = 0),
          webSocket.send(
            JSON.stringify({
              type: "subscribe",
              entityIds: runtimeSubscriptionOptions.entityIds,
              // 服务端据此决定是否把同一瞬间的多条状态合并成一帧（旧缓存不认识批量帧，
              // 所以必须显式协商，不能默认开启）。
              supportsStateBatch: true,
            }),
          ));
      }),
      webSocket.addEventListener("message", (socketMessageEvent) => {
        if (socketGeneration !== this.socketGeneration) return;
        const { entityIds: subscriptionEntityIds } = runtimeSubscriptionOptions;
        let runtimeMessage;
        try {
          runtimeMessage = JSON.parse(socketMessageEvent.data);
        } catch (runtimeMessageError: any) {
          window.HomeOSLog?.error!(
            runtimeMessageError,
            {
              phase: "websocket-message",
              path: "/api/v1/ws/runtime",
            },
            "实时状态消息格式异常",
          )!;
          return;
        }
        if (runtimeMessage.type === "ha_status") {
          // 墙屏与仪表盘共用同一个 HA 连接：这条帧是「中枢失联」与「设备真的关了」
          // 的唯一区分依据。状态为 connected 时强制补一次快照以外的水合（断线期间
          // 发生的变更不会补发，重连后的快照会覆盖，这里只需要刷新展示态）。
          const haStatus = String(runtimeMessage.status || "");
          this.runtimeHaConnected = haStatus === "connected";
          this.options.onRuntimeHaStatus?.(haStatus, runtimeMessage);
          window.dispatchEvent?.(
            new CustomEvent("hb-ha-status", {
              detail: { status: haStatus, payload: runtimeMessage },
            }),
          );
          if (haStatus !== "connected") {
            // 断线期间数值会冻结：暂停依赖连续状态变化的流线动画，并标记快照需要重建，
            // 避免界面把旧值当成实时值继续演绎。
            this.pauseRuntimeFlowLines();
          }
          return;
        }
        if (runtimeMessage.type === "snapshot") {
          this.runtimeSnapshotReady = true;
          const snapshotStates = runtimeMessage.states || [],
            restoredEntityIdSet = new Set(
              [...this.removedRuntimeEntityIds].filter((removedRuntimeEntityId) =>
                snapshotStates.some(
                  (snapshotState: any) =>
                    String(snapshotState?.entityId || "") === removedRuntimeEntityId,
                ),
              ),
            );
          for (const restoredEntityId of restoredEntityIdSet)
            this.historyRequestPolicy?.success(restoredEntityId);
          (this.historyRequestPolicy?.authenticated(),
            window.dispatchEvent?.(
              new CustomEvent("hb-runtime-ready", {
                detail: {
                  entityIds: [...restoredEntityIdSet],
                },
              }),
            ));
          const activeEntityIdSet = new Set(
            snapshotStates
              .map((snapshotEntry: any) => String(snapshotEntry?.entityId || ""))
              .filter(Boolean),
          );
          for (const subscriptionEntityId of subscriptionEntityIds)
            activeEntityIdSet.has(subscriptionEntityId) ||
              (this.removedRuntimeEntityIds.add(subscriptionEntityId),
              this.states.delete(subscriptionEntityId));
          for (const cachedEntityId of [...this.states.keys()])
            activeEntityIdSet.has(cachedEntityId) || this.states.delete(cachedEntityId);
          for (const incomingState of snapshotStates)
            this.optimisticStateIsConfirmed(incomingState.entityId, incomingState) &&
              (this.rememberLightVisualState(incomingState.entityId, incomingState),
              this.removedRuntimeEntityIds.delete(incomingState.entityId),
              this.states.set(incomingState.entityId, incomingState),
              this.applyRuntimeStateHandlers(
                incomingState.entityId,
                incomingState.newState || incomingState,
              ));
          (this.options.onRuntimeStateChange?.(snapshotStates), this.tryOpenPendingEntityDetails());
          for (const mapState of snapshotStates) this.refreshVacuumMapEntity(mapState.entityId);
          if (this.detailsStateSync?.handlers)
            for (const [registeredEntityId, entityStateHandlers] of this.detailsStateSync
              .handlers) {
              const isForcedConnectEntityStateSnapshot = this.states.get(registeredEntityId);
              if (isForcedConnectEntityStateSnapshot) {
                for (const entityHandler of entityStateHandlers)
                  entityHandler(
                    isForcedConnectEntityStateSnapshot.newState ||
                      isForcedConnectEntityStateSnapshot,
                  );
              }
            }
          else {
            const detailsSyncState = this.detailsStateSync
              ? this.states.get(this.detailsStateSync.entityId)
              : null;
            this.detailsStateSync &&
              detailsSyncState &&
              this.detailsStateSync.apply(detailsSyncState.newState || detailsSyncState);
          }
          (this.refreshRuntimeComponents([...activeEntityIdSet, ...this.removedRuntimeEntityIds]),
            snapshotStates.some(
              (stateNeedingHydration: any) =>
                !lineChartRuntimeStateNeedsHydration2(stateNeedingHydration),
            ) &&
              (window.clearTimeout(this.runtimeHydrationRetryTimer!),
              (this.runtimeHydrationRetryTimer = null),
              (this.runtimeHydrationRetryAttempt = 0)),
            this.scheduleRuntimeHydrationRetry(runtimeSubscriptionOptions, socketGeneration));
        } else {
          if (runtimeMessage.type === "state_removed") {
            const removedEntityId = String(runtimeMessage.entityId || "");
            if (!removedEntityId) return;
            const removedStateOptions = {
              type: "state_changed",
              entityId: removedEntityId,
              domain: removedEntityId.split(".", 1)[0],
              state: "unavailable",
              attributes: {} as Record<string, any>,
              available: false,
            };
            if (
              (this.removedRuntimeEntityIds.add(removedEntityId),
              this.states.delete(removedEntityId),
              this.options.onRuntimeStateChange?.([]),
              this.tryOpenPendingEntityDetails(),
              this.detailsStateSync?.handlers?.has(removedEntityId))
            ) {
              for (const stateHandlerFn of this.detailsStateSync!.handlers.get(removedEntityId))
                stateHandlerFn(removedStateOptions);
            } else
              this.detailsStateSync?.entityId === removedEntityId &&
                this.detailsStateSync.apply(removedStateOptions);
            (this.applyRuntimeStateHandlers(removedEntityId, removedStateOptions),
              this.refreshRuntimeComponents([removedEntityId]));
            for (const componentId of this.runtimeEntityComponentIndex.get(removedEntityId) || []) {
              const componentEntry = this.componentRecords.get(componentId);
              ["line-chart", "camera", "vacuum-map"].includes(componentEntry?.type) &&
                this.refreshRuntimeComponent(componentId);
            }
            this.refreshVacuumMapEntity(removedEntityId);
          } else {
            if (runtimeMessage.type === "resync_required")
              socketGeneration === this.socketGeneration &&
                !this.destroyed &&
                this.connectRuntime({
                  force: true,
                });
            else {
              if (runtimeMessage.type === "state_changed") {
                applyRuntimeStateEvent(this, runtimeMessage);
              } else if (
                runtimeMessage.type === "state_changed_batch" &&
                Array.isArray(runtimeMessage.events)
              ) {
                // 同一次场景切换 / 全屋开关的多条状态被服务端合并成一帧：
                // 逐条套用与单条帧完全相同的落点逻辑，只是省掉了 N-1 次 JSON 解析与调度。
                for (const batchedStateEvent of runtimeMessage.events)
                  applyRuntimeStateEvent(this, batchedStateEvent);
              }
            }
          }
        }
      }),
      webSocket.addEventListener("close", (socketCloseEvent) => {
        if (socketGeneration !== this.socketGeneration || this.destroyed) return;
        if (
          (this.pauseRuntimeFlowLines(),
          (this.runtimeHaConnected = false),
          (this.socket = null),
          (this.runtimeSubscription = null),
          window.clearTimeout(this.runtimeHydrationRetryTimer!),
          (this.runtimeHydrationRetryTimer = null),
          window.HomeOSLog?.report!(
            "warning",
            "实时连接",
            "实时状态连接已断开（" +
              socketCloseEvent.code +
              "）" +
              ([4400, 4401, 4403].includes(socketCloseEvent.code) ? "" : "，正在重连"),
            {
              code: socketCloseEvent.code,
              phase: "websocket-disconnected",
              path: "/api/v1/ws/runtime",
            },
          )!,
          socketCloseEvent.code === 4401)
        ) {
          // 会话失效一律回登录页，登录后由路由守卫放行。
          navigateInShell("/login");
          return;
        }
        if (socketCloseEvent.code === 4403) {
          navigateInShell("/activate");
          return;
        }
        if (socketCloseEvent.code === 4400) {
          const socketErrorText =
            socketCloseEvent.reason === "too many entities"
              ? "当前项目的实时订阅实体超过 " +
                maxRuntimeEntitySubscriptions +
                " 个，已停止重连。请减少统计或控件中绑定的实体。"
              : "实时状态订阅请求无效，已停止自动重连。";
          this.options.onError?.(new Error(socketErrorText));
          return;
        }
        // 指数退避加抖动：全屋多块墙屏 + 手机在同一个 HA 重启后往往同时重连，
        // 固定间隔会让它们每一轮都撞在同一时刻（同刻 SYN、同刻超时），把恢复拖慢。
        // 抖动只向下取 0.5~1.0，因此等待时间永远不会超过 15s 上限。
        const reconnectDelayMs = Math.max(
          200,
          Math.round(Math.min(1000 * 2 ** this.reconnectAttempt, 15000) * (0.5 + Math.random() * 0.5)),
        );
        ((this.reconnectAttempt += 1),
          (this.reconnectTimer = window.setTimeout(() => this.connectRuntime(), reconnectDelayMs)));
      }),
      webSocket.addEventListener("error", () => {
        webSocket.readyState === WebSocket.OPEN && webSocket.close();
      }));
  }

/**
 * 套用一条 `state_changed`（单条帧与批量帧共用）。
 *
 * 抽出来的目的是让服务端可以把一次场景切换的 N 条状态合并成一帧下发，而落点逻辑
 * （乐观态确认、光效记忆、详情面板、事件日志、组件重绘）与逐条推送时完全一致。
 */
function applyRuntimeStateEvent(self: PanelRenderer, runtimeMessage: any) {
  if (!self.optimisticStateIsConfirmed(runtimeMessage.entityId, runtimeMessage)) return;
  const previousState = self.states.get(runtimeMessage.entityId);
  const wasRemoved = self.removedRuntimeEntityIds.has(runtimeMessage.entityId);
  if (wasRemoved) {
    self.historyRequestPolicy?.success(runtimeMessage.entityId);
    window.dispatchEvent?.(
      new CustomEvent("hb-runtime-ready", {
        detail: { entityIds: [runtimeMessage.entityId] },
      }),
    );
  }
  (self.rememberLightVisualState(runtimeMessage.entityId, runtimeMessage),
    self.removedRuntimeEntityIds.delete(runtimeMessage.entityId),
    self.states.set(runtimeMessage.entityId, runtimeMessage),
    self.options.onRuntimeStateChange?.([runtimeMessage]),
    self.tryOpenPendingEntityDetails(),
    self.refreshVacuumMapEntity(runtimeMessage.entityId));
  if (self.detailsStateSync?.handlers?.has(runtimeMessage.entityId)) {
    for (const detailsHandler of self.detailsStateSync!.handlers.get(runtimeMessage.entityId))
      detailsHandler(runtimeMessage.newState || runtimeMessage);
  } else if (self.detailsStateSync?.entityId === runtimeMessage.entityId) {
    self.detailsStateSync!.apply(runtimeMessage.newState || runtimeMessage);
  }
  (self.applyRuntimeStateHandlers(
    runtimeMessage.entityId,
    runtimeMessage.newState || runtimeMessage,
  ),
    self.pushEventLogWallEntries(
      runtimeMessage.entityId,
      previousState,
      runtimeMessage.newState || runtimeMessage,
    ),
    self.scheduleRuntimeRender(runtimeMessage.entityId));
}
