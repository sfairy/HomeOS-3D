export function drawTelevisionGlass(canvasElement, painter, isLit = false) {
  const glassGradient = painter.createLinearGradient(
    0,
    0,
    canvasElement.width * 0.35,
    canvasElement.height,
  );
  (glassGradient.addColorStop(0, isLit ? "#505b62" : "#2a2c2f"),
    glassGradient.addColorStop(0.45, isLit ? "#343d45" : "#222427"),
    glassGradient.addColorStop(1, isLit ? "#242b31" : "#181a1d"),
    (painter.fillStyle = glassGradient),
    painter.fillRect(0, 0, canvasElement.width, canvasElement.height));
}
export function createWarmTelevisionGlass(three) {
  const glassMaterial = new three.MeshBasicMaterial({
      color: 16777215,
      toneMapped: false,
    }),
    lowColor = new three.Color("#242b31"),
    highColor = new three.Color("#505b62");
  return (
    (glassMaterial.onBeforeCompile = (shader) => {
      ((shader.uniforms.tvGlassLow = {
        value: lowColor,
      }),
        (shader.uniforms.tvGlassHigh = {
          value: highColor,
        }),
        (shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec2 tvGlassUv;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\ntvGlassUv = uv;")),
        (shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec2 tvGlassUv; uniform vec3 tvGlassLow; uniform vec3 tvGlassHigh;",
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\ndiffuseColor.rgb = mix(tvGlassLow, tvGlassHigh, smoothstep(0.0, 1.35, tvGlassUv.y + (1.0-tvGlassUv.x)*.35));",
          )));
    }),
    (glassMaterial.customProgramCacheKey = () => "warm-tv-glass-v1"),
    glassMaterial
  );
}
