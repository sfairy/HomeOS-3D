/**
 * 人体存在（presence）在 3D 舞台里的角色呈现与地面检测波纹，是 presence 的渲染侧。
 * 把行走路线（楼层平面坐标）经 worldPoint 换算成世界坐标，为每个绑定造虚拟人物沿闭合路径
 * 匀速走动并按触发状态淡入/淡出；另给「检测到人」的传感器模型在地面画扩散波纹。
 *
 * 约定：routePoint 是楼层平面坐标，一律经 sceneOptions.worldPoint(floorId, x, y, height) 换算
 * （像素当量与原点由该函数处理，height 单位为米）；世界空间 Y 轴向上，人物正面朝 +Z。
 * sync(...) 只在外部签名变化时调用、内部再做细粒度 diff；tick 返回 true 表示还需继续出帧。
 */
// 状态条目归一与「按 ID 切域」经 static-helpers 桥取用（运行侧不能写裸 /static/... 的静态 import）。
import { resolveStateEntry } from "../core/static-helpers.js?v=2609222006";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609222006";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609222006";
import { createWalker, animateWalker, disposeWalker } from "./presence-character.js?v=2609222006";
import {
  validPresenceRoute,
  createPresenceTriggers,
  closedPath,
  sampleClosedPath,
  presenceVisibleOnPage
} from "./presence-motion.js?v=2609222006";
/**
 * 创建人体存在角色场景。
 * @param {Function} [wakeFrameLoop=() => {}] 唤醒空闲帧循环；角色在动时必须调用，
 *     否则舞台为省电停掉帧循环后动画会僵住。
 */
export function createPresenceScene(sceneOptions, wakeFrameLoop = () => {}, nowProvider) {
  const actorsByBindingId = new Map();
  // 记住「角色走到了哪」：切楼层、改可见性会把角色删掉重建，没有这份缓存就会回到起点。
  const progressByBindingId = new Map();
  // 模块级累计时间，驱动步态之外的动作（呼吸、张望、灯灵明暗）。
  let elapsedSeconds = 0;
  // 触发计时复用 presence-motion 的实现：什么时候出现、显示多久与舞台无关。
  const triggers = createPresenceTriggers(nowProvider);
  // 需要重建反射的楼层先攒起来，等一轮结束统一提交，避免一帧内多次重建同一楼层。
  const dirtyFloorIds = new Set();
  // 接触阴影的几何体与贴图只在第一次用到时创建，之后所有角色共用（见 createFootShadow）。
  let footShadowAssets = null;
  /**
   * 造一片「脚底接触阴影」。
   * 不是真实软阴影，而是程序生成的径向渐变贴图铺在脚下：人物小又有自发光，开真实
   * 阴影收益远低于代价；贴图与几何体只在首次调用时创建，Mesh 每次新建（材质各自调不透明度）。
   */
  function createFootShadow() {
    if (!footShadowAssets) {
      // 64×64 够用：贴图只画一个渐变圆，放大后的模糊感反而更像软阴影。
      const shadowPixels = new Uint8Array(16384);
      for (let pixelY = 0; pixelY < 64; pixelY++) {
        for (let pixelX = 0; pixelX < 64; pixelX++) {
          // +0.5 取像素中心：直接用整数下标会让渐变整体偏移半像素，出现硬边。
          const radialDistance = Math.hypot(
            ((pixelX + 0.5) / 64) * 2 - 1,
            ((pixelY + 0.5) / 64) * 2 - 1
          );
          // 只写 alpha 通道：颜色由材质决定。(1-d²)² 比线性衰减更接近真实接触阴影，
          // 中心密实、边缘迅速消散。
          shadowPixels[(pixelY * 64 + pixelX) * 4 + 3] = Math.round(
            Math.max(0, 1 - radialDistance * radialDistance) ** 2 * 255
          );
        }
      }
      const shadowTexture = new sceneOptions.THREE.DataTexture(shadowPixels, 64, 64);
      // LinearFilter：贴图会被放大到米级，用最近邻会看到马赛克方块。
      shadowTexture.magFilter = shadowTexture.minFilter = sceneOptions.THREE.LinearFilter;
      shadowTexture.needsUpdate = true;
      footShadowAssets = {
        texture: shadowTexture,
        // 1.05 × 0.8 米：略大于人物的双脚跨度，边缘刚好拖在身后一点。
        geometry: new sceneOptions.THREE.PlaneGeometry(1.05, 0.8)
      };
    }
    const shadowMaterial = new sceneOptions.THREE.MeshBasicMaterial({
      map: footShadowAssets.texture,
      transparent: true,
      // 0.62 是基准浓度；applyActorOpacity 会在此基础上再乘角色不透明度。
      opacity: 0.62,
      // 不写深度：阴影贴在会反光的地板上，写深度会在人物与地板间产生切割。
      depthWrite: false,
      // 与地板共面必然 z-fighting，向观察者方向偏移一点点把它抬起来。
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      // 关掉色调映射，否则曝光变化会让阴影浓淡跟着变，看起来像浮在地面上。
      toneMapped: false
    });
    const shadowMesh = new sceneOptions.THREE.Mesh(footShadowAssets.geometry, shadowMaterial);
    shadowMesh.name = "presence-foot-shadow";
    // 平面默认在 XY 平面，绕 X 轴转 -90° 才能平躺到 XZ 地面上。
    shadowMesh.rotation.x = -Math.PI / 2;
    // 晚于地板与路线预览绘制，确保不会被地板盖住。
    shadowMesh.renderOrder = 2;
    // 标记为环境效果：environment-scene 与索引逻辑会跳过这类节点，不参与材质改造。
    shadowMesh.userData.environmentEffect = true;
    // 不参与拾取：否则点到脚下的阴影却选中不了人物，或反而挡住人物的射线。
    shadowMesh.raycast = () => {};
    return shadowMesh;
  }
  /**
   * 把本轮攒下的脏楼层一次性提交给舞台重建反射。
   */
  function flushReflectionFloors() {
    if (dirtyFloorIds.size) {
      sceneOptions.invalidateReflections?.([...dirtyFloorIds]);
      dirtyFloorIds.clear();
      sceneOptions.requestRender?.();
    }
  }
  /**
   * 设置角色的整体不透明度（淡入淡出）。
   * 不能只改 opacity：半透明材质必须同时开 transparent 并关 depthWrite，否则角色
   * 前后部件互相遮挡、出现「外壳盖住内里」的穿帮；transparent 是渲染状态开关，改动后必须置 needsUpdate 重编译着色器。
   */
  function applyActorOpacity(actor, targetOpacity) {
    actor.opacity = targetOpacity;
    for (const [material, originalMaterialState] of actor.materials) {
      material.opacity = originalMaterialState.opacity * targetOpacity;
      // 半透明时关深度写入；恢复不透明时还原材质原本的取值（不要一律写成 true）。
      material.depthWrite = targetOpacity < 1 ? false : originalMaterialState.depthWrite;
      const shouldBeTransparent = originalMaterialState.transparent || targetOpacity < 1;
      if (material.transparent !== shouldBeTransparent) {
        material.transparent = shouldBeTransparent;
        material.needsUpdate = true;
      }
    }
    actor.shadow.material.opacity = targetOpacity * 0.62;
    // 角色外观变了，脚下地板反射也要重算。
    dirtyFloorIds.add(actor.floorId);
  }
  /**
   * 量角色的世界包围盒。
   */
  function measureActorBounds(measuredActor) {
    const bounds = new sceneOptions.THREE.Box3();
    // 先刷新世界矩阵：角色位置是每帧改的，不刷新会拿到上一帧的包围盒。
    measuredActor.root.updateWorldMatrix(true, true);
    // 逐个遍历子节点展开，而不是 expandByObject(root)：阴影是 root 的子节点，
    // 它比人物扁得多但铺得更开，会让人物的点击热区被显著放大。
    for (const childObject of measuredActor.root.children) {
      if (childObject !== measuredActor.shadow) {
        bounds.expandByObject(childObject);
      }
    }
    return bounds;
  }
  // 复用的临时向量：贴地计算每帧都要跑一遍，避免每帧新建 Vector3 产生垃圾。
  const scratchFootPosition = new sceneOptions.THREE.Vector3();
  /**
   * 删除一个角色并摘下它的全部资源，同时记住它走到哪了。
   */
  const removeActor = removalBindingId => {
    const removedActor = actorsByBindingId.get(removalBindingId);
    // 先存进度：重建时若路线没变，可以接着上次的位置继续走。
    progressByBindingId.set(removalBindingId, {
      key: removedActor.progressKey,
      distance: removedActor.distance
    });
    dirtyFloorIds.add(removedActor.floorId);
    // 阴影材质是每个角色独有的，要单独 dispose；几何体与贴图是共享的，不能在这里释放。
    removedActor.shadow.removeFromParent();
    removedActor.shadow.material.dispose();
    disposeWalker(removedActor.root);
    if (removedActor.routeLine) {
      removedActor.routeLine.geometry.dispose();
      removedActor.routeLine.material.dispose();
      removedActor.routeLine.removeFromParent();
    }
    actorsByBindingId.delete(removalBindingId);
  };
  /**
   * 把角色摆到路径上的当前位置，并完成贴地。
   */
  function placeActor(placedActor) {
    const pathSample = sampleClosedPath(placedActor.path, placedActor.distance);
    if (!pathSample) {
      return;
    }
    placedActor.root.position.set(pathSample.x, pathSample.y, pathSample.z);
    // 朝向约定：模型正面朝 +Z，因此 heading 可以直接写进 rotation.y。
    placedActor.root.rotation.y = pathSample.heading;
    animateWalker(
      placedActor.root,
      // 步态相位 = 已走距离 / 角色缩放 × 12：同距离下角色越大步频越慢（步幅更大），
      // 12 是与 speed 一起调出来的手感系数，不要理解成「每圈多少步」。
      (placedActor.distance / placedActor.size) * 12,
      // 编辑态的静态预览要求「站着不动」，用 walkAmount = 0 冻结步态。
      placedActor.preview ? 0 : 1,
      elapsedSeconds
    );
    placedActor.root.updateMatrixWorld(true);
    // 贴地：取双脚世界坐标的最低点，减去「缩放过」的鞋底高度，得到当前模型的离地偏差。
    const groundOffsetY = Math.min(
      ...placedActor.root.userData.parts.legs.map(legRig => {
        legRig.foot.getWorldPosition(scratchFootPosition);
        return scratchFootPosition.y - placedActor.root.userData.soleHeight * placedActor.size;
      })
    );
    // 再加 1.4% 身高（0.014 × size）的微小悬浮，避免脚掌正好埋进地板与阴影平面里。
    placedActor.root.position.y += pathSample.y + placedActor.size * 0.014 - groundOffsetY;
    // 阴影是 root 的子节点，位置会随 root 的 scale 一起放大，因此要除以 size 抵消，
    // 使其始终贴在楼层地面（世界坐标 y ≈ pathSample.y + 0.008）上方一点。
    placedActor.shadow.position.y =
      (pathSample.y + 0.008 - placedActor.root.position.y) / placedActor.size;
  }
  /**
   * 计算每个可点击角色在屏幕上的包围矩形。
   * 把世界包围盒的 8 个角投影到屏幕再取外接矩形 —— 比逐点采样便宜，也够用
   * （角色是近立方体，倾斜投影下的误差可忽略）。
   */
  function computeHitRects(renderCamera, hitCanvasElement, sensorBindings) {
    const hitCanvasRect = hitCanvasElement.getBoundingClientRect();
    const hitRects = [];
    for (const [hitBindingId, hitActor] of actorsByBindingId) {
      const hitBinding = sensorBindings.find(hitProbe => hitProbe.id === hitBindingId);
      // 只有「点击聚焦」的角色才有热区；正在淡出或已透明的角色不该被点到。
      if (!hitBinding?.clickToFocus || hitActor.exiting || hitActor.opacity <= 0) {
        continue;
      }
      const actorBounds = measureActorBounds(hitActor);
      const projectedCorners = [];
      for (const boundX of [actorBounds.min.x, actorBounds.max.x]) {
        for (const boundY of [actorBounds.min.y, actorBounds.max.y]) {
          for (const boundZ of [actorBounds.min.z, actorBounds.max.z]) {
            projectedCorners.push(
              new sceneOptions.THREE.Vector3(boundX, boundY, boundZ).project(renderCamera)
            );
          }
        }
      }
      // NDC 的 z 超出 ±1 表示整块都在裁剪体之外（相机背后或视锥外）；只要有一个角
      // 落在视锥内就仍可能可见，所以这里用 every 而不是 some。
      if (projectedCorners.every(cornerPoint => cornerPoint.z < -1 || cornerPoint.z > 1)) {
        continue;
      }
      // NDC → 屏幕像素：x 线性映射，y 要翻转（NDC 向上为正，屏幕向下为正）。
      const screenXList = projectedCorners.map(
        cornerForX => hitCanvasRect.left + ((cornerForX.x + 1) * hitCanvasRect.width) / 2
      );
      const screenYList = projectedCorners.map(
        cornerForY => hitCanvasRect.top + ((1 - cornerForY.y) * hitCanvasRect.height) / 2
      );
      const leftPx = Math.min(...screenXList);
      const topPx = Math.min(...screenYList);
      const widthPx = Math.max(...screenXList) - leftPx;
      const heightPx = Math.max(...screenYList) - topPx;
      // 触控扩展范围由绑定决定，默认 8px：手指点不准小人物是常态。
      const paddingPx = hitBinding.hitPadding ?? 8;
      hitRects.push({
        id: hitBindingId,
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: heightPx,
        padding: paddingPx
      });
    }
    return hitRects;
  }
  return {
    /**
     * 按最新配置与状态对齐角色集合（外部签名变化时才会被调用）。
     */
    sync(
      bindings = [],
      states = {},
      enabled = false,
      floorId = "all",
      isEditing = false,
      isPreviewWalk = false,
      activeModule = "light"
    ) {
      triggers.sync(bindings, states);
      const liveBindingIds = new Set();
      let didChange = false;
      // 没有叠加层或楼层坐标换算能力时无法工作（例如只读的缩略预览），直接跳过。
      if (sceneOptions.overlayScene && sceneOptions.worldPoint) {
        for (const binding of bindings) {
          // 逐条过滤「不该出现」的绑定。判定顺序有讲究：先排除配置层面的不可能
          // （未闭合、没绑实体、路线非法、总开关关闭、不在本楼层），最后才查运行态
          // 的触发与页面可见性 —— 前者是配置问题，后者每次状态变化都会重算。
          if (
            binding.routeClosed === false ||
            (!isEditing && !binding.entityId) ||
            !validPresenceRoute(binding.route) ||
            !enabled ||
            (floorId !== "all" && binding.floorId !== floorId) ||
            (!isEditing &&
              (!triggers.visible(binding.id) || !presenceVisibleOnPage(binding, activeModule)))
          ) {
            continue;
          }
          // 平面坐标 → 世界坐标；高度固定 0（脚底平面），真实离地高度由 placeActor 补偿。
          const worldPoints = binding.route.map(routePoint =>
            sceneOptions.worldPoint(binding.floorId, routePoint.x, routePoint.y, 0)
          );
          // 换算失败（楼层不存在等）会返回 null 或非有限值，此时宁可不出人也不要用坏点建路径。
          if (
            worldPoints.some(
              pointProbe =>
                !pointProbe || ![pointProbe.x, pointProbe.y, pointProbe.z].every(Number.isFinite)
            )
          ) {
            continue;
          }
          // 签名变化就整体重建角色：路线、外观、预览模式任一改动都走同一条路，
          // 比逐个字段打补丁可靠；代价是重建时有几帧开销，对这么小的模型可接受。
          const actorSignature = JSON.stringify([binding, worldPoints, isEditing, isPreviewWalk]);
          let actorRecord = actorsByBindingId.get(binding.id);
          if (actorRecord && actorRecord.signature !== actorSignature) {
            removeActor(binding.id);
            actorRecord = null;
          }
          if (!actorRecord) {
            const walkerRoot = createWalker(
              sceneOptions.THREE,
              // 15376452 = 0xEAA044 橙、5421233 = 0x52B8B1 青，与编辑器里的路线颜色同值。
              binding.color === "orange" ? 15376452 : 5421233,
              binding.character
            );
            const actorMaterialSet = new Set();
            walkerRoot.traverse(meshObject => {
              if (meshObject.isMesh) {
                actorMaterialSet.add(meshObject.material);
              }
            });
            for (const actorMaterial of actorMaterialSet) {
              // 给没有自发光的材质补一层自身颜色自发光（强度 0.55）：夜间 / 环境调暗
              // 页面下人物不能黑成剪影，否则看不出有人在家。
              if (!actorMaterial.emissive?.getHex()) {
                actorMaterial.emissive.copy(actorMaterial.color);
                actorMaterial.emissiveIntensity = 0.55;
              }
            }
            // size 是「身高倍率」，1 即模型原尺寸（约 1.35 米）；缩放同时影响贴地补偿。
            const walkerSize = binding.size ?? 1;
            walkerRoot.scale.setScalar(walkerSize);
            // 这两个 userData 是舞台侧识别叠加层的约定（拾取、按楼层显隐都靠它）。
            walkerRoot.userData.presenceId = binding.id;
            walkerRoot.userData.environmentFloorId = binding.floorId;
            sceneOptions.overlayScene.add(walkerRoot);
            // 进度只在「实体 / 楼层 / 路线 / 编辑态」都没变时才算数：换了路线还沿用旧距离
            // 会让人物突然出现在新路径的某个莫名其妙的位置。
            const progressSignature = JSON.stringify([
              binding.entityId,
              binding.floorId,
              binding.route,
              isEditing
            ]);
            const savedProgress = progressByBindingId.get(binding.id);
            actorRecord = {
              root: walkerRoot,
              size: walkerSize,
              floorId: binding.floorId,
              shadow: createFootShadow(),
              // 记下材质的原始渲染状态：淡入淡出结束后要按原样还回去（见 applyActorOpacity）。
              materials: new Map(
                [...actorMaterialSet].map(materialItem => [
                  materialItem,
                  {
                    opacity: materialItem.opacity,
                    transparent: materialItem.transparent,
                    depthWrite: materialItem.depthWrite
                  }
                ])
              ),
              opacity: 1,
              exiting: false,
              path: closedPath(worldPoints),
              distance: savedProgress?.key === progressSignature ? savedProgress.distance : 0,
              progressKey: progressSignature,
              // 默认 0.45 米/秒：接近真人散步速度，太快会显得在跑。
              speed: binding.speed ?? 0.45,
              signature: actorSignature,
              // simulated = 编辑态：此时角色由编辑器直接摆布，不受触发状态影响。
              simulated: isEditing,
              // preview = 编辑态且没开「预览行走」：站着不动，方便调大小与位置。
              preview: isEditing && !isPreviewWalk
            };
            walkerRoot.add(actorRecord.shadow);
            // 编辑态直接给全不透明（不走淡入），非编辑态从 0 开始淡入，避免凭空出现。
            applyActorOpacity(actorRecord, isEditing ? 1 : 0);
            if (isEditing) {
              // 编辑态才画路线预览线：抬高 0.025 米避免与地板共面闪烁。
              const routeLinePoints = [...worldPoints, worldPoints[0]].map(
                linePoint =>
                  new sceneOptions.THREE.Vector3(linePoint.x, linePoint.y + 0.025, linePoint.z)
              );
              actorRecord.routeLine = new sceneOptions.THREE.Line(
                new sceneOptions.THREE.BufferGeometry().setFromPoints(routeLinePoints),
                new sceneOptions.THREE.LineBasicMaterial({
                  color: binding.color === "orange" ? 15376452 : 5421233,
                  depthTest: true
                })
              );
              actorRecord.routeLine.name = "presence-route-preview";
              actorRecord.routeLine.userData.environmentFloorId = binding.floorId;
              actorRecord.routeLine.userData.environmentEffect = true;
              sceneOptions.overlayScene.add(actorRecord.routeLine);
            }
            actorsByBindingId.set(binding.id, actorRecord);
            placeActor(actorRecord);
            didChange = true;
          }
          // 这条绑定又该显示了：取消正在进行的淡出。
          if (actorRecord.exiting) {
            actorRecord.exiting = false;
            didChange = true;
          }
          liveBindingIds.add(binding.id);
        }
      }
      for (const [staleBindingId, staleActor] of actorsByBindingId) {
        if (!liveBindingIds.has(staleBindingId)) {
          const bindingMatch = bindings.find(bindingProbe => bindingProbe.id === staleBindingId);
          // 「切走了页面」而不是「人不在了」时先淡出再删，避免下一页出现时闪一下；
          // 其余情况（人走了、配置删了、总开关关了）必须立即移除，不能留残影。
          if (
            !isEditing &&
            enabled &&
            bindingMatch &&
            triggers.visible(staleBindingId) &&
            (floorId === "all" || staleActor.floorId === floorId) &&
            !presenceVisibleOnPage(bindingMatch, activeModule)
          ) {
            if (!staleActor.exiting) {
              staleActor.exiting = true;
              didChange = true;
            }
          } else {
            removeActor(staleBindingId);
            didChange = true;
          }
        }
      }
      // 进度缓存也要跟着绑定一起过期，否则删了又加的绑定会继承一份无意义的距离。
      for (const progressBindingId of progressByBindingId.keys()) {
        if (
          !bindings.some(bindingEntry => bindingEntry.id === progressBindingId) ||
          (!isEditing && !triggers.visible(progressBindingId))
        ) {
          progressByBindingId.delete(progressBindingId);
        }
      }
      flushReflectionFloors();
      if (didChange) {
        sceneOptions.requestRender?.();
        // 必须唤醒帧循环：舞台空闲时会停掉渲染，淡入淡出就永远不会推进。
        wakeFrameLoop();
      }
    },
    /**
     * 推进动画（每帧调用）。
     */
    tick(deltaSeconds) {
      // 夹到 0.1 秒：切后台回来时 delta 可能是几十秒，不夹会让角色瞬间跨过整条路径。
      const stepSeconds = Math.max(0, Math.min(0.1, Number(deltaSeconds) || 0));
      elapsedSeconds += stepSeconds;
      let needsRender = false;
      // 触发结束的绑定在这里退场；simulated（编辑态）的不参与触发判定，不会被删。
      for (const trackedBindingId of actorsByBindingId.keys()) {
        if (
          !actorsByBindingId.get(trackedBindingId).simulated &&
          !triggers.visible(trackedBindingId)
        ) {
          removeActor(trackedBindingId);
          progressByBindingId.delete(trackedBindingId);
          needsRender = true;
        }
      }
      for (const [actorBindingId, tickedActor] of actorsByBindingId) {
        const fadeTargetOpacity = tickedActor.exiting ? 0 : 1;
        // 淡入淡出全程 0.22 秒（即每秒走 1/0.22 个不透明度单位），进出场速度一致。
        if (tickedActor.opacity !== fadeTargetOpacity && stepSeconds > 0) {
          applyActorOpacity(
            tickedActor,
            fadeTargetOpacity > tickedActor.opacity
              ? Math.min(1, tickedActor.opacity + stepSeconds / 0.22)
              : Math.max(0, tickedActor.opacity - stepSeconds / 0.22)
          );
        }
        if (tickedActor.exiting) {
          // 完全透明后才真正删除：在 visibilitychange 里没走完的淡出，下一帧接着走。
          if (tickedActor.opacity === 0) {
            removeActor(actorBindingId);
          }
          continue;
        }
        // preview（编辑态静止预览）不推进距离；stepSeconds 为 0 时也跳过，省一次采样。
        if (!tickedActor.preview && stepSeconds !== 0) {
          // 匀速沿闭合路径推进，取模回到起点，因此走到终点不会停。
          tickedActor.distance =
            (tickedActor.distance + stepSeconds * tickedActor.speed) % tickedActor.path.length;
          placeActor(tickedActor);
          dirtyFloorIds.add(tickedActor.floorId);
        }
      }
      // 还有「在走的」或「没淡完的」角色就继续要帧；静止预览不算动画（否则会一直渲染）。
      const isAnimating = [...actorsByBindingId.values()].some(
        trackedActor => !trackedActor.preview || trackedActor.opacity !== 1
      );
      flushReflectionFloors();
      if (isAnimating || needsRender) {
        sceneOptions.requestRender?.();
      }
      return isAnimating;
    },
    /**
     * 取角色头顶附近的世界坐标，供相机聚焦使用。
     */
    anchor(bindingId) {
      const anchoredActor = actorsByBindingId.get(bindingId);
      if (anchoredActor) {
        return {
          center: [
            anchoredActor.root.position.x,
            // +0.7 个身高：镜头对准躯干 / 头部而不是脚下，避免画面里人物贴在底边。
            anchoredActor.root.position.y + anchoredActor.size * 0.7,
            anchoredActor.root.position.z
          ]
        };
      } else {
        return null;
      }
    },
    hitRects: computeHitRects,
    /**
     * 命中测试：先射线打模型，再用热区矩形兜底。
     */
    pick(clientX, clientY, camera, canvasElement, pickBindings) {
      const pickCanvasRect = canvasElement.getBoundingClientRect();
      // 画布还没布局出尺寸时算不出 NDC，直接判定未命中。
      if (!pickCanvasRect.width || !pickCanvasRect.height) {
        return null;
      }
      const clickableActors = [...actorsByBindingId.entries()].filter(
        ([pickBindingId, entryActor]) =>
          !entryActor.exiting &&
          entryActor.opacity > 0 &&
          pickBindings.find(clickBinding => clickBinding.id === pickBindingId)?.clickToFocus ===
            true
      );
      const raycaster = new sceneOptions.THREE.Raycaster();
      // 视口坐标 → NDC：x 线性映射，y 翻转（屏幕向下为正，NDC 向上为正）。
      raycaster.setFromCamera(
        new sceneOptions.THREE.Vector2(
          ((clientX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((clientY - pickCanvasRect.top) / pickCanvasRect.height) * 2
        ),
        camera
      );
      // 射线求交依赖世界矩阵，而这些角色的位置是上一帧写的，先刷新一遍。
      for (const [, clickableActor] of clickableActors) {
        clickableActor.root.updateMatrixWorld(true);
      }
      const intersections = raycaster.intersectObjects(
        clickableActors.map(([, raycastActor]) => raycastActor.root),
        true
      );
      if (intersections.length) {
        // 命中的通常是最内层的子网格，需要沿父链回溯到角色根节点才能确定是哪个绑定；
        // 若最近命中点不属于任何角色（例如别的物体挡在前面），返回 null 交给上层处理。
        return (
          clickableActors.find(([, candidateActor]) => {
            let sceneNode = intersections[0].object;
            while (sceneNode) {
              if (sceneNode === candidateActor.root) {
                return true;
              }
              sceneNode = sceneNode.parent;
            }
            return false;
          })?.[0] || null
        );
      }
      // 射线没打中（人物太细 / 点在小人两腿之间）时，用热区矩形的 padding 兜底：
      // 计算点到矩形的最近距离，落在 padding 内就算命中，多个候选取最近的一个。
      const paddingHits = [];
      for (const {
        id: rectId,
        left: rectLeft,
        top: rectTop,
        width: rectWidth,
        height: rectHeight,
        padding: rectPadding
      } of computeHitRects(camera, canvasElement, pickBindings)) {
        // padding 为 0 表示用户只要精确命中模型，不做兜底。
        if (!rectPadding) {
          continue;
        }
        // 点到矩形的「外部距离」：在矩形内时为 0，取 x / y 两轴的超界量再合成。
        const dxPx = Math.max(rectLeft - clientX, 0, clientX - rectLeft - rectWidth);
        const dyPx = Math.max(rectTop - clientY, 0, clientY - rectTop - rectHeight);
        if (Math.hypot(dxPx, dyPx) <= rectPadding) {
          paddingHits.push({
            id: rectId,
            distance: Math.hypot(dxPx, dyPx)
          });
        }
      }
      return (
        paddingHits.sort((firstHit, secondHit) => firstHit.distance - secondHit.distance)[0]?.id ||
        null
      );
    },
    /**
     * 释放本场景创建的全部资源。
     */
    dispose() {
      for (const disposedBindingId of actorsByBindingId.keys()) {
        removeActor(disposedBindingId);
      }
      progressByBindingId.clear();
      flushReflectionFloors();
      // 阴影的贴图与几何体是所有角色共享的，等最后一个角色删完再统一释放。
      footShadowAssets?.geometry.dispose();
      footShadowAssets?.texture.dispose();
      footShadowAssets = null;
    }
  };
}
/**
 * 创建「检测到人」的地面波纹效果：波纹出现在传感器模型（userData.environmentModelType === "presence"）
 * 的脚下，用同心圆环由中心向外扩散并淡出。所有波纹共用一份 RingGeometry 与每实例
 * 克隆的材质，环只靠缩放变形；每帧直接拷贝被跟随模型的 matrixWorld（传感器可能被拖动），开启「减少动态效果」时退化为静态环。
 */
export function createPresenceWaves(waveOptions) {
  const { THREE: THREE } = waveOptions;
  const waveRecordsByBindingId = new Map();
  // 圆环默认躺在 XY 平面，一次性转到 XZ 地面；之后所有波纹共用这一个几何体。
  const ringGeometry = new THREE.RingGeometry(0.965, 1, 48);
  ringGeometry.rotateX(-Math.PI / 2);
  // 三重缓存：模型根 / 场景版本 / 绑定签名任一变化才重建波纹节点，否则只更新数值。
  let cachedModelRoot;
  let cachedRevision;
  let cachedSignature = "";
  let isDisposed = false;
  let hasVisibleWave = false;
  /**
   * 摘掉一条波纹记录并释放它独占的材质（几何体是共享的，不能在这里 dispose）。
   */
  const removeWaveRecord = removedWave => {
    removedWave.group.removeFromParent();
    removedWave.rings.forEach(disposedRing => disposedRing.material.dispose());
  };
  /**
   * 按最新绑定与状态对齐波纹节点。
   */
  function syncWaves({
    bindings: waveBindings = [],
    states: waveStates = {},
    enabled: wavesEnabled = false,
    floorId: waveFloorId = "",
    preview: wavePreview = false
  }) {
    // dispose 之后所有入口都必须变成空操作：舞台可能在销毁后来一帧 tick / sync。
    if (isDisposed) {
      return;
    }
    const revision = waveOptions.environmentRevision ?? waveOptions.sceneRevision;
    // 签名只收「会影响波纹形态」的字段：模型位置、尺寸变了才需要重建，状态变化不用。
    const bindingSignature = JSON.stringify(
      waveBindings.map(waveBinding => [
        waveBinding.id,
        waveBinding.floorId,
        waveBinding.modelId,
        waveBinding.width,
        waveBinding.height,
        waveBinding.depth
      ])
    );
    if (
      cachedModelRoot !== waveOptions.modelRoot ||
      cachedRevision !== revision ||
      cachedSignature !== bindingSignature
    ) {
      cachedModelRoot = waveOptions.modelRoot;
      cachedRevision = revision;
      cachedSignature = bindingSignature;
      // 按「楼层 + 模型 ID」给传感器模型建索引：绑定里存的是 ID，画波纹要拿节点。
      // 键必须走 core/scene-model-key.js 的共享实现：场景节点的 userData 常常缺
      // environmentFloorId，而配置侧可能写成空串，裸 JSON.stringify 会把这两者编码成
      // 两个不同的键，波纹于是静默不出现。
      const presenceModelsByKey = new Map();
      cachedModelRoot?.traverse(modelNode => {
        if (modelNode.userData?.environmentModelType === "presence") {
          presenceModelsByKey.set(
            sceneModelKey(
              modelNode.userData.environmentFloorId,
              modelNode.userData.environmentModelId
            ),
            modelNode
          );
        }
      });
      const visibleBindingIds = new Set();
      for (const waveBindingItem of waveBindings) {
        const matchedModelNode = presenceModelsByKey.get(
          sceneModelKey(waveBindingItem.floorId, waveBindingItem.modelId)
        );
        if (!matchedModelNode || !waveOptions.overlayScene) {
          continue;
        }
        visibleBindingIds.add(waveBindingItem.id);
        let waveRecord = waveRecordsByBindingId.get(waveBindingItem.id);
        // 绑定的模型换了（例如换了传感器型号 / 重新布点）要重建波纹组；
        // matrixAutoUpdate 关掉是因为位置完全由每帧拷贝模型世界矩阵决定。
        if (waveRecord?.model !== matchedModelNode) {
          if (waveRecord) {
            removeWaveRecord(waveRecord);
          }
          const waveGroup = new THREE.Group();
          waveGroup.name = "presence-waves-" + waveBindingItem.id;
          waveGroup.matrixAutoUpdate = false;
          waveGroup.userData.environmentEffect = true;
          // 3 个环错开相位形成连续扩散感：再多环在暗色地面上看不出区别，只增加 draw call。
          const ringMeshes = Array.from(
            {
              length: 3
            },
            () => {
              const createdRingMesh = new THREE.Mesh(
                ringGeometry,
                new THREE.MeshBasicMaterial({
                  // 0xC3E4D6 浅薄荷绿：与环境模块的冷暖色都不冲突的高亮色。
                  color: 12838102,
                  transparent: true,
                  // 初始透明，可见性由 tickWaves 每帧按相位写入。
                  opacity: 0,
                  // 双面：相机俯视时看到环的正面，贴地平视时看到背面。
                  side: THREE.DoubleSide,
                  depthWrite: false,
                  toneMapped: false
                })
              );
              // 波纹是纯装饰，不参与拾取，否则会挡住传感器模型本身的点击。
              createdRingMesh.raycast = () => {};
              waveGroup.add(createdRingMesh);
              return createdRingMesh;
            }
          );
          waveOptions.overlayScene.add(waveGroup);
          waveRecord = {
            group: waveGroup,
            rings: ringMeshes,
            model: matchedModelNode
          };
          waveRecordsByBindingId.set(waveBindingItem.id, waveRecord);
        }
        // 半径取模型宽度的一半；宽度缺失时按 0.16 米兜底，下限 0.02 防止缩放到 0。
        waveRecord.radius = Math.max(0.02, (waveBindingItem.width || 0.16) * 0.5);
        // 模型可能不是正方形（传感器是个小盒子），用 depth/width 的比值把环在 z 向拉成椭圆。
        waveRecord.depthRatio =
          (waveBindingItem.depth || waveBindingItem.width || 0.16) /
          (waveBindingItem.width || 0.16);
        for (const ringMesh of waveRecord.rings) {
          // 0.755 × 模型高度：环贴在模型偏下的位置（接近地面），不会从盒子上半部穿出来。
          ringMesh.position.y = (waveBindingItem.height || 0.2) * 0.755;
        }
      }
      // 配置里已经没有的绑定：连节点带材质一起清掉，避免越积越多。
      for (const [waveBindingId, staleWave] of waveRecordsByBindingId) {
        if (!visibleBindingIds.has(waveBindingId)) {
          removeWaveRecord(staleWave);
          waveRecordsByBindingId.delete(waveBindingId);
        }
      }
    }
    hasVisibleWave = false;
    for (const waveBindingEntry of waveBindings) {
      const activeWaveRecord = waveRecordsByBindingId.get(waveBindingEntry.id);
      if (!activeWaveRecord) {
        continue;
      }
      // 用户可调的范围：缩放 0.25~3 倍，不透明度 0~100%（默认 0.68）。
      // 越界值一律夹回，避免配置里写坏的数值把波纹放大到铺满整个户型。
      activeWaveRecord.scale = Number.isFinite(waveBindingEntry.waveScale)
        ? Math.max(0.25, Math.min(3, waveBindingEntry.waveScale))
        : 1;
      activeWaveRecord.opacity = Number.isFinite(waveBindingEntry.waveOpacity)
        ? Math.max(0, Math.min(100, waveBindingEntry.waveOpacity)) / 100
        : 0.68;
      // 状态可能是 Map（编辑器的实时表）或普通对象（序列化快照），两种都兼容。
      const stateEntry =
        waveStates?.get?.(waveBindingEntry.entityId) ?? waveStates[waveBindingEntry.entityId];
      const stateData = resolveStateEntry(stateEntry);
      // 与触发器同口径：可用、state 非空、且不是 unknown / unavailable 才算「有人」。
      const isActiveState =
        stateData?.available !== false &&
        !!stateData?.state &&
        !["unknown", "unavailable"].includes(stateData.state);
      activeWaveRecord.group.visible =
        wavesEnabled &&
        waveBindingEntry.waveEnabled !== false &&
        activeWaveRecord.opacity > 0 &&
        // 编辑预览时无视状态直接显示，方便调参数；正式运行时才要求状态激活。
        (wavePreview || isActiveState) &&
        // 波纹是地面效果，只能出现在当前楼层，否则会叠在别的楼层地板上。
        waveBindingEntry.floorId === waveFloorId;
      hasVisibleWave ||= activeWaveRecord.group.visible;
    }
    waveOptions.requestRender?.();
  }
  /**
   * 推进波纹动画（每帧调用）。
   */
  function tickWaves(elapsedMs) {
    // 没有可见波纹时直接返回 false：波纹自身的开销很小，但没必要让帧循环空转。
    if (isDisposed || !hasVisibleWave) {
      return false;
    }
    const prefersReducedMotion = prefersReducedMotionNow();
    for (const visibleWave of waveRecordsByBindingId.values()) {
      if (visibleWave.group.visible) {
        // 波纹组自身不参与变换更新，每帧把被跟随模型的世界矩阵整体拷过来即可：
        // 传感器可能被拖动 / 旋转，这样波纹永远贴合模型，不必反算偏移。
        visibleWave.model.updateWorldMatrix(true, false);
        visibleWave.group.matrix.copy(visibleWave.model.matrixWorld);
        visibleWave.group.matrixWorldNeedsUpdate = true;
        for (let ringIndex = 0; ringIndex < visibleWave.rings.length; ringIndex++) {
          // 周期 2.4 秒；三个环按 1/3 均分相位，形成「前一个刚淡出、后一个已扩散」的连续感。
          // 开启减少动态效果时相位固定在 0.35，波纹退化为静止的浅色环。
          const ringPhase = prefersReducedMotion ? 0.35 : (elapsedMs / 2400 + ringIndex / 3) % 1;
          // 1.05 起步（略大于模型本身，不然会被模型盖住），随相位最多扩到 21 倍半径。
          const ringScale = visibleWave.radius * (1.05 + ringPhase * 20) * visibleWave.scale;
          // 只留一个环给「减少动态效果」的用户，避免多个静止环叠成硬边。
          visibleWave.rings[ringIndex].visible = !prefersReducedMotion || ringIndex === 0;
          // 环在水平面上，y 不缩放（恒为 1），z 用 depthRatio 拉成椭圆跟随模型长宽比。
          visibleWave.rings[ringIndex].scale.set(ringScale, 1, ringScale * visibleWave.depthRatio);
          // 越往外越淡：指数 0.7 让衰减前段平缓、末端快速消失，比线性更像涟漪。
          visibleWave.rings[ringIndex].material.opacity =
            visibleWave.opacity * Math.pow(1 - ringPhase, 0.7);
        }
      }
    }
    waveOptions.requestRender?.();
    // 静止环不需要每帧重绘，返回 false 让舞台停掉帧循环。
    return !prefersReducedMotion;
  }
  return {
    sync: syncWaves,
    tick: tickWaves,
    /**
     * 释放全部波纹资源（含共享的圆环几何体）。
     */
    dispose() {
      // isDisposed 兜底：dispose 可能被重复调用。
      if (!isDisposed) {
        isDisposed = true;
        for (const disposedWave of waveRecordsByBindingId.values()) {
          removeWaveRecord(disposedWave);
        }
        waveRecordsByBindingId.clear();
        // 共享几何体最后释放：上面每个记录释放的都是各自克隆的材质。
        ringGeometry.dispose();
      }
    }
  };
}
