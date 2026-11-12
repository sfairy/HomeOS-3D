/**
 * Q01/Q03：场景就绪后的着色器 idle fill + 近场 lite→full 调度。
 *
 * 从 `waitForSceneReady` 拆出，压 `scene-layers-and-floor-build` 行数。
 */
import {
  precompileShaderPrograms,
  scheduleIdleShaderPrecompileFill,
  visiblePrecompileBudgetMs,
} from '../../scene/studio-shader-precompile'
import { scheduleNearbyModelUpgradesAfterReady } from '../persistence/nearby-model-upgrades'

type WarmupRuntime = Parameters<typeof scheduleNearbyModelUpgradesAfterReady>[0]['runtime']

/** 可见优先预编译 → idle fill → 近场模型升级。 */
export async function completeSceneReadyWarmup(params: {
  runtime: WarmupRuntime
  floors: Parameters<typeof precompileShaderPrograms>[0]
  scene: Parameters<typeof precompileShaderPrograms>[1]
  camera: Parameters<typeof precompileShaderPrograms>[2]
  sceneRoot: unknown
  isSceneStable: () => boolean
}): Promise<void> {
  const { runtime, floors, scene, camera, sceneRoot, isSceneStable } = params
  try {
    // Q01：可见优先 → 尽快让出首帧；非可见 program 交给 idle fill。
    await precompileShaderPrograms(floors, scene, camera, isSceneStable, {
      visibleOnly: true,
      pollInterval: 16,
      budgetMs: visiblePrecompileBudgetMs,
    })
  } catch {
    /* 着色器预编译是预热优化：失败时退回按需编译，不影响渲染正确性 */
  }
  scheduleIdleShaderPrecompileFill(floors, scene, camera, isSceneStable)
  // Q03：首帧后闲时对近场 lite→full（聚焦类型若有则优先）
  scheduleNearbyModelUpgradesAfterReady({
    runtime,
    isSceneStable,
    camera,
    sceneRoot,
  })
}
