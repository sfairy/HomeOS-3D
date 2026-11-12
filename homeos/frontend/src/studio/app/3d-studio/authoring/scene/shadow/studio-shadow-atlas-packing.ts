/** 聚光阴影图集的方块打包：按尺寸降序逐行排布，放不下就把图集边长翻倍重试。 */
const DEFAULT_TILE_GUTTER = 1

interface AtlasTile {
  index: number
  size: number
}

export interface PlacedAtlasTile extends AtlasTile {
  x: number
  y: number
}

export function toPositiveInt(input: unknown, fallback = 0) {
  const parsed = Math.floor(Number(input))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function nextPowerOfTwo(requestedValue: unknown) {
  let result = 1
  const powerOfTwo = Math.max(1, Math.ceil(Number(requestedValue) || 1))
  for (; result < powerOfTwo; ) result *= 2
  return result
}

function packTilesIntoAtlas(tiles: AtlasTile[], atlasSize: number, gutter: number): PlacedAtlasTile[] | null {
  let cursorX = gutter,
    cursorY = gutter,
    rowHeight = 0
  const placed: PlacedAtlasTile[] = []
  for (const tile of tiles) {
    const tileSize = tile.size
    if (
      (cursorX + tileSize + gutter > atlasSize &&
        ((cursorX = gutter), (cursorY += rowHeight + gutter * 2), (rowHeight = 0)),
      cursorY + tileSize + gutter > atlasSize)
    )
      return null
    placed.push({
      ...tile,
      x: cursorX,
      y: cursorY,
    }),
      (cursorX += tileSize + gutter * 2),
      (rowHeight = Math.max(rowHeight, tileSize))
  }
  return placed
}

export function packSpotShadowAtlasTiles(
  tileSizes: unknown[] = [],
  maxAtlasSize = 4096,
  tileGutter = DEFAULT_TILE_GUTTER,
): { size: number; tiles: PlacedAtlasTile[] } | null {
  const atlasLimit = toPositiveInt(maxAtlasSize, 4096),
    gutterPx = Math.max(0, Math.floor(Number(tileGutter) || 0)),
    entries = tileSizes
      .map((size, index) => ({
        index: index,
        size: toPositiveInt(size),
      }))
      .filter((entry) => entry.size > 0 && entry.size + gutterPx * 2 <= atlasLimit)
      .sort((entryA, entryB) => entryB.size - entryA.size || entryA.index - entryB.index)
  if (entries.length !== tileSizes.length) return null
  if (!entries.length) return { size: 1, tiles: [] }
  const totalArea = entries.reduce((sum, tileEntry) => sum + (tileEntry.size + gutterPx * 2) ** 2, 0)
  let atlasSizeCandidate = nextPowerOfTwo(Math.max(entries[0].size + gutterPx * 2, Math.sqrt(totalArea)))
  for (; atlasSizeCandidate <= atlasLimit; ) {
    const candidateLayout = packTilesIntoAtlas(entries, atlasSizeCandidate, gutterPx)
    if (candidateLayout) {
      const orderedTiles = new Array<PlacedAtlasTile>(tileSizes.length)
      for (const placedTile of candidateLayout) orderedTiles[placedTile.index] = placedTile
      return { size: atlasSizeCandidate, tiles: orderedTiles }
    }
    atlasSizeCandidate *= 2
  }
  return null
}
