/**
 * 编译期影子模块：对应运行时由浏览器直接加载的 `/static/vendor/three/0.186.0/three.module.min.js`。
 *
 * 这条绝对路径不是 npm 包，`moduleResolution: "bundler"` 找不到它，也不会去 node_modules 里
 * 装一份 three；因此由 tsconfig 的 `paths` 把该路径指到这里，编译期只暴露「值一律 any」的出口。
 * 下面列出的名字就是 studio-app 实际用到的那一层 three API。
 */
export declare const AdditiveBlending: any;
export declare const AmbientLight: any;
export declare const Box3: any;
export declare const BoxGeometry: any;
export declare const BufferAttribute: any;
export declare const BufferGeometry: any;
export declare const CanvasTexture: any;
export declare const Color: any;
export declare const ConeGeometry: any;
export declare const CylinderGeometry: any;
export declare const DirectionalLight: any;
export declare const DoubleSide: any;
export declare const Euler: any;
export declare const ExtrudeGeometry: any;
export declare const Float32BufferAttribute: any;
export declare const FrontSide: any;
export declare const GridHelper: any;
export declare const Group: any;
export declare const HemisphereLight: any;
export declare const InstancedMesh: any;
export declare const LessDepth: any;
export declare const LessEqualDepth: any;
export declare const Material: any;
export declare const MathUtils: any;
export declare const Matrix4: any;
export declare const Mesh: any;
export declare const MeshBasicMaterial: any;
export declare const MeshStandardMaterial: any;
export declare const NeutralToneMapping: any;
export declare const Object3D: any;
export declare const OrthographicCamera: any;
export declare const Path: any;
export declare const PerspectiveCamera: any;
export declare const PlaneGeometry: any;
export declare const Quaternion: any;
export declare const REVISION: any;
export declare const RepeatWrapping: any;
export declare const Raycaster: any;
export declare const RectAreaLight: any;
export declare const SRGBColorSpace: any;
export declare const Scene: any;
export declare const Shape: any;
export declare const ShapeGeometry: any;
export declare const SpotLight: any;
export declare const StaticDrawUsage: any;
export declare const VSMShadowMap: any;
export declare const Vector2: any;
export declare const Vector3: any;
export declare const WebGLRenderTarget: any;
export declare const WebGLRenderer: any;
