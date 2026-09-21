/*
 * 设备请求结算。
 *
 * 幕帘、空调、电视、灯光四类控制请求的超时、失败与确认结算。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */
export function createRequestSettlement(ctx) {
  /**
   * 结清窗帘控制请求：清定时器、撤回叶片待确认标记、把失败原因写进反馈，
   * 再重绘标记与灯光面板并唤醒渲染。
   */
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

  // 结清灯光命令：清超时、按需下发排队中的下一条、回滚或确认本地预览，
  // 最后把错误写进面板提示。超时时不下发排队命令，避免超时后还继续往设备灌命令。
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
  return { settleClimateRequest, settleCoverRequest, settleLightCommand, settleTelevisionRequest };
}
