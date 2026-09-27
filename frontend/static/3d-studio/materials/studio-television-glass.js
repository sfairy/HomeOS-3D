/**
 * 电视屏幕玻璃质感的两种画法：熄屏渐变与暖色玻璃材质。
 */

/**
 * 在 2D 上下文上画熄屏玻璃渐变。
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
 */
export function createWarmTelevisionGlass(three) {
  const glassMaterial = new three.MeshBasicMaterial({
    color: 16777215,
    toneMapped: false
  });
  const glassLow = new three.Color("#242b31");
  const glassHigh = new three.Color("#505b62");
  glassMaterial.onBeforeCompile = compiledShader => {
    // 两个色标走 uniform 而不是硬编码进字符串：这里传的是 Color 实例，
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
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb = mix(tvGlassLow, tvGlassHigh, smoothstep(0.0, 1.35, tvGlassUv.y + (1.0-tvGlassUv.x)*.35));"
      );
  };
  // 缓存键固定字符串：这一套注入与材质参数无关，所有实例共用同一份编译结果。
  glassMaterial.customProgramCacheKey = () => "warm-tv-glass-v1";
  return glassMaterial;
}
