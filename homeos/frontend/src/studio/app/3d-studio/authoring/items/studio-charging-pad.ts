import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

export function addChargingPadModel(
  chargingPadParent: any,
  chargingPadItem: any,
  chargingPadWidth: any,
  chargingPadDepth: any,
  chargingPadY: any,
  /** 舞台内嵌模式：内嵌时不开设备（与单体里同名闭包变量口径一致），搬出后显式传入。 */
  isEmbeddedStage: boolean,
) {
  if (chargingPadItem.chargingEnabled !== true) return;
  const chargingPadCanvas = document.createElement("canvas");
  ((chargingPadCanvas.width = 256), (chargingPadCanvas.height = 256));
  const chargingPadPainter = chargingPadCanvas.getContext("2d"),
    padCanvasCenter = chargingPadCanvas.width / 2,
    radialGradient2 = chargingPadPainter!.createRadialGradient(
      padCanvasCenter,
      padCanvasCenter,
      0,
      padCanvasCenter,
      padCanvasCenter,
      padCanvasCenter,
    );
  (radialGradient2.addColorStop(0, "rgba(79, 239, 183, .48)"),
    radialGradient2.addColorStop(0.46, "rgba(79, 239, 183, .23)"),
    radialGradient2.addColorStop(1, "rgba(79, 239, 183, 0)"),
    (chargingPadPainter!.fillStyle = radialGradient2),
    chargingPadPainter!.fillRect(0, 0, chargingPadCanvas.width, chargingPadCanvas.height));
  for (let padGridY = 18; padGridY < chargingPadCanvas.height - 18; padGridY += 10)
    for (let padGridX = 18; padGridX < chargingPadCanvas.width - 18; padGridX += 10) {
      const padGridDistance =
          Math.hypot(padGridX - padCanvasCenter, padGridY - padCanvasCenter) / padCanvasCenter,
        padGlowAlpha = Math.max(0, 1 - padGridDistance) * 0.32;
      padGlowAlpha <= 0.01 ||
        ((chargingPadPainter!.fillStyle = "rgba(116, 255, 202, " + padGlowAlpha + ")"),
        chargingPadPainter!.beginPath(),
        chargingPadPainter!.arc(padGridX, padGridY, 1.45, 0, Math.PI * 2),
        chargingPadPainter!.fill());
    }
  const chargingPadTexture = new threeModuleMin.CanvasTexture(chargingPadCanvas);
  ((chargingPadTexture.colorSpace = threeModuleMin.SRGBColorSpace), (chargingPadTexture.needsUpdate = true));
  const chargingPadMesh = new threeModuleMin.Mesh(
    new threeModuleMin.PlaneGeometry(chargingPadWidth * 1.72, chargingPadDepth * 1.42),
    new threeModuleMin.MeshBasicMaterial({
      map: chargingPadTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
      side: threeModuleMin.DoubleSide,
      forceSinglePass: isEmbeddedStage,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -3,
    }),
  );
  ((chargingPadMesh.rotation.x = -Math.PI / 2),
    (chargingPadMesh.position.y = 0.014),
    (chargingPadMesh.renderOrder = 2),
    (chargingPadMesh.castShadow = false),
    (chargingPadMesh.receiveShadow = false),
    chargingPadParent.add(chargingPadMesh));
  const boltShape = new threeModuleMin.Shape();
  (boltShape.moveTo(0.08, 0.5),
    boltShape.lineTo(-0.22, 0.04),
    boltShape.lineTo(-0.03, 0.04),
    boltShape.lineTo(-0.13, -0.5),
    boltShape.lineTo(0.25, -0.02),
    boltShape.lineTo(0.05, -0.02),
    boltShape.closePath());
  const boltMesh = new threeModuleMin.Mesh(
      new threeModuleMin.ShapeGeometry(boltShape),
      new threeModuleMin.MeshBasicMaterial({
        color: 8257488,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: threeModuleMin.AdditiveBlending,
        toneMapped: false,
        side: threeModuleMin.DoubleSide,
        forceSinglePass: isEmbeddedStage,
      }),
    ),
    boltScale = Math.max(Math.min(chargingPadWidth, chargingPadDepth) * 0.22, 0.18);
  (boltMesh.scale.setScalar(boltScale),
    (boltMesh.rotation.x = -Math.PI / 2),
    boltMesh.position.set(0, chargingPadY + 0.04, 0),
    (boltMesh.renderOrder = 9),
    (boltMesh.castShadow = false),
    (boltMesh.receiveShadow = false),
    chargingPadParent.add(boltMesh));
}
