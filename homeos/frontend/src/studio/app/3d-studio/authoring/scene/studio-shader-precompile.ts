/** 灯光预编译：把「切灯/切楼层」后要用的 shader program 提前编译，避免首次切灯抖一下。
 *
 * 从 `../studio-app.ts` 的巨型闭包抽出（P4 拆单体）：入参全显式，只读时间预算常量。
 */

import * as threeModuleMin from "/static/vendor/three/0.186.1/three.module.min.js";

const lightPrecompileBudgetMs = 4500;

export function precompileShaderPrograms(
  targetRenderer: any,
  targetScene: any,
  precompileShaderProgramsTargetCamera: any,
  shouldContinueCompile: any,
  { visibleOnly: shouldCompileVisibleOnly = false, pollInterval: pollIntervalMs = 32 } = {},
) {
  const webglApi = targetRenderer.getContext();
  if (
    !shouldContinueCompile() ||
    webglApi.isContextLost() ||
    targetRenderer.extensions?.has("KHR_parallel_shader_compile") === false
  )
    return Promise.resolve(false);
  const precompileRoot = shouldCompileVisibleOnly ? new threeModuleMin.Group() : targetScene;
  shouldCompileVisibleOnly &&
    (precompileRoot.traverse = (visitNode: any) =>
      targetScene.traverseVisible((visibleNode: any) => {
        visibleNode.layers.test(precompileShaderProgramsTargetCamera.layers) &&
          visitNode(visibleNode);
      }));
  const compileScene = () =>
    shouldCompileVisibleOnly
      ? targetRenderer.compile(precompileRoot, precompileShaderProgramsTargetCamera, targetScene)
      : targetRenderer.compile(targetScene, precompileShaderProgramsTargetCamera);
  compileScene();
  let hasTransmission = false;
  if (
    (precompileRoot.traverse?.((compiledNode: any) => {
      (Array.isArray(compiledNode.material) ? compiledNode.material : [compiledNode.material]).some(
        (precompileShaderProgramsNodeMaterial: any) =>
          precompileShaderProgramsNodeMaterial?.transmission > 0,
      ) && (hasTransmission = true);
    }),
    hasTransmission)
  ) {
    const renderTarget = targetRenderer.getRenderTarget(),
      activeCubeFace = targetRenderer.getActiveCubeFace(),
      activeMipmapLevel = targetRenderer.getActiveMipmapLevel(),
      transmissionTarget = new threeModuleMin.WebGLRenderTarget(1, 1);
    try {
      (targetRenderer.setRenderTarget(transmissionTarget), compileScene());
    } finally {
      (targetRenderer.setRenderTarget(renderTarget, activeCubeFace, activeMipmapLevel),
        transmissionTarget.dispose());
    }
  }
  const initialPrograms = [...targetRenderer.info.programs],
    compileDeadlineMs = performance.now() + lightPrecompileBudgetMs;
  return new Promise((resolveCompile, rejectCompile) => {
    const pollProgramStatus = () => {
      try {
        if (
          !shouldContinueCompile() ||
          targetRenderer.getContext() !== webglApi ||
          webglApi.isContextLost()
        ) {
          resolveCompile(false);
          return;
        }
        const liveProgramSet = new Set(targetRenderer.info.programs),
          isLiveProgram = (shaderProgram: any) =>
            liveProgramSet.has(shaderProgram) &&
            shaderProgram.program &&
            webglApi.isProgram(shaderProgram.program);
        if (initialPrograms.some((pendingProgram) => !isLiveProgram(pendingProgram))) {
          resolveCompile(false);
          return;
        }
        if (initialPrograms.every((readyCandidateProgram) => readyCandidateProgram.isReady())) {
          for (const trackedProgram of initialPrograms) {
            if (!isLiveProgram(trackedProgram)) {
              resolveCompile(false);
              return;
            }
            if ((trackedProgram.getUniforms(), !isLiveProgram(trackedProgram))) {
              resolveCompile(false);
              return;
            }
            trackedProgram.getAttributes();
          }
          resolveCompile(true);
        } else
          performance.now() >= compileDeadlineMs
            ? resolveCompile(false)
            : window.setTimeout(pollProgramStatus, pollIntervalMs);
      } catch (compileError: any) {
        rejectCompile(compileError);
      }
    };
    window.setTimeout(pollProgramStatus, 0);
  });
}
