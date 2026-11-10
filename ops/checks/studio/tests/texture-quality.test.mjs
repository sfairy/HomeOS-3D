import { describe, expect, test } from 'bun:test'
import {
  TEXTURE_ANISOTROPY_CAP,
  applyTextureQuality,
  applyTreeTextureAnisotropy,
  isLegacyTextureQuality,
  textureAnisotropyFor,
} from '../../../../homeos/frontend/src/studio/app/3d-studio/render-kit/texture-quality.ts'

const renderer = (max) => ({ capabilities: { getMaxAnisotropy: () => max } })
const texture = (anisotropy = 1) => ({ isTexture: true, anisotropy, needsUpdate: false })

describe('texture-quality', () => {
  test('anisotropy is capped by device and policy', () => {
    expect(textureAnisotropyFor(renderer(16))).toBe(TEXTURE_ANISOTROPY_CAP)
    expect(textureAnisotropyFor(renderer(4))).toBe(4)
    expect(textureAnisotropyFor(null)).toBe(1)
    expect(textureAnisotropyFor(0)).toBe(1)
  })

  test('applyTextureQuality sets color space only when given', () => {
    const color = applyTextureQuality(texture(), renderer(16), 'srgb')
    expect(color).toMatchObject({ anisotropy: 8, colorSpace: 'srgb' })
    const data = applyTextureQuality({ isTexture: true, colorSpace: 'none' }, 2)
    expect(data).toMatchObject({ anisotropy: 2, colorSpace: 'none' })
  })

  test('tree pass only raises and never forces a re-upload', () => {
    const low = texture(1)
    const high = texture(16)
    const emissive = texture(1)
    const root = {
      traverse(visit) {
        visit({ material: { map: low, normalMap: high } })
        visit({ material: [{ emissiveMap: emissive }, null] })
        visit({})
      },
    }
    expect(applyTreeTextureAnisotropy(root, 8)).toBe(2)
    expect(low).toMatchObject({ anisotropy: 8, needsUpdate: false })
    expect(high.anisotropy).toBe(16)
    expect(emissive.anisotropy).toBe(8)
    expect(applyTreeTextureAnisotropy(root, 8)).toBe(0)
  })

  test('legacy flag', () => {
    expect(isLegacyTextureQuality('?texture-quality=legacy')).toBe(true)
    expect(isLegacyTextureQuality('?x=1')).toBe(false)
  })
})
