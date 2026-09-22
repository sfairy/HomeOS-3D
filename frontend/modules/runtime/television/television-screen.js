/**
 * 电视屏幕的画面渲染。
 *
 * 把 HA 播放器上报的「封面 + 状态」画到一张 2D 画布，再作为 CanvasTexture 贴到电视模型的
 * 屏幕面，替代模型自带的发光贴图。对外提供 createTelevisionScreens。没有封面时用
 * 3d-studio/materials/studio-television-poster.js 生成程序化海报，保证离线 / 未播放时屏幕不纯黑。
 */

import { televisionState } from "./television-state.js?v=2609222006";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js：这里原先建键用裸值、
// 查表也用裸值，一旦某一侧缺字段就成 `null` 而另一侧是 `""`，屏幕永远挂不上。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609222006";
// 程序化海报绘制；缓存戳需与 static 资源版本保持一致。
const { drawTelevisionPoster: drawTelevisionPoster } = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../../static/3d-studio/materials/studio-television-poster.js?v=2609222006",
        import.meta.url
      )
    )
  : import("/static/3d-studio/materials/studio-television-poster.js?v=2609222006"));
// 熄屏玻璃渐变；冷暖两档色标都在该模块里，暖阳原木主题下传 warm=true。
const { drawTelevisionGlass: drawTelevisionGlass } = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../../static/3d-studio/materials/studio-television-glass.js?v=2609222006",
        import.meta.url
      )
    )
  : import("/static/3d-studio/materials/studio-television-glass.js?v=2609222006"));
/**
 * 创建电视屏幕控制器。
 */
export function createTelevisionScreens({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  let syncedRoot;
  let syncedRevision;
  let screensByLocation = new Map();
  let modelsByLocation = new Map();
  let isDisposed = false;
  /**
   * 释放一块屏幕：还原原材质与原生发光网格，销毁贴图与材质。
   */
  function releaseScreen(targetEntry) {
    // removed 标记保证幂等：几何体 dispose 事件与主动释放可能先后到达。
    if (!targetEntry.removed) {
      targetEntry.removed = true;
      // 摘掉几何体的 dispose 监听，避免释放后再被回调一次。
      targetEntry.screen.geometry.removeEventListener("dispose", targetEntry.onGeometryDispose);
      // 自增 generation：让在途的封面加载回调失效。
      targetEntry.generation++;
      // 只有材质仍是我们替换上去的那份时才还原，防止覆盖别人的改动。
      if (targetEntry.screen.material === targetEntry.materials) {
        targetEntry.screen.material = targetEntry.original;
      }
      for (const [glow, wasVisible] of targetEntry.glows) {
        glow.visible = wasVisible;
      }
      targetEntry.texture.dispose();
      targetEntry.material.dispose();
    }
  }
  /**
   * 把当前状态画到画布上并标记贴图需要更新。
   */
  function renderScreen(entry) {
    if (isDisposed) {
      return;
    }
    const { canvas: canvas, context: context, state: state, image: image } = entry;
    // 先铺一层近黑底色：封面按等比缩放居中，空出来的部分就是「黑边」。
    context.fillStyle = "#050609";
    if (state.on) {
      context.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      // 关机状态画一层深灰渐变（暖阳原木主题换暖色档），比纯黑更有体积感，也能看出屏幕边界。
      drawTelevisionGlass(canvas, context, entry.screen.userData?.sceneStyle === "warm-wood");
    }
    if (state.on && image) {
      // 等比缩放（contain）而不是拉伸：封面比例各异，拉伸会明显变形。
      const fitScale = Math.min(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight
      );
      const drawWidth = image.naturalWidth * fitScale;
      const drawHeight = image.naturalHeight * fitScale;
      context.drawImage(
        image,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
    } else if (state.on) {
      // 开机但没有封面：用程序化海报占位。
      drawTelevisionPoster(canvas, context);
    }
    entry.texture.needsUpdate = true;
    // 屏幕内容变化会影响该楼层的缓存，因此带上楼层 ID 请求重绘。
    requestFrame([entry.floorId]);
  }
  return {
    /**
     * 按最新绑定与状态同步所有电视屏幕。
     */
    sync({
      root: root,
      revision: revision,
      bindings: bindings = [],
      states: states = {},
      focusedModel: focusedModel = "",
      dimStrength: dimStrength = 70
    }) {
      if (isDisposed) {
        return;
      }
      // 场景重建（根节点或修订号变化）时才重新扫一遍电视模型。
      if (syncedRoot !== root || syncedRevision !== revision) {
        syncedRoot = root;
        syncedRevision = revision;
        modelsByLocation = new Map();
        syncedRoot?.traverse(sceneObject => {
          if (sceneObject.userData?.environmentModelType === "tv") {
            modelsByLocation.set(
              sceneModelKey(
                sceneObject.userData.environmentFloorId,
                sceneObject.userData.environmentModelId
              ),
              sceneObject
            );
          }
        });
      }
      const activeLocations = new Set();
      for (const binding of bindings) {
        // 隐藏的、或既没绑播放器也没绑电源的电视直接跳过。
        if (binding.visible === false || (!binding.entityId && !binding.powerEntityId)) {
          continue;
        }
        const location = sceneModelKey(binding.floorId, binding.modelId);
        const model = modelsByLocation.get(location);
        activeLocations.add(location);
        if (!model) {
          continue;
        }
        let screenMesh;
        model.traverse(candidate => {
          if (candidate.userData?.televisionScreen) {
            screenMesh = candidate;
          }
        });
        if (!screenMesh) {
          continue;
        }
        activeLocations.add(location);
        let screenEntry = screensByLocation.get(location);
        if (screenEntry && screenEntry.screen !== screenMesh) {
          // 屏幕网格被重建过：释放旧记录，重新建一份。
          releaseScreen(screenEntry);
          screensByLocation.delete(location);
          screenEntry = null;
        }
        if (!screenEntry) {
          // 512×288 正好是 16:9，够看清封面文字又不会太占显存。
          const canvasElement = document.createElement("canvas");
          canvasElement.width = 512;
          canvasElement.height = 288;
          const canvasContext = canvasElement.getContext("2d");
          if (!canvasContext) {
            continue;
          }
          const texture = new THREE.CanvasTexture(canvasElement);
          // 画布内容按 sRGB 解释；toneMapped 关闭，避免色彩被色调映射压暗。
          texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            toneMapped: false,
            // polygonOffset 往镜头方向偏移，防止屏幕与模型自带的屏幕面 z-fighting。
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          });
          const originalMaterial = screenMesh.material;
          // BoxGeometry 的材质顺序是 [+x, -x, +y, -y, +z, -z]，
          // 因此下标 4 是正前方（屏幕所在的那一面），只替换它，其余保持原材质。
          const materials = Array.from(
            {
              length: 6
            },
            (element, index) =>
              index === 4
                ? material
                : Array.isArray(originalMaterial)
                  ? originalMaterial[index]
                  : originalMaterial
          );
          // 模型自带的发光面（televisionGlow）会被真实画面替代，先隐藏并记住原状态。
          const glows = [];
          model.traverse(childObject => {
            if (childObject.userData?.televisionGlow) {
              glows.push([childObject, childObject.visible]);
              childObject.visible = false;
            }
          });
          screenEntry = {
            floorId: binding.floorId,
            screen: screenMesh,
            original: originalMaterial,
            materials: materials,
            material: material,
            canvas: canvasElement,
            context: canvasContext,
            texture: texture,
            glows: glows,
            generation: 0,
            artwork: "",
            signature: "",
            image: null
          };
          const createdEntry = screenEntry;
          // 几何体被场景重建销毁时，贴图也要跟着释放，否则会留下一张悬空纹理。
          screenEntry.onGeometryDispose = () => {
            releaseScreen(createdEntry);
            if (screensByLocation.get(location) === createdEntry) {
              screensByLocation.delete(location);
            }
          };
          screenMesh.geometry.addEventListener("dispose", screenEntry.onGeometryDispose);
          screenMesh.material = materials;
          screensByLocation.set(location, screenEntry);
        }
        const deviceState = televisionState(binding, states);
        // 签名只覆盖「画面上看得见的东西」，避免音量等无关状态变化触发重绘。
        const signature = JSON.stringify([
          deviceState.on,
          deviceState.status,
          deviceState.title,
          deviceState.app,
          deviceState.name,
          deviceState.artwork
        ]);
        screenEntry.state = deviceState;
        // 聚焦了其它电视时，本屏调暗（最低 0.1）；没聚焦任何电视时全部保持原亮度。
        const colorLevel =
          focusedModel && focusedModel !== location ? Math.max(0.1, 1 - dimStrength / 100) : 1;
        if (screenEntry.material.color.r !== colorLevel) {
          screenEntry.material.color.setRGB(colorLevel, colorLevel, colorLevel);
          requestFrame([screenEntry.floorId]);
        }
        if (screenEntry.signature !== signature) {
          screenEntry.signature = signature;
          if (screenEntry.artwork !== deviceState.artwork) {
            // 封面地址变了：先把旧图清掉，再用自增的 generation 标记这次加载。
            screenEntry.artwork = deviceState.artwork;
            screenEntry.image = null;
            const generation = ++screenEntry.generation;
            if (deviceState.artwork) {
              const loadedImage = new Image();
              loadedImage.onload = () => {
                // 三重校验：未销毁、仍是最新一次加载、记录还在表里。
                // 快速换曲时旧图的 onload 会晚于新图到达，必须挡掉。
                if (
                  !isDisposed &&
                  generation === screenEntry.generation &&
                  screensByLocation.get(location) === screenEntry
                ) {
                  screenEntry.image = loadedImage;
                  renderScreen(screenEntry);
                }
              };
              loadedImage.onerror = () => {
                // 加载失败同样要重绘：此时会退化成程序化海报。
                if (
                  !isDisposed &&
                  generation === screenEntry.generation &&
                  screensByLocation.get(location) === screenEntry
                ) {
                  screenEntry.image = null;
                  renderScreen(screenEntry);
                }
              };
              loadedImage.src = deviceState.artwork;
            }
          }
          renderScreen(screenEntry);
        }
      }
      for (const [staleLocation, staleEntry] of screensByLocation) {
        // 绑定被删除或电视被隐藏：释放屏幕并请求该楼层重绘（还原成模型原样）。
        if (!activeLocations.has(staleLocation)) {
          releaseScreen(staleEntry);
          screensByLocation.delete(staleLocation);
          requestFrame([staleEntry.floorId]);
        }
      }
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of screensByLocation.values()) {
        releaseScreen(disposedEntry);
      }
      screensByLocation.clear();
      modelsByLocation.clear();
      syncedRoot = null;
    }
  };
}
