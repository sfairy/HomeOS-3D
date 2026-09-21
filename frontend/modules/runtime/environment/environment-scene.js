/**
 * 环境氛围（页面压暗、降饱和、状态发光与光晕）：把「聚焦观感」注入户型已有材质，
 * 只让与当前任务有关的设备亮起来，并为被聚焦的模型叠加光晕。不替换材质，而是给原材质
 * onBeforeCompile 打补丁插入去饱和 + 发光 + 压暗三段逻辑，不丢原贴图与光照；基础材质被
 * 多绑定共用，故按「绑定」克隆变体材质并以 customProgramCacheKey 版本后缀强制重编译。
 * 补丁必须完整可逆：unpatchMaterial / resetScene / dispose 都要还原。setRoot 在模型树更换时
 * 重建索引；setMode 是全部观感输入入口；tick 由帧循环调用，返回 true 表示仍在淡入淡出
 * （模式开关 400ms，单材质淡入淡出 360ms）。
 */
// 状态条目归一与「按 ID 切域」只有一份实现（/static/utils/），这里经 static-helpers 桥取用。
import { readFromMapOrRecord, resolveStateEntry, stateTextOf } from "../core/static-helpers.js?v=2609220141";
// 模型定位键（楼层 + 模型）的唯一实现在 core/scene-model-key.js —— 本文件原来是它的原始出处，
// 现已提为共享实现，其余模块不再各写一份。
import { sceneModelKey } from "../core/scene-model-key.js?v=2609220141";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609220141";
import { createEnvironmentHalos } from "./environment-halos.js?v=2609220141";
/**
 * 计算「当前页面应该压暗多少、降饱和多少」。
 */
export function pageDimming(config, activeModule, isFocusMode = false) {
  // 模块 ID → 页面 ID 的归一：气候 / 窗帘都算「环境」页，NAS / 电视算「设备」页，
  // 扫地机快捷入口算「扫地机」页。查不到就用模块名本身当页面。
  const moduleKey =
    {
      climate: "environment",
      cover: "environment",
      nas: "devices",
      television: "devices",
      "vacuum-shortcut": "vacuum"
    }[activeModule] || activeModule;
  // 白名单外的页面（例如编辑器内部视图）一律不压暗，避免把别人的画布弄脏。
  if (!["overview", "light", "environment", "devices", "vacuum", "security"].includes(moduleKey)) {
    return {
      page: moduleKey,
      strength: 0,
      enabled: false
    };
  }
  /**
   * 把百分比夹到 0~100；非有限值（undefined / 字符串 / NaN）用兜底值。
   */
  const clampPercent = (candidateValue, fallbackValue) =>
    Number.isFinite(candidateValue) ? Math.max(0, Math.min(100, candidateValue)) : fallbackValue;
  // 压暗强度的取值链：页面级配置 → 环境默认（70）→ 总览页恒为 0。
  // 总览页是「看全屋」的场景，压暗会让所有设备一起变暗，得不偿失。
  const dimStrengthPercent = clampPercent(
    config.pageDimStrength?.[moduleKey],
    moduleKey === "overview" ? 0 : clampPercent(config.environment?.dimStrength, 70)
  );
  // 饱和度默认降到 75%：只靠压暗容易显得脏，一并去饱和才有「氛围光」的观感。
  const saturationPercent = clampPercent(
    config.pageSaturation?.[moduleKey],
    moduleKey === "overview" ? 100 : 75
  );
  return {
    page: moduleKey,
    saturation: saturationPercent,
    // 三项都是默认值时不必开启改造，省去一次全场材质重编译。
    enabled: moduleKey !== "overview" || dimStrengthPercent > 0 || saturationPercent < 100,
    strength: Math.min(
      100,
      dimStrengthPercent +
        // 聚焦模式再压暗一点（默认 15），让被聚焦设备与背景的对比更强。
        (isFocusMode && moduleKey !== "overview" ? clampPercent(config.focusDimStrength, 15) : 0)
    )
  };
}
// 模型类型 → 所属页面的映射，用于把静态模型也纳入页面绑定（见 pageModelBindings）。
const MODEL_TYPE_TO_PAGE = {
  wallac: "environment",
  floorac: "environment",
  airoutlet: "environment",
  curtain: "environment",
  nas: "devices",
  tv: "devices",
  robotvacuum: "vacuum",
  camera: "security",
  presence: "security"
};
// 模型类型 → 设备种类；驱动发光参数（lift）与状态取值的差异。
const MODEL_TYPE_TO_DEVICE_KIND = {
  wallac: "climate",
  floorac: "climate",
  airoutlet: "climate",
  curtain: "cover",
  nas: "nas",
  tv: "television",
  robotvacuum: "vacuum",
  camera: "camera",
  presence: "presence"
};
/**
 * 把「楼层场景里的静态模型」合成为页面绑定列表。
 * 背景：绑定了实体的设备由 stage.js 提供绑定，但户型里还可能有没绑实体、或不属于当前页面绑定集合的模型
 * （总览页要显示全部）；这里按模型类型反推所属页面，给缺绑定的模型补一个 previewOnly 展示用绑定。
 */
export function pageModelBindings(floors, sceneBindings, page, floorId) {
  // 键用 (楼层, 模型) 复合值：模型 ID 在不同楼层可能重名。
  const bindingsByKey = new Map(
    sceneBindings.map(sceneBinding => [
      sceneModelKey(sceneBinding.floorId, sceneBinding.modelId),
      sceneBinding
    ])
  );
  return floors
    .filter(floor => floorId === "all" || floor.id === floorId)
    .flatMap(floorOfScene =>
      (floorOfScene.scene?.items || []).flatMap(sceneItem => {
        const itemPage = MODEL_TYPE_TO_PAGE[sceneItem.type];
        // 类型不在映射表里（例如纯装饰构件）不参与环境特效；页面不匹配也跳过。
        if (!itemPage || (page !== "overview" && itemPage !== page)) {
          return [];
        }
        // 与上面 bindingsByKey 同一套键。注意它还派生出合成绑定的 id（`presentation:` 前缀），
        // 所以键的编码是**对外可见**的：对真实文档（楼层与模型 id 都是字符串）本函数与
        // `JSON.stringify([a, b])` 逐字节相同，id 不变。
        const modelBindingKey = sceneModelKey(floorOfScene.id, sceneItem.id);
        const existingBinding = bindingsByKey.get(modelBindingKey);
        return [
          {
            // 已有绑定在前，保证实体 ID / 状态来源等真实信息不被覆盖。
            ...existingBinding,
            // 合成 ID 用 presentation: 前缀，与真实绑定区分开，便于排查。
            id: existingBinding?.id || "presentation:" + modelBindingKey,
            floorId: floorOfScene.id,
            modelId: sceneItem.id,
            deviceKind: MODEL_TYPE_TO_DEVICE_KIND[sceneItem.type],
            modelType: sceneItem.type,
            modelAvailable: true,
            visible: true,
            // previewOnly 标记「只为展示而合成的绑定」，没有实体状态可查。
            previewOnly: !existingBinding
          }
        ];
      })
    );
}
/**
 * 创建环境氛围场景（页面压暗 / 降饱和 / 状态发光 + 光晕）。
 */
export function createEnvironmentScene({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  // 三个全局 uniform 对象被所有补丁共享（同一引用挂进 shader），改一次即可全场生效。
  // amount：页面压暗强度 0~1；mode：环境模式强度 0~1（0 表示不改造观感）；
  // saturation：饱和度 0~1，1 为原色。默认 0.75 与 pageDimming 的默认值对齐。
  const amountUniform = {
    value: 0
  };
  const modeUniform = {
    value: 0
  };
  const saturationUniform = {
    value: 0.75
  };
  // 已打补丁的材质 → 补丁记录（含原 onBeforeCompile，用于还原）。
  const patchedMaterials = new Map();
  // 基础材质 → (绑定键 → 变体材质)。同一基础材质被多个绑定共用时要各给一份变体。
  const variantsBySourceMaterial = new Map();
  // 正在做数值淡入淡出的材质变体。
  const fadingEntries = new Set();
  // 被别的模块「保留」的根节点（例如楼层过渡期间仍要显示的子树），其材质不做还原。
  const retainedRoots = new Set();
  const retainedMeshEntries = new Map();
  // 是否要求减少动态效果；判定与理由见 core/motion-preference.js，这里只是取一个本地名字。
  const prefersReducedMotion = () => prefersReducedMotionNow();
  // 光晕交给 environment-halos 维护，共享同一个 modeUniform 以保持显隐节奏一致。
  const halos = createEnvironmentHalos({
    THREE: THREE,
    modeAmount: modeUniform
  });
  // 状态发光色板：cool（制冷）/ heat（制热）与其它中性的暖白；selected 为选中高亮色。
  const stateColors = {
    cool: new THREE.Color("#c8e2eb"),
    heat: new THREE.Color("#efd1ae"),
    other: new THREE.Color("#eee9df"),
    selected: new THREE.Color("#ffe1aa")
  };
  let sceneRoot = null;
  let rootRevision;
  let meshEntries = [];
  let isDisposed = false;
  let isEnabled = false;
  let hasTraversedScene = false;
  let bindings = [];
  // 绑定签名：只有这些字段变化才需要重算材质挂载，状态变化不必重建。
  let bindingsSignature = "[]";
  let entityStates = {};
  let focusedId = "";
  let selectedId = "";
  // 已移除、但为了播完淡出动画而暂时保留的绑定：绑定键 → 绑定。
  const retiredBindings = new Map();
  /** 参与环境特效的全部绑定（含正在淡出的），不含则会导致淡出中途被还原。 */
  const activeBindings = () => [...bindings, ...retiredBindings.values()];
  let targetDimStrength = 0;
  let previousDimStrength = 0;
  let targetModeAmount = 0;
  let previousModeAmount = 0;
  // 模式淡入淡出的起始时间戳；null 表示尚未开始（下次 tick 时取当前时间）。
  let modeFadeStartMs = null;
  let materialsApplied = false;
  // 配置里未指定时的压暗强度（0.7 = 70%，与 pageDimming 的兜底值一致）。
  let configuredDimStrength = 0.7;
  /**
   * 复合绑定键：绑定 ID + 楼层 + 模型，用于识别「同一个绑定」。
   */
  const composeBindingKey = binding =>
    JSON.stringify([String(binding.id ?? ""), binding.floorId, binding.modelId]);
  /**
   * 把可能是单值 / 数组 / 空值的材质字段统一成数组。
   */
  const toArray = arrayCandidate =>
    Array.isArray(arrayCandidate) ? arrayCandidate : arrayCandidate ? [arrayCandidate] : [];
  /**
   * 判断材质能否被注入着色器补丁：白名单只收常见的内置光照材质。
   * 自定义 ShaderMaterial 的片元着色器里没有 opaque_fragment / colorspace_fragment 这些 chunk，注入会编译失败。
   */
  const isSupportedMaterial = materialCandidate =>
    materialCandidate?.isMaterial &&
    !materialCandidate.isShaderMaterial &&
    (materialCandidate.isMeshStandardMaterial ||
      materialCandidate.isMeshPhysicalMaterial ||
      materialCandidate.isMeshBasicMaterial ||
      materialCandidate.isMeshLambertMaterial ||
      materialCandidate.isMeshPhongMaterial ||
      materialCandidate.isMeshToonMaterial);
  /**
   * 造一组 uniform 引用：amount 全局共享（页面压暗全场同值），retain / glow / lift 每组独立。
   * 它们是「按绑定」的发光参数；lift 默认 [0.12, 0.8] 是中性设备的发光抬升曲线。
   */
  const createUniforms = () => ({
    amount: amountUniform,
    retain: {
      value: 0
    },
    glow: {
      value: new THREE.Color(0, 0, 0)
    },
    lift: {
      value: new THREE.Vector2(0.12, 0.8)
    }
  });
  // 基础材质（未被任何绑定接管的那种）共用的 uniform 组，保证未绑定模型整体压暗生效。
  const baseUniforms = createUniforms();
  /**
   * 给材质打上环境特效补丁（幂等：同一材质只打一次）。
   */
  function patchMaterial(material, uniforms, sourceMaterial = null) {
    if (!isSupportedMaterial(material) || patchedMaterials.has(material)) {
      return;
    }
    const previousOnBeforeCompile = material.onBeforeCompile;
    const previousProgramCacheKey = material.customProgramCacheKey;
    // 用 hasOwn 区分「材质自己定义过」与「从原型继承的默认实现」：
    // 还原时前者要赋回原值，后者必须 delete，否则会给材质留下一个多余的自有属性。
    const hadOnBeforeCompile = Object.hasOwn(material, "onBeforeCompile");
    const hadProgramCacheKey = Object.hasOwn(material, "customProgramCacheKey");
    // 变体材质要接在来源材质的注入链之后：链上的每一环都必须被执行，
    // 否则来源材质自己的自定义注入会被我们顶掉。
    const existingPatch = sourceMaterial ? patchedMaterials.get(sourceMaterial) : null;
    const priorCompile = existingPatch?.priorCompile || previousOnBeforeCompile;
    const priorKey = existingPatch?.priorKey || previousProgramCacheKey;
    // cacheKey 的调用者（this 绑定）应为材质本体，变体材质的注入属于它自己，故取 source 优先。
    const originalOwner = sourceMaterial || material;
    /**
     * 真正被 three 在编译期调用的注入函数。
     */
    const patchedOnBeforeCompile = function (shaderParameters, renderer) {
      priorCompile?.call(this, shaderParameters, renderer);
      const opaqueFragmentChunk = "#include <opaque_fragment>";
      // 两段式短路：先确认片元着色器里存在目标 chunk（否则注入无处安放），
      // 再把六个 uniform 挂到 shader 上并检查是否已经注入过（防止重复 replace）。
      if (
        !shaderParameters.fragmentShader.includes(opaqueFragmentChunk) ||
        ((shaderParameters.uniforms.hbEnvironmentAmount = uniforms.amount),
        (shaderParameters.uniforms.hbEnvironmentMode = modeUniform),
        (shaderParameters.uniforms.hbEnvironmentSaturation = saturationUniform),
        (shaderParameters.uniforms.hbEnvironmentRetain = uniforms.retain),
        (shaderParameters.uniforms.hbEnvironmentGlow = uniforms.glow),
        (shaderParameters.uniforms.hbEnvironmentLift = uniforms.lift),
        shaderParameters.fragmentShader.includes("uniform float hbEnvironmentAmount;"))
      ) {
        return;
      }
      // 注入点选在 opaque_fragment 之后：此时 outgoingLight 已经算完，改它等于改最终物体色，
      // 又早于色彩空间转换，因此后续的色调映射 / sRGB 处理仍然生效。
      shaderParameters.fragmentShader =
        "uniform float hbEnvironmentAmount;\nuniform float hbEnvironmentMode;\nuniform float hbEnvironmentSaturation;\nuniform float hbEnvironmentRetain;\nuniform vec3 hbEnvironmentGlow;\nuniform vec2 hbEnvironmentLift;\n" +
        shaderParameters.fragmentShader.replace(
          opaqueFragmentChunk,
          // 三段逻辑：① 按 Rec.709 亮度混合去饱和（分量 1.005/1.0/0.99 让去饱和后的灰略偏暖，
          // 纯灰会显得死板）；② 叠加发光色；③ lift 把发光按当前亮度抬升，亮处更亮、暗处靠常量托底。
          "float hbEnvironmentLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\noutgoingLight = mix(outgoingLight, vec3(hbEnvironmentLuma) * vec3(1.005, 1.0, 0.99), hbEnvironmentMode * (1.0 - hbEnvironmentRetain) * (1.0 - hbEnvironmentSaturation));\noutgoingLight += hbEnvironmentGlow * hbEnvironmentMode * (vec3(hbEnvironmentLift.x) + clamp(outgoingLight, 0.0, 1.0) * hbEnvironmentLift.y);\n" +
            opaqueFragmentChunk
        );
      // 整体压暗放在色彩空间转换之后：直接乘最终颜色，压暗不会被 tone mapping 回弹。
      // retain 越接近 1 越保留原色（被聚焦 / 被选中的设备就靠它保持亮度）。
      const colorSpaceFragmentChunk = "#include <colorspace_fragment>";
      shaderParameters.fragmentShader = shaderParameters.fragmentShader.replace(
        colorSpaceFragmentChunk,
        colorSpaceFragmentChunk +
          "\ngl_FragColor.rgb *= mix(1.0, 0.15, hbEnvironmentAmount * (1.0 - hbEnvironmentRetain));"
      );
    };
    // 着色器缓存键：三段注入的源码一变就必须换 key，否则 three 会复用旧 program；版本后缀 v7 手工递增。
    // 键的取法分两种情况：原材质若用 three 默认实现（恒为空串）则改用注入函数源码当键，
    // 否则所有打过补丁的材质会哈希到同一个 program，互相串味。
    const patchedProgramCacheKey = function () {
      return (
        (priorKey === THREE.Material.prototype.customProgramCacheKey
          ? priorCompile?.toString() || ""
          : priorKey?.call(originalOwner) || "") + "|hb-environment-saturation-v7"
      );
    };
    // 记全所有原始值，unpatchMaterial 必须能精确还原到补丁前的状态。
    patchedMaterials.set(material, {
      oldCompile: previousOnBeforeCompile,
      oldKey: previousProgramCacheKey,
      hasCompile: hadOnBeforeCompile,
      hasKey: hadProgramCacheKey,
      priorCompile: priorCompile,
      priorKey: priorKey,
      compile: patchedOnBeforeCompile,
      key: patchedProgramCacheKey,
      source: sourceMaterial
    });
    material.onBeforeCompile = patchedOnBeforeCompile;
    material.customProgramCacheKey = patchedProgramCacheKey;
    // 改了注入函数必须让 three 重新编译该材质。
    material.needsUpdate = true;
  }
  /**
   * 把所有 mesh 的材质从「变体」换回原始材质，并隐藏光晕。
   */
  function detachAppliedMaterials() {
    halos.setVisible(false);
    for (const entry of meshEntries) {
      // 只在当前材质确实还是我们挂上去的那份变体时才换回：模型可能已被别的模块
      // 替换过材质，强行覆盖会破坏别人的状态。
      if (entry.applied && entry.mesh.material === entry.applied) {
        entry.mesh.material = entry.original;
      }
    }
    materialsApplied = false;
  }
  /**
   * 彻底重置场景侧状态（换模型根 / dispose 时用）：还原材质、清空索引与光晕。
   */
  function resetScene() {
    for (const retainedEntry of retainedMeshEntries.values()) {
      if (retainedEntry.applied && retainedEntry.mesh.material === retainedEntry.applied) {
        retainedEntry.mesh.material = retainedEntry.original;
      }
    }
    retainedMeshEntries.clear();
    retainedRoots.clear();
    detachAppliedMaterials();
    halos.clear();
    fadingEntries.clear();
    retiredBindings.clear();
    // 逐份还原补丁，再释放变体材质；顺序不能反：变体的还原逻辑依赖补丁记录。
    for (const [patchedMaterial, materialPatch] of patchedMaterials) {
      unpatchMaterial(patchedMaterial, materialPatch);
    }
    for (const variantsOfMaterial of variantsBySourceMaterial.values()) {
      for (const variant of variantsOfMaterial.values()) {
        variant.material.dispose();
      }
    }
    patchedMaterials.clear();
    variantsBySourceMaterial.clear();
    meshEntries = [];
    hasTraversedScene = false;
  }
  /**
   * 撤销一个材质的补丁，恢复补丁前的方法与 cacheKey。
   */
  function unpatchMaterial(targetMaterial, patch) {
    let didRestore = false;
    // 只在当前方法仍是我们注入的那个时才还原：材质可能已被别人重新赋值，
    // 这时"还原"会把别人的实现覆盖掉。
    if (targetMaterial.onBeforeCompile === patch.compile) {
      if (patch.hasCompile) {
        targetMaterial.onBeforeCompile = patch.oldCompile;
      } else {
        // 原本是继承自原型的默认实现，必须 delete 掉自有属性才算真正还原。
        delete targetMaterial.onBeforeCompile;
      }
      didRestore = true;
    }
    if (targetMaterial.customProgramCacheKey === patch.key) {
      if (patch.hasKey) {
        targetMaterial.customProgramCacheKey = patch.oldKey;
      } else {
        delete targetMaterial.customProgramCacheKey;
      }
      didRestore = true;
    }
    if (didRestore) {
      // 自己克隆出来的变体材质由我们负责销毁；来自模型的原始材质绝不能 dispose，
      // 它还被场景里其它 mesh 用着（patch.source 非空即表示这是变体）。
      if (!patch.source) {
        targetMaterial.dispose();
      }
      targetMaterial.needsUpdate = true;
    }
  }
  /**
   * 取（必要时创建）某个基础材质在某绑定下的变体材质。
   * 之所以要变体：一份基础材质常被多个模型共用（同一款空调），而每个绑定的发光色与 lift 各不相同，
   * 共享材质会让后设置的绑定覆盖前一个。
   */
  function resolveVariantMaterial(baseMaterial, targetBinding) {
    if (!isSupportedMaterial(baseMaterial)) {
      return baseMaterial;
    }
    let variantsBySource = variantsBySourceMaterial.get(baseMaterial);
    if (!variantsBySource) {
      variantsBySource = new Map();
      variantsBySourceMaterial.set(baseMaterial, variantsBySource);
    }
    const bindingKey = composeBindingKey(targetBinding);
    let resolvedVariant = variantsBySource.get(bindingKey);
    if (!resolvedVariant) {
      const variantMaterial = baseMaterial.clone();
      const variantUniforms = createUniforms();
      // clone() 不会深拷贝 defines，不补回去会让变体丢失基础材质的编译开关
      // （贴图 / 法线等特性就是靠 defines 打开的）。
      if (baseMaterial.defines) {
        variantMaterial.defines = {
          ...baseMaterial.defines
        };
      }
      // 反向指针：patchMaterial 靠它把变体的注入链挂到来源材质之后。
      Object.defineProperty(variantMaterial, "environmentSourceMaterial", {
        value: baseMaterial,
        configurable: true
      });
      patchMaterial(variantMaterial, variantUniforms, baseMaterial);
      resolvedVariant = {
        material: variantMaterial,
        uniforms: variantUniforms,
        binding: targetBinding
      };
      variantsBySource.set(bindingKey, resolvedVariant);
    }
    // 每帧都刷新绑定引用与 lift：绑定对象可能被重新构造（配置热更新）。
    resolvedVariant.binding = targetBinding;
    resolvedVariant.uniforms.lift.value.set(
      // lift 决定发光的形态：窗帘是薄布，几乎不吃自发光（0.025 / 0.9）；
      // 空调外壳大，常量托底给高一点（0.16 / 1.05）让整机亮起来；
      // 其余设备取中性值（0.12 / 0.8）。
      ...(targetBinding.deviceKind === "cover"
        ? [0.025, 0.9]
        : targetBinding.deviceKind === "climate"
          ? [0.16, 1.05]
          : [0.12, 0.8])
    );
    return resolvedVariant.material;
  }
  /**
   * 按当前绑定把每个 mesh 的材质挂成对应变体（没绑定的还原为原始材质）。
   */
  function applyBindingMaterials() {
    // 完全关闭且淡出结束时才允许「拆掉」特效，否则淡出过程中材质会被提前还原而闪一下。
    if (!sceneRoot || (!isEnabled && amountUniform.value === 0 && modeUniform.value === 0)) {
      detachAppliedMaterials();
      pruneMaterialVariants();
      return;
    }
    halos.sync(
      sceneRoot,
      activeBindings(),
      rootRevision,
      // 光晕按模型键定位，复用索引好的 mesh 记录，避免重复遍历模型树。
      new Map(
        meshEntries
          .filter(filteredEntry => filteredEntry.modelNode)
          .map(entryWithModel => [entryWithModel.modelKey, entryWithModel.modelNode])
      )
    );
    halos.setVisible(true);
    // 一个模型可能被多个绑定命中（真实绑定 + 展示用合成绑定），取第一个即可：
    // 材质只有一套，挑一个代表就够，重复挂载没有意义。
    const bindingsByModelKey = new Map();
    for (const pageBinding of activeBindings()) {
      if (pageBinding.modelId != null && pageBinding.visible !== false) {
        const modelKey = sceneModelKey(pageBinding.floorId, pageBinding.modelId);
        if (!bindingsByModelKey.has(modelKey)) {
          bindingsByModelKey.set(modelKey, pageBinding);
        }
      }
    }
    for (const meshEntry of meshEntries) {
      const bindingForEntry = bindingsByModelKey.get(meshEntry.modelKey);
      if (bindingForEntry) {
        const appliedMaterials = toArray(meshEntry.original).map(mappedMaterial =>
          resolveVariantMaterial(mappedMaterial, bindingForEntry)
        );
        // 原始材质是数组（多材质网格）时变体也保持数组，形态必须一致。
        meshEntry.applied = Array.isArray(meshEntry.original)
          ? appliedMaterials
          : appliedMaterials[0];
        meshEntry.mesh.material = meshEntry.applied;
      } else {
        if (meshEntry.applied && meshEntry.mesh.material === meshEntry.applied) {
          meshEntry.mesh.material = meshEntry.original;
        }
        meshEntry.applied = null;
      }
    }
    materialsApplied = true;
    pruneMaterialVariants();
  }
  /**
   * 回收不再活跃的变体材质，防止绑定反复增删导致显存泄漏。
   */
  function pruneMaterialVariants() {
    const activeBindingKeys = new Set(activeBindings().map(composeBindingKey));
    for (const [staleSourceMaterial, variantsOfSource] of variantsBySourceMaterial) {
      for (const [candidateBindingKey, removedVariant] of variantsOfSource) {
        if (!activeBindingKeys.has(candidateBindingKey)) {
          // 从淡出队列里摘掉，否则 tick 还会去改一个已 dispose 的材质。
          fadingEntries.delete(removedVariant);
          patchedMaterials.delete(removedVariant.material);
          removedVariant.material.dispose();
          variantsOfSource.delete(candidateBindingKey);
        }
      }
      // 来源材质没有任何变体了就整条记录删掉，避免 Map 无限增长。
      if (!variantsOfSource.size) {
        variantsBySourceMaterial.delete(staleSourceMaterial);
      }
    }
  }
  /**
   * 重算每个材质变体的目标值（是否发光、发光色、强度），必要时启动淡入淡出。
   */
  function updateMaterialTargets(shouldAnimate = false, changedFloorIdsTarget = new Set()) {
    const highlightId = selectedId || focusedId;
    // 有选中 / 聚焦时，其它设备一律压到不发光，形成"只亮一个"的观感。
    const isHighlightVisible =
      !!highlightId && bindings.some(listedBinding => listedBinding.id === highlightId);
    let didChange = false;
    for (const variantMap of variantsBySourceMaterial.values()) {
      for (const materialVariant of variantMap.values()) {
        const materialBinding = materialVariant.binding;
        const targetAmount =
          // 正在淡出的绑定不再发光（retain 会归 0，颜色被去饱和吞掉）。
          !retiredBindings.has(composeBindingKey(materialBinding)) &&
          (!isHighlightVisible || materialBinding.id === highlightId)
            ? 1
            : 0;
        // NAS 这类设备的状态挂在别的实体上（statusSource.primaryEntityId），要兜一层。
        const entityId =
          materialBinding.entityId ||
          (materialBinding.deviceKind === "nas"
            ? materialBinding.statusSource?.primaryEntityId
            : "");
        // 取值口径只有一份实现（utils/state-entry.js 的 readFromMapOrRecord），本地不再手写。
        const stateRecord = readFromMapOrRecord(entityStates, entityId);
        // 状态可能是事件包裹（newState）或就是 state 本身，两种形态都兼容。
        const state = resolveStateEntry(stateRecord, {});
        const stateKey = stateTextOf(state);
        // off 也算「不活跃」，因此这里只排除空值与未知态；on / cool / heat 等都会命中色板。
        const isStateActive = !["", "off", "unknown", "unavailable"].includes(stateKey);
        const isSelected = materialBinding.id === selectedId;
        // 发光强度是观感调参表：选中最亮（1.45），窗帘固定 1.2；
        // 空调分运行 / 待机（1.35 / 1）；其它设备运行 1.125，而待机时给 0.325 而不是 0，
        // 是为了让「存在但没开」的设备仍有微弱轮廓，不至于在压暗后完全消失。
        const intensity = targetAmount
          ? isSelected
            ? 1.45
            : materialBinding.deviceKind === "cover"
              ? 1.2
              : materialBinding.deviceKind === "climate"
                ? isStateActive
                  ? 1.35
                  : 1
                : isStateActive
                  ? 1.125
                  : 0.325
          : 0;
        // 制冷 / 制热有专属色，其余状态用中性暖白；选中时一律用高亮色覆盖状态色。
        const displayColor = isSelected
          ? stateColors.selected
          : (isStateActive && stateColors[stateKey]) || stateColors.other;
        const tintedRed = intensity * displayColor.r;
        const tintedGreen = intensity * displayColor.g;
        const tintedBlue = intensity * displayColor.b;
        const materialUniforms = materialVariant.uniforms;
        const glowColor = materialUniforms.glow.value;
        const nextTarget = [targetAmount, tintedRed, tintedGreen, tintedBlue];
        // 逐分量比较后再动手：uniform 赋值会触发重绘，而这里是每帧都可能跑的路径。
        if (
          !materialVariant.target?.every((targetValue, index) => targetValue === nextTarget[index])
        ) {
          didChange = true;
          changedFloorIdsTarget.add(materialBinding.floorId);
          // 只有「模式已经打开」且允许动画时才做过渡：首次开启时 modeUniform 还是 0，
          // 此时做淡入会和整体压暗的淡入叠加，看起来像闪两下。
          if (shouldAnimate && modeUniform.value > 0 && !prefersReducedMotion()) {
            materialVariant.fade = {
              // 从当前值出发而不是从 0 出发：中途被打断也不会跳变。
              from: [materialUniforms.retain.value, glowColor.r, glowColor.g, glowColor.b],
              started: null
            };
            fadingEntries.add(materialVariant);
          } else {
            fadingEntries.delete(materialVariant);
            materialVariant.fade = null;
            materialUniforms.retain.value = targetAmount;
            glowColor.setRGB(tintedRed, tintedGreen, tintedBlue);
            halos.setColor(materialBinding.id, glowColor);
          }
          materialVariant.target = nextTarget;
        }
      }
    }
    return didChange;
  }
  /**
   * 换模型根（楼层 / 户型整体重建时调用）。
   */
  function setRoot(nextRoot, revision) {
    if (!isDisposed && (sceneRoot !== nextRoot || rootRevision !== revision)) {
      // 根节点换了才需要整套重置（还原材质、清索引）；只是版本变了可以不重建。
      if (sceneRoot !== nextRoot) {
        resetScene();
      }
      sceneRoot = nextRoot || null;
      rootRevision = revision;
      // 只有「已经开始工作」时才立刻重建索引；否则等 setMode 打开特效时再建，省一次遍历。
      if (!!hasTraversedScene || !!isEnabled || !!bindings.length) {
        indexSceneGraph();
        applyBindingMaterials();
        updateMaterialTargets();
        requestFrame();
      }
    }
  }
  /**
   * 遍历模型树，建立 mesh → 材质 / 所属模型 的索引，并给材质打补丁。
   * 这是本模块最重的一次遍历，只在根节点变化、绑定变化或首次启用时执行；已有记录会被复用（见 entriesByMesh），
   * 避免每帧重复打补丁。
   */
  function indexSceneGraph() {
    if (!sceneRoot?.traverse) {
      return;
    }
    // 复用上一轮的记录：key 为 mesh 节点。保留子树（retainedMeshEntries）优先，
    // 它们在上一轮被别的模块「占住」，材质状态要一并带过来。
    const entriesByMesh = new Map([
      ...retainedMeshEntries,
      ...meshEntries.map(indexedEntry => [indexedEntry.mesh, indexedEntry])
    ]);
    const nextMeshEntries = [];
    const usedMaterials = new Set();
    sceneRoot?.traverse?.(node => {
      // 跳过非网格、无材质，以及明确标记为 overlay 效果（人物、波纹、路线线）的节点：
      // 它们有自己的材质逻辑，被环境补丁改造会出问题。
      if (!node.isMesh || !node.material || node.userData?.environmentEffect) {
        return;
      }
      let foundModelId;
      let foundFloorId;
      let modelNode;
      // 沿父链往上一路找 environmentModelId / environmentFloorId 标记（放在模型根上）。
      // 用逗号表达式把两个查找塞进 for 的条件里，命中后置为 null 即不再重复查找，
      // 这样即使树的层级很深也只走一遍祖先链。
      for (
        let ancestorNode = node;
        ancestorNode &&
        (foundModelId == null &&
          ancestorNode.userData?.environmentModelId != null &&
          ((foundModelId = ancestorNode.userData.environmentModelId), (modelNode = ancestorNode)),
        foundFloorId == null &&
          ancestorNode.userData?.environmentFloorId != null &&
          (foundFloorId = ancestorNode.userData.environmentFloorId),
        ancestorNode !== sceneRoot);
        ancestorNode = ancestorNode.parent
      );
      const existingEntry = entriesByMesh.get(node);
      // 若当前材质是我们挂上去的变体，说明记录的 original 才是模型真正的材质，
      // 不能把变体当成新的"原始材质"存下来（否则会层层套娃）。
      const originalMaterial =
        existingEntry?.applied && node.material === existingEntry.applied
          ? existingEntry.original
          : node.material;
      const materialEntry =
        existingEntry && originalMaterial === existingEntry.original
          ? existingEntry
          : {
              mesh: node,
              original: originalMaterial,
              applied: null
            };
      materialEntry.modelNode = modelNode;
      materialEntry.modelKey =
        foundModelId == null ? null : sceneModelKey(foundFloorId, foundModelId);
      nextMeshEntries.push(materialEntry);
      // 从复用表里删掉：遍历结束后表里剩下的就是「已经不在场景里」的节点。
      entriesByMesh.delete(node);
      for (const entryOriginalMaterial of toArray(originalMaterial)) {
        usedMaterials.add(entryOriginalMaterial);
        // 未绑定任何设备的材质也打补丁，用共享的 baseUniforms 即可 —— 页面压暗是全场行为，
        // 不能让没绑实体的墙面 / 地板保持原样。
        patchMaterial(entryOriginalMaterial, baseUniforms);
      }
    });
    // 剩下的记录是「本轮遍历没见到的 mesh」：先把它们的材质还原，但保留子树例外。
    for (const staleEntry of entriesByMesh.values()) {
      let isRetainedSubtree = false;
      for (
        let ancestorOfStale = staleEntry.mesh;
        ancestorOfStale;
        ancestorOfStale = ancestorOfStale.parent
      ) {
        if (retainedRoots.has(ancestorOfStale)) {
          isRetainedSubtree = true;
          break;
        }
      }
      // 保留子树里的 mesh 暂时不可见（比如正在做楼层过渡），但稍后还会回来，
      // 此时还原材质会造成闪烁，因此只把记录挪进保留表（见下面的 retainedMeshEntries）。
      if (
        !isRetainedSubtree &&
        staleEntry.applied &&
        staleEntry.mesh.material === staleEntry.applied
      ) {
        staleEntry.mesh.material = staleEntry.original;
      }
    }
    retainedMeshEntries.clear();
    /** 判断某个节点是否位于被保留的子树内（自下而上查一次祖先链）。 */
    const isUnderRetainedRoot = startNode => {
      for (let ancestorOfMesh = startNode; ancestorOfMesh; ancestorOfMesh = ancestorOfMesh.parent) {
        if (retainedRoots.has(ancestorOfMesh)) {
          return true;
        }
      }
      return false;
    };
    for (const keptEntry of entriesByMesh.values()) {
      if (isUnderRetainedRoot(keptEntry.mesh)) {
        // 保留子树继续占着变体材质（否则变体会被 pruneMaterialVariants 回收），
        // 同时把它计入 usedMaterials，防止补丁被当成"无人使用"而撤销。
        retainedMeshEntries.set(keptEntry.mesh, keptEntry);
        for (const retainedMaterial of toArray(keptEntry.original)) {
          usedMaterials.add(retainedMaterial);
        }
      }
    }
    meshEntries = nextMeshEntries;
    // 清理孤儿资源：来源材质已经不在场景里（模型被删）时，它名下的变体也必须释放，
    // 否则反复进出编辑态会不断累积显存。
    for (const [orphanSourceMaterial, variantsOfOrphan] of variantsBySourceMaterial) {
      if (!usedMaterials.has(orphanSourceMaterial)) {
        for (const discardedVariant of variantsOfOrphan.values()) {
          fadingEntries.delete(discardedVariant);
          patchedMaterials.delete(discardedVariant.material);
          discardedVariant.material.dispose();
        }
        variantsBySourceMaterial.delete(orphanSourceMaterial);
      }
    }
    // 基础材质（不是变体，patch.source 为空）若已不再被任何 mesh 使用，就撤销补丁。
    for (const [unusedMaterial, stalePatch] of patchedMaterials) {
      if (!stalePatch.source && !usedMaterials.has(unusedMaterial)) {
        unpatchMaterial(unusedMaterial, stalePatch);
        patchedMaterials.delete(unusedMaterial);
      }
    }
    hasTraversedScene = true;
  }
  /**
   * 更新环境特效的全部输入（开关 / 强度 / 饱和度 / 绑定 / 状态 / 聚焦选中）。
   */
  function setMode(options = {}) {
    if (isDisposed) {
      return;
    }
    // 饱和度是全局 uniform，改一次即生效，不必重建材质，因此单独短路处理。
    if (Number.isFinite(options.saturation)) {
      const saturationRatio = Math.max(0, Math.min(100, options.saturation)) / 100;
      if (saturationRatio !== saturationUniform.value) {
        saturationUniform.value = saturationRatio;
        requestFrame();
      }
    }
    // 用 hasOwn 判断"这次是否显式传了"：传 false 与没传是两种语义。
    const isEnabledNext = Object.hasOwn(options, "enabled") ? options.enabled === true : isEnabled;
    if (Object.hasOwn(options, "dimStrength")) {
      const parsedDimStrength = Number(options.dimStrength);
      configuredDimStrength = Number.isFinite(parsedDimStrength)
        ? Math.max(0, Math.min(100, parsedDimStrength)) / 100
        : 0.7;
    }
    const nextBindings = Object.hasOwn(options, "bindings")
      ? Array.isArray(options.bindings)
        ? options.bindings
        : []
      : bindings;
    // 绑定签名只收「影响材质挂载」的字段：状态变化不需要重新挂材质。
    const nextSignature = JSON.stringify(
      nextBindings.map(
        ({
          id: bindingId,
          floorId: bindingFloorId,
          modelId: bindingModelId,
          entityId: bindingEntityId,
          visible: isVisible
        }) => [bindingId, bindingFloorId, bindingModelId, bindingEntityId, isVisible]
      )
    );
    const didBindingsChange = bindingsSignature !== nextSignature;
    const didEnabledChange = isEnabled !== isEnabledNext;
    // 只有「模式已经打开」时才值得播淡出：否则压暗本身还在淡入，两个过渡会叠加。
    const shouldAnimateBindings =
      didBindingsChange &&
      options.animateBindings === true &&
      modeUniform.value > 0 &&
      !prefersReducedMotion();
    if (didBindingsChange) {
      if (shouldAnimateBindings) {
        const nextBindingKeys = new Set(nextBindings.map(composeBindingKey));
        const nextModelKeys = new Set(
          nextBindings.map(nextBinding => sceneModelKey(nextBinding.floorId, nextBinding.modelId))
        );
        // 被移除的绑定先"退休"而不是立刻删：让它的发光淡出，避免设备突兀熄灯。
        for (const retiredBinding of bindings) {
          if (!nextBindingKeys.has(composeBindingKey(retiredBinding))) {
            retiredBindings.set(composeBindingKey(retiredBinding), retiredBinding);
          }
        }
        // 同一模型仍有别的绑定在，或者绑定自己又回来了，就不必再退休。
        for (const [retiredKey, pendingBinding] of retiredBindings) {
          if (
            nextBindingKeys.has(retiredKey) ||
            nextModelKeys.has(sceneModelKey(pendingBinding.floorId, pendingBinding.modelId))
          ) {
            retiredBindings.delete(retiredKey);
          }
        }
      } else {
        retiredBindings.clear();
      }
    }
    isEnabled = isEnabledNext;
    bindings = nextBindings;
    bindingsSignature = nextSignature;
    if (Object.hasOwn(options, "states")) {
      entityStates = options.states || {};
    }
    // 选中比聚焦优先：已经有选中项时不再为聚焦播动画，避免两层高亮互相盖。
    const shouldAnimateFocus =
      Object.hasOwn(options, "focusedId") &&
      (options.focusedId || "") !== focusedId &&
      !(options.selectedId ?? selectedId);
    if (Object.hasOwn(options, "focusedId")) {
      focusedId = options.focusedId || "";
    }
    if (Object.hasOwn(options, "selectedId")) {
      selectedId = options.selectedId || "";
    }
    // 关闭时目标是「不压暗、退出环境模式」，开启时用配置值。
    const nextDimStrength = isEnabled ? configuredDimStrength : 0;
    const nextModeAmount = isEnabled ? 1 : 0;
    const didMotionChange =
      nextDimStrength !== targetDimStrength || nextModeAmount !== targetModeAmount;
    if (didMotionChange) {
      // 记下当前值作为淡入淡出的起点，并把开始时间留到 tick 里再取（更贴近真实起始帧）。
      previousDimStrength = amountUniform.value;
      previousModeAmount = modeUniform.value;
      targetDimStrength = nextDimStrength;
      targetModeAmount = nextModeAmount;
      modeFadeStartMs = null;
    }
    // 首次需要在场（启用或有绑定）时才建索引：只是切页面而根节点没变的场景可以省掉遍历。
    if (!hasTraversedScene && (isEnabled || bindings.length)) {
      indexSceneGraph();
    }
    if (didBindingsChange || didEnabledChange || (!materialsApplied && isEnabled)) {
      applyBindingMaterials();
    }
    const changedFloorIds = new Set();
    const didMaterialTargetsChange = updateMaterialTargets(
      shouldAnimateFocus || shouldAnimateBindings,
      changedFloorIds
    );
    // 退休绑定已经淡完（没有正在淡出的材质）却还留在表里：清掉并重挂材质，让它们消失。
    if (retiredBindings.size && !fadingEntries.size) {
      retiredBindings.clear();
      applyBindingMaterials();
    }
    if (didEnabledChange || didMotionChange || didBindingsChange) {
      // 这几类变化会牵动全场（压暗 / 饱和度 / 材质挂载），只能整体重建。
      requestFrame();
    } else if (didMaterialTargetsChange && (isEnabled || modeUniform.value > 0)) {
      // 只是个别设备换了发光：只重建受影响楼层的地面反射，代价小得多。
      requestFrame([...changedFloorIds]);
    }
  }
  /**
   * 推进淡入淡出（每帧调用）。
   */
  function tick(timestampMs) {
    if (isDisposed) {
      return false;
    }
    // 光晕有自己的脉冲动画，先无条件推进一次。
    halos.update();
    const isModeAnimating =
      amountUniform.value !== targetDimStrength || modeUniform.value !== targetModeAmount;
    // 既没有模式过渡、也没有材质过渡时直接返回，不产生任何绘制。
    if (!isModeAnimating && !fadingEntries.size) {
      return false;
    }
    // 没有传入时间戳（部分调用方不给）时用性能时钟兜底，保证进度计算永远有基准。
    if (!Number.isFinite(timestampMs)) {
      timestampMs = globalThis.performance?.now() ?? Date.now();
    }
    let didTickChange = false;
    const tickChangedFloorIds = new Set();
    if (isModeAnimating) {
      // 起始时刻延迟到第一帧才取：setMode 与真正开始绘制之间可能隔着很久。
      if (modeFadeStartMs === null) {
        modeFadeStartMs = timestampMs;
      }
      // 整场开关的过渡时长固定 400ms；「减少动态效果」时直接跳到终值。
      const modeFadeProgress = prefersReducedMotion()
        ? 1
        : Math.max(0, Math.min(1, (timestampMs - modeFadeStartMs) / 400));
      const dimStrengthBeforeTick = amountUniform.value;
      const modeAmountBeforeTick = modeUniform.value;
      // 缓动 1-(1-p)² 是 ease-out：压暗一开始来得快、收尾柔和，比线性更像"灯慢慢暗下去"。
      amountUniform.value =
        modeFadeProgress === 1
          ? targetDimStrength
          : previousDimStrength +
            (targetDimStrength - previousDimStrength) * (1 - (1 - modeFadeProgress) ** 2);
      modeUniform.value =
        modeFadeProgress === 1
          ? targetModeAmount
          : previousModeAmount +
            (targetModeAmount - previousModeAmount) * (1 - (1 - modeFadeProgress) ** 2);
      didTickChange ||=
        dimStrengthBeforeTick !== amountUniform.value || modeAmountBeforeTick !== modeUniform.value;
    }
    for (const fadingEntry of fadingEntries) {
      const fade = fadingEntry.fade;
      if (fade.started === null) {
        fade.started = timestampMs;
      }
      // 单材质过渡时长 360ms，比整场开关的 400ms 略短：设备先亮起来、背景后暗下去。
      const fadeProgress = prefersReducedMotion()
        ? 1
        : Math.max(0, Math.min(1, (timestampMs - fade.started) / 360));
      // smoothstep 3p²-2p³：两端导数为 0，起止都没有可见的"顿挫"。
      const easedProgress = fadeProgress * fadeProgress * (3 - fadeProgress * 2);
      const interpolatedTarget = fadingEntry.target.map((targetComponent, targetIndex) =>
        fadeProgress === 1
          ? targetComponent
          : fade.from[targetIndex] + (targetComponent - fade.from[targetIndex]) * easedProgress
      );
      const fadeGlowColor = fadingEntry.uniforms.glow.value;
      // 只在数值真的变了时才标脏：过渡结束后这段比较会一直为假，避免空转重绘。
      if (
        fadingEntry.uniforms.retain.value !== interpolatedTarget[0] ||
        fadeGlowColor.r !== interpolatedTarget[1] ||
        fadeGlowColor.g !== interpolatedTarget[2] ||
        fadeGlowColor.b !== interpolatedTarget[3]
      ) {
        didTickChange = true;
        tickChangedFloorIds.add(fadingEntry.binding.floorId);
      }
      fadingEntry.uniforms.retain.value = interpolatedTarget[0];
      fadeGlowColor.setRGB(interpolatedTarget[1], interpolatedTarget[2], interpolatedTarget[3]);
      // 光晕颜色跟着材质走，否则会出现"模型已变色、光晕还是旧色"的割裂感。
      halos.setColor(fadingEntry.binding.id, fadeGlowColor);
      if (fadeProgress === 1) {
        fadingEntries.delete(fadingEntry);
        fadingEntry.fade = null;
      }
    }
    // 淡出播完后再清理退休绑定并重挂材质；这一步必须在 tick 里做，
    // 否则 setMode 时会立刻把还在淡出的材质拆掉。
    if (retiredBindings.size && !fadingEntries.size) {
      retiredBindings.clear();
      applyBindingMaterials();
    }
    // 全部淡到 0 之后才拆补丁：拆早了会在最后一帧闪回原色。
    if (!isEnabled && amountUniform.value === 0 && modeUniform.value === 0) {
      detachAppliedMaterials();
    }
    if (didTickChange) {
      // 模式整体在变时影响全场，只能整体重建；否则只重建变色设备所在的楼层。
      requestFrame(isModeAnimating ? undefined : [...tickChangedFloorIds]);
    }
    return (
      amountUniform.value !== targetDimStrength ||
      modeUniform.value !== targetModeAmount ||
      fadingEntries.size > 0
    );
  }
  return {
    setRoot: setRoot,
    setMode: setMode,
    tick: tick,
    /**
     * 登记一个「被保留」的根节点：它下面的材质不参与还原 / 回收。
     */
    retainRoot(root) {
      retainedRoots.add(root);
    },
    /**
     * 解除保留（与 retainRoot 配对使用）。
     */
    releaseRoot(releasedRoot) {
      retainedRoots.delete(releasedRoot);
    },
    /** 是否正在生效（启用中或还没淡完），供舞台决定是否保留这一路的开销。 */
    get isActive() {
      return !isDisposed && (isEnabled || modeUniform.value > 0);
    },
    /**
     * 释放本模块的资源：还原所有材质补丁并销毁变体材质。
     */
    dispose() {
      // 先把共享 uniform 归零：即使还有材质没来得及还原，画面也不会残留压暗。
      if (!isDisposed) {
        amountUniform.value = 0;
        modeUniform.value = 0;
        isEnabled = false;
        resetScene();
        halos.dispose();
        sceneRoot = null;
        bindings = [];
        entityStates = {};
        isDisposed = true;
      }
    }
  };
}
