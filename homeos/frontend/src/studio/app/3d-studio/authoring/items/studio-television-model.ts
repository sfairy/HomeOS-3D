/**
 * 电视模型构件：屏幕本体 / 发光层 / 贴图（`createTelevisionPoster`）与挂装比例的换算
 * （`computeTelevisionProportions`，桌面 / 移动 / 壁挂三档）。
 *
 * 从 studio-app.ts 单体切出（P4）。只读输入；三个外部状态按 deps 显式传入 ——
 * `isEmbeddedStage`（嵌入舞台开关）、`threeRenderer`（只读 `capabilities` 定贴图各向异性上限）、
 * `backgroundSettings`（warm-wood 主题下的玻璃材质替换）。
 */

import { addBoxMesh } from "./studio-mesh-primitives";
import { createWarmTelevisionGlass as createWarmTelevisionGlass2 } from "../../materials/studio-television-glass";
import { drawTelevisionPoster as drawTelevisionPoster2 } from "../../materials/studio-television-poster";
import * as ns2 from "/static/vendor/three/0.186.0/three.module.min.js";

/** 电视模型构件需要的外部状态（均为只读）。 */
export interface StudioTelevisionDeps {
  isEmbeddedStage: boolean;
  threeRenderer: any;
  backgroundSettings: () => { warmWood?: boolean } & Record<string, any>;
}

function createTelevisionPoster(deps: StudioTelevisionDeps) {
  const posterCanvas = document.createElement("canvas");
  ((posterCanvas.width = 960), (posterCanvas.height = 540));
  const posterCanvasPainter = posterCanvas.getContext("2d");
  if (!posterCanvasPainter) return null;
  drawTelevisionPoster2(posterCanvas, posterCanvasPainter);
  const posterTexture = new ns2.CanvasTexture(posterCanvas);
  return (
    (posterTexture.colorSpace = ns2.SRGBColorSpace),
    (posterTexture.anisotropy = Math.min(
      deps.threeRenderer?.capabilities?.getMaxAnisotropy?.() || 1,
      8,
    )),
    (posterTexture.needsUpdate = true),
    posterTexture
  );
}

export function computeTelevisionProportions(televisionItem: any, televisionHeight: any) {
  const isMobileMount = televisionItem.tvMountStyle === "mobile",
    isTabletopMount = televisionItem.tvMountStyle === "tabletop";
  return {
    bodyHeight: televisionHeight * (isMobileMount ? 0.43 : isTabletopMount ? 0.56 : 0.62),
    centerY: televisionHeight * (isMobileMount ? 0.76 : isTabletopMount ? 0.67 : 0.62),
  };
}

export function addTelevisionModel(
  deps: StudioTelevisionDeps,
  televisionParent: any,
  televisionScreenItem: any,
  televisionWidth: any,
  televisionDepth: any,
  televisionModelHeight: any,
) {
  const { bodyHeight: ag2, centerY: ag3 } = computeTelevisionProportions(
      televisionScreenItem,
      televisionModelHeight,
    ),
    screenWidth = televisionWidth * 0.965,
    screenHeight = ag2 * 0.94,
    screenThickness = 0.012,
    screenFrontDepth = Math.max(televisionDepth * 0.28, 0.05) * 0.5 + 0.006,
    screenBodyZ = screenFrontDepth - screenThickness * 0.5;
  if (deps.isEmbeddedStage || televisionScreenItem.screenEnabled === false) {
    const screenBodyMesh = addBoxMesh(
      televisionParent,
      screenWidth,
      screenHeight,
      screenThickness,
      0,
      ag3,
      screenBodyZ,
      527122,
      {
        roughness: 0.18,
      },
    );
    if (deps.backgroundSettings().warmWood) {
      const screenBodyMaterial = screenBodyMesh.material,
        screenGlassMaterial = createWarmTelevisionGlass2(ns2);
      screenBodyMesh.material = [
        screenBodyMaterial,
        screenBodyMaterial,
        screenBodyMaterial,
        screenBodyMaterial,
        screenGlassMaterial,
        screenBodyMaterial,
      ];
    }
    ((screenBodyMesh.userData.sceneStyle = deps.backgroundSettings().warmWood ? "warm-wood" : "default"),
      (screenBodyMesh.userData.televisionScreen = true),
      deps.isEmbeddedStage && (screenBodyMesh.userData.environmentEffect = true));
    return;
  }
  const screenGlowMesh = new ns2.Mesh(
    new ns2.PlaneGeometry(screenWidth * 1.035, screenHeight * 1.08),
    new ns2.MeshBasicMaterial({
      color: 7253215,
      transparent: true,
      opacity: 0.09,
      depthTest: false,
      depthWrite: false,
      blending: ns2.AdditiveBlending,
      toneMapped: false,
      side: ns2.DoubleSide,
    }),
  );
  ((screenGlowMesh.userData.televisionGlow = true),
    deps.isEmbeddedStage && (screenGlowMesh.userData.environmentEffect = true),
    screenGlowMesh.position.set(0, ag3, screenFrontDepth - 0.014),
    (screenGlowMesh.renderOrder = 6),
    (screenGlowMesh.castShadow = false),
    (screenGlowMesh.receiveShadow = false),
    televisionParent.add(screenGlowMesh));
  const uv2 = createTelevisionPoster(deps),
    screenEdgeMaterial = new ns2.MeshBasicMaterial({
      color: 527122,
      toneMapped: false,
    }),
    screenBackMaterial = new ns2.MeshBasicMaterial({
      color: uv2 ? 16777215 : 1519946,
      map: uv2,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    screenInsetMesh = new ns2.Mesh(
      new ns2.BoxGeometry(screenWidth, screenHeight, screenThickness),
      [
        screenEdgeMaterial,
        screenEdgeMaterial,
        screenEdgeMaterial,
        screenEdgeMaterial,
        screenBackMaterial,
        screenEdgeMaterial,
      ],
    );
  ((screenInsetMesh.userData.sceneStyle = deps.backgroundSettings().warmWood ? "warm-wood" : "default"),
    (screenInsetMesh.userData.televisionScreen = true),
    deps.isEmbeddedStage && (screenInsetMesh.userData.environmentEffect = true),
    screenInsetMesh.position.set(0, ag3, screenBodyZ),
    (screenInsetMesh.renderOrder = 7),
    (screenInsetMesh.castShadow = false),
    (screenInsetMesh.receiveShadow = false),
    televisionParent.add(screenInsetMesh));
}
