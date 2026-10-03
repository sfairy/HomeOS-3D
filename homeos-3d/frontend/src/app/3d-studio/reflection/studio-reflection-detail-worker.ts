import { MeshoptSimplifier } from "/static/vendor/meshoptimizer/0.25/meshopt_simplifier.module.js";


type ReflectionWorkerScope = {
  onmessage: ((event: { data: any }) => void) | null;
  postMessage: (message: any, transfer?: Transferable[]) => void;
};
const reflectionWorkerScope = globalThis as unknown as ReflectionWorkerScope;
async function simplifyReflection({
  indices: sourceIndices,
  positions: sourcePositions,
  attributes: sourceAttributes,
  stride: vertexStride,
  weights: vertexWeights,
  error: errorTolerance,
  ratio: targetRatio = 0.35,
}) {
  return (
    await MeshoptSimplifier.ready,
    MeshoptSimplifier.simplifyWithAttributes(
      sourceIndices,
      sourcePositions,
      3,
      sourceAttributes,
      vertexStride,
      vertexWeights,
      null,
      Math.floor((sourceIndices.length * targetRatio) / 3) * 3,
      errorTolerance,
      ["ErrorAbsolute", "LockBorder"],
    )[0]
  );
}
typeof self < "u" &&
  typeof document > "u" &&
  (reflectionWorkerScope.onmessage = async ({ data: message }) => {
    try {
      const simplifiedIndices = await simplifyReflection(message);
      reflectionWorkerScope.postMessage(
        {
          id: message.id,
          indices: simplifiedIndices,
        },
        [simplifiedIndices.buffer],
      );
    } catch {
      reflectionWorkerScope.postMessage({
        id: message.id,
        failed: true,
      });
    }
  });
