/**
 * 楼层切换动画的外部依赖。
 * 本模块只做「把楼层节点搬进搬出、按进度插值」这件事，取根对象、回收节点、暂停反射都交给调用方。
 */
type FloorTransitionOptions = {
  THREE: any;
  /** 承载所有楼层节点的根对象。 */
  getRoot: () => any;
  /** 记录彻底离场时回收它的节点；released 返回 true 时不会再走这里。 */
  dispose: (node: any) => void;
  /** 返回 true 表示调用方自己接管离场节点，本模块不再 dispose。 */
  release?: (record: any) => boolean;
  /** 过渡期间暂停 / 恢复地面反射。 */
  suspendReflections?: (shouldSuspend: boolean) => void;
  /** 请求重绘；参数为 true 表示需要立即刷新。 */
  invalidate?: (isImmediate: boolean) => void;
};

export function createFloorTransition({
  THREE: three,
  getRoot: getRootObject,
  dispose: onDispose,
  release: onRelease = () => false,
  suspendReflections: onSuspendReflections = () => {},
  invalidate: onInvalidate = () => {},
}: FloorTransitionOptions) {
  let activeRecords = [],
    isTransitionActive = false,
    slideState = null,
    exitState = null,
    assemblyState = null;
  const decomposeMatrix = (matrix) => {
      const positionVector = new three.Vector3(),
        quaternionValue = new three.Quaternion(),
        scaleVector = new three.Vector3();
      return (
        matrix.decompose(positionVector, quaternionValue, scaleVector),
        {
          position: positionVector,
          quaternion: quaternionValue,
          scale: scaleVector,
        }
      );
    },
    resolveBoundingBox = (sourceMesh) => {
      const boundsSource = sourceMesh.isInstancedMesh ? sourceMesh : sourceMesh.geometry;
      return (
        boundsSource.boundingBox || boundsSource.computeBoundingBox(),
        boundsSource.boundingBox
      );
    };
  function captureFloors(captureFloorIds, getBaseFrame, groupByFloorId) {
    const rootObject = getRootObject();
    return (
      rootObject.updateMatrixWorld(true),
      captureFloorIds.map((floorId) => {
        const floorGroup = new three.Group();
        ((floorGroup.name = "floor-transition-" + floorId),
          (floorGroup.userData.floorId = floorGroup.userData.regionFloorId = floorId));
        const sourceChildren = groupByFloorId
          ? rootObject.children.filter((matchedChild) => matchedChild.userData.floorId === floorId)
          : [...rootObject.children];
        rootObject.add(floorGroup);
        for (const childObject of sourceChildren) floorGroup.attach(childObject);
        const record = {
          id: floorId,
          node: floorGroup,
          baseFrame: getBaseFrame(floorId),
          ground: [],
          groundAlpha: 1,
        };
        return (
          floorGroup.traverse((sceneNode) => {
            if (
              !sceneNode.material ||
              !["background", "grid", "contact-shadow"].includes(sceneNode.userData?.exportRole)
            )
              return;
            const originalMaterial = sceneNode.material,
              cloneGroundMaterial = (material) => {
                const clonedMaterial = material.clone();
                return (
                  (clonedMaterial.onBeforeCompile = material.onBeforeCompile),
                  (clonedMaterial.customProgramCacheKey =
                    material.customProgramCacheKey.bind(material)),
                  (clonedMaterial.transparent = true),
                  (clonedMaterial.depthWrite = false),
                  clonedMaterial
                );
              };
            ((sceneNode.material = Array.isArray(originalMaterial)
              ? originalMaterial.map(cloneGroundMaterial)
              : cloneGroundMaterial(originalMaterial)),
              record.ground.push({
                node: sceneNode,
                followsFloor: sceneNode.userData.exportRole === "contact-shadow",
                original: originalMaterial,
                materials: Array.isArray(sceneNode.material)
                  ? sceneNode.material
                  : [sceneNode.material],
                opacity: (Array.isArray(originalMaterial)
                  ? originalMaterial
                  : [originalMaterial]
                ).map((sourceMaterial) => sourceMaterial.opacity),
              }));
          }),
          record
        );
      })
    );
  }
  function computeRecordFrame(capturedRecord) {
    return (
      capturedRecord.node.updateMatrix(),
      capturedRecord.node.matrix.clone().multiply(capturedRecord.baseFrame)
    );
  }
  function restoreGroundMaterials(floorRecord) {
    for (const groundEntry of floorRecord.ground) {
      groundEntry.node.material = groundEntry.original;
      for (const disposableMaterial of groundEntry.materials) disposableMaterial.dispose();
    }
    floorRecord.ground = [];
  }
  function detachRecord(leavingRecord, shouldDispose = true) {
    (restoreGroundMaterials(leavingRecord),
      leavingRecord.node.removeFromParent(),
      !leavingRecord.transferred &&
        !(shouldDispose && onRelease(leavingRecord)) &&
        onDispose(leavingRecord.node));
  }
  function reuseRecord(cachedRecord, targetFrame) {
    restoreGroundMaterials(cachedRecord);
    const cachedChildren = [...cachedRecord.node.children];
    let reusedNode;
    if (cachedChildren.length === 1 && cachedChildren[0].userData.floorId === cachedRecord.id)
      ((reusedNode = cachedChildren[0]), cachedRecord.node.remove(reusedNode));
    else {
      ((reusedNode = new three.Group()),
        (reusedNode.name = "floor-" + cachedRecord.id),
        (reusedNode.userData.floorId = reusedNode.userData.regionFloorId = cachedRecord.id));
      for (const cachedChild of cachedChildren)
        (cachedRecord.node.remove(cachedChild), reusedNode.add(cachedChild));
    }
    return (
      reusedNode.applyMatrix4(
        targetFrame.clone().multiply(cachedRecord.baseFrame.clone().invert()),
      ),
      getRootObject().add(reusedNode),
      reusedNode.updateMatrixWorld(true),
      (cachedRecord.transferred = true),
      reusedNode
    );
  }
  function takeRecords(takeFloorIds, resolveBaseFrame, takeGroupByFloorId) {
    onSuspendReflections(true);
    const takenRecords = isTransitionActive
      ? activeRecords
      : captureFloors(takeFloorIds, resolveBaseFrame, takeGroupByFloorId);
    for (const takenRecord of takenRecords)
      ((takenRecord.frame = computeRecordFrame(takenRecord)), takenRecord.node.removeFromParent());
    return (
      (activeRecords = []),
      (isTransitionActive = false),
      (slideState = null),
      (exitState = null),
      (assemblyState = null),
      takenRecords
    );
  }
  function beginTransition(
    previousRecords,
    nextRecords,
    floorOrder,
    floorSpread,
    isScrollTransition = false,
    scrollAxis = null,
    targetFloorId = null,
  ) {
    const sceneRoot = getRootObject(),
      // 显式标注键值类型：previousRecords / nextRecords 是 any[]，Map 构造器推不出元素类型，
      // 不标注的话 .get() 会退化成 unknown，后面的 previousRecord?.frame 之类全部报错。
      previousById = new Map<string, any>(
        previousRecords.map((previousEntry) => [previousEntry.id, previousEntry]),
      ),
      nextById = new Map<string, any>(nextRecords.map((nextEntry) => [nextEntry.id, nextEntry])),
      focusRecord =
        nextRecords.find((targetCandidate) => targetCandidate.id === targetFloorId) ||
        nextRecords.find((keptCandidate) => previousById.get(keptCandidate.id)?.keep) ||
        nextRecords.find((sharedCandidate) => previousById.has(sharedCandidate.id)) ||
        nextRecords[0],
      anchorRecord = previousById.get(focusRecord.id) || previousRecords[0],
      handoffMatrix =
        !isScrollTransition && nextRecords.length > 1
          ? anchorRecord.frame.clone().multiply(focusRecord.baseFrame.clone().invert())
          : null;
    ((assemblyState = handoffMatrix ? decomposeMatrix(handoffMatrix) : null),
      assemblyState && (assemblyState.anchorId = focusRecord.id));
    const keptPreviousRecord =
        previousRecords.find((keptEntry) => keptEntry.keep) || previousRecords[0],
      orderIndexOf = (orderFloorId) => floorOrder.indexOf(orderFloorId),
      scrollAnchorRecord = previousRecords.find((scrollingEntry) =>
        Number.isFinite(scrollingEntry.scrollPosition),
      ),
      offsetFrameBySteps = (frameMatrix, stepDelta) => {
        const offsetFrame = frameMatrix.clone(),
          offsetMeters = stepDelta * floorSpread,
          axisVector = isScrollTransition && scrollAxis ? scrollAxis : new three.Vector3(0, 1, 0);
        return (
          (offsetFrame.elements[12] += axisVector.x * offsetMeters),
          (offsetFrame.elements[13] += axisVector.y * offsetMeters),
          (offsetFrame.elements[14] += axisVector.z * offsetMeters),
          offsetFrame
        );
      };
    activeRecords = [];
    for (const nextRecord of nextRecords) {
      const previousRecord = previousById.get(nextRecord.id),
        recordFrame =
          previousRecord?.frame ||
          offsetFrameBySteps(
            anchorRecord.frame,
            orderIndexOf(nextRecord.id) - orderIndexOf(anchorRecord.id),
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
      ((nextRecord.assemblyRelative = handoffMatrix
        ? decomposeMatrix(handoffMatrix.clone().invert().multiply(assemblyFrame))
        : null),
        assemblyFrame.decompose(
          nextRecord.node.position,
          nextRecord.node.quaternion,
          nextRecord.node.scale,
        ),
        (nextRecord.scrollOffset = previousRecord?.scrollOffset),
        (nextRecord.wasVisible = !!previousRecord),
        (nextRecord.from = decomposeMatrix(assemblyFrame)),
        (nextRecord.to = decomposeMatrix(new three.Matrix4())),
        (nextRecord.keep = !isScrollTransition || nextRecord.id === focusRecord.id),
        (nextRecord.node.userData.floorTransitionLeaving = !nextRecord.keep),
        (nextRecord.groundFrom = previousRecord?.groundAlpha ?? 0),
        (nextRecord.groundTo = nextRecord.keep ? 1 : 0),
        activeRecords.push(nextRecord),
        previousRecord && detachRecord(previousRecord, false));
    }
    for (const restoredRecord of previousRecords) {
      if (nextById.has(restoredRecord.id)) continue;
      sceneRoot.add(restoredRecord.node);
      const restoredFrame = offsetFrameBySteps(
        focusRecord.baseFrame,
        orderIndexOf(restoredRecord.id) - orderIndexOf(focusRecord.id),
      );
      ((restoredRecord.from = decomposeMatrix(restoredRecord.node.matrix)),
        (restoredRecord.to = decomposeMatrix(
          restoredFrame.multiply(restoredRecord.baseFrame.clone().invert()),
        )),
        (restoredRecord.keep = false),
        (restoredRecord.node.userData.floorTransitionLeaving = true),
        (restoredRecord.wasVisible = true),
        (restoredRecord.groundFrom = restoredRecord.groundAlpha),
        (restoredRecord.groundTo = 0),
        activeRecords.push(restoredRecord));
    }
    if (
      ((slideState = isScrollTransition
        ? {
            spread: scrollAnchorRecord?.scrollSpacing || floorSpread,
            order: [...floorOrder],
            screenSpacing: scrollAnchorRecord?.scrollScreenSpacing,
            scrollFrom: scrollAnchorRecord?.scrollPosition ?? orderIndexOf(keptPreviousRecord.id),
            scrollTo: orderIndexOf(focusRecord.id),
          }
        : null),
      (exitState =
        !isScrollTransition && nextRecords.length === 1
          ? {
              target: focusRecord.id,
              order: [...floorOrder],
            }
          : null),
      !slideState)
    ) {
      for (const staleRecord of activeRecords)
        (delete staleRecord.scrollPosition,
          delete staleRecord.scrollSpacing,
          delete staleRecord.scrollScreenSpacing,
          delete staleRecord.scrollOffset);
    }
    for (const easeRecord of activeRecords)
      easeRecord.departureEase =
        !isScrollTransition && nextRecords.length === 1 && !easeRecord.keep;
    ((isTransitionActive = true), onSuspendReflections(true), sampleTransition(0));
  }
  function finishTransition() {
    if (!isTransitionActive && !activeRecords.length) return;
    const finishRoot = getRootObject();
    for (const finishedRecord of activeRecords)
      if (finishedRecord.keep && finishedRecord.node.parent === finishRoot) {
        (finishedRecord.node.position.set(0, 0, 0),
          finishedRecord.node.quaternion.identity(),
          finishedRecord.node.scale.set(1, 1, 1),
          finishedRecord.node.updateMatrixWorld(true),
          restoreGroundMaterials(finishedRecord));
        for (const releasedChild of [...finishedRecord.node.children])
          finishRoot.attach(releasedChild);
        finishedRecord.node.removeFromParent();
      } else detachRecord(finishedRecord);
    ((activeRecords = []),
      (isTransitionActive = false),
      (slideState = null),
      (exitState = null),
      (assemblyState = null),
      onSuspendReflections(false),
      onInvalidate(true));
  }
  const computeCameraFrame = (cameraDescriptor) => {
    const cameraPosition = new three.Vector3().fromArray(cameraDescriptor.position),
      cameraTarget = new three.Vector3().fromArray(cameraDescriptor.target);
    return new three.Matrix4()
      .lookAt(
        cameraPosition,
        cameraTarget,
        new three.Vector3().fromArray(cameraDescriptor.up || [0, 1, 0]),
      )
      .setPosition(cameraPosition);
  };
  function prepareSlideCameras(fromCameraSpec, toCameraSpec, projections = null) {
    if (assemblyState && projections) {
      const fromViewMatrix = computeCameraFrame(fromCameraSpec).invert(),
        toViewMatrix = computeCameraFrame(toCameraSpec).invert(),
        assemblyAnchorRecord = activeRecords.find(
          (anchorEntry) => anchorEntry.id === assemblyState.anchorId,
        ),
        centersById = new Map(
          activeRecords.map((centerRecord) => {
            const worldBounds = new three.Box3();
            centerRecord.node.updateWorldMatrix(true, true);
            const inverseNodeWorld = centerRecord.node.matrixWorld.clone().invert();
            return (
              centerRecord.node.traverseVisible((meshNode) => {
                if (
                  !meshNode.isMesh ||
                  !meshNode.geometry ||
                  ["background", "grid", "contact-shadow"].includes(meshNode.userData?.exportRole)
                )
                  return;
                const meshBounds = resolveBoundingBox(meshNode);
                meshBounds &&
                  worldBounds.union(
                    meshBounds
                      .clone()
                      .applyMatrix4(inverseNodeWorld.clone().multiply(meshNode.matrixWorld)),
                  );
              }),
              [
                centerRecord.id,
                worldBounds.isEmpty()
                  ? new three.Vector3().setFromMatrixPosition(centerRecord.baseFrame)
                  : worldBounds.getCenter(new three.Vector3()),
              ]
            );
          }),
        ),
        anchorCenter = centersById
          .get(assemblyAnchorRecord.id)
          .clone()
          .applyMatrix4(
            new three.Matrix4().compose(
              assemblyAnchorRecord.from.position,
              assemblyAnchorRecord.from.quaternion,
              assemblyAnchorRecord.from.scale,
            ),
          )
          .applyMatrix4(fromViewMatrix);
      for (const assemblyRecord of activeRecords) {
        const recordCenter = centersById.get(assemblyRecord.id),
          recordWorldFrame = fromViewMatrix
            .clone()
            .multiply(
              new three.Matrix4().compose(
                assemblyRecord.from.position,
                assemblyRecord.from.quaternion,
                assemblyRecord.from.scale,
              ),
            ),
          toViewFrame = toViewMatrix.clone(),
          screenFrom = recordCenter.clone().applyMatrix4(recordWorldFrame),
          screenTo = recordCenter.clone().applyMatrix4(toViewFrame);
        if (!assemblyRecord.wasVisible) {
          const anchorProjectionScale = projectedScaleAtDepth(projections.from, -anchorCenter.z),
            assemblySign =
              (assemblyRecord.assemblyOffset /
                Math.max(0.001, Math.abs(assemblyRecord.assemblyOffset))) *
              1.8;
          (screenFrom.copy(anchorCenter), (screenFrom.y += assemblySign * anchorProjectionScale));
          const closerCount = activeRecords.filter(
            (otherRecord) =>
              !otherRecord.wasVisible &&
              Math.sign(otherRecord.assemblyOffset) === Math.sign(assemblyRecord.assemblyOffset) &&
              Math.abs(otherRecord.assemblyOffset) < Math.abs(assemblyRecord.assemblyOffset),
          ).length;
          screenFrom.y += assemblySign * anchorProjectionScale * closerCount;
        }
        const projectToScreenSpace = (worldPoint, screenProjection) => {
            const depthScale = projectedScaleAtDepth(screenProjection, -worldPoint.z);
            return new three.Vector3(
              worldPoint.x / depthScale,
              worldPoint.y / depthScale,
              -worldPoint.z,
            );
          },
          screenStart = projectToScreenSpace(screenFrom, projections.from),
          screenEnd = projectToScreenSpace(screenTo, projections.to);
        (assemblyRecord.wasVisible || (screenStart.x = screenEnd.x),
          (assemblyRecord.assemblyScreen = {
            pivot: recordCenter,
            from: decomposeMatrix(assemblyRecord.wasVisible ? recordWorldFrame : toViewFrame),
            to: decomposeMatrix(toViewFrame),
            start: screenStart,
            end: screenEnd,
          }));
      }
      return;
    }
    if (!slideState) {
      if (!exitState || !projections) return;
      const exitViewMatrix = computeCameraFrame(fromCameraSpec).invert();
      for (const exitingRecord of activeRecords) {
        if (exitingRecord.keep) continue;
        const exitStartFrame = exitViewMatrix
            .clone()
            .multiply(
              new three.Matrix4().compose(
                exitingRecord.from.position,
                exitingRecord.from.quaternion,
                exitingRecord.from.scale,
              ),
            ),
          exitSign = Math.sign(
            exitState.order.indexOf(exitingRecord.id) - exitState.order.indexOf(exitState.target),
          );
        let exitLift = 0;
        exitingRecord.node.updateWorldMatrix(true, true);
        const inverseExitWorld = exitingRecord.node.matrixWorld.clone().invert();
        (exitingRecord.node.traverseVisible((exitMeshNode) => {
          if (
            !exitMeshNode.isMesh ||
            !exitMeshNode.geometry ||
            ["background", "grid", "contact-shadow"].includes(exitMeshNode.userData?.exportRole)
          )
            return;
          const exitMeshBounds = resolveBoundingBox(exitMeshNode);
          if (!exitMeshBounds || exitMeshBounds.isEmpty()) return;
          const boundsToWorld = exitStartFrame
            .clone()
            .multiply(inverseExitWorld)
            .multiply(exitMeshNode.matrixWorld);
          for (const exitCornerX of [exitMeshBounds.min.x, exitMeshBounds.max.x])
            for (const exitCornerY of [exitMeshBounds.min.y, exitMeshBounds.max.y])
              for (const exitCornerZ of [exitMeshBounds.min.z, exitMeshBounds.max.z]) {
                const cornerPoint = new three.Vector3(
                  exitCornerX,
                  exitCornerY,
                  exitCornerZ,
                ).applyMatrix4(boundsToWorld);
                for (const exitProjection of [projections.from, projections.to]) {
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
        }),
          (exitingRecord.exitFrom = decomposeMatrix(exitStartFrame)),
          (exitStartFrame.elements[13] += exitSign * exitLift),
          (exitingRecord.exitTo = decomposeMatrix(exitStartFrame)));
      }
      return;
    }
    ((slideState.from = computeCameraFrame(fromCameraSpec).invert()),
      (slideState.to = computeCameraFrame(toCameraSpec).invert()),
      (slideState.projected = !!projections),
      (slideState.projections = projections));
    const withVerticalOffset = (baseSlideFrame, offsetY) =>
        new three.Matrix4().makeTranslation(0, offsetY, 0).multiply(baseSlideFrame),
      projectedScaleAtZ = (slideProjection, worldZ) =>
        Math.max(
          0.001,
          (slideProjection.height *
            (1 -
              slideProjection.weight +
              (slideProjection.weight * Math.max(0.001, -worldZ)) /
                Math.max(0.001, slideProjection.distance))) /
            2,
        ),
      slideCandidates = activeRecords.map((slideRecord) => {
        const worldFrame = slideState.from
          .clone()
          .multiply(
            new three.Matrix4().compose(
              slideRecord.from.position,
              slideRecord.from.quaternion,
              slideRecord.from.scale,
            ),
          );
        if (!projections)
          return {
            r: slideRecord,
            current: worldFrame,
          };
        slideRecord.node.updateWorldMatrix(true, true);
        const inverseSlideWorld = slideRecord.node.matrixWorld.clone().invert(),
          recordBounds = new three.Box3(),
          boundCorners = [];
        (slideRecord.node.traverseVisible((boundsMeshNode) => {
          if (
            !boundsMeshNode.isMesh ||
            !boundsMeshNode.geometry ||
            ["background", "grid", "contact-shadow"].includes(boundsMeshNode.userData?.exportRole)
          )
            return;
          const meshBoundingBox = resolveBoundingBox(boundsMeshNode);
          if (meshBoundingBox && !meshBoundingBox.isEmpty()) {
            const meshToWorld = inverseSlideWorld.clone().multiply(boundsMeshNode.matrixWorld);
            recordBounds.union(meshBoundingBox.clone().applyMatrix4(meshToWorld));
            for (const cornerX of [meshBoundingBox.min.x, meshBoundingBox.max.x])
              for (const cornerY of [meshBoundingBox.min.y, meshBoundingBox.max.y])
                for (const cornerZ of [meshBoundingBox.min.z, meshBoundingBox.max.z])
                  boundCorners.push(
                    new three.Vector3(cornerX, cornerY, cornerZ).applyMatrix4(meshToWorld),
                  );
          }
        }),
          (slideRecord.scrollCenter = recordBounds.isEmpty()
            ? new three.Vector3()
            : recordBounds.getCenter(new three.Vector3())),
          (slideRecord.projectionFrom = slideRecord.wasVisible ? projections.from : projections.to),
          (slideRecord.projectionTo =
            slideRecord.keep || !slideRecord.wasVisible ? projections.to : projections.from));
        let exitExtentValue = 0;
        if (!recordBounds.isEmpty()) {
          for (const [pairMatrix, pairProjection] of [
            [slideRecord.wasVisible ? worldFrame : slideState.to, slideRecord.projectionFrom],
            [
              slideRecord.keep || !slideRecord.wasVisible ? slideState.to : worldFrame,
              slideRecord.projectionTo,
            ],
          ])
            for (const cornerVector of boundCorners) {
              const transformedCorner = cornerVector.clone().applyMatrix4(pairMatrix),
                orderIndex = slideState.order.indexOf(slideRecord.id),
                directionalExtent =
                  orderIndex === 0
                    ? transformedCorner.y
                    : orderIndex === slideState.order.length - 1
                      ? -transformedCorner.y
                      : Math.abs(transformedCorner.y);
              exitExtentValue = Math.max(
                exitExtentValue,
                directionalExtent / projectedScaleAtZ(pairProjection, transformedCorner.z),
              );
            }
        }
        return (
          (slideRecord.scrollExitExtent = exitExtentValue),
          {
            r: slideRecord,
            current: worldFrame,
            extent: exitExtentValue,
            corners: boundCorners,
          }
        );
      });
    projections &&
      !Number.isFinite(slideState.screenSpacing) &&
      (slideState.screenSpacing = Math.min(
        1.8,
        Math.max(
          1.24,
          ...slideCandidates.map((extentCandidate) => 1 + extentCandidate.extent + 0.24),
        ),
      ));
    for (const {
      r: candidateRecord,
      current: candidateFrame,
      corners: candidateCorners,
    } of slideCandidates) {
      const recordOrderIndex = slideState.order.indexOf(candidateRecord.id);
      if (projections) {
        if (
          ((candidateRecord.independentDeparture =
            !candidateRecord.keep &&
            candidateRecord.wasVisible &&
            (recordOrderIndex - slideState.scrollTo) *
              (slideState.scrollTo - slideState.scrollFrom) >
              0),
          candidateRecord.wasVisible)
        ) {
          const scrollCenterPoint = candidateRecord.scrollCenter
            .clone()
            .applyMatrix4(candidateFrame);
          candidateFrame.elements[13] -=
            (recordOrderIndex - slideState.scrollFrom) *
            slideState.screenSpacing *
            projectedScaleAtZ(projections.from, scrollCenterPoint.z);
        }
        if (
          ((candidateRecord.slideFrom = decomposeMatrix(
            candidateRecord.wasVisible ? candidateFrame : slideState.to,
          )),
          (candidateRecord.slideTo = decomposeMatrix(
            candidateRecord.keep || !candidateRecord.wasVisible ? slideState.to : candidateFrame,
          )),
          !candidateRecord.keep)
        ) {
          const scaledSlideFrame = new three.Matrix4().compose(
              candidateRecord.slideTo.position,
              candidateRecord.slideTo.quaternion,
              candidateRecord.slideTo.scale,
            ),
            slideExitDepth = -candidateRecord.scrollCenter.clone().applyMatrix4(scaledSlideFrame).z,
            slideExitScale = projectedScaleAtZ(projections.to, -slideExitDepth),
            scaleRatio =
              slideExitScale / projectedScaleAtZ(candidateRecord.projectionTo, -slideExitDepth);
          (scaledSlideFrame.premultiply(
            new three.Matrix4().makeScale(scaleRatio, scaleRatio, scaleRatio),
          ),
            (scaledSlideFrame.elements[14] += slideExitDepth * (scaleRatio - 1)));
          const exitAnchorIndex = candidateRecord.independentDeparture
            ? slideState.scrollFrom
            : slideState.scrollTo;
          scaledSlideFrame.elements[13] +=
            (recordOrderIndex - exitAnchorIndex) * slideState.screenSpacing * slideExitScale;
          const slideSign = Math.sign(recordOrderIndex - slideState.scrollTo),
            exitSpacingBuffer = candidateRecord.independentDeparture
              ? 0
              : Math.abs(slideState.scrollTo - slideState.scrollFrom) *
                slideState.screenSpacing *
                0.1;
          candidateRecord.scrollExitExtra = Math.max(
            0,
            ...candidateCorners.map((corner) => {
              const cornerInFrame = corner.clone().applyMatrix4(scaledSlideFrame);
              return (
                (1.14 * projectedScaleAtZ(projections.to, cornerInFrame.z) -
                  slideSign * cornerInFrame.y) /
                  slideExitScale +
                exitSpacingBuffer
              );
            }),
          );
        }
      } else
        ((candidateRecord.slideFrom = decomposeMatrix(
          candidateRecord.wasVisible
            ? candidateFrame
            : withVerticalOffset(
                slideState.to,
                (recordOrderIndex - slideState.scrollFrom) * slideState.spread,
              ),
        )),
          (candidateRecord.slideTo = decomposeMatrix(
            candidateRecord.keep
              ? slideState.to
              : candidateRecord.wasVisible
                ? withVerticalOffset(
                    candidateFrame,
                    (slideState.scrollFrom - slideState.scrollTo) * slideState.spread,
                  )
                : withVerticalOffset(
                    slideState.to,
                    (recordOrderIndex - slideState.scrollTo) * slideState.spread,
                  ),
          )));
    }
  }
  function projectedScaleAtDepth(projectionSpec, depthValue) {
    return Math.max(
      0.001,
      (projectionSpec.height *
        (1 -
          projectionSpec.weight +
          (projectionSpec.weight * Math.max(0.001, depthValue)) /
            Math.max(0.001, projectionSpec.distance))) /
        2,
    );
  }
  function sampleTransition(progressRatio, cameraSpec = null, projectionParams = null) {
    if (!isTransitionActive) return;
    if (
      activeRecords.some(
        (staleEntry) => staleEntry.keep && staleEntry.node.parent !== getRootObject(),
      )
    ) {
      finishTransition();
      return;
    }
    const clampedProgress = Math.max(0, Math.min(1, progressRatio));
    if (!projectionParams && slideState?.projections) {
      const { from: projectionFrom, to: projectionTo } = slideState.projections;
      projectionParams = Object.fromEntries(
        ["height", "weight", "distance"].map((projectionKey) => [
          projectionKey,
          projectionFrom[projectionKey] +
            (projectionTo[projectionKey] - projectionFrom[projectionKey]) * clampedProgress,
        ]),
      );
    }
    for (const sampledRecord of activeRecords) {
      if (
        (slideState &&
          ((sampledRecord.scrollPosition =
            slideState.scrollFrom +
            (slideState.scrollTo - slideState.scrollFrom) * clampedProgress),
          (sampledRecord.scrollSpacing = slideState.spread),
          (sampledRecord.scrollScreenSpacing = slideState.screenSpacing)),
        assemblyState && sampledRecord.assemblyScreen && cameraSpec && projectionParams)
      ) {
        const assemblyScreen = sampledRecord.assemblyScreen,
          screenPoint = assemblyScreen.start.clone().lerp(assemblyScreen.end, clampedProgress),
          screenScale = projectedScaleAtDepth(projectionParams, screenPoint.z),
          screenFrame = new three.Matrix4().compose(
            new three.Vector3(),
            new three.Quaternion().slerpQuaternions(
              assemblyScreen.from.quaternion,
              assemblyScreen.to.quaternion,
              clampedProgress,
            ),
            assemblyScreen.from.scale.clone().lerp(assemblyScreen.to.scale, clampedProgress),
          ),
          pivotPoint = assemblyScreen.pivot.clone().applyMatrix4(screenFrame);
        (screenFrame.setPosition(
          new three.Vector3(
            screenPoint.x * screenScale,
            screenPoint.y * screenScale,
            -screenPoint.z,
          ).sub(pivotPoint),
        ),
          computeCameraFrame(cameraSpec)
            .multiply(screenFrame)
            .decompose(
              sampledRecord.node.position,
              sampledRecord.node.quaternion,
              sampledRecord.node.scale,
            ));
      } else {
        if (assemblyState && sampledRecord.assemblyRelative) {
          const assemblyRelative = sampledRecord.assemblyRelative,
            assemblyEase = 1 - (1 - clampedProgress) * (1 - clampedProgress),
            relativeFrame = new three.Matrix4().compose(
              new three.Vector3(
                assemblyRelative.position.x * (1 - assemblyEase),
                assemblyRelative.position.y * (1 - clampedProgress),
                assemblyRelative.position.z * (1 - assemblyEase),
              ),
              new three.Quaternion().slerpQuaternions(
                assemblyRelative.quaternion,
                new three.Quaternion(),
                assemblyEase,
              ),
              new three.Vector3().lerpVectors(
                assemblyRelative.scale,
                new three.Vector3(1, 1, 1),
                assemblyEase,
              ),
            );
          new three.Matrix4()
            .compose(
              assemblyState.position.clone().multiplyScalar(1 - clampedProgress),
              new three.Quaternion().slerpQuaternions(
                assemblyState.quaternion,
                new three.Quaternion(),
                clampedProgress,
              ),
              new three.Vector3().lerpVectors(
                assemblyState.scale,
                new three.Vector3(1, 1, 1),
                clampedProgress,
              ),
            )
            .multiply(relativeFrame)
            .decompose(
              sampledRecord.node.position,
              sampledRecord.node.quaternion,
              sampledRecord.node.scale,
            );
        } else {
          if (exitState && !sampledRecord.keep && sampledRecord.exitFrom && cameraSpec) {
            const exitEase = clampedProgress * clampedProgress,
              exitFrame = new three.Matrix4().compose(
                new three.Vector3().lerpVectors(
                  sampledRecord.exitFrom.position,
                  sampledRecord.exitTo.position,
                  exitEase,
                ),
                sampledRecord.exitFrom.quaternion,
                sampledRecord.exitFrom.scale,
              );
            computeCameraFrame(cameraSpec)
              .multiply(exitFrame)
              .decompose(
                sampledRecord.node.position,
                sampledRecord.node.quaternion,
                sampledRecord.node.scale,
              );
          } else {
            if (slideState?.from && cameraSpec) {
              const slideFrame = new three.Matrix4().compose(
                new three.Vector3().lerpVectors(
                  sampledRecord.slideFrom.position,
                  sampledRecord.slideTo.position,
                  clampedProgress,
                ),
                new three.Quaternion().slerpQuaternions(
                  sampledRecord.slideFrom.quaternion,
                  sampledRecord.slideTo.quaternion,
                  clampedProgress,
                ),
                new three.Vector3().lerpVectors(
                  sampledRecord.slideFrom.scale,
                  sampledRecord.slideTo.scale,
                  clampedProgress,
                ),
              );
              if (slideState.projected && projectionParams) {
                const slideDepth = -sampledRecord.scrollCenter.clone().applyMatrix4(slideFrame).z,
                  slideScale =
                    (projectionParams.height *
                      (1 -
                        projectionParams.weight +
                        (projectionParams.weight * Math.max(0.001, slideDepth)) /
                          Math.max(0.001, projectionParams.distance))) /
                    2,
                  projectionAtRecord = Object.fromEntries(
                    ["height", "weight", "distance"].map((projectionField) => [
                      projectionField,
                      sampledRecord.projectionFrom[projectionField] +
                        (sampledRecord.projectionTo[projectionField] -
                          sampledRecord.projectionFrom[projectionField]) *
                          clampedProgress,
                    ]),
                  ),
                  recordScale =
                    (projectionAtRecord.height *
                      (1 -
                        projectionAtRecord.weight +
                        (projectionAtRecord.weight * Math.max(0.001, slideDepth)) /
                          Math.max(0.001, projectionAtRecord.distance))) /
                    2,
                  scaleCorrection = slideScale / Math.max(0.001, recordScale);
                (slideFrame.premultiply(
                  new three.Matrix4().makeScale(scaleCorrection, scaleCorrection, scaleCorrection),
                ),
                  (slideFrame.elements[14] += slideDepth * (scaleCorrection - 1)));
                const scrollPositionAnchor = sampledRecord.independentDeparture
                  ? slideState.scrollFrom
                  : sampledRecord.scrollPosition;
                if (
                  ((sampledRecord.scrollOffset =
                    (slideState.order.indexOf(sampledRecord.id) - scrollPositionAnchor) *
                    slideState.screenSpacing *
                    slideScale),
                  (slideFrame.elements[13] += sampledRecord.scrollOffset),
                  !sampledRecord.keep)
                ) {
                  const exitDirection = Math.sign(
                      slideState.order.indexOf(sampledRecord.id) - slideState.scrollTo,
                    ),
                    exitExtra =
                      sampledRecord.scrollExitExtra ??
                      Math.max(
                        0,
                        1.14 +
                          (sampledRecord.scrollExitExtent || 0) -
                          Math.abs(
                            slideState.order.indexOf(sampledRecord.id) - slideState.scrollTo,
                          ) *
                            slideState.screenSpacing,
                      ),
                    exitFade = Math.max(
                      0,
                      Math.min(
                        1,
                        sampledRecord.independentDeparture
                          ? clampedProgress / 0.88
                          : (clampedProgress - 0.65) / 0.23,
                      ),
                    );
                  slideFrame.elements[13] +=
                    exitDirection *
                    exitExtra *
                    slideScale *
                    exitFade *
                    exitFade *
                    (3 - 2 * exitFade);
                }
              }
              computeCameraFrame(cameraSpec)
                .multiply(slideFrame)
                .decompose(
                  sampledRecord.node.position,
                  sampledRecord.node.quaternion,
                  sampledRecord.node.scale,
                );
            } else {
              const easedProgress = sampledRecord.departureEase
                ? clampedProgress * clampedProgress
                : clampedProgress;
              (sampledRecord.node.position.lerpVectors(
                sampledRecord.from.position,
                sampledRecord.to.position,
                easedProgress,
              ),
                sampledRecord.node.quaternion.slerpQuaternions(
                  sampledRecord.from.quaternion,
                  sampledRecord.to.quaternion,
                  easedProgress,
                ),
                sampledRecord.node.scale.lerpVectors(
                  sampledRecord.from.scale,
                  sampledRecord.to.scale,
                  easedProgress,
                ));
            }
          }
        }
      }
      (sampledRecord.node.updateMatrixWorld(true),
        (sampledRecord.groundAlpha =
          sampledRecord.groundFrom +
          (sampledRecord.groundTo - sampledRecord.groundFrom) * clampedProgress));
      for (const recordGroundEntry of sampledRecord.ground)
        recordGroundEntry.materials.forEach((groundMaterial, materialIndex) => {
          groundMaterial.opacity =
            recordGroundEntry.opacity[materialIndex] *
            (recordGroundEntry.followsFloor ? 1 : sampledRecord.groundAlpha);
        });
    }
    (onInvalidate(false), clampedProgress === 1 && finishTransition());
  }
  return {
    capture: captureFloors,
    take: takeRecords,
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
    },
  };
}
