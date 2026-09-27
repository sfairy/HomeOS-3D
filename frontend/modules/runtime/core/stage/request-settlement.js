/*
 * 设备请求结算。
 */
export function createRequestSettlement(ctx) {
  function settleCoverRequest(pendingCoverKey, coverError) {
    const pendingCoverRequest = ctx.coverRequestsById.get(pendingCoverKey);
    if (pendingCoverRequest) {
      clearTimeout(pendingCoverRequest.timeout);
      ctx.coverRequestsById.delete(pendingCoverKey);
      if (coverError) {
        if (
          ctx.bladePendingByEntityId.get(pendingCoverRequest.entityId)?.requestId === pendingCoverKey
        ) {
          ctx.bladePendingByEntityId.delete(pendingCoverRequest.entityId);
        }
        ctx.dreamCoverFeedback.fail(pendingCoverRequest.entityId, pendingCoverKey, coverError);
        pendingCoverRequest.feedback.fail(
          pendingCoverRequest.entityId,
          pendingCoverKey,
          coverError
        );
        ctx.syncCoverFeedback();
        ctx.renderLightPanel();
        ctx.wakeFrameLoop();
        pendingCoverRequest.reject(new Error(coverError));
      } else {
        pendingCoverRequest.resolve();
      }
    }
  }

  /**
   * 结清一条空调控制请求：清超时定时器、出表，再按有无错误 resolve / reject。
   */
  function settleClimateRequest(pendingClimateKey, climateError) {
    const pendingClimateRequest = ctx.climateRequestsById.get(pendingClimateKey);
    if (pendingClimateRequest) {
      clearTimeout(pendingClimateRequest.timeout);
      ctx.climateRequestsById.delete(pendingClimateKey);
      if (climateError) {
        pendingClimateRequest.reject(new Error(climateError));
      } else {
        pendingClimateRequest.resolve();
      }
    }
  }

  /**
   * 结清电视控制请求：清超时定时器并按结果 resolve / reject。
   */
  function settleTelevisionRequest(pendingTelevisionKey, televisionError) {
    const pendingTelevisionRequest = ctx.televisionRequestsById.get(pendingTelevisionKey);
    if (pendingTelevisionRequest) {
      clearTimeout(pendingTelevisionRequest.timeout);
      ctx.televisionRequestsById.delete(pendingTelevisionKey);
      if (televisionError) {
        pendingTelevisionRequest.reject(new Error(televisionError));
      } else {
        pendingTelevisionRequest.resolve();
      }
    }
  }

  /**
   * 结清通用设备附加实体的控制请求（冰箱 / 冰柜 / 洗碗机 / 洗衣机 / 烘干机 / 绿植的卡片操作）。
   */
  function settleDeviceRequest(pendingDeviceKey, deviceError) {
    const pendingDeviceRequest = ctx.deviceRequestsById.get(pendingDeviceKey);
    if (pendingDeviceRequest) {
      clearTimeout(pendingDeviceRequest.timeout);
      ctx.deviceRequestsById.delete(pendingDeviceKey);
      if (deviceError) {
        pendingDeviceRequest.reject(new Error(deviceError));
      } else {
        pendingDeviceRequest.resolve();
      }
    }
  }

  // 结清灯光命令：清超时、按需下发排队中的下一条、回滚或确认本地预览，
  function settleLightCommand(lightRequestKey, lightError = "", isTimedOut = false) {
    const lightRequest = ctx.lightRequestsById.get(lightRequestKey);
    if (!lightRequest) {
      return;
    }
    clearTimeout(lightRequest.timeout);
    ctx.lightRequestsById.delete(lightRequestKey);
    const nextCommand = lightRequest.next;
    const shouldSendNext =
      nextCommand &&
      !isTimedOut &&
      !ctx.isDisposed &&
      !ctx.isEditing &&
      ctx.isInteractive &&
      ctx.activeModule === "light" &&
      ctx.currentFloorId !== "all" &&
      (ctx.config.lights || []).some(
        matchingLightEntry =>
          ctx.isOnActiveFloor(matchingLightEntry) &&
          matchingLightEntry.entityId === lightRequest.entityId
      ) &&
      ctx.readLightState(lightRequest.entityId).available;
    if (lightError) {
      ctx.lightPreview.reject(lightRequest.entityId, lightRequest.previewToken);
    } else {
      ctx.lightPreview.acknowledge(lightRequest.entityId, lightRequest.previewToken);
    }
    if (shouldSendNext) {
      ctx.sendLightCommand(nextCommand.command, nextCommand.previewToken);
    } else if (nextCommand) {
      ctx.lightPreview.reject(lightRequest.entityId, nextCommand.previewToken);
    }
    if (ctx.findFocusedBinding()?.entityId === lightRequest.entityId) {
      ctx.controlErrorElement.textContent = shouldSendNext ? "" : lightError;
    }
    ctx.renderMarkers();
  }
  return {
    settleClimateRequest,
    settleCoverRequest,
    settleDeviceRequest,
    settleLightCommand,
    settleTelevisionRequest
  };
}
