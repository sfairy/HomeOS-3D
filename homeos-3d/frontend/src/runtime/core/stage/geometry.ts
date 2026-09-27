/*
 * 几何与相机位姿换算。
 */

// 通用设备品类清单只此一处（device-profiles.js 零依赖）：别在这里再抄一遍品类名。
import { isGenericDeviceKind } from "../../device/device-profiles.js";

/**
 * 窗帘帘型取值，与上游 0.6.5 同集合：standard 普通窗帘 / roller 卷帘 / dream 梦幻帘。
 */
const CURTAIN_COVER_KINDS = ["standard", "roller", "dream"] as const;

type Vec3 = [number, number, number] | number[];

type CameraPose = {
  mode?: string;
  zoom?: number;
  position?: Vec3;
  target?: Vec3;
  up?: Vec3;
  frameSize?: number;
  focalLength?: number;
  view?: string;
  topRotation?: number;
  [key: string]: unknown;
};

type Vector3Like = {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => Vector3Like;
  sub: (other: Vector3Like) => Vector3Like;
  distanceTo: (other: Vector3Like) => number;
  lengthSq: () => number;
  normalize: () => Vector3Like;
  toArray: () => number[];
  dot: (other: Vector3Like) => number;
};

type StageGeometryCtx = {
  THREE: {
    Vector3: new (...args: number[]) => Vector3Like;
    Vector2: new (x: number, y: number) => unknown;
    MathUtils: { degToRad: (degrees: number) => number };
    Raycaster: new () => {
      setFromCamera: (ndc: unknown, camera: unknown) => void;
      ray: {
        intersectPlane: (plane: unknown, target: Vector3Like) => Vector3Like | null;
      };
    };
    Plane: new (normal: Vector3Like, constant: number) => unknown;
  };
  stageOptions: {
    constrainCameraPose: (pose: CameraPose) => CameraPose;
    transformCamera?: (
      pose: CameraPose,
      floorSelectionId: unknown,
      absolute: boolean
    ) => CameraPose;
    cameraState: (absolute: boolean) => CameraPose;
    worldPoint: (
      floorId: unknown,
      x: number,
      y: number,
      height: unknown
    ) => Vector3Like | null;
    presentationRay?: (floorId: unknown, ndc: unknown, raycaster: unknown) => void;
    camera: unknown;
  };
  config: { floorSelection?: unknown };
  containerElement: HTMLElement;
};

type SceneItemSource = {
  curtainPreview?: unknown;
  curtainForm?: string;
  width?: unknown;
  curtainPosition?: string;
  curtainTrack?: string;
  curtainCorner?: unknown;
  curtainLeftLength?: unknown;
  curtainRightLength?: unknown;
  curtainMeet?: unknown;
  curtainFabric?: string;
  [key: string]: unknown;
};

type CurtainItemConfig = {
  coverKindOverride?: boolean;
  coverKind?: string;
  curtainFabricOverride?: boolean;
  curtainFabric?: string;
  unboundPosition?: number;
  [key: string]: unknown;
};

type DragBinding = {
  floorId: unknown;
  height: unknown;
};

export function createStageGeometry(ctx: StageGeometryCtx) {
  /**
   * 归一化窗帘几何参数：宽度、开合方式、帘型、轨道形状、布料与未绑定预览开合度。
   */
  function resolveCurtainGeometry(
    sceneItemSource: SceneItemSource | null | undefined,
    itemConfig: CurtainItemConfig = {}
  ) {
    // 场景模型的开合预览：模型没写这个字段时（undefined）保持缺失，由下游定默认值；
    const sceneCurtainPreview = Number(sceneItemSource?.curtainPreview);
    // 帘型（standard 普通窗帘 / roller 卷帘 / dream 梦幻帘）默认是**模型**的属性（与
    const modelCurtainForm =
      sceneItemSource?.curtainForm === "roller"
        ? "roller"
        : "standard";
    const coverKind =
      itemConfig.coverKindOverride === true
        ? (CURTAIN_COVER_KINDS as readonly string[]).includes(itemConfig.coverKind || "")
          ? itemConfig.coverKind
          : "standard"
        : modelCurtainForm === "roller"
          ? "roller"
          : (CURTAIN_COVER_KINDS as readonly string[]).includes(itemConfig.coverKind || "")
            ? itemConfig.coverKind
            : "standard";
    return {
      curtainWidth: Number(sceneItemSource?.width) || 1.8,
      curtainPosition: sceneItemSource?.curtainPosition || "split",
      // 帘型只认 curtainForm：舞台把这份结果直接当窗帘绑定
      coverKind,
      // 卷帘没有轨道形态：强制直线型，与工作室的 normalizeCurtainTrack 收敛口径一致，
      curtainTrack:
        coverKind === "roller" ? "straight" : sceneItemSource?.curtainTrack || "straight",
      curtainCorner: sceneItemSource?.curtainCorner,
      curtainLeftLength: sceneItemSource?.curtainLeftLength,
      curtainRightLength: sceneItemSource?.curtainRightLength,
      curtainMeet: sceneItemSource?.curtainMeet,
      // 帘布：默认以**户型模型**为准（同一副帘在户型里画的是什么布就是什么布）；
      curtainFabric:
        itemConfig.curtainFabricOverride === true
          ? itemConfig.curtainFabric === "sheer"
            ? "sheer"
            : "cloth"
          : sceneItemSource?.curtainFabric || itemConfig.curtainFabric || "cloth",
      // 未绑定的预览开合度：配置优先，其次模型自带的预览值。两者都没有时**故意留空** ——
      unboundPosition: Number.isFinite(itemConfig.unboundPosition)
        ? itemConfig.unboundPosition
        : Number.isFinite(sceneCurtainPreview)
          ? sceneCurtainPreview
          : undefined
    };
  }

  // 比较两个相机姿态是否等价：缩放用 1e-6 容差、位置分量用更小的容差。
  function cameraPosesEqual(poseA: CameraPose, poseB: CameraPose) {
    return (
      poseA.mode === poseB.mode &&
      Math.abs((poseA.zoom || 0) - (poseB.zoom || 0)) < 0.000001 &&
      (["position", "target", "up"] as const).every(poseKey =>
        (poseA[poseKey] || [0, 1, 0]).every(
          (poseValue: number, poseValueIndex: number) =>
            Math.abs(poseValue - (poseB[poseKey] || [0, 1, 0])[poseValueIndex]) < 0.000001
        )
      ) &&
      (["frameSize", "focalLength"] as const).every(
        numberKey => Math.abs((Number(poseA[numberKey]) || 0) - (Number(poseB[numberKey]) || 0)) < 0.000001
      )
    );
  }

  // 约束相机姿态：非俯视（top）视图要夹住缩放与目标点，
  function constrainCameraPose(cameraPose: CameraPose | null | undefined) {
    if (!cameraPose) {
      return cameraPose;
    }
    if (cameraPose.view !== "top") {
      return ctx.stageOptions.constrainCameraPose({
        ...cameraPose,
        up: [0, 1, 0]
      });
    }
    const poseTargetPoint = new ctx.THREE.Vector3(...(cameraPose.target || [0, 0, 0]));
    const topViewHeight = Math.max(
      new ctx.THREE.Vector3(...(cameraPose.position || [0, 0, 0])).distanceTo(poseTargetPoint),
      0.001
    );
    const topRotationRad = ctx.THREE.MathUtils.degToRad(cameraPose.topRotation || 0);
    const upVector = new ctx.THREE.Vector3(
      ...(cameraPose.up || [Math.sin(topRotationRad), 0, -Math.cos(topRotationRad)])
    );
    upVector.y = 0;
    if (upVector.lengthSq() < 1e-12) {
      upVector.set(Math.sin(topRotationRad), 0, -Math.cos(topRotationRad));
    }
    return ctx.stageOptions.constrainCameraPose({
      ...cameraPose,
      position: [poseTargetPoint.x, poseTargetPoint.y + topViewHeight, poseTargetPoint.z],
      up: upVector.normalize().toArray()
    });
  }

  // 相机姿态一律经宿主转换：舞台侧存的是「相对楼层」坐标，由宿主叠加楼层抬升。
  const transformCameraPose = (
    pose: CameraPose,
    floorSelectionId: unknown = ctx.config.floorSelection,
    absolute = false
  ) => ctx.stageOptions.transformCamera?.(pose, floorSelectionId, absolute) ?? pose;

  // 取当前相机在世界坐标下的姿态快照，用于恢复视角与判断相机是否变化。
  const currentCameraSnapshot = () =>
    transformCameraPose(ctx.stageOptions.cameraState(true), ctx.config.floorSelection, true);

  // 把指针位置换算成该楼层的平面坐标；指针没有落在楼层上时返回 null。
  function pointerToFloorPoint(
    dragPointerEvent: { clientX: number; clientY: number },
    dragBinding: DragBinding
  ) {
    const floorOrigin = ctx.stageOptions.worldPoint(dragBinding.floorId, 0, 0, dragBinding.height);
    if (!floorOrigin) {
      return null;
    }
    const canvasContainerRect = ctx.containerElement.getBoundingClientRect();
    const raycaster = new ctx.THREE.Raycaster();
    const pointerNdc = new ctx.THREE.Vector2(
      ((dragPointerEvent.clientX - canvasContainerRect.left) / canvasContainerRect.width) * 2 - 1,
      1 - ((dragPointerEvent.clientY - canvasContainerRect.top) / canvasContainerRect.height) * 2
    );
    if (ctx.stageOptions.presentationRay) {
      ctx.stageOptions.presentationRay(dragBinding.floorId, pointerNdc, raycaster);
    } else {
      raycaster.setFromCamera(pointerNdc, ctx.stageOptions.camera);
    }
    const hitPoint = raycaster.ray.intersectPlane(
      new ctx.THREE.Plane(new ctx.THREE.Vector3(0, 1, 0), -floorOrigin.y),
      new ctx.THREE.Vector3()
    );
    if (!hitPoint) {
      return null;
    }
    const xAxisOrigin = ctx.stageOptions.worldPoint(
      dragBinding.floorId,
      1,
      0,
      dragBinding.height
    );
    const yAxisOrigin = ctx.stageOptions.worldPoint(
      dragBinding.floorId,
      0,
      1,
      dragBinding.height
    );
    if (!xAxisOrigin || !yAxisOrigin) {
      return null;
    }
    const xAxisVector = xAxisOrigin.sub(floorOrigin);
    const yAxisVector = yAxisOrigin.sub(floorOrigin);
    const offsetVector = hitPoint.sub(floorOrigin);
    return {
      x: Math.round((offsetVector.dot(xAxisVector) / xAxisVector.lengthSq()) * 100) / 100,
      y: Math.round((offsetVector.dot(yAxisVector) / yAxisVector.lengthSq()) * 100) / 100
    };
  }

  // 这几类设备点标记后会弹出面板（聚焦流程）；其余绑定点一下就是就地执行，不进聚焦态。
  const isFocusableDevice = (device: { deviceKind?: unknown } | null | undefined) =>
    ["lock", "nas", "television", "vacuum", "presence", "camera"].includes(
      String(device?.deviceKind || "")
    ) || isGenericDeviceKind(device?.deviceKind);
  return {
    cameraPosesEqual,
    constrainCameraPose,
    currentCameraSnapshot,
    isFocusableDevice,
    pointerToFloorPoint,
    resolveCurtainGeometry,
    transformCameraPose
  };
}
