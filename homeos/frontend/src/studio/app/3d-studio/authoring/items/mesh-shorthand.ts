/**
 * 网格原语的「尺寸 + 位置」元组形薄包装：`box` / `cyl`。
 *
 * 为什么需要
 * ----------
 * `addBoxMesh` / `addCylinderMesh` 是 9 个位置参数的 API（父节点、宽、高、深、x、y、z、颜色、
 * 选项）。在 120 列换行下，同一个调用会被拆成 10～20 行，`width6 * 0.92` 与 `height6 * 0.28`
 * 谁对应宽、谁对应高完全靠数位置 —— 既费行数也费读的人。本模块把三个尺寸与三个坐标各收成
 * 一个三元组，调用点从 9 个参数降到 4～5 个，读的时候「尺寸一组、位置一组」一眼可辨。
 *
 * 等价性（为什么不是换个写法而是纯转发）
 * --------------------------------------
 * 两个函数都只做一件事：按**原顺序**把值交回原语。参数表达式的求值顺序是
 * `parent → [w,h,d] → [x,y,z] → color → options`，数组字面量的元素按书写顺序求值，因此与
 * `parent, w, h, d, x, y, z, color, options` 完全一致（无副作用重排）。
 * `ops/checks/geometry-call-golden.mjs` 对每个调用点逐字段比对参数表达式，作为可执行的证明。
 *
 * 为什么 `cyl` 直接 import 原语而不是走 `ItemModelScope` 注入：宿主注入的就是本模块 import 的
 * 同一个函数对象（`authoring/studio-app/geometry/index.ts` 的 re-export 与 `boot.ts` 传入的是
 * 同一引用），因此不存在「绕过注入点」的行为差异。
 */

import type { BoxMeshOptions, CylinderMeshOptions } from '../types/studio-app-types'
import { addCylinderMesh } from '../studio-app/geometry/cylinder-mesh'
import { addBoxMesh } from './studio-mesh-primitives'

/** 三维尺寸 / 坐标：`[宽, 高, 深]`、`[x, y, z]`；圆柱为 `[上半径, 下半径, 高]`。 */
export type MeshTriple = readonly [number, number, number]

/** 盒体：`box(父节点, [宽, 高, 深], [x, y, z], 颜色, 选项?)`。 */
export function box(parent: unknown, size: MeshTriple, at: MeshTriple, color: unknown, options?: BoxMeshOptions) {
  return addBoxMesh(parent, size[0], size[1], size[2], at[0], at[1], at[2], color, options)
}

/** 圆柱：`cyl(父节点, [上半径, 下半径, 高], [x, y, z], 颜色, 选项?)`。 */
export function cyl(parent: unknown, size: MeshTriple, at: MeshTriple, color: unknown, options?: CylinderMeshOptions) {
  return addCylinderMesh(parent, size[0], size[1], size[2], at[0], at[1], at[2], color, options)
}
