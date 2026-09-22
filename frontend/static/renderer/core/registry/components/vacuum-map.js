/**
 * `vacuum-map` 控件：扫地机地图与路径，底图走内置资源解析。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../../utils/numbers.js?v=2609221226";
// 状态条目归一统一走 utils/state-entry.js，全仓库只有这一份实现。
import { resolveStateEntry } from "../../../../utils/state-entry.js?v=2609221226";
// 同门分片：builtin-assets
import { vacuumMapImageSource } from "../builtin-assets.js?v=2609221226";
// 同门分片：registry-core
import { registerComponent } from "../registry-core.js?v=2609221226";

// 扫地机地图控件：图片地址由 vacuumMapImageSource 生成，并交给预加载器提前取图。
registerComponent("vacuum-map", {
  render(vacuumComponent, vacuumContext) {
    const vacuumProperties = vacuumComponent.properties || {};
    const vacuumBindingEntityId = vacuumComponent.bindings?.entity?.entityId || "";
    const vacuumElement = document.createElement("div");
    vacuumElement.className = "hb-vacuum-map-component";
    vacuumElement.style.opacity = String(clampCoercedNumber(vacuumProperties.opacity, 0, 1, 0.5));
    vacuumElement.setAttribute("aria-label", vacuumProperties.label || "扫地机器人实时地图");
    if (!vacuumBindingEntityId) {
      if (vacuumContext.editable) {
        const vacuumEmptyPlaceholderElement = document.createElement("span");
        vacuumEmptyPlaceholderElement.className = "hb-vacuum-map-placeholder";
        vacuumEmptyPlaceholderElement.textContent = "请选择实时地图实体";
        vacuumElement.append(vacuumEmptyPlaceholderElement);
      }
      return vacuumElement;
    }
    const vacuumImageElement = document.createElement("img");
    vacuumImageElement.className = "hb-vacuum-map-image";
    vacuumImageElement.alt =
      vacuumProperties.label ||
      resolveStateEntry(vacuumContext.states?.get(vacuumBindingEntityId))?.attributes
        ?.friendly_name ||
      vacuumBindingEntityId;
    vacuumImageElement.draggable = false;
    const vacuumEncodedEntityId = encodeURIComponent(vacuumBindingEntityId);
    const isImageEntityId = vacuumBindingEntityId.startsWith("image.");
    const isVacuumLiveMediaEnabled = vacuumContext.liveMedia !== false;
    const isVacuumLiveMediaActive = vacuumContext.liveMedia !== false && !vacuumContext.editable;
    if (isVacuumLiveMediaActive && document.visibilityState === "hidden") {
      vacuumImageElement.dataset.vacuumMapSuspended = "true";
    }
    // 地图地址随场景变化：image.* 实体走 vacuumMapImageSource 生成带 token 的地址，
    // 其余实体在编辑器里用一次性快照、运行时用 MJPEG 长连。
    const resolveVacuumMapSource = () =>
      isImageEntityId
        ? vacuumMapImageSource(
            vacuumBindingEntityId,
            vacuumContext.states?.get(vacuumBindingEntityId)
          )
        : vacuumContext.editable
          ? "/api/camera_proxy/" + vacuumEncodedEntityId + "?hb=" + Date.now()
          : "/api/camera_proxy_stream/" + vacuumEncodedEntityId;
    let vacuumRetryTimeoutId = 0;
    let vacuumRetryCount = 0;
    const MAX_VACUUM_RETRY_COUNT = 4;
    // 清重试定时器；守卫 if 是为了避免对 0 调用 clearTimeout（并无副作用，只是少一次无谓调用）。
    const clearVacuumRetryTimer = () => {
      if (vacuumRetryTimeoutId) {
        window.clearTimeout(vacuumRetryTimeoutId);
        vacuumRetryTimeoutId = 0;
      }
    };
    // 把当前该用的地址写给 img；后台挂起状态下刻意不赋 src，
    // 否则浏览器仍会去取图，白占带宽。
    const applyVacuumMapSource = () => {
      const vacuumMapSource = resolveVacuumMapSource();
      if (isImageEntityId) {
        vacuumImageElement.dataset.vacuumMapSource = vacuumMapSource;
      }
      if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
        vacuumImageElement.removeAttribute("src");
        return;
      }
      vacuumImageElement.src = vacuumMapSource;
    };
    // 加载成功：清零重试计数，让下一次失败可以重新获得完整次数的指数退避额度。
    const handleVacuumImageLoad = () => {
      vacuumRetryCount = 0;
      clearVacuumRetryTimer();
    };
    // 重试耗尽后把图替换成文案占位。只在编辑器里做：运行时替换会丢掉后续状态更新的挂载点。
    const showVacuumUnavailablePlaceholder = () => {
      if (!vacuumContext.editable || !vacuumImageElement.isConnected) {
        return;
      }
      const vacuumUnavailableElement = document.createElement("span");
      vacuumUnavailableElement.className = "hb-vacuum-map-placeholder";
      vacuumUnavailableElement.textContent = "实时地图暂时不可用";
      vacuumImageElement.replaceWith(vacuumUnavailableElement);
    };
    // 加载失败：指数退避重试，延迟 = 700ms × 2^(次数-1)，封顶 4 秒、最多试 4 次；
    // 非 image.* 实体的重试地址额外拼 hb 时间戳，因为 MJPEG 长连的失败很可能是缓存了坏响应。
    const handleVacuumImageError = () => {
      if (!isVacuumLiveMediaEnabled || vacuumImageElement.dataset.vacuumMapSuspended === "true") {
        return;
      }
      if (vacuumRetryCount >= MAX_VACUUM_RETRY_COUNT) {
        showVacuumUnavailablePlaceholder();
        return;
      }
      vacuumRetryCount += 1;
      clearVacuumRetryTimer();
      const vacuumRetryDelayMs = Math.min(4000, 2 ** (vacuumRetryCount - 1) * 700);
      vacuumRetryTimeoutId = window.setTimeout(() => {
        vacuumRetryTimeoutId = 0;
        if (
          vacuumImageElement.dataset.vacuumMapSuspended === "true" ||
          !vacuumImageElement.isConnected
        ) {
          return;
        }
        const vacuumRetrySource = resolveVacuumMapSource();
        const vacuumRetrySourceBusted = isImageEntityId
          ? vacuumRetrySource
          : "" +
            vacuumRetrySource +
            (vacuumRetrySource.includes("?") ? "&" : "?") +
            "hb=" +
            Date.now();
        if (isImageEntityId) {
          vacuumImageElement.dataset.vacuumMapSource = vacuumRetrySourceBusted;
        }
        vacuumImageElement.src = vacuumRetrySourceBusted;
      }, vacuumRetryDelayMs);
    };
    vacuumImageElement.addEventListener("load", handleVacuumImageLoad);
    if (isVacuumLiveMediaEnabled) {
      vacuumImageElement.addEventListener("error", handleVacuumImageError);
    }
    if (vacuumContext.liveMedia !== false) {
      applyVacuumMapSource();
    }
    if (isVacuumLiveMediaActive) {
      // 页面显隐：隐藏时用 dataset 标记挂起并摘掉 src（长连才算真正断开），
      // 回前台清标记并重新取图，避免在后台持续吃流量。
      const handleVacuumVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
            return;
          }
          vacuumImageElement.dataset.vacuumMapSuspended = "true";
          vacuumImageElement.removeAttribute("src");
          return;
        }
        if (vacuumImageElement.dataset.vacuumMapSuspended === "true") {
          delete vacuumImageElement.dataset.vacuumMapSuspended;
          applyVacuumMapSource();
        }
      };
      document.addEventListener("visibilitychange", handleVacuumVisibilityChange);
      vacuumContext.cleanup(() =>
        document.removeEventListener("visibilitychange", handleVacuumVisibilityChange)
      );
    }
    if (!isVacuumLiveMediaEnabled) {
      vacuumImageElement.addEventListener("error", showVacuumUnavailablePlaceholder, {
        once: true
      });
    }
    vacuumElement.append(vacuumImageElement);
    vacuumContext.cleanup(() => {
      clearVacuumRetryTimer();
      vacuumImageElement.removeEventListener?.("load", handleVacuumImageLoad);
      if (isVacuumLiveMediaEnabled) {
        vacuumImageElement.removeEventListener?.("error", handleVacuumImageError);
      }
      vacuumImageElement.removeAttribute("src");
    });
    return vacuumElement;
  }
});
