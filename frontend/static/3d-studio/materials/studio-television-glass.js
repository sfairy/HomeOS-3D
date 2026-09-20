/**
 * 电视屏幕玻璃质感的两种画法：熄屏渐变与暖色玻璃材质。
 *
 * 位置：3D 工作室与展示态都用到同一套熄屏观感 ——
 *   1) 展示态的电视屏幕是一张 2D 画布，熄屏时用 drawTelevisionGlass 画渐变；
 *   2) 工作室里电视模型的屏幕面在暖阳原木主题下换成 createWarmTelevisionGlass，
 *      用着色器画出同色系的渐变，保证两侧「熄屏」看起来是同一种玻璃。
 * 对外：drawTelevisionGlass（Canvas 2D）、createWarmTelevisionGlass（three 材质）。
 * 约定：两种画法的三个色标必须保持一致 —— 冷色 #2a2c2f / #222427 / #181a1d，
 *   暖色 #505b62 / #343d45 / #242b31；改了一边就要同步另一边，否则同一台电视
 *   在展示态与工作室会呈现两种不同的熄屏色。
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
 *
 * 做法：用一个 MeshBasicMaterial（不受光照影响，屏幕不该被环境光改变），
 * 通过 onBeforeCompile 注入两段 GLSL —— 顶点阶段把 uv 传到片元，片元阶段按
 * 「纵向 + 左上偏置」的权重在两个色标之间插值，复现 2D 版的斜向反光。
 *
 * 注意：与 drawTelevisionGlass 的暖色档同色系，不要单独改这里的颜色常量。
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
