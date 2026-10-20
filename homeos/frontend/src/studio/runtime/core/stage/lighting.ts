/**
 * 舞台灯光控件：灯按钮状态（亮度 / 色温 / 色彩）+ 灯具指令下发。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageLightingDeps`。
 */

import { hsToRgbColor as hsToRgbColor2, lightCommand as lightCommand2 } from "../../light/light-state";
import { lightPresetEntries } from "./_shared";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageLightingDeps {
  powerButton: any;
  getFocusedEntry: any;
  isEditing: any;
  isControlBusy: any;
  resolveLightState: any;
  vector: any;
  applyLightStates: any;
  enqueueControlCommand: any;
  controlErrorElement: any;
  syncMarkers: any;
  updateDevicePanel: any;
}

export function updateLampButtonCore(deps: StageLightingDeps, mountOptionsLightState: any) {
    const brightnessPercent = Math.max(
        1,
        Math.min(
          100,
          Number(mountOptionsLightState.brightness) ||
            (mountOptionsLightState.brightnessSupported ? 1 : 100),
        ),
      ),
      kelvinRatio =
        (Math.max(2000, Math.min(6500, Number(mountOptionsLightState.kelvin) || 3000)) - 2000) /
        4500,
      warmColorRgb = [255, 132, 42],
      coolColorRgb = [172, 225, 255],
      lampColorRgb =
        mountOptionsLightState.colorMode === "white"
          ? [255, 255, 255]
          : mountOptionsLightState.colorSupported &&
              !["color_temp", "onoff", "brightness", "unknown"].includes(
                mountOptionsLightState.colorMode,
              ) &&
              mountOptionsLightState.colorHs
            ? mountOptionsLightState.colorRgb || hsToRgbColor2(mountOptionsLightState.colorHs)
            : warmColorRgb.map((warmChannelBase, colorChannelIndex) =>
                Math.round(
                  warmChannelBase +
                    (coolColorRgb[colorChannelIndex] - warmChannelBase) * kelvinRatio,
                ),
              );
    (deps.powerButton.classList.toggle("is-on", mountOptionsLightState.on),
      deps.powerButton.setAttribute("aria-pressed", String(mountOptionsLightState.on)),
      deps.powerButton.setAttribute(
        "aria-label",
        "" +
          (deps.getFocusedEntry()?.label || mountOptionsLightState.name) +
          (mountOptionsLightState.available
            ? mountOptionsLightState.on
              ? "已开启，点击关闭"
              : "已关闭，点击开启"
            : "当前不可用"),
      ),
      deps.powerButton.style.setProperty("--i3d-lamp-color", "rgb(" + lampColorRgb.join(",") + ")"),
      deps.powerButton.style.setProperty(
        "--i3d-lamp-opacity",
        mountOptionsLightState.on && brightnessPercent > 0
          ? String(0.08 + (brightnessPercent / 100) * 0.92)
          : "0",
      ),
      deps.powerButton.style.setProperty(
        "--i3d-lamp-scale",
        String(0.62 + (brightnessPercent / 100) * 1.05),
      ));
  }

export async function sendLightCommandCore(deps: StageLightingDeps, serviceName: any, serviceValue: any, commandTargetItem = deps.getFocusedEntry()) {
    if (!(!commandTargetItem || deps.isEditing || deps.isControlBusy))
      try {
        const commandLightState = deps.resolveLightState(commandTargetItem);
        let commandPayload,
          commandValue = serviceValue;
        if (serviceName === "preset") {
          if (!lightPresetEntries.includes(serviceValue)) throw new Error("灯光预设无效。");
          const presetFieldPairs: any[] = [];
          if (
            ((commandValue = {}),
            commandLightState.brightnessSupported &&
              (presetFieldPairs.push(["brightness", serviceValue.brightness]),
              (commandValue.brightness = serviceValue.brightness)),
            commandLightState.temperatureSupported &&
              ((commandValue.kelvin = Math.round(
                commandLightState.minimum +
                  ((commandLightState.maximum - commandLightState.minimum) *
                    serviceValue.temperaturePercent) /
                    100,
              )),
              presetFieldPairs.push(["temperature", commandValue.kelvin])),
            !presetFieldPairs.length)
          )
            throw new Error("此设备不支持灯光预设。");
          const presetFieldCommands = presetFieldPairs.map(([presetFieldName, presetFieldValue]) =>
            lightCommand2(
              commandTargetItem.entityId,
              presetFieldName,
              presetFieldValue,
              commandLightState,
            ),
          );
          ((commandPayload = {
            ...presetFieldCommands[0],
            data: Object.assign(
              {},
              ...presetFieldCommands.map((presetFieldCommand) => presetFieldCommand.data),
            ),
          }),
            commandLightState.brightnessSupported &&
              serviceValue.brightness < 100 &&
              (delete commandPayload.data.brightness,
              (commandPayload.data.brightness_pct = serviceValue.brightness)));
        } else
          commandPayload = lightCommand2(
            commandTargetItem.entityId,
            serviceName,
            serviceValue,
            commandLightState,
          );
        const previewTokenFromSet = deps.vector.set(
          commandTargetItem.entityId,
          serviceName,
          commandValue,
          true,
        );
        (deps.applyLightStates({
          preview: serviceName !== "power",
        }),
          deps.enqueueControlCommand(commandPayload, previewTokenFromSet),
          (deps.controlErrorElement.textContent = ""),
          deps.syncMarkers());
      } catch (lightCommandError: any) {
        ((deps.controlErrorElement.textContent = lightCommandError.message), deps.updateDevicePanel());
      }
  }
