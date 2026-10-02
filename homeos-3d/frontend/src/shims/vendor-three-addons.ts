/**
 * 编译期影子模块：对应运行时由浏览器直接加载的 `/static/vendor/three/0.186.0/` 下的几个 addon。
 *
 * 这些绝对路径不是 npm 包，由 tsconfig 的 `paths` 把四条路径都指到这里，
 * 编译期只暴露「值一律 any」的出口。真正 import 哪个 addon 由源码的 import 语句本身表达。
 */
export declare const OrbitControls: any;
export declare const RoundedBoxGeometry: any;
export declare const mergeGeometries: any;
export declare const GLTFLoader: any;
