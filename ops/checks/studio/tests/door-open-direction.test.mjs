/**
 * 全部门型的开合朝向契约测试，逐项对照 0.8.1。
 *
 * 0.8.1 的开向规则只有一条，对所有平开门共用：
 *
 *   转角 = |openAngle| × (铰链在右 ? +1 : -1) × 室内侧 × 开门方向
 *
 * 「室内侧」由 `doorInteriorSide` 从楼层闭合多边形探出来，**不是** `swing`。
 * `swing` 只负责门扇贴面 / 门套 / 把手的朝向（美术上的「内外翻转」），
 * 所以翻 swing 不会让三维门换边开 —— 这点常被误当成 bug。
 *
 * 三种门型在几何侧的表达不同，但都必须落到同一条规则上：
 *
 * | 门型 | 枢轴 | 门扇在枢轴内的偏移 | doorFixedHinge | 几何侧写的 doorOpenRotation |
 * |---|---|---|---|---|
 * | solid / glass | 铰链侧洞口边 | 朝洞口中心 | 否 | 不写（0.8.1 也没有） |
 * | entry | 铰链侧洞口边 | 朝洞口中心 | 否 | 不写 |
 * | entry-child-mother | 铰链侧洞口边 | 朝洞口中心（只含母门） | 是 | 不写 |
 * | double | 每扇各在洞口边 | 朝洞口中心 | 是 | 写入 ±0.42π（唯一一处） |
 *
 * 另外两类不是转动，方向由别的字段决定：
 * - sliding-glass：`doorSlideSide` 与 `openDirection` 同侧的那扇滑开；
 * - roller-shutter：沿 +y 收卷；
 * - frame-only：`doorAnimationType = static`，运行时完全不动。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCK_MOTION = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/security/lock-motion.ts', import.meta.url),
)
const GEOMETRY = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/plan/geometry.ts', import.meta.url),
)
const STUDIO_WALLS = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-walls.ts',
    import.meta.url,
  ),
)

const { createLockMotion } = await import(LOCK_MOTION)
const { doorInteriorSide } = await import(GEOMETRY)

const OPEN_ANGLE = 80
const OPEN_STATES = { 'binary_sensor.door': { state: 'on', available: true } }
const CLOSED_STATES = { 'binary_sensor.door': { state: 'off', available: true } }
const LEAF_THICKNESS = 0.065
const PPM = 100

function createNode(userData, { x = 0, y = 0, rotationY = 0, scaleX = 1 } = {}) {
  return {
    userData,
    position: { x, y, z: 0 },
    rotation: { x: 0, y: rotationY, z: 0 },
    scale: { x: scaleX, y: 1, z: 1 },
    parent: null,
    children: [],
    add(child) {
      child.parent = this
      this.children.push(child)
      return child
    },
    traverse(visit) {
      visit(this)
      for (const child of this.children) child.traverse(visit)
    },
  }
}

/**
 * 按 `studio-walls` 各分支的真实写法造门：枢轴位置 / 门扇偏移 / userData 都与几何侧一致。
 * `doorWidth` 只影响洞口与门扇长度，不影响符号。
 */
function createDoorRig({
  doorType = 'solid',
  hinge = 'right',
  interiorSide = 1,
  doorWidth = 1,
  animationType,
  doorOpenRotation,
  fixedHinge = false,
  pivotHinge = hinge,
} = {}) {
  const pivotSign = pivotHinge === 'right' ? 1 : -1
  const leafWidth = doorWidth - LEAF_THICKNESS * 1.4
  const modelRoot = createNode({})
  const doorGroup = createNode({
    environmentModelId: 'door:d1',
    environmentFloorId: 'f1',
    environmentModelType: 'door',
    doorAnimationType: animationType ?? 'wood',
    doorInteriorSide: interiorSide,
    doorLeafWidth: leafWidth,
    doorClosedRotation: 0,
  })
  modelRoot.add(doorGroup)

  // 枢轴贴在铰链侧洞口边，门扇朝洞口中心伸出（solid / glass / entry / 子母门母门都是这样）。
  const pivotX = pivotSign * (doorWidth / 2 - LEAF_THICKNESS * 0.5)
  const pivot = createNode(
    {
      doorHingePivot: true,
      doorRestRotation: 0,
      ...(doorType === 'entry' || doorType === 'entry-child-mother' ? { entryDoorPivot: true } : {}),
      ...(fixedHinge ? { doorFixedHinge: true } : {}),
      ...(doorOpenRotation === undefined ? {} : { doorOpenRotation }),
    },
    { x: pivotX },
  )
  pivot.add(createNode({}, { x: -pivotSign * (leafWidth / 2) }))
  doorGroup.add(pivot)

  return {
    modelRoot,
    doorGroup,
    pivot,
    leafWidth,
    bindings: [
      {
        id: 'lock:1',
        modelId: 'door:d1',
        floorId: 'f1',
        doorEntityId: 'binary_sensor.door',
        doorType,
        hinge,
        openAngle: OPEN_ANGLE,
        openDirection: 1,
        duration: 0.7,
      },
    ],
  }
}

/** 门扇自由边在墙体法线方向（局部 +z）上的位置：R_y(θ)·(offsetX,0) 的 z 分量 = -offsetX·sinθ。 */
function leafTipSide(rig) {
  const leaf = rig.pivot.children[0]
  return Math.sign(-leaf.position.x * Math.sin(rig.pivot.rotation.y))
}

// ---------------------------------------------------------------- 平开门：三种表达同一规则

const HINGE_TYPES = [
  { doorType: 'solid', label: '平开门（木）', animationType: 'wood', authorsOpenRotation: true },
  { doorType: 'glass', label: '玻璃门', animationType: 'glass', authorsOpenRotation: true },
  { doorType: 'entry', label: '入户门', animationType: 'entry' },
  {
    doorType: 'entry-child-mother',
    label: '入户子母门（母门）',
    animationType: 'entry',
    fixedHinge: true,
  },
]

for (const doorCase of HINGE_TYPES) {
  for (const hinge of ['left', 'right']) {
    for (const interiorSide of [1, -1]) {
      for (const swing of [1, -1]) {
        test(`${doorCase.label}：hinge=${hinge} 室内侧=${interiorSide} swing=${swing} 朝屋里开`, () => {
          // 几何侧对普通门扇会按 swing 写一个开门位；有室内侧时运行时必须忽略它。
          const authoredOpenRotation = doorCase.authorsOpenRotation
            ? -(swing === -1 ? -1 : 1) * Math.PI * 0.42
            : undefined
          const rig = createDoorRig({
            ...doorCase,
            hinge,
            interiorSide,
            doorOpenRotation: authoredOpenRotation,
          })
          createLockMotion({ modelRoot: rig.modelRoot }).sync(rig.bindings, OPEN_STATES)

          const openedAngle = rig.pivot.rotation.y
          assert.ok(
            Math.abs(Math.abs(openedAngle) - (OPEN_ANGLE * Math.PI) / 180) < 1e-6,
            `开门角度应是 ${OPEN_ANGLE}°，实际 ${(Math.abs(openedAngle) * 180) / Math.PI}°`,
          )
          // 0.8.1：符号 = 铰链侧 × 室内侧，与 swing 无关。
          assert.equal(
            Math.sign(openedAngle),
            (hinge === 'right' ? 1 : -1) * interiorSide,
            `开向反了（rotation=${openedAngle}）`,
          )
          assert.equal(leafTipSide(rig), interiorSide, '门扇摆到了屋里反侧')
          // swing 只改门扇贴面朝向，不能改变开向。
          const swingRig = createDoorRig({
            ...doorCase,
            hinge,
            interiorSide,
            doorOpenRotation: doorCase.authorsOpenRotation
              ? (swing === -1 ? -1 : 1) * Math.PI * 0.42
              : undefined,
          })
          createLockMotion({ modelRoot: swingRig.modelRoot }).sync(swingRig.bindings, OPEN_STATES)
          assert.equal(swingRig.pivot.rotation.y, openedAngle, 'swing 不该改变开门转角')
        })
      }
    }
  }
}

// ---------------------------------------------------------------- 双开门：两扇同侧开

for (const interiorSide of [1, -1]) {
  for (const swing of [1, -1]) {
    test(`双开门：室内侧=${interiorSide} swing=${swing} 两扇都朝屋里开`, () => {
      const doorWidth = 1.6
      const modelRoot = createNode({})
      const doorGroup = createNode({
        environmentModelId: 'door:d1',
        environmentFloorId: 'f1',
        environmentModelType: 'door',
        doorAnimationType: 'double',
        doorInteriorSide: interiorSide,
        doorClosedRotation: 0,
      })
      modelRoot.add(doorGroup)
      const authoredAngle = (swing === -1 ? 1 : -1) * Math.PI * 0.42
      const pivots = []
      for (const leafSign of [-1, 1]) {
        const pivot = createNode(
          {
            doorHingePivot: true,
            doorFixedHinge: true,
            doorRestRotation: leafSign < 0 ? authoredAngle : -authoredAngle,
            doorOpenRotation: leafSign < 0 ? authoredAngle : -authoredAngle,
          },
          {
            x: leafSign * (doorWidth / 2 - LEAF_THICKNESS * 0.5),
            rotationY: leafSign < 0 ? authoredAngle : -authoredAngle,
          },
        )
        const leafWidth = Math.max((doorWidth - LEAF_THICKNESS) / 2 - 0.003, 0.25)
        pivot.add(createNode({}, { x: leafSign < 0 ? leafWidth / 2 : -leafWidth / 2 }))
        doorGroup.add(pivot)
        pivots.push(pivot)
      }
      createLockMotion({ modelRoot }).sync(
        [
          {
            id: 'lock:1',
            modelId: 'door:d1',
            floorId: 'f1',
            doorEntityId: 'binary_sensor.door',
            openAngle: OPEN_ANGLE,
            openDirection: 1,
            duration: 0.7,
          },
        ],
        OPEN_STATES,
      )
      for (const pivot of pivots) {
        const leaf = pivot.children[0]
        assert.equal(
          Math.sign(-leaf.position.x * Math.sin(pivot.rotation.y)),
          interiorSide,
          `某一扇朝反侧开了（pivotX=${pivot.position.x} rotation=${pivot.rotation.y}）`,
        )
        assert.ok(
          Math.abs(Math.abs(pivot.rotation.y) - (OPEN_ANGLE * Math.PI) / 180) < 1e-6,
          '双开门两扇都应开到配置角度',
        )
      }
    })
  }
}

// ---------------------------------------------------------------- 推拉 / 卷帘 / 静置

for (const interiorSide of [1, -1]) {
  test(`玻璃推拉门：只有 doorSlideSide === -openDirection 的那扇滑开（室内侧=${interiorSide} 无关）`, () => {
    const modelRoot = createNode({})
    const doorGroup = createNode({
      environmentModelId: 'door:d1',
      environmentFloorId: 'f1',
      environmentModelType: 'door',
      doorAnimationType: 'sliding',
      doorInteriorSide: interiorSide,
      doorSlideOpenTranslation: 0.5,
      doorSlideClosedTranslation: 0,
    })
    modelRoot.add(doorGroup)
    const panels = [-1, 1].map((panelSign) => {
      const panel = createNode(
        {
          doorSlidePivot: true,
          doorSlideSide: panelSign,
          doorRestTranslation: 0,
          doorSlideTravel: 0.5,
        },
        { x: 0 },
      )
      doorGroup.add(panel)
      return panel
    })
    createLockMotion({ modelRoot }).sync(
      [
        {
          id: 'lock:1',
          modelId: 'door:d1',
          floorId: 'f1',
          doorEntityId: 'binary_sensor.door',
          openDirection: 1,
          duration: 0.7,
        },
      ],
      OPEN_STATES,
    )
    // openDirection = 1 → 滑开的是 doorSlideSide === -1 的那扇。
    assert.ok(Math.abs(panels[0].position.x - 0.5) < 1e-9, '反向那扇应滑满行程')
    assert.ok(Math.abs(panels[1].position.x) < 1e-9, '同侧那扇不应动')
  })
}

test('卷帘门：沿 +y 收卷到 doorRollerOpenTranslation，不转动', () => {
  const modelRoot = createNode({})
  const doorGroup = createNode({
    environmentModelId: 'door:d1',
    environmentFloorId: 'f1',
    environmentModelType: 'door',
    doorAnimationType: 'roller',
    doorInteriorSide: 1,
    doorRollerOpenTranslation: 2.1,
    doorRollerClosedTranslation: 0,
  })
  modelRoot.add(doorGroup)
  const roller = createNode(
    {
      doorRollerPivot: true,
      doorRestTranslation: 0,
      doorRollerOpenTranslation: 2.1,
      doorRollerClosedTranslation: 0,
    },
    { y: 0 },
  )
  doorGroup.add(roller)
  createLockMotion({ modelRoot }).sync(
    [
      {
        id: 'lock:1',
        modelId: 'door:d1',
        floorId: 'f1',
        doorEntityId: 'binary_sensor.door',
        openDirection: 1,
        duration: 0.7,
      },
    ],
    OPEN_STATES,
  )
  assert.ok(Math.abs(roller.position.y - 2.1) < 1e-9, `应升到 2.1，实际 ${roller.position.y}`)
  assert.equal(roller.rotation.y, 0)
})

test('仅门框：doorAnimationType=static，开门状态也不产生任何位移/转角', () => {
  const rig = createDoorRig({ doorType: 'frame-only', animationType: 'static' })
  createLockMotion({ modelRoot: rig.modelRoot }).sync(rig.bindings, OPEN_STATES)
  assert.equal(rig.pivot.rotation.y, 0)
  assert.equal(rig.pivot.position.x, rig.doorGroup.children[0].position.x)
})

// ---------------------------------------------------------------- 几何侧契约

test('几何侧只允许两处写 doorOpenRotation：普通门扇 + 双开门扇（0.8.1 的全部）', () => {
  const source = readFileSync(STUDIO_WALLS, 'utf8')
  const authored = source.match(/doorOpenRotation/g) ?? []
  assert.equal(
    authored.length,
    2,
    '入户门 / 子母门母门 / 推拉门 / 卷帘门都不该写 doorOpenRotation —— ' +
      '它们的开向由「铰链侧 × 室内侧」或位移字段决定，写死符号会在拿不到楼层多边形时把门开向带偏' +
      `（当前 ${authored.length} 处）`,
  )
})

function createRoomPolygon(sideOfWall = 1) {
  const inner = sideOfWall * 10
  return {
    wall: {
      id: 'w1',
      start: { x: 0, y: 0 },
      end: { x: 500, y: 0 },
      thickness: 0.1,
      height: 2.8,
    },
    polygon: [
      { x: -50, y: 0 },
      { x: 550, y: 0 },
      { x: 550, y: inner * 5 },
      { x: -50, y: inner * 5 },
    ],
  }
}

test('doorInteriorSide：屋里在哪侧就返回哪侧，墙反向画时符号也反转', () => {
  const { wall, polygon } = createRoomPolygon(1)
  const door = { id: 'd1', wallId: 'w1', t: 0.5, width: 1, height: 2.1, swing: 1 }
  assert.equal(doorInteriorSide(wall, door, [polygon], PPM), 1)
  const reversedWall = { ...wall, start: wall.end, end: wall.start }
  assert.equal(doorInteriorSide(reversedWall, door, [polygon], PPM), -1)
})

test('doorInteriorSide：墙不在闭合房间上时返回 0（走无室内侧的回退路径）', () => {
  const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 500, y: 0 }, thickness: 0.1 }
  const door = { id: 'd1', wallId: 'w1', t: 0.5, width: 1, height: 2.1 }
  assert.equal(doorInteriorSide(wall, door, [], PPM), 0)
  const bothSidesPolygon = [
    { x: -50, y: -100 },
    { x: 550, y: -100 },
    { x: 550, y: 100 },
    { x: -50, y: 100 },
  ]
  assert.equal(doorInteriorSide(wall, door, [bothSidesPolygon], PPM), 0)
})

test('拿不到室内侧时：普通门扇沿用几何侧开门位的符号（-swing），入户门按铰链侧', () => {
  for (const hinge of ['left', 'right'])
    for (const swing of [1, -1]) {
      // 普通门扇：几何侧按 swing 写了 doorOpenRotation ⇒ 回退时与 swing 反向。
      const solidRig = createDoorRig({
        doorType: 'solid',
        hinge,
        interiorSide: 0,
        doorOpenRotation: -(swing === -1 ? -1 : 1) * Math.PI * 0.42,
      })
      createLockMotion({ modelRoot: solidRig.modelRoot }).sync(solidRig.bindings, OPEN_STATES)
      assert.equal(
        Math.sign(solidRig.pivot.rotation.y),
        -(swing === -1 ? -1 : 1),
        `hinge=${hinge} swing=${swing} 的普通门扇回退方向不对`,
      )
      // 入户门 / 子母门母门：几何侧不写开门位 ⇒ 回退只看铰链侧。
      const entryRig = createDoorRig({ doorType: 'entry', hinge, interiorSide: 0 })
      createLockMotion({ modelRoot: entryRig.modelRoot }).sync(entryRig.bindings, OPEN_STATES)
      assert.equal(Math.sign(entryRig.pivot.rotation.y), hinge === 'right' ? 1 : -1)
    }
})

test('模型写的铰链侧与枢轴实际所在侧相反时，回退方向整体翻一次（0.8.1 错位校正）', () => {
  const doorOpenRotation = Math.PI * 0.42
  const consistent = createDoorRig({
    doorType: 'solid',
    hinge: 'right',
    interiorSide: 0,
    doorOpenRotation,
  })
  createLockMotion({ modelRoot: consistent.modelRoot }).sync(consistent.bindings, OPEN_STATES)

  const mismatched = createDoorRig({
    doorType: 'solid',
    hinge: 'left',
    interiorSide: 0,
    doorOpenRotation,
    pivotHinge: 'right',
  })
  createLockMotion({ modelRoot: mismatched.modelRoot }).sync(mismatched.bindings, OPEN_STATES)

  assert.equal(
    Math.sign(mismatched.pivot.rotation.y),
    -Math.sign(consistent.pivot.rotation.y),
    '铰链侧与枢轴错位时没有翻转，门会朝反侧开',
  )
})

test('子母门母门：固定铰链枢轴的位置与镜像不被运行时改写', () => {
  const rig = createDoorRig({
    doorType: 'entry-child-mother',
    hinge: 'left',
    interiorSide: 1,
    fixedHinge: true,
  })
  const authoredX = rig.pivot.position.x
  const authoredScaleX = rig.pivot.scale.x
  createLockMotion({ modelRoot: rig.modelRoot }).sync(rig.bindings, OPEN_STATES)
  assert.equal(rig.pivot.position.x, authoredX, '母门枢轴被挪到了整洞宽度的一半')
  assert.equal(rig.pivot.scale.x, authoredScaleX, '母门门扇被运行时镜像翻转')
})

test('关门后回到几何侧的关闭位', () => {
  const rig = createDoorRig({ doorType: 'solid', hinge: 'right' })
  const motion = createLockMotion({ modelRoot: rig.modelRoot })
  motion.sync(rig.bindings, OPEN_STATES)
  assert.ok(Math.abs(rig.pivot.rotation.y) > 1e-3)
  motion.sync(rig.bindings, CLOSED_STATES)
  for (let tickIndex = 1; tickIndex <= 40; tickIndex += 1)
    motion.tick(tickIndex * 100, rig.bindings, CLOSED_STATES)
  assert.ok(Math.abs(rig.pivot.rotation.y) < 1e-3, `关门后应回到 0，实际 ${rig.pivot.rotation.y}`)
})
