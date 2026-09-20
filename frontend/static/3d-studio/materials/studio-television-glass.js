/**
 * 电视屏幕玻璃质感的两种画法：熄屏渐变与暖色玻璃材质。
 *
 * 展示态电视屏是 2D 画布，熄屏用 drawTelevisionGlass 画渐变；工作室里电视模型屏面在暖阳原木下
 * 换成 createWarmTelevisionGlass，用着色器画同色系渐变，保证两侧熄屏看起来是同一种玻璃。
 * 约定：两种画法的三个色标必须一致 —— 冷色 #2a2c2f / #222427 / #181a1d，暖色 #505b62 / #343d45 / #242b31；
 * 改一边要同步另一边，否则同一台电视在展示态与工作室会呈现两种熄屏色。
 */

/**
 * 在 2D 上下文上画熄屏玻璃渐变。
 *
 * 渐变方向从左上延伸到画布高度的位置，模拟斜向的环境反光；比纯黑更有体积感，
 * 也能让人看清屏幕边界。函数内会自行设置 fillStyle 并铺满整块画布。
 */
export function drawTelevisionGlass(canvasSize, context, warm = false) {
  const glassGradient = context.createLinearGradient(
    0,
    0,
    canvasSize.width * 0.35,
    canvasSize.height
  );
  glassGradient.addColorStop(0, warm ? "#505b62" : "#2a2c2f");
  glassGradient.addColorStop(0.45, warm ? "#343d45" : "#222427");
  glassGradient.addColorStop(1, warm ? "#242b31" : "#181a1d");
  context.fillStyle = glassGradient;
  context.fillRect(0, 0, canvasSize.width, canvasSize.height);
}

/**
 * 创建暖阳原木主题下的电视玻璃材质。
 * 用 MeshBasicMaterial（不受光照影响，屏幕不该被环境光改变），通过 onBeforeCompile 注入两段 GLSL：
 * 顶点阶段传 uv，片元阶段按「纵向 + 左上偏置」权重在两个色标间插值，复现 2D 版的斜向反光。
 * 与 drawTelevisionGlass 的暖色档同色系，不要单独改这里的颜色常量。
 */
export function createWarmTelevisionGlass(three) {
  const glassMaterial = new three.MeshBasicMaterial({
    color: 16777215,
    // 屏幕玻璃是自发光观感，不能被色调映射压暗，否则暖色会发灰。
    toneMapped: false
  });
  const glassLow = new three.Color("#242b31");
  const glassHigh = new three.Color("#505b62");
  glassMaterial.onBeforeCompile = compiledShader => {
    // 两个色标走 uniform 而不是硬编码进字符串：这里传的是 Color 实例，
    // 与 three 的颜色管理保持一致，色值不会被二次转换。
    compiledShader.uniforms.tvGlassLow = {
      value: glassLow
    };
    compiledShader.uniforms.tvGlassHigh = {
      value: glassHigh
    };
    compiledShader.vertexShader = compiledShader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 tvGlassUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntvGlassUv = uv;");
    compiledShader.fragmentShader = compiledShader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 tvGlassUv; uniform vec3 tvGlassLow; uniform vec3 tvGlassHigh;"
      )
      // 1.35 让渐变在到达顶边前就走完，底部留出一段纯暗色，避免整块玻璃发亮；
      // (1.0 - uv.x) * 0.35 是把亮部往右上角推，与 2D 版的左上到右下方向一致。
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb = mix(tvGlassLow, tvGlassHigh, smoothstep(0.0, 1.35, tvGlassUv.y + (1.0-tvGlassUv.x)*.35));"
      );
  };
  // 缓存键固定字符串：这一套注入与材质参数无关，所有实例共用同一份编译结果。
  glassMaterial.customProgramCacheKey = () => "warm-tv-glass-v1";
  return glassMaterial;
}
