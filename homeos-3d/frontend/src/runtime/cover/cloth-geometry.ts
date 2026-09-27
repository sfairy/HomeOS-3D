/**
 * 窗帘布料网格的程序化生成：正弦褶皱的薄壳（正/反/上/下四面 + 侧端盖，带厚度与顶点色）。
 */

type ThreeBufferGeometry = {
  setAttribute: (name: string, attribute: unknown) => void;
  setIndex: (indices: number[]) => void;
  computeBoundingBox: () => void;
  computeBoundingSphere: () => void;
};

type ThreeLib = {
  BufferGeometry: new () => ThreeBufferGeometry;
  Float32BufferAttribute: new (array: number[] | Float32Array, itemSize: number) => unknown;
};

/**
 * 程序化生成布料网格（正弦褶皱的薄壳）。
 */
export function createClothGeometry(three: ThreeLib, folds: number, fabric: string) {
  const isSheer = fabric === "sheer";
  // 每道褶皱至少 6 段才能画出平滑的正弦；总数下限 64 段，保证窄帘也不出现折角。
  const segmentCount = Math.max(64, folds * 6);
  // 2.28168 是模型导出的实际帘高（米），用固定值而非模型量得的尺寸，
  const panelHeight = 2.28168;
  // 纱更薄，褶皱幅度取布帘的一半，看起来更轻盈。
  const foldAmplitude = isSheer ? 0.023 : 0.046;
  const clothThickness = 0.003;
  const positionArray: number[] = [];
  const normalArray: number[] = [];
  const uvArray: number[] = [];
  // 顶点色数组：与轨道帘同一套褶皱明暗公式，保证自建几何与轨道几何的暗部层次一致。
  const colorArray: number[] = [];
  const indexArray: number[] = [];
  // 褶皱位移与斜率：位移取正弦，斜率取导数，用于把法线扭转成垂直于布面。
  const foldDisplacement = (seamRatio: number) =>
    foldAmplitude * Math.sin(seamRatio * folds * Math.PI * 2);
  // 上式的解析导数（∂/∂seamRatio）：直接用导数当切线算出布面法线，
  const foldSlope = (seamSlopeRatio: number) =>
    foldAmplitude * folds * Math.PI * 2 * Math.cos(seamSlopeRatio * folds * Math.PI * 2);
  /** 写入一个顶点（位置 / 法线 / UV / 褶皱明暗）。 */
  const pushVertex = (
    positionX: number,
    positionY: number,
    positionZ: number,
    normalX: number,
    normalY: number,
    normalZ: number,
    textureU: number,
    textureV: number
  ) => {
    positionArray.push(positionX, positionY, positionZ);
    normalArray.push(normalX, normalY, normalZ);
    uvArray.push(textureU, textureV);
    // 褶皱暗部：positionX 在这里就是沿帘宽的比例，波谷压暗、波峰保持原色。
    const foldDarkness = 0.5 - Math.sin(positionX * folds * Math.PI * 2) * 0.5;
    const foldShade = 1 - (isSheer ? 0.16 : 0.34) * foldDarkness * foldDarkness;
    colorArray.push(foldShade, foldShade, foldShade);
  };
  // 纱帘只生成正面（背面看不见且更省三角形）；布帘四面全做，才有厚度感。
  for (const face of isSheer ? (["front"] as const) : (["front", "back", "top", "bottom"] as const)) {
    // 记录本面第一个顶点的下标，后面按它拼三角形索引。
    const faceVertexOffset = positionArray.length / 3;
    for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
      const alongRatio = segmentIndex / segmentCount;
      const foldOffset = foldDisplacement(alongRatio);
      const foldSlopeSample = foldSlope(alongRatio);
      // 法线要垂直于倾斜的布面，因此按斜率归一化。
      const normalLength = Math.hypot(foldSlopeSample, 1);
      if (face === "front" || face === "back") {
        // 正反面沿厚度方向各偏 half thickness，法线的 z 分量即朝外方向。
        const outwardSign = face === "front" ? 1 : -1;
        for (const vertexHeight of [0, panelHeight]) {
          pushVertex(
            alongRatio,
            vertexHeight,
            foldOffset + (outwardSign * clothThickness) / 2,
            (-outwardSign * foldSlopeSample) / normalLength,
            0,
            outwardSign / normalLength,
            alongRatio,
            vertexHeight / panelHeight
          );
        }
      } else {
        // 上下面：法线朝向 ±Y，顶点沿厚度方向取两端（形成一条厚度边）。
        const verticalSign = face === "top" ? 1 : -1;
        for (const thicknessOffset of [-clothThickness / 2, clothThickness / 2]) {
          pushVertex(
            alongRatio,
            verticalSign > 0 ? panelHeight : 0,
            foldOffset + thicknessOffset,
            0,
            verticalSign,
            0,
            alongRatio,
            thicknessOffset > 0 ? 1 : 0
          );
        }
      }
      if (segmentIndex < segmentCount) {
        const segmentVertexIndex = faceVertexOffset + segmentIndex * 2;
        // 三角形绕序按面分别处理：正面与底面用一套，其余用反向的另一套，
        if (face === "front" || face === "bottom") {
          indexArray.push(
            segmentVertexIndex,
            segmentVertexIndex + 2,
            segmentVertexIndex + 1,
            segmentVertexIndex + 1,
            segmentVertexIndex + 2,
            segmentVertexIndex + 3
          );
        } else {
          indexArray.push(
            segmentVertexIndex,
            segmentVertexIndex + 1,
            segmentVertexIndex + 2,
            segmentVertexIndex + 1,
            segmentVertexIndex + 3,
            segmentVertexIndex + 2
          );
        }
      }
    }
  }
  for (const edgeX of isSheer ? ([] as number[]) : [0, 1]) {
    const capVertexOffset = positionArray.length / 3;
    const edgeNormalSign = edgeX === 0 ? -1 : 1;
    for (const edgeHeight of [0, panelHeight]) {
      for (const edgeThicknessOffset of [-clothThickness / 2, clothThickness / 2]) {
        pushVertex(
          edgeX,
          edgeHeight,
          foldDisplacement(edgeX) + edgeThicknessOffset,
          edgeNormalSign,
          0,
          0,
          edgeThicknessOffset > 0 ? 1 : 0,
          edgeHeight / panelHeight
        );
      }
    }
    // 端盖的绕序同样按法线方向选择，保证朝外。
    if (edgeNormalSign > 0) {
      indexArray.push(
        capVertexOffset,
        capVertexOffset + 2,
        capVertexOffset + 1,
        capVertexOffset + 1,
        capVertexOffset + 2,
        capVertexOffset + 3
      );
    } else {
      indexArray.push(
        capVertexOffset,
        capVertexOffset + 1,
        capVertexOffset + 2,
        capVertexOffset + 1,
        capVertexOffset + 3,
        capVertexOffset + 2
      );
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute("position", new three.Float32BufferAttribute(positionArray, 3));
  geometry.setAttribute("normal", new three.Float32BufferAttribute(normalArray, 3));
  geometry.setAttribute("uv", new three.Float32BufferAttribute(uvArray, 2));
  geometry.setAttribute("color", new three.Float32BufferAttribute(colorArray, 3));
  geometry.setIndex(indexArray);
  // 包围盒与包围球是必须的：视锥剔除与射线拾取都依赖它们。
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
