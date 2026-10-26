/** 情景模式按钮渲染器（从 register-all 拆出）。 */
import { bindSceneMode } from "../../scene-mode";
import { navigationComponentRenderer } from "../navigation-button";

export function register(registerComponent: (type: any, def: any) => void) {
  registerComponent("scene-mode", {
      render(sceneModeComponent: any, sceneModeRenderEnvironment: any) {
        const sceneModeElement = document.createElement("button");
        ((sceneModeElement.type = "button"),
          (sceneModeElement.className = "hb-scene-mode"),
          sceneModeElement.setAttribute(
            "aria-label",
            sceneModeComponent.properties?.mainText || "情景模式",
          ));
        const navigationButtonViewElement = navigationComponentRenderer(
          {
            ...sceneModeComponent,
            actions: {} as Record<string, any>,
            bindings: {} as Record<string, any>,
            properties: {
              ...sceneModeComponent.properties,
              targetPage: "",
              frameVisible: false,
              glowVisible: false,
            },
          },
          {
            ...sceneModeRenderEnvironment,
            editable: true,
            previewState: "off",
          },
        );
        return (
          sceneModeElement.append(navigationButtonViewElement),
          bindSceneMode(
            sceneModeElement,
            navigationButtonViewElement,
            sceneModeComponent,
            sceneModeRenderEnvironment,
          ),
          sceneModeElement
        );
      },
    });
}

export default register;
