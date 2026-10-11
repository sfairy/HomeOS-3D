/**
 * 盒子网格（box mesh）构件：把一组 box 规格合并成**缓存几何** + **缓存材质**，挂到父节点上；
 * `addWindowFrames`（平面图门窗框）也走同一套。
 *
 * 从 studio-app.ts 单体切出（P4）。只读输入、无闭包可变状态；三个外部状态按参数显式传入 ——
 * `geometryCacheByKey` / `textureCacheByKey`（几何 / 材质缓存）与 `backgroundSettings`
 * （当前主题的视图设置，门窗玻璃的透明度 / 金属度要看它的 warmWood 标记）。
 */

import type { ArchitectureMeshOptions, MeshMaterialOptions } from "../studio-app-types";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
import * as ns2 from "/static/vendor/three/0.186.0/three.module.min.js";

/** 盒子网格构件需要的外部状态：两个缓存 + 主题视图设置读取器。 */
export interface StudioBoxMeshDeps {
  geometryCacheByKey: Map<string, any>;
  textureCacheByKey: Map<string, any>;
  backgroundSettings: () => { warmWood?: boolean } & Record<string, any>;
}

function normalizeBoxSpec(boxSpec: any) {
  if (Array.isArray(boxSpec)) {
    const [specWidth, specHeight, specDepth, specX = 0, specY = 0, specZ = 0, specRotationY = 0] =
      boxSpec;
    return {
      width: specWidth,
      height: specHeight,
      depth: specDepth,
      x: specX,
      y: specY,
      z: specZ,
      rotationY: specRotationY,
    };
  }
  return {
    width: boxSpec.width,
    height: boxSpec.height,
    depth: boxSpec.depth,
    x: boxSpec.x || 0,
    y: boxSpec.y || 0,
    z: boxSpec.z || 0,
    rotationY: boxSpec.rotationY || 0,
  };
}

function mergeBoxGeometries(deps: StudioBoxMeshDeps, boxSpecs: any) {
  const validBoxSpecs = boxSpecs
    .map(normalizeBoxSpec)
    .filter((validBoxSpec: any) =>
      [validBoxSpec.width, validBoxSpec.height, validBoxSpec.depth].every(
        (boxSpecValue) => Number.isFinite(boxSpecValue) && boxSpecValue > 0.0001,
      ),
    );
  if (!validBoxSpecs.length) return null;
  const boxSpecKey = JSON.stringify(
    validBoxSpecs.map((boxSpecEntry: any) => [
      boxSpecEntry.width,
      boxSpecEntry.height,
      boxSpecEntry.depth,
      boxSpecEntry.x,
      boxSpecEntry.y,
      boxSpecEntry.z,
      boxSpecEntry.rotationY,
    ]),
  );
  if (!deps.geometryCacheByKey.has(boxSpecKey)) {
    const boxGeometries = validBoxSpecs.map((boxGeometrySpec: any) => {
        const singleBoxGeometry = new ns2.BoxGeometry(
            boxGeometrySpec.width,
            boxGeometrySpec.height,
            boxGeometrySpec.depth,
          ),
          compose = new ns2.Matrix4().compose(
            new ns2.Vector3(boxGeometrySpec.x, boxGeometrySpec.y, boxGeometrySpec.z),
            new ns2.Quaternion().setFromEuler(new ns2.Euler(0, boxGeometrySpec.rotationY, 0)),
            new ns2.Vector3(1, 1, 1),
          );
        return singleBoxGeometry.applyMatrix4(compose);
      }),
      mergedBoxGeometry = mergeGeometries2(boxGeometries);
    if (
      (boxGeometries.forEach((disposedGeometry: any) => disposedGeometry.dispose()), !mergedBoxGeometry)
    )
      return null;
    deps.geometryCacheByKey.set(boxSpecKey, mergedBoxGeometry);
  }
  return deps.geometryCacheByKey.get(boxSpecKey);
}

function createBoxMaterial(
  deps: StudioBoxMeshDeps,
  materialColor: any,
  materialOptions: MeshMaterialOptions = {},
) {
  const hex = new ns2.Color(materialColor).getHex(),
    materialKey = JSON.stringify([
      hex,
      materialOptions.roughness ?? 0.8,
      materialOptions.metalness ?? 0.01,
      !!materialOptions.transparent,
      materialOptions.opacity ?? 1,
      materialOptions.depthWrite ?? true,
      materialOptions.depthFunc ?? ns2.LessEqualDepth,
      materialOptions.side ?? ns2.FrontSide,
      materialOptions.emissive ?? 0,
      materialOptions.emissiveIntensity ?? 0,
    ]);
  return (
    deps.textureCacheByKey.has(materialKey) ||
      deps.textureCacheByKey.set(
        materialKey,
        new ns2.MeshStandardMaterial({
          color: hex,
          roughness: materialOptions.roughness ?? 0.8,
          metalness: materialOptions.metalness ?? 0.01,
          transparent: !!materialOptions.transparent,
          opacity: materialOptions.opacity ?? 1,
          depthWrite: materialOptions.depthWrite ?? true,
          depthFunc: materialOptions.depthFunc ?? ns2.LessEqualDepth,
          side: materialOptions.side ?? ns2.FrontSide,
          emissive: materialOptions.emissive ?? 0,
          emissiveIntensity: materialOptions.emissiveIntensity ?? 0,
        }),
      ),
    deps.textureCacheByKey.get(materialKey)
  );
}

export function addArchitectureMesh(
  deps: StudioBoxMeshDeps,
  architectureParent: any,
  architectureSpecs: any,
  architectureColor: any,
  architectureOptions: ArchitectureMeshOptions = {},
) {
  const fv2 = mergeBoxGeometries(deps, architectureSpecs);
  if (!fv2) return null;
  const architectureMesh = new ns2.Mesh(
    fv2,
    createBoxMaterial(deps, architectureColor, architectureOptions),
  );
  return (
    (architectureMesh.castShadow = architectureOptions.castShadow !== false),
    (architectureMesh.receiveShadow = architectureOptions.receiveShadow !== false),
    (architectureMesh.renderOrder = architectureOptions.renderOrder ?? 0),
    (architectureMesh.userData.architectureSharedGeometry = true),
    (architectureMesh.userData.architectureSharedMaterial = true),
    architectureParent.add(architectureMesh),
    architectureMesh
  );
}

export function addWindowFrames(
  deps: StudioBoxMeshDeps,
  windowParent: any,
  windowOpenings: any,
  windowFrameColor: any,
  windowGlassColor: any,
) {
  const windowFrameOptions = {
      rounded: false,
      metalness: 0.18,
      roughness: 0.36,
      castShadow: false,
      receiveShadow: false,
    },
    windowFrameSpecs: any[] = [],
    windowSpecsWithGlass: any[] = [];
  for (const windowOpening of windowOpenings) {
    const windowInset = Math.min(0.045, windowOpening.width * 0.08, windowOpening.height * 0.04),
      windowInnerWidth = Math.max(windowOpening.width - windowInset * 2, 0.04),
      windowInnerHeight = Math.max(windowOpening.height - windowInset * 2, 0.08);
    (windowFrameSpecs.push([
      windowInnerWidth,
      windowInnerHeight,
      0.018,
      windowOpening.centerX,
      windowOpening.height / 2,
      windowOpening.centerZ,
    ]),
      windowSpecsWithGlass.push(
        [
          windowOpening.width,
          windowInset,
          0.045,
          windowOpening.centerX,
          windowInset / 2,
          windowOpening.centerZ,
        ],
        [
          windowOpening.width,
          windowInset,
          0.045,
          windowOpening.centerX,
          windowOpening.height - windowInset / 2,
          windowOpening.centerZ,
        ],
        [
          windowInset,
          windowOpening.height,
          0.045,
          windowOpening.centerX - windowOpening.width / 2 + windowInset / 2,
          windowOpening.height / 2,
          windowOpening.centerZ,
        ],
        [
          windowInset,
          windowOpening.height,
          0.045,
          windowOpening.centerX + windowOpening.width / 2 - windowInset / 2,
          windowOpening.height / 2,
          windowOpening.centerZ,
        ],
      ));
  }
  for (const windowFrameSpec of windowFrameSpecs)
    addArchitectureMesh(deps, windowParent, [windowFrameSpec], windowGlassColor, {
      rounded: false,
      transparent: true,
      opacity: deps.backgroundSettings().warmWood ? 0.2 : 0.24,
      depthWrite: false,
      side: ns2.DoubleSide,
      roughness: 0.08,
      metalness: deps.backgroundSettings().warmWood ? 0.04 : 0.03,
      castShadow: false,
      receiveShadow: false,
      renderOrder: 7,
    });
  addArchitectureMesh(deps, windowParent, windowSpecsWithGlass, windowFrameColor, windowFrameOptions);
}
