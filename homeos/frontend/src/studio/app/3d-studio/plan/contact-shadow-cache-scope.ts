import { scenePreparationKey } from "../scene-persistent-cache";

/** 接触阴影烘焙算法的版本指纹：算法变了，旧快照必须整体失效。 */
export const CONTACT_SHADOW_ALGORITHM_REVISION =
  "5d70477edac6294f0ef28c0e93ee64d724862b0a7aa4399be716e72ec72b6066";

/**
 * 接触阴影持久缓存的键：把「场景标识 + 算法版本」编进键里。
 * 传 legacy、或算法版本不是 64 位十六进制时，退回普通场景键（不隔离算法版本）。
 */
export function contactShadowPreparationKey(
  lightHistoryScope: any,
  projectId: any,
  sceneId: any,
  source = "",
  { algorithmRevision = CONTACT_SHADOW_ALGORITHM_REVISION, legacy = false } = {},
) {
  return !lightHistoryScope || !projectId || !sceneId
    ? ""
    : legacy || typeof algorithmRevision != "string" || !/^[a-f0-9]{64}$/.test(algorithmRevision)
      ? scenePreparationKey(lightHistoryScope, projectId, sceneId, source)
      : JSON.stringify([
          "contact-shadow-scope-v1",
          lightHistoryScope,
          projectId,
          sceneId,
          algorithmRevision,
        ]);
}
