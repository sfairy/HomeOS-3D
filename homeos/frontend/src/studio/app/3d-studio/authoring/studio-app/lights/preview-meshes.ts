import { applyTextureQuality } from '../../../render-kit/texture-quality'
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2, selectShadowCastingLightIds as selectShadowCastingLightIds2 } from '../../../plan/geometry'
import { drawTrackedText as drawTrackedText2 } from '../../../plan/studio-plan-drawing'
import { finite as finite2, normalizeLabelText as normalizeLabelText2 } from '../../../loaders/studio-normalization'
import { lampItemTypeSet } from '../../items/item-catalog'
import { lightPresetCatalog } from '../../lights/studio-app-light-data'
import { addStripFixture } from '../../lights/strip-light/strip-light-model'
import { lightEffectColorHex } from '../../../../bridge/light-motion'
import {
  maxTextureUnitLimit,
  planLabelAccentAlpha,
  normalizePlanLabelColor,
  planLabelThemeColors,
} from '../../scene/payload/studio-scene-payload'
import { dashboardCanvasFont } from '../../../../shared/dashboard-fonts'

/** 灯带的发光本体与朝向箭头：户型总览里不画；选中且「显示光源」开着才显示。 */
export function addStripLightPreview(runtime: StudioAppRuntime, stripPreviewParent: any, stripLightItem: any) {
  if (stripLightItem.type !== 'striplight') return
  // 否则墙面上会挂一条黑灰细条。
  const showSource =
    stripLightItem.lightSourceVisible !== false &&
    !runtime.appCtx.pendingRuntimeSettings &&
    !!runtime.createSelectionRef('item', stripLightItem.id)
  addStripFixture(stripPreviewParent, stripLightItem, {
    colorHex: lightEffectColorHex(stripLightItem.lightTemperature, stripLightItem.lightColorRgb),
    showFixture: showSource,
    showArrow: showSource,
    configurePreview: (mesh) => runtime.configureLightSourcePreview(mesh),
  })
}

export function applyAccentEmissive(runtime: StudioAppRuntime, accentRoot: any, isAccentActive: any) {
  if (!isAccentActive) return
  const yt3 = runtime.backgroundSettings()
  accentRoot.traverse((accentObject: any) => {
    const accentMaterials = Array.isArray(accentObject.material)
      ? accentObject.material
      : accentObject.material
        ? [accentObject.material]
        : []
    for (const accentMaterial of accentMaterials)
      accentMaterial?.isMeshStandardMaterial &&
        ((accentMaterial.emissive = new ns2.Color(yt3.accent)), (accentMaterial.emissiveIntensity = 0.32))
  })
}

/** 由铭牌颜色派生底线 / 描边的半透明色，保证描边永远跟字色同源。 */
export function planLabelAccentColor(_runtime: StudioAppRuntime, candidateColor: any, alpha = planLabelAccentAlpha) {
  const labelColorHex = normalizePlanLabelColor(candidateColor)
  return (
    'rgba(' +
    Number.parseInt(labelColorHex.slice(1, 3), 16) +
    ', ' +
    Number.parseInt(labelColorHex.slice(3, 5), 16) +
    ', ' +
    Number.parseInt(labelColorHex.slice(5, 7), 16) +
    ', ' +
    alpha +
    ')'
  )
}

export function createPlanLabel(runtime: StudioAppRuntime, labelSpec: any) {
  const labelCanvas = document.createElement('canvas')
  ;(labelCanvas.width = 2048), (labelCanvas.height = 640)
  const labelCanvasPainter = labelCanvas.getContext('2d'),
    labelColors = planLabelThemeColors(labelSpec.labelColor, runtime.backgroundSettings()),
    labelPaintColor = labelColors.text
  labelCanvasPainter!.clearRect(0, 0, labelCanvas.width, labelCanvas.height),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = 'left'),
    (labelCanvasPainter!.textBaseline = 'middle')
  const labelTitleText = normalizeLabelText2(labelSpec.title, '家庭总览', 24),
    labelSubtitleText = normalizeLabelText2(labelSpec.subtitle, 'HOME PLAN', 36),
    labelTitleX = 115,
    labelTitleFontSize = 184
  ;(labelCanvasPainter!.font = dashboardCanvasFont('700 ' + labelTitleFontSize + 'px', 'sans-serif')),
    drawTrackedText2(
      labelCanvasPainter,
      labelTitleText,
      labelTitleX,
      130,
      labelTitleFontSize * clamp2(finite2(labelSpec.titleSpacing, 1.05), 0, 1.8),
      1340,
    )
  const labelGlyphX = 1580,
    labelGlyphY = 130,
    labelGlyphSize = 170
  ;(labelCanvasPainter!.fillStyle = labelPaintColor),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelGlyphX, labelGlyphY - labelGlyphSize * 0.58),
    labelCanvasPainter!.lineTo(labelGlyphX + labelGlyphSize * 0.56, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.lineTo(labelGlyphX + labelGlyphSize * 0.38, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.lineTo(labelGlyphX + labelGlyphSize * 0.38, labelGlyphY + labelGlyphSize * 0.5),
    labelCanvasPainter!.lineTo(labelGlyphX - labelGlyphSize * 0.38, labelGlyphY + labelGlyphSize * 0.5),
    labelCanvasPainter!.lineTo(labelGlyphX - labelGlyphSize * 0.38, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.lineTo(labelGlyphX - labelGlyphSize * 0.56, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.closePath(),
    labelCanvasPainter!.fill(),
    labelCanvasPainter!.save(),
    (labelCanvasPainter!.globalCompositeOperation = 'destination-out'),
    labelCanvasPainter!.fillRect(
      labelGlyphX - labelGlyphSize * 0.09,
      labelGlyphY + labelGlyphSize * 0.2,
      labelGlyphSize * 0.18,
      labelGlyphSize * 0.3,
    ),
    labelCanvasPainter!.restore(),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = 'left')
  const labelSubtitleFontSize = 310
  ;(labelCanvasPainter!.font = dashboardCanvasFont(
    '400 ' + labelSubtitleFontSize + 'px',
    '"Arial Narrow", Arial, sans-serif',
  )),
    drawTrackedText2(
      labelCanvasPainter,
      labelSubtitleText,
      72,
      410,
      labelSubtitleFontSize * clamp2(finite2(labelSpec.subtitleSpacing, 0.08), 0, 0.6),
      1880,
    )
  const labelLineStartX = 74,
    labelLineEndX = labelLineStartX + 1880 * clamp2(finite2(labelSpec.lineLength, 0.86), 0.3, 1)
  ;(labelCanvasPainter!.strokeStyle = labelColors.line || runtime.planLabelAccentColor(labelPaintColor)),
    (labelCanvasPainter!.lineWidth = 16),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelLineStartX, 590),
    labelCanvasPainter!.lineTo(labelLineEndX, 590),
    labelCanvasPainter!.moveTo(labelLineStartX, 566),
    labelCanvasPainter!.lineTo(labelLineStartX, 614),
    labelCanvasPainter!.moveTo(labelLineEndX, 566),
    labelCanvasPainter!.lineTo(labelLineEndX, 614),
    labelCanvasPainter!.stroke()
  const labelTexture = new ns2.CanvasTexture(labelCanvas)
  applyTextureQuality(labelTexture, runtime.appCtx.threeRenderer, ns2.SRGBColorSpace)
  labelTexture.needsUpdate = true
  const labelPlaneMesh = new ns2.Mesh(
    new ns2.PlaneGeometry(labelSpec.width, labelSpec.depth),
    new ns2.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
      side: ns2.DoubleSide,
      forceSinglePass: runtime.isEmbeddedStage,
    }),
  )
  return (
    (labelPlaneMesh.rotation.x = -Math.PI / 2),
    (labelPlaneMesh.position.y = 0.008),
    (labelPlaneMesh.castShadow = false),
    (labelPlaneMesh.receiveShadow = false),
    (labelPlaneMesh.renderOrder = 8),
    labelPlaneMesh
  )
}

export function collectLightSourceSpecs(runtime: StudioAppRuntime) {
  return new Set(
    selectShadowCastingLightIds2(
      runtime.appCtx.studioState.items.map((lightSourceItem) => ({
        id: lightSourceItem.id,
        groupId: lightSourceItem.lightGroupId,
        type: lightSourceItem.type,
        brightness: finite2(
          lightSourceItem.lightBrightness,
          (lightPresetCatalog as any)[lightSourceItem.type]?.brightness || 0,
        ),
        enabled: lampItemTypeSet.has(lightSourceItem.type) && runtime.isLampEnabled(lightSourceItem),
      })),
      maxTextureUnitLimit,
    ),
  )
}
