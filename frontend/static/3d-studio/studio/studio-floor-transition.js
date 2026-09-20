/**
 * 楼层之间的切换动画（滑动 / 展开 / 退场）。
 *
 * 位置：3D 工作室在切换楼层（或从总览进入某一层）时，本模块负责把「旧楼层集合」
 *   与「新楼层集合」编排成一段动画，而不是硬切。
 * 对外：只导出 createFloorTransition 工厂，返回 capture / take / reuse / begin /
 *   sample / setSlideCameras / finish 以及 active、records 两个只读状态。
 * 坐标系与单位：所有矩阵都是 three.js 世界矩阵（右手系、Y 轴向上、单位米）；
 *   矩阵的 elements[12..14] 依次是平移的 x / y / z，动画里直接改这三个分量做位移。
 * 关键约定：
 *   - floorSpread 是相邻楼层的屏幕间距参考值（米），用于估算不存在的旧楼层该从哪里入场。
 *   - 过渡期间会把每个楼层临时挂到一个以楼层 ID 命名的 Group 下，结束时再解开；
 *     这样做是为了能整体移动 / 旋转一层楼而不动楼层内的对象局部变换。
 *   - 过渡期间地面层（地板 / 网格 / 接触阴影）材质被换成透明克隆体，随动画淡入淡出。
 */

export function createFloorTransition({
  THREE: three,
  getRoot: getRootObject,
  dispose: onDispose,
  release: onRelease = () => false,
  suspendReflections: onSuspendReflections = () => {},
  invalidate: onInvalidate = () => {}
}) {
  // 当前参与过渡的楼层记录；过渡结束后清空。
  let activeRecords = [];
  let isTransitionActive = false;
  // 三选一的动画模式：scroll 模式（楼层连续排布）、exit 模式（退到单层的抽离）、
  // 以及装配模式（assemblyState 非空时，多楼层从同一锚点展开）。
  let slideState = null;
  let exitState = null;
  let assemblyState = null;

  /**
   * 把矩阵拆成 position / quaternion / scale。
   */
  const decomposeMatrix = matrix => {
    // 三个向量各复用一个实例，避免每帧为每个楼层分配新对象。
    const positionVector = new three.Vector3();
    const quaternionValue = new three.Quaternion();
    const scaleVector = new three.Vector3();
    matrix.decompose(positionVector, quaternionValue, scaleVector);
    return {
      position: positionVector,
      quaternion: quaternionValue,
      scale: scaleVector
    };
  };

  /**
   * 捕捉待过渡的楼层：为每层建一个包装 Group 并把该层的根对象托管进去。
   */
  function captureFloors(captureFloorIds, getBaseFrame, groupByFloorId) {
    const rootObject = getRootObject();
    // 先刷新一次世界矩阵：下面用 attach() 重新挂载时会依赖当前的世界矩阵保持不变。
    rootObject.updateMatrixWorld(true);
    return captureFloorIds.map(floorId => {
      const floorGroup = new three.Group();
      floorGroup.name = "floor-transition-" + floorId;
      // 同时写两个 userData 键：floorId 供本模块识别，regionFloorId 供区域灯光等模块识别。
      floorGroup.userData.floorId = floorGroup.userData.regionFloorId = floorId;
      const sourceChildren = groupByFloorId
        ? rootObject.children.filter(matchedChild => matchedChild.userData.floorId === floorId)
        : [...rootObject.children];
      rootObject.add(floorGroup);
      for (const childObject of sourceChildren) {
        // 用 attach 而不是 add：保留对象的世界变换，视觉上不会跳一下。
        floorGroup.attach(childObject);
      }
      const record = {
        id: floorId,
        node: floorGroup,
        baseFrame: getBaseFrame(floorId),
        ground: [],
        groundAlpha: 1
      };
      floorGroup.traverse(sceneNode => {
        // 只接管地面层（背景 / 网格 / 接触阴影）：它们需要独立淡出，
        // 否则滑动时地面会像一整块板跟着飞出去。
        if (
          !sceneNode.material ||
          !["background", "grid", "contact-shadow"].includes(sceneNode.userData?.exportRole)
        ) {
          return;
        }
        const originalMaterial = sceneNode.material;
        // 过渡期间地面必须可透明（要做淡入淡出），并复制原材质的着色器钩子 ——
        // clone() 不会带过去，漏掉会让阴影图集 / 环境反射的补丁在过渡中失效。
        // 同时关掉深度写入：多层半透明地面否则会互相遮挡出条纹。
        const cloneGroundMaterial = material => {
          const clonedMaterial = material.clone();
          // clone() 不会复制这两个钩子，必须手动带过去，
          // 否则阴影图集 / 环境反射的着色器补丁会在过渡期间失效。
          clonedMaterial.onBeforeCompile = material.onBeforeCompile;
          clonedMaterial.customProgramCacheKey = material.customProgramCacheKey.bind(material);
          // 过渡期间地面必须可透明，才能做淡入淡出。
          clonedMaterial.transparent = true;
          // 关掉深度写入：多层地面在半透明状态下会互相遮挡出条纹。
          clonedMaterial.depthWrite = false;
          return clonedMaterial;
        };
        sceneNode.material = Array.isArray(originalMaterial)
          ? originalMaterial.map(cloneGroundMaterial)
          : cloneGroundMaterial(originalMaterial);
        record.ground.push({
          node: sceneNode,
          // 接触阴影是「贴在地上」的产物，必须始终跟随楼层；背景与网格则单独淡出。
          followsFloor: sceneNode.userData.exportRole === "contact-shadow",
          original: originalMaterial,
          materials: Array.isArray(sceneNode.material) ? sceneNode.material : [sceneNode.material],
          // 记住原始不透明度，淡出要在它的基础上做，而不是固定到 0 / 1。
          opacity: (Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]).map(
            sourceMaterial => sourceMaterial.opacity
          )
        });
      });
      return record;
    });
  }

  /**
   * 算出一层楼当前的「层内坐标系到世界」的实际帧：包装 Group 的矩阵乘基准帧。
   */
  function computeRecordFrame(capturedRecord) {
    capturedRecord.node.updateMatrix();
    return capturedRecord.node.matrix.clone().multiply(capturedRecord.baseFrame);
  }

  /**
   * 把地面层材质还原成原始材质，并释放过渡期间用的克隆体。
   */
  function restoreGroundMaterials(floorRecord) {
    for (const groundEntry of floorRecord.ground) {
      groundEntry.node.material = groundEntry.original;
      for (const disposableMaterial of groundEntry.materials) {
        // 克隆材质是过渡专用的，用完必须 dispose，否则每次切楼层都泄漏一批材质。
        disposableMaterial.dispose();
      }
    }
    floorRecord.ground = [];
  }

  /**
   * 把一层楼从过渡状态里摘掉。
   */
  function detachRecord(leavingRecord, shouldDispose = true) {
    restoreGroundMaterials(leavingRecord);
    leavingRecord.node.removeFromParent();
    // transferred 表示这层楼已经被 reuse 复用给新场景，此时不能销毁。
    // 否则先问 onRelease 是否愿意接管，不愿接管才真正 dispose。
    if (!leavingRecord.transferred && (!shouldDispose || !onRelease(leavingRecord))) {
      onDispose(leavingRecord.node);
    }
  }
  /**
   * 复用上一轮过渡留下的楼层包装：把里面的内容取出并挂回根节点。
   */
  function reuseRecord(cachedRecord, targetFrame) {
    restoreGroundMaterials(cachedRecord);
    const cachedChildren = [...cachedRecord.node.children];
    let reusedNode;
    if (cachedChildren.length === 1 && cachedChildren[0].userData.floorId === cachedRecord.id) {
      // 常见情形：包装里就一个节点且已经是该层的正式节点，直接复用，省一层嵌套。
      reusedNode = cachedChildren[0];
      cachedRecord.node.remove(reusedNode);
    } else {
      // 内容多于一个（或不是该层的节点）：新建一层包装把内容收进去。
      reusedNode = new three.Group();
      reusedNode.name = "floor-" + cachedRecord.id;
      reusedNode.userData.floorId = reusedNode.userData.regionFloorId = cachedRecord.id;
      for (const cachedChild of cachedChildren) {
        cachedRecord.node.remove(cachedChild);
        reusedNode.add(cachedChild);
      }
    }
    // 复用节点的世界变换 = 目标帧 × 缓存基准帧的逆，这样节点内容看起来落在原位。
    reusedNode.applyMatrix4(targetFrame.clone().multiply(cachedRecord.baseFrame.clone().invert()));
    getRootObject().add(reusedNode);
    reusedNode.updateMatrixWorld(true);
    // 标记已转移：后续 detach 时不能把它当垃圾销毁。
    cachedRecord.transferred = true;
    return reusedNode;
  }
  /**
   * 取出待过渡的楼层记录：已有过渡在跑就沿用当前记录，否则现捕捉一份。
   */
  function takeRecords(takeFloorIds, resolveBaseFrame, takeGroupByFloorId) {
    // 过渡期间立刻暂停反射：反射探针采到的中间态会污染反射贴图。
    onSuspendReflections(true);
    const takenRecords = isTransitionActive
      ? activeRecords
      : captureFloors(takeFloorIds, resolveBaseFrame, takeGroupByFloorId);
    for (const takenRecord of takenRecords) {
      takenRecord.frame = computeRecordFrame(takenRecord);
      takenRecord.node.removeFromParent();
    }
    // 取出后立刻复位动画状态：接下来的 begin() 会重新建立。
    activeRecords = [];
    isTransitionActive = false;
    slideState = null;
    exitState = null;
    assemblyState = null;
    return takenRecords;
  }
  /**
   * 编排一次楼层过渡：给每个楼层算出起点帧、终点帧与淡出目标。
   */
  function beginTransition(
    previousRecords,
    nextRecords,
    floorOrder,
    floorSpread,
    isScrollTransition = false,
    scrollAxis = null,
    targetFloorId = null
  ) {
    const sceneRoot = getRootObject();
    const previousById = new Map(
      previousRecords.map(previousEntry => [previousEntry.id, previousEntry])
    );
    const nextById = new Map(nextRecords.map(nextEntry => [nextEntry.id, nextEntry]));
    // 聚焦层的选择顺序：显式指定 > 上一轮标记保留的层 > 新旧共有的层 > 第一个。
    // 顺序体现了优先级：调用方的意图最优先，其次是动画连续性。
    const focusRecord =
      nextRecords.find(targetCandidate => targetCandidate.id === targetFloorId) ||
      nextRecords.find(keptCandidate => previousById.get(keptCandidate.id)?.keep) ||
      nextRecords.find(sharedCandidate => previousById.has(sharedCandidate.id)) ||
      nextRecords[0];
    const anchorRecord = previousById.get(focusRecord.id) || previousRecords[0];
    // 装配矩阵：把「锚点层当前的世界帧」换算成「聚焦层的基准帧」，
    // 于是所有新出现的楼层都能从锚点的位置整齐展开。滚动模式下不用这套。
    const handoffMatrix =
      !isScrollTransition && nextRecords.length > 1
        ? anchorRecord.frame.clone().multiply(focusRecord.baseFrame.clone().invert())
        : null;
    assemblyState = handoffMatrix ? decomposeMatrix(handoffMatrix) : null;
    if (assemblyState) {
      assemblyState.anchorId = focusRecord.id;
    }
    const keptPreviousRecord =
      previousRecords.find(keptEntry => keptEntry.keep) || previousRecords[0];
    // 取楼层在自下而上顺序里的下标，用来算层间相对位移（层差 × floorSpread）；
    // 找不到时 indexOf 返回 -1，位移量会退化但不会抛错 —— 楼层列表本应与 floorOrder 一致。
    const orderIndexOf = orderFloorId => floorOrder.indexOf(orderFloorId);
    // 滚动模式需要上一轮的滚动位置来保持惯性连续，否则每次切换都会跳回起点。
    const scrollAnchorRecord = previousRecords.find(scrollingEntry =>
      Number.isFinite(scrollingEntry.scrollPosition)
    );

    /**
     * 把一帧沿楼层顺序方向平移若干「层距」。
     */
    const offsetFrameBySteps = (frameMatrix, stepDelta) => {
      const offsetFrame = frameMatrix.clone();
      const offsetMeters = stepDelta * floorSpread;
      const axisVector = isScrollTransition && scrollAxis ? scrollAxis : new three.Vector3(0, 1, 0);
      // 直接改矩阵的平移分量，避免再构造一次 Matrix4 乘法的开销。
      offsetFrame.elements[12] += axisVector.x * offsetMeters;
      offsetFrame.elements[13] += axisVector.y * offsetMeters;
      offsetFrame.elements[14] += axisVector.z * offsetMeters;
      return offsetFrame;
    };
    activeRecords = [];
    for (const nextRecord of nextRecords) {
      const previousRecord = previousById.get(nextRecord.id);
      // 上一轮就在的楼层沿用它的实际帧；新出现的楼层按「从锚点层偏移 N 层」估算入场位置。
      const recordFrame =
        previousRecord?.frame ||
        offsetFrameBySteps(
          anchorRecord.frame,
          orderIndexOf(nextRecord.id) - orderIndexOf(anchorRecord.id)
        );
      nextRecord.assemblyOffset =
        !previousRecord && handoffMatrix
          ? (orderIndexOf(nextRecord.id) - orderIndexOf(focusRecord.id)) * floorSpread
          : null;
      const assemblyFrame =
        nextRecord.assemblyOffset !== null
          ? handoffMatrix
              .clone()
              .multiply(new three.Matrix4().makeTranslation(0, nextRecord.assemblyOffset, 0))
          : recordFrame.clone().multiply(nextRecord.baseFrame.clone().invert());
      // 装配位移用「相对聚焦层」的形式保存，这样每帧只用插值一个很小的矩阵。
      nextRecord.assemblyRelative = handoffMatrix
        ? decomposeMatrix(handoffMatrix.clone().invert().multiply(assemblyFrame))
        : null;
      assemblyFrame.decompose(
        nextRecord.node.position,
        nextRecord.node.quaternion,
        nextRecord.node.scale
      );
      nextRecord.scrollOffset = previousRecord?.scrollOffset;
      // wasVisible 表示这一层在切换前就已经在屏幕上，它决定动画走「滑动」还是「从外飞入」。
      nextRecord.wasVisible = !!previousRecord;
      nextRecord.from = decomposeMatrix(assemblyFrame);
      // to 用单位矩阵：即「回到自己的基准位置」，无需再算一次。
      nextRecord.to = decomposeMatrix(new three.Matrix4());
      // 滚动模式下只有聚焦层留在场景里，其余楼层作为滑动内容被带走。
      nextRecord.keep = !isScrollTransition || nextRecord.id === focusRecord.id;
      nextRecord.node.userData.floorTransitionLeaving = !nextRecord.keep;
      // 地面淡入：上一轮已有该层就接着它的 alpha，新层从 0 开始。
      nextRecord.groundFrom = previousRecord?.groundAlpha ?? 0;
      nextRecord.groundTo = nextRecord.keep ? 1 : 0;
      activeRecords.push(nextRecord);
      if (previousRecord) {
        // 这里不销毁：节点已被新记录接管（或即将被复用）。
        detachRecord(previousRecord, false);
      }
    }
    for (const restoredRecord of previousRecords) {
      if (nextById.has(restoredRecord.id)) {
        continue;
      }
      // 本轮不再展示的楼层：挂回场景，让它按顺序滑出屏幕而不是凭空消失。
      sceneRoot.add(restoredRecord.node);
      const restoredFrame = offsetFrameBySteps(
        focusRecord.baseFrame,
        orderIndexOf(restoredRecord.id) - orderIndexOf(focusRecord.id)
      );
      restoredRecord.from = decomposeMatrix(restoredRecord.node.matrix);
      restoredRecord.to = decomposeMatrix(
        restoredFrame.multiply(restoredRecord.baseFrame.clone().invert())
      );
      restoredRecord.keep = false;
      restoredRecord.node.userData.floorTransitionLeaving = true;
      restoredRecord.wasVisible = true;
      restoredRecord.groundFrom = restoredRecord.groundAlpha;
      restoredRecord.groundTo = 0;
      activeRecords.push(restoredRecord);
    }
    slideState = isScrollTransition
      ? {
          // 间距优先用上轮缓存的实际值，保证连续切换时视觉节奏一致。
          spread: scrollAnchorRecord?.scrollSpacing || floorSpread,
          order: [...floorOrder],
          screenSpacing: scrollAnchorRecord?.scrollScreenSpacing,
          // 滚动位置以「层序号」为单位，可从上一轮的位置接着走。
          scrollFrom: scrollAnchorRecord?.scrollPosition ?? orderIndexOf(keptPreviousRecord.id),
          scrollTo: orderIndexOf(focusRecord.id)
        }
      : null;
    exitState =
      !isScrollTransition && nextRecords.length === 1
        ? {
            // 退场模式：目标层决定其余楼层的退出方向（按楼层顺序判断上 / 下）。
            target: focusRecord.id,
            order: [...floorOrder]
          }
        : null;
    if (!slideState) {
      // 非滚动模式必须清掉上轮遗留的滚动字段，否则采样时会误走滚动分支。
      for (const staleRecord of activeRecords) {
        delete staleRecord.scrollPosition;
        delete staleRecord.scrollSpacing;
        delete staleRecord.scrollScreenSpacing;
        delete staleRecord.scrollOffset;
      }
    }
    for (const easeRecord of activeRecords) {
      // 退场楼层用加速缓动（ease-in）：先慢后快，看起来像被「抽走」。
      easeRecord.departureEase =
        !isScrollTransition && nextRecords.length === 1 && !easeRecord.keep;
    }
    isTransitionActive = true;
    onSuspendReflections(true);
    // 立刻采样第 0 帧，保证第一帧就有正确姿态，不会闪一下基准位置。
    sampleTransition(0);
  }
  /**
   * 结束过渡：把保留的楼层解包回场景根，其余楼层摘除。
   */
  function finishTransition() {
    if (!isTransitionActive && !activeRecords.length) {
      return;
    }
    const finishRoot = getRootObject();
    for (const finishedRecord of activeRecords) {
      if (finishedRecord.keep && finishedRecord.node.parent === finishRoot) {
        // 保留层：把包装 Group 的变换清零，然后 children 直接挂回根节点，
        // 这样过渡结束后场景图里不再残留任何动画用的临时节点。
        finishedRecord.node.position.set(0, 0, 0);
        finishedRecord.node.quaternion.identity();
        finishedRecord.node.scale.set(1, 1, 1);
        finishedRecord.node.updateMatrixWorld(true);
        restoreGroundMaterials(finishedRecord);
        for (const releasedChild of [...finishedRecord.node.children]) {
          // 用 attach 保证世界变换不变（此处包装已是单位矩阵，等价于 add）。
          finishRoot.attach(releasedChild);
        }
        finishedRecord.node.removeFromParent();
      } else {
        detachRecord(finishedRecord);
      }
    }
    activeRecords = [];
    isTransitionActive = false;
    slideState = null;
    exitState = null;
    assemblyState = null;
    // 过渡结束才恢复反射，此时场景已是稳定姿态。
    onSuspendReflections(false);
    // 强制重绘一帧：否则停在下一次交互才刷新，会看到过渡的最后一帧残留。
    onInvalidate(true);
  }

  /**
   * 把「相机描述」转成视图矩阵。
   */
  const computeCameraFrame = cameraDescriptor => {
    const cameraPosition = new three.Vector3().fromArray(cameraDescriptor.position);
    const cameraTarget = new three.Vector3().fromArray(cameraDescriptor.target);
    return new three.Matrix4()
      .lookAt(
        cameraPosition,
        cameraTarget,
        new three.Vector3().fromArray(cameraDescriptor.up || [0, 1, 0])
      )
      .setPosition(cameraPosition);
  };
  /**
   * 预先算好滑动 / 装配动画所需的相机空间数据。
   *
   * 为什么要预计算：过渡期间每帧都要把楼层摆到「屏幕上某个位置」，
   * 而把世界坐标换算成屏幕坐标需要相机矩阵与投影参数；这些在同一段过渡里
   * 只在起止两次取值（中间按 progress 插值），提前算完能省下每层的重复计算。
   */
  function prepareSlideCameras(fromCameraSpec, toCameraSpec, projections = null) {
    if (assemblyState && projections) {
      // 装配模式 + 有投影参数：走「屏幕空间对齐」路径，
      // 让新出现的楼层在屏幕上从锚点层的位置散开，而不是沿世界 Y 轴。
      const fromViewMatrix = computeCameraFrame(fromCameraSpec).invert();
      const toViewMatrix = computeCameraFrame(toCameraSpec).invert();
      const assemblyAnchorRecord = activeRecords.find(
        anchorEntry => anchorEntry.id === assemblyState.anchorId
      );
      const centersById = new Map(
        activeRecords.map(centerRecord => {
          // 直接量取楼层内容的几何中心（而不是用基准帧的平移），
          // 因为基准帧可能不在楼层几何中心，用它对齐会偏。
          const worldBounds = new three.Box3();
          centerRecord.node.updateWorldMatrix(true, true);
          const inverseNodeWorld = centerRecord.node.matrixWorld.clone().invert();
          centerRecord.node.traverseVisible(meshNode => {
            // 排除背景 / 网格 / 接触阴影：这些是无边界的平面，
            // 一旦计入，包围盒会变得极大，中心点也就失去意义。
            if (
              !!meshNode.isMesh &&
              !!meshNode.geometry &&
              !["background", "grid", "contact-shadow"].includes(meshNode.userData?.exportRole)
            ) {
              if (!meshNode.geometry.boundingBox) {
                // 只在缺缓存时算一次：computeBoundingBox 是 O(顶点数) 的开销。
                meshNode.geometry.computeBoundingBox();
              }
              if (meshNode.geometry.boundingBox) {
                worldBounds.union(
                  meshNode.geometry.boundingBox
                    .clone()
                    .applyMatrix4(inverseNodeWorld.clone().multiply(meshNode.matrixWorld))
                );
              }
            }
          });
          // 完全没有网格的楼层退化为用基准帧的平移点，保证 map 里始终有值。
          return [
            centerRecord.id,
            worldBounds.isEmpty()
              ? new three.Vector3().setFromMatrixPosition(centerRecord.baseFrame)
              : worldBounds.getCenter(new three.Vector3())
          ];
        })
      );
      const anchorCenter = centersById
        .get(assemblyAnchorRecord.id)
        .clone()
        // 中心点先经锚点当前的变换，再进相机空间：得到锚点在屏幕上的落点。
        .applyMatrix4(
          new three.Matrix4().compose(
            assemblyAnchorRecord.from.position,
            assemblyAnchorRecord.from.quaternion,
            assemblyAnchorRecord.from.scale
          )
        )
        .applyMatrix4(fromViewMatrix);
      for (const assemblyRecord of activeRecords) {
        const recordCenter = centersById.get(assemblyRecord.id);
        const recordWorldFrame = fromViewMatrix
          .clone()
          .multiply(
            new three.Matrix4().compose(
              assemblyRecord.from.position,
              assemblyRecord.from.quaternion,
              assemblyRecord.from.scale
            )
          );
        const toViewFrame = toViewMatrix.clone();
        const screenFrom = recordCenter.clone().applyMatrix4(recordWorldFrame);
        const screenTo = recordCenter.clone().applyMatrix4(toViewFrame);
        if (!assemblyRecord.wasVisible) {
          // 新出现的楼层不能让它在原地淡入，否则会看到「凭空冒出」；
          // 把它沿装配方向从锚点位置依次排开。
          const anchorProjectionScale = projectedScaleAtDepth(projections.from, -anchorCenter.z);
          const assemblySign =
            (assemblyRecord.assemblyOffset /
              Math.max(0.001, Math.abs(assemblyRecord.assemblyOffset))) *
            1.8;
          screenFrom.copy(anchorCenter);
          screenFrom.y += assemblySign * anchorProjectionScale;
          // 同一方向上更接近锚点的楼层要排得更靠内，否则会重叠。
          const closerCount = activeRecords.filter(
            otherRecord =>
              !otherRecord.wasVisible &&
              Math.sign(otherRecord.assemblyOffset) === Math.sign(assemblyRecord.assemblyOffset) &&
              Math.abs(otherRecord.assemblyOffset) < Math.abs(assemblyRecord.assemblyOffset)
          ).length;
          screenFrom.y += assemblySign * anchorProjectionScale * closerCount;
        }
        // 把相机空间的点转成归一化的屏幕坐标（除以该深度的投影缩放）。
        const projectToScreenSpace = (worldPoint, screenProjection) => {
          const depthScale = projectedScaleAtDepth(screenProjection, -worldPoint.z);
          return new three.Vector3(
            worldPoint.x / depthScale,
            worldPoint.y / depthScale,
            -worldPoint.z
          );
        };
        const screenStart = projectToScreenSpace(screenFrom, projections.from);
        const screenEnd = projectToScreenSpace(screenTo, projections.to);
        if (!assemblyRecord.wasVisible) {
          // 横向不参与散开：只在竖直方向错开，横向留给相机本身的运动。
          screenStart.x = screenEnd.x;
        }
        assemblyRecord.assemblyScreen = {
          pivot: recordCenter,
          from: decomposeMatrix(assemblyRecord.wasVisible ? recordWorldFrame : toViewFrame),
          to: decomposeMatrix(toViewFrame),
          start: screenStart,
          end: screenEnd
        };
      }
      // 装配模式独占处理，后面两套分支都不用跑。
      return;
    }
    if (!slideState) {
      // 既不是装配也不是滚动，只剩「退场」模式。
      if (!exitState || !projections) {
        return;
      }
      const exitViewMatrix = computeCameraFrame(fromCameraSpec).invert();
      for (const exitingRecord of activeRecords) {
        if (exitingRecord.keep) {
          continue;
        }
        const exitStartFrame = exitViewMatrix
          .clone()
          .multiply(
            new three.Matrix4().compose(
              exitingRecord.from.position,
              exitingRecord.from.quaternion,
              exitingRecord.from.scale
            )
          );
        // 退出方向：处于目标层「上方」的往上飘，下方的往下沉。
        const exitSign = Math.sign(
          exitState.order.indexOf(exitingRecord.id) - exitState.order.indexOf(exitState.target)
        );
        let exitLift = 0;
        exitingRecord.node.updateWorldMatrix(true, true);
        const inverseExitWorld = exitingRecord.node.matrixWorld.clone().invert();
        exitingRecord.node.traverseVisible(exitMeshNode => {
          if (
            !exitMeshNode.isMesh ||
            !exitMeshNode.geometry ||
            ["background", "grid", "contact-shadow"].includes(exitMeshNode.userData?.exportRole)
          ) {
            return;
          }
          if (!exitMeshNode.geometry.boundingBox) {
            exitMeshNode.geometry.computeBoundingBox();
          }
          const exitMeshBounds = exitMeshNode.geometry.boundingBox;
          if (!exitMeshBounds || exitMeshBounds.isEmpty()) {
            return;
          }
          const boundsToWorld = exitStartFrame
            .clone()
            .multiply(inverseExitWorld)
            .multiply(exitMeshNode.matrixWorld);
          // 遍历包围盒 8 个角点取最大抬升量：只按盒子顶点算，
          // 比遍历所有顶点便宜得多，而退场动画不需要像素级精确。
          for (const exitCornerX of [exitMeshBounds.min.x, exitMeshBounds.max.x]) {
            for (const exitCornerY of [exitMeshBounds.min.y, exitMeshBounds.max.y]) {
              for (const exitCornerZ of [exitMeshBounds.min.z, exitMeshBounds.max.z]) {
                const cornerPoint = new three.Vector3(
                  exitCornerX,
                  exitCornerY,
                  exitCornerZ
                ).applyMatrix4(boundsToWorld);
                for (const exitProjection of [projections.from, projections.to]) {
                  // 把「该纵深处的可视半高」换算出来，乘 1.12 留一点余量，
                  // 保证楼层完全滑出画面而不是只露出半个角。
                  const projectedHeight =
                    (exitProjection.height *
                      (1 -
                        exitProjection.weight +
                        (exitProjection.weight * Math.max(0.001, -cornerPoint.z)) /
                          Math.max(0.001, exitProjection.distance))) /
                    2;
                  exitLift = Math.max(exitLift, projectedHeight * 1.12 - exitSign * cornerPoint.y);
                }
              }
            }
          }
        });
        exitingRecord.exitFrom = decomposeMatrix(exitStartFrame);
        // 终点只改 Y 平移（elements[13]），其余姿态保持不变。
        exitStartFrame.elements[13] += exitSign * exitLift;
        exitingRecord.exitTo = decomposeMatrix(exitStartFrame);
      }
      return;
    }
    // 滚动模式：起止视图矩阵存到 slideState 上，供采样时复用。
    slideState.from = computeCameraFrame(fromCameraSpec).invert();
    slideState.to = computeCameraFrame(toCameraSpec).invert();
    slideState.projected = !!projections;
    slideState.projections = projections;
    // 在基准视图矩阵之上再叠一层竖直平移：把滑入 / 滑出的轨道上下错开，
    // 避免两条轨迹在同一高度重叠而穿模。
    const withVerticalOffset = (baseSlideFrame, offsetY) =>
      new three.Matrix4().makeTranslation(0, offsetY, 0).multiply(baseSlideFrame);
    /**
     * 深入换算：给定纵深，求该处「世界单位 → 屏幕半高比例」的缩放系数。
     */
    const projectedScaleAtZ = (slideProjection, worldZ) =>
      Math.max(
        0.001,
        (slideProjection.height *
          (1 -
            slideProjection.weight +
            (slideProjection.weight * Math.max(0.001, -worldZ)) /
              Math.max(0.001, slideProjection.distance))) /
          2
      );
    const slideCandidates = activeRecords.map(slideRecord => {
      const worldFrame = slideState.from
        .clone()
        .multiply(
          new three.Matrix4().compose(
            slideRecord.from.position,
            slideRecord.from.quaternion,
            slideRecord.from.scale
          )
        );
      if (!projections) {
        // 无投影参数（正交或不做屏幕对齐）时只需要世界帧，后面的计算全部跳过。
        return {
          r: slideRecord,
          current: worldFrame
        };
      }
      if (slideRecord.wasVisible) {
        // 上一帧的滚动位移要补回来，否则相机一动会让楼层「回弹」一下。
        worldFrame.elements[13] -= slideRecord.scrollOffset || 0;
      }
      slideRecord.node.updateWorldMatrix(true, true);
      const inverseSlideWorld = slideRecord.node.matrixWorld.clone().invert();
      const recordBounds = new three.Box3();
      const boundCorners = [];
      slideRecord.node.traverseVisible(boundsMeshNode => {
        if (
          !!boundsMeshNode.isMesh &&
          !!boundsMeshNode.geometry &&
          !["background", "grid", "contact-shadow"].includes(boundsMeshNode.userData?.exportRole) &&
          // 这里用逗号表达式「顺手」计算缺失的包围盒（computeBoundingBox 返回 undefined，
          // 所以条件后半段才是真正的判定），避免为这一步单独写一个循环。
          (boundsMeshNode.geometry.boundingBox || boundsMeshNode.geometry.computeBoundingBox(),
          boundsMeshNode.geometry.boundingBox && !boundsMeshNode.geometry.boundingBox.isEmpty())
        ) {
          const meshToWorld = inverseSlideWorld.clone().multiply(boundsMeshNode.matrixWorld);
          const meshBoundingBox = boundsMeshNode.geometry.boundingBox;
          recordBounds.union(meshBoundingBox.clone().applyMatrix4(meshToWorld));
          // 角点先存下来：后面判断进出场范围时反复要用，避免重复遍历。
          for (const cornerX of [meshBoundingBox.min.x, meshBoundingBox.max.x]) {
            for (const cornerY of [meshBoundingBox.min.y, meshBoundingBox.max.y]) {
              for (const cornerZ of [meshBoundingBox.min.z, meshBoundingBox.max.z]) {
                boundCorners.push(
                  new three.Vector3(cornerX, cornerY, cornerZ).applyMatrix4(meshToWorld)
                );
              }
            }
          }
        }
      });
      slideRecord.scrollCenter = recordBounds.isEmpty()
        ? new three.Vector3()
        : recordBounds.getCenter(new three.Vector3());
      // 每个楼层有两组投影参数：入场时用「起」的，离场 / 已可见时用「终」的。
      // 之所以按方向分开：远景深的楼缩小、近景深的楼放大，视觉上才有纵深。
      slideRecord.projectionFrom = slideRecord.wasVisible ? projections.from : projections.to;
      slideRecord.projectionTo =
        slideRecord.keep || !slideRecord.wasVisible ? projections.to : projections.from;
      let exitExtentValue = 0;
      if (!recordBounds.isEmpty()) {
        for (const [pairMatrix, pairProjection] of [
          [slideRecord.wasVisible ? worldFrame : slideState.to, slideRecord.projectionFrom],
          [
            slideRecord.keep || !slideRecord.wasVisible ? slideState.to : worldFrame,
            slideRecord.projectionTo
          ]
        ]) {
          for (const cornerVector of boundCorners) {
            const transformedCorner = cornerVector.clone().applyMatrix4(pairMatrix);
            const orderIndex = slideState.order.indexOf(slideRecord.id);
            // 链条两端的楼层只能往外走，中间的按绝对距离衡量，
            // 否则「往下滑」的楼层会算出负的行程。
            const directionalExtent =
              orderIndex === 0
                ? transformedCorner.y
                : orderIndex === slideState.order.length - 1
                  ? -transformedCorner.y
                  : Math.abs(transformedCorner.y);
            exitExtentValue = Math.max(
              exitExtentValue,
              directionalExtent / projectedScaleAtZ(pairProjection, transformedCorner.z)
            );
          }
        }
      }
      slideRecord.scrollExitExtent = exitExtentValue;
      return {
        r: slideRecord,
        current: worldFrame,
        extent: exitExtentValue,
        corners: boundCorners
      };
    });
    if (projections && !Number.isFinite(slideState.screenSpacing)) {
      // 屏幕间距：按最高的楼层再留 0.24 的余量，并夹在 [1.24, 1.8]，
      // 上限防止极端高的楼层把间距撑到看不清相邻层。
      slideState.screenSpacing = Math.min(
        1.8,
        Math.max(1.24, ...slideCandidates.map(extentCandidate => 1 + extentCandidate.extent + 0.24))
      );
    }
    for (const {
      r: candidateRecord,
      current: candidateFrame,
      corners: candidateCorners
    } of slideCandidates) {
      const recordOrderIndex = slideState.order.indexOf(candidateRecord.id);
      if (projections) {
        if (candidateRecord.wasVisible && !Number.isFinite(candidateRecord.scrollOffset)) {
          // 上一层没有留下滚动偏移（首次进入滚动模式）时，
          // 按「距滚动起点多少层」估算一个初始偏移，避免所有楼层叠在一起。
          const scrollCenterPoint = candidateRecord.scrollCenter
            .clone()
            .applyMatrix4(candidateFrame);
          candidateFrame.elements[13] -=
            (recordOrderIndex - slideState.scrollFrom) *
            slideState.screenSpacing *
            projectedScaleAtZ(projections.from, scrollCenterPoint.z);
        }
        candidateRecord.slideFrom = decomposeMatrix(
          candidateRecord.wasVisible ? candidateFrame : slideState.to
        );
        candidateRecord.slideTo = decomposeMatrix(
          candidateRecord.keep || !candidateRecord.wasVisible ? slideState.to : candidateFrame
        );
        if (!candidateRecord.keep) {
          // 离场楼层要额外走远一点：先按终态构图，再沿屏幕方向推动它，
          // 并补偿缩放，让「推远」看起来是深度变化而不是简单的平移。
          const scaledSlideFrame = new three.Matrix4().compose(
            candidateRecord.slideTo.position,
            candidateRecord.slideTo.quaternion,
            candidateRecord.slideTo.scale
          );
          const slideExitDepth = -candidateRecord.scrollCenter
            .clone()
            .applyMatrix4(scaledSlideFrame).z;
          const slideExitScale = projectedScaleAtZ(projections.to, -slideExitDepth);
          const scaleRatio =
            slideExitScale / projectedScaleAtZ(candidateRecord.projectionTo, -slideExitDepth);
          scaledSlideFrame.premultiply(
            new three.Matrix4().makeScale(scaleRatio, scaleRatio, scaleRatio)
          );
          // 缩放是以原点为中心的，要把纵深补回来，否则物体沿 z 轴跑偏。
          scaledSlideFrame.elements[14] += slideExitDepth * (scaleRatio - 1);
          scaledSlideFrame.elements[13] +=
            (recordOrderIndex - slideState.scrollTo) * slideState.screenSpacing * slideExitScale;
          const slideSign = Math.sign(recordOrderIndex - slideState.scrollTo);
          candidateRecord.scrollExitExtra = Math.max(
            0,
            ...candidateCorners.map(corner => {
              const cornerInFrame = corner.clone().applyMatrix4(scaledSlideFrame);
              // 用 1.14 的余量确保整个包围盒离开屏幕，最后除以 slideExitScale
              // 换算回「屏幕间距」这同一套单位。
              return (
                (projectedScaleAtZ(projections.to, cornerInFrame.z) * 1.14 -
                  slideSign * cornerInFrame.y) /
                slideExitScale
              );
            })
          );
        }
      } else {
        // 无投影参数时退化为纯世界空间平移：新楼层按层序号从终点位置偏移入场。
        candidateRecord.slideFrom = decomposeMatrix(
          candidateRecord.wasVisible
            ? candidateFrame
            : withVerticalOffset(
                slideState.to,
                (recordOrderIndex - slideState.scrollFrom) * slideState.spread
              )
        );
        candidateRecord.slideTo = decomposeMatrix(
          candidateRecord.keep
            ? slideState.to
            : candidateRecord.wasVisible
              ? withVerticalOffset(
                  candidateFrame,
                  (slideState.scrollFrom - slideState.scrollTo) * slideState.spread
                )
              : withVerticalOffset(
                  slideState.to,
                  (recordOrderIndex - slideState.scrollTo) * slideState.spread
                )
        );
      }
    }
  }
  /**
   * 按纵深算投影缩放：把世界单位换算成屏幕半高比例。
   *
   * 与内部同名逻辑的区别是入参是一个「投影参数对象」而不是矩阵，
   * 供外部（导出、相机适配）复用同一套公式。
   */
  function projectedScaleAtDepth(projectionSpec, depthValue) {
    return Math.max(
      0.001,
      // 透视权重为 0 时退化成固定的正交缩放；为 1 时完全按纵深缩放。
      (projectionSpec.height *
        (1 -
          projectionSpec.weight +
          (projectionSpec.weight * Math.max(0.001, depthValue)) /
            Math.max(0.001, projectionSpec.distance))) /
        2
    );
  }

  /**
   * 采样过渡的第 progressRatio 帧，把每层楼摆到该时刻应有的位置。
   */
  function sampleTransition(progressRatio, cameraSpec = null, projectionParams = null) {
    if (!isTransitionActive) {
      return;
    }
    // 自愈检查：保留层的父节点已经不是场景根，说明外层代码重建过场景图，
    // 过渡状态已经失效，直接收尾而不是继续摆一个已经不在场景里的节点。
    if (
      activeRecords.some(
        staleEntry => staleEntry.keep && staleEntry.node.parent !== getRootObject()
      )
    ) {
      finishTransition();
      return;
    }
    // 夹紧进度：动画驱动可能因掉帧给出越界值，越界会让楼层冲出画面。
    const clampedProgress = Math.max(0, Math.min(1, progressRatio));
    if (!projectionParams && slideState?.projections) {
      // 只插值 height / weight / distance 三个字段，
      // 它们是透视公式的全部输入，线性插值即可与相机运动大致同步。
      const { from: projectionFrom, to: projectionTo } = slideState.projections;
      projectionParams = Object.fromEntries(
        ["height", "weight", "distance"].map(projectionKey => [
          projectionKey,
          projectionFrom[projectionKey] +
            (projectionTo[projectionKey] - projectionFrom[projectionKey]) * clampedProgress
        ])
      );
    }
    for (const sampledRecord of activeRecords) {
      if (slideState) {
        // 把滚动位置写回记录：下一轮 begin() 要靠它保持连续。
        sampledRecord.scrollPosition =
          slideState.scrollFrom + (slideState.scrollTo - slideState.scrollFrom) * clampedProgress;
        sampledRecord.scrollSpacing = slideState.spread;
        sampledRecord.scrollScreenSpacing = slideState.screenSpacing;
      }
      if (assemblyState && sampledRecord.assemblyScreen && cameraSpec && projectionParams) {
        // 装配 + 屏幕对齐：在屏幕空间插值，再反算回世界姿态。
        const assemblyScreen = sampledRecord.assemblyScreen;
        const screenPoint = assemblyScreen.start.clone().lerp(assemblyScreen.end, clampedProgress);
        const screenScale = projectedScaleAtDepth(projectionParams, screenPoint.z);
        const screenFrame = new three.Matrix4().compose(
          new three.Vector3(),
          // 姿态用球面插值（四元数），避免欧拉角插值出现的抖动与万向锁。
          new three.Quaternion().slerpQuaternions(
            assemblyScreen.from.quaternion,
            assemblyScreen.to.quaternion,
            clampedProgress
          ),
          assemblyScreen.from.scale.clone().lerp(assemblyScreen.to.scale, clampedProgress)
        );
        const pivotPoint = assemblyScreen.pivot.clone().applyMatrix4(screenFrame);
        // 屏幕坐标是「以中心为原点」的，而矩阵的平移是相对对象自身枢轴的，
        // 因此要用枢轴点做差，才能让几何中心落在目标屏幕点上。
        screenFrame.setPosition(
          new three.Vector3(
            screenPoint.x * screenScale,
            screenPoint.y * screenScale,
            -screenPoint.z
          ).sub(pivotPoint)
        );
        computeCameraFrame(cameraSpec)
          .multiply(screenFrame)
          .decompose(
            sampledRecord.node.position,
            sampledRecord.node.quaternion,
            sampledRecord.node.scale
          );
      } else if (assemblyState && sampledRecord.assemblyRelative) {
        const assemblyRelative = sampledRecord.assemblyRelative;
        // 装配收拢用 ease-out 二次曲线：起步快、收尾稳，观感上像被「吸」回位。
        const assemblyEase = 1 - (1 - clampedProgress) * (1 - clampedProgress);
        const relativeFrame = new three.Matrix4().compose(
          // x / z 用二维缓动、y 保持线性：竖直方向线性才有「分层堆叠」的秩序感。
          new three.Vector3(
            assemblyRelative.position.x * (1 - assemblyEase),
            assemblyRelative.position.y * (1 - clampedProgress),
            assemblyRelative.position.z * (1 - assemblyEase)
          ),
          new three.Quaternion().slerpQuaternions(
            assemblyRelative.quaternion,
            new three.Quaternion(),
            assemblyEase
          ),
          new three.Vector3().lerpVectors(
            assemblyRelative.scale,
            new three.Vector3(1, 1, 1),
            assemblyEase
          )
        );
        new three.Matrix4()
          .compose(
            // 整体位移随进度线性衰减到 0（即回到正确位置）。
            assemblyState.position.clone().multiplyScalar(1 - clampedProgress),
            new three.Quaternion().slerpQuaternions(
              assemblyState.quaternion,
              new three.Quaternion(),
              clampedProgress
            ),
            new three.Vector3().lerpVectors(
              assemblyState.scale,
              new three.Vector3(1, 1, 1),
              clampedProgress
            )
          )
          .multiply(relativeFrame)
          .decompose(
            sampledRecord.node.position,
            sampledRecord.node.quaternion,
            sampledRecord.node.scale
          );
      } else if (exitState && !sampledRecord.keep && sampledRecord.exitFrom && cameraSpec) {
        // 退场：二次缓动（先慢后快），姿态与缩放保持不变，只沿屏幕方向抬起。
        const exitEase = clampedProgress * clampedProgress;
        const exitFrame = new three.Matrix4().compose(
          new three.Vector3().lerpVectors(
            sampledRecord.exitFrom.position,
            sampledRecord.exitTo.position,
            exitEase
          ),
          sampledRecord.exitFrom.quaternion,
          sampledRecord.exitFrom.scale
        );
        computeCameraFrame(cameraSpec)
          .multiply(exitFrame)
          .decompose(
            sampledRecord.node.position,
            sampledRecord.node.quaternion,
            sampledRecord.node.scale
          );
      } else if (slideState?.from && cameraSpec) {
        // 滚动：在相机空间内插值姿态，并按纵深做缩放补偿。
        const slideFrame = new three.Matrix4().compose(
          new three.Vector3().lerpVectors(
            sampledRecord.slideFrom.position,
            sampledRecord.slideTo.position,
            clampedProgress
          ),
          new three.Quaternion().slerpQuaternions(
            sampledRecord.slideFrom.quaternion,
            sampledRecord.slideTo.quaternion,
            clampedProgress
          ),
          new three.Vector3().lerpVectors(
            sampledRecord.slideFrom.scale,
            sampledRecord.slideTo.scale,
            clampedProgress
          )
        );
        if (slideState.projected && projectionParams) {
          const slideDepth = -sampledRecord.scrollCenter.clone().applyMatrix4(slideFrame).z;
          const slideScale =
            (projectionParams.height *
              (1 -
                projectionParams.weight +
                (projectionParams.weight * Math.max(0.001, slideDepth)) /
                  Math.max(0.001, projectionParams.distance))) /
            2;
          const projectionAtRecord = Object.fromEntries(
            ["height", "weight", "distance"].map(projectionField => [
              projectionField,
              sampledRecord.projectionFrom[projectionField] +
                (sampledRecord.projectionTo[projectionField] -
                  sampledRecord.projectionFrom[projectionField]) *
                  clampedProgress
            ])
          );
          const recordScale =
            (projectionAtRecord.height *
              (1 -
                projectionAtRecord.weight +
                (projectionAtRecord.weight * Math.max(0.001, slideDepth)) /
                  Math.max(0.001, projectionAtRecord.distance))) /
            2;
          // 缩放补偿：让「该楼层的等效透视」在当前帧的相机参数下保持一致，
          // 于是相机推拉时楼层的观感大小不会突变。
          const scaleCorrection = slideScale / Math.max(0.001, recordScale);
          slideFrame.premultiply(
            new three.Matrix4().makeScale(scaleCorrection, scaleCorrection, scaleCorrection)
          );
          // 同上：缩放以原点为中心，需把纵深偏移补回来。
          slideFrame.elements[14] += slideDepth * (scaleCorrection - 1);
          sampledRecord.scrollOffset =
            (slideState.order.indexOf(sampledRecord.id) - sampledRecord.scrollPosition) *
            slideState.screenSpacing *
            slideScale;
          slideFrame.elements[13] += sampledRecord.scrollOffset;
          if (!sampledRecord.keep) {
            // 离场楼层额外推远，并在最后 25% 进度里加速淡出。
            const exitDirection = Math.sign(
              slideState.order.indexOf(sampledRecord.id) - slideState.scrollTo
            );
            const exitExtra =
              sampledRecord.scrollExitExtra ??
              Math.max(
                0,
                1.14 +
                  (sampledRecord.scrollExitExtent || 0) -
                  Math.abs(slideState.order.indexOf(sampledRecord.id) - slideState.scrollTo) *
                    slideState.screenSpacing
              );
            // 0.75 之后才开始淡出，且用 smoothstep 的二次形式避免线性淡出的生硬感。
            const exitFade = Math.max(0, Math.min(1, (clampedProgress - 0.75) / 0.21));
            slideFrame.elements[13] +=
              exitDirection * exitExtra * slideScale * exitFade * exitFade * (3 - exitFade * 2);
          }
        }
        computeCameraFrame(cameraSpec)
          .multiply(slideFrame)
          .decompose(
            sampledRecord.node.position,
            sampledRecord.node.quaternion,
            sampledRecord.node.scale
          );
      } else {
        // 兜底路径：纯线性插值，不依赖相机。离场层用二次缓动做出「被抽走」的速度感。
        const easedProgress = sampledRecord.departureEase
          ? clampedProgress * clampedProgress
          : clampedProgress;
        sampledRecord.node.position.lerpVectors(
          sampledRecord.from.position,
          sampledRecord.to.position,
          easedProgress
        );
        sampledRecord.node.quaternion.slerpQuaternions(
          sampledRecord.from.quaternion,
          sampledRecord.to.quaternion,
          easedProgress
        );
        sampledRecord.node.scale.lerpVectors(
          sampledRecord.from.scale,
          sampledRecord.to.scale,
          easedProgress
        );
      }
      sampledRecord.node.updateMatrixWorld(true);
      // 地面透明度插值：新楼层地面从 0 淡入，离场楼层地面淡出到 0。
      sampledRecord.groundAlpha =
        sampledRecord.groundFrom +
        (sampledRecord.groundTo - sampledRecord.groundFrom) * clampedProgress;
      for (const recordGroundEntry of sampledRecord.ground) {
        recordGroundEntry.materials.forEach((groundMaterial, materialIndex) => {
          // 接触阴影的 alpha 恒定（它必须始终贴着地面），其余地面材质参与淡入淡出。
          groundMaterial.opacity =
            recordGroundEntry.opacity[materialIndex] *
            (recordGroundEntry.followsFloor ? 1 : sampledRecord.groundAlpha);
        });
      }
    }
    // 通知外部：本帧只改了对象变换，可以走「不重建场景」的轻量重绘路径。
    onInvalidate(false);
    if (clampedProgress === 1) {
      // 走到终点立刻收尾，避免过渡状态一直挂着导致后续操作被当成「过渡中」。
      finishTransition();
    }
  }
  // 对外接口：capture/take/reuse 负责把楼层从场景里取出与放回，
  // begin/sample/finish 驱动动画，setSlideCameras 在动画前补齐相机数据。
  return {
    capture: captureFloors,
    take: takeRecords,
    // reuse 用于「上一轮取出的楼层」复用给新场景，避免重建几何。
    reuse: reuseRecord,
    begin: beginTransition,
    sample: sampleTransition,
    setSlideCameras: prepareSlideCameras,
    finish: finishTransition,
    get active() {
      return isTransitionActive;
    },
    get records() {
      return activeRecords;
    }
  };
}
