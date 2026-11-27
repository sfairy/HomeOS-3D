/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */
export default {
  merges: [
    {
      into: 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/asset.ts',
      from: [
        'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/asset-library.ts',
        'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/asset-preview.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/preview.ts',
      from: [
        'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/preview-camera-panel.ts',
        'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/preview-style.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/3d-studio/reflection/reflection.ts',
      from: [
        'homeos/frontend/src/studio/app/3d-studio/reflection/reflection-overlay.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/reflection-persistent-cache.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/reflection-renderer-diff.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/reflection-resolve.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/reflection-scene-queries.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection.ts',
      from: [
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-capture-budget.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-culling.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-passes.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-runtime.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-signature.ts',
      ],
    },
    {
      into: 'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-detail.ts',
      from: [
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-detail-worker.ts',
        'homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-detail.ts',
      ],
    },
  ],
}
