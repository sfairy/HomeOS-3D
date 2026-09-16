/**
 * 电视屏幕的画面渲染。
 *
 * 在 3D 子系统里的位置：把 HA 播放器上报的「封面 + 状态」画到一张 2D 画布上，
 * 再作为 CanvasTexture 贴到电视模型的屏幕面上，替代模型自带的发光贴图。
 *
 * 对外提供：createTelevisionScreens。
 *
 * 与渲染器的约定：没有封面时用 3d-studio/studio-television-poster.js 生成程序化海报，
 * 保证离线 / 未播放时屏幕也不是纯黑。
 */

import { televisionState } from "./television-state.js?v=20260916230552";
// 程序化海报绘制；缓存戳需与 static 资源版本保持一致。
const { drawTelevisionPoster: drawTelevisionPoster } = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../static/3d-studio/studio-television-poster.js?v=20260916230552",
        import.meta.url
      )
    )
  : import("/static/3d-studio/studio-television-poster.js?v=20260916230552"));
/**
 * 创建电视屏幕控制器。
 *
 * @param {object} options 参数。
 * @param {object} options.THREE three.js 命名空间。
 * @param {(floorIds?: Array<string>) => void} [options.requestFrame] 请求重绘；
 *        传入楼层列表是因为屏幕内容属于分楼层渲染的缓存键。
 * @returns {{sync: Function, dispose: Function}} 控制器。
 */
export function createTelevisionScreens({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  let syncedRoot;
  let syncedRevision;
  let screensByLocation = new Map();
  let modelsByLocation = new Map();
  let isDisposed = false;
  /** 绑定 / 屏幕用「楼层 + 模型 ID」定位。 */
  const locationKey = bindingConfig =>
    JSON.stringify([bindingConfig.floorId, bindingConfig.modelId]);
  /**
   * 释放一块屏幕：还原原材质与原生发光网格，销毁贴图与材质。
   *
   * @param {object} targetEntry 屏幕记录。
   * @returns {void}
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
   *
   * @param {object} entry 屏幕记录。
   * @returns {void}
   */
  function renderScreen(entry) {
    if (isDisposed) {
      return;
    }
    const { canvas: canvas, context: context, state: state, image: image } = entry;
    // 先铺一层近黑底色：封面按等比缩放居中，空出来的部分就是「黑边」。
    context.fillStyle = "#050609";
    if (!state.on) {
      // 关机状态：画一层从左上到右下的深灰渐变，模拟熄屏玻璃的反光，
      // 比纯黑更有体积感，也能看出屏幕边界。
      const offGradient = context.createLinearGradient(0, 0, canvas.width * 0.35, canvas.height);
      offGradient.addColorStop(0, "#2a2c2f");
      offGradient.addColorStop(0.45, "#222427");
      offGradient.addColorStop(1, "#181a1d");
      context.fillStyle = offGradient;
    }
    context.fillRect(0, 0, canvas.width, canvas.height);
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
     *
     * @param {object} params 参数。
     * @param {object} params.root 场景根节点。
     * @param {number} params.revision 场景修订号。
     * @param {Array<object>} params.bindings 电视绑定列表。
     * @param {object} params.states 实体 ID → HA 状态。
     * @param {string} [params.focusedModel=""] 当前聚焦的电视位置键（其它电视会变暗）。
     * @param {number} [params.dimStrength=70] 变暗强度（百分比，0 为不变暗）。
     * @returns {void}
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
              JSON.stringify([
                sceneObject.userData.environmentFloorId,
                sceneObject.userData.environmentModelId
              ]),
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
        const location = locationKey(binding);
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
