/**
 * 窗帘域的运行时映射：普通帘、晾衣机、梦幻帘，以及帘子背后的电机状态。
 *
 * 职责：
 * - 把 cover 的 state（open / closed / opening / closing）与 current_position 归一成展示状态；
 * - 处理「电机反转」（电机接线方向与界面相反）造成的开合颠倒；
 * - 晾衣机专题：在同一台设备里找出灯、设定位置、当前位置、电机速度与升降按钮；
 * - 梦幻帘专题：叶片位置与角度的文案、收起 / 展开的判定；
 * - 与窗帘同设备的开关 / 下拉 / 数值实体（用于扩展功能面板）。
 *
 * 位置：被窗帘控件、晾衣机控件与编辑器预览共用。
 *
 * 约定：导入路径上的 ?v= 版本戳必须与 home.js、renderer.js 一致；
 * 本文件反向 import registry.js（为拿 coverComponentIsDream），循环依赖是既有结构，
 * 因此 here 的顶层不要执行任何依赖 registry 初始化结果的副作用。
 */
import { coverComponentIsDream } from "./registry.js?v=20260918224928";
import { entityMetadataIsAvailable } from "./entity-metadata.js?v=20260918224928";
/**
 * 通用「实体是否处于活动态」判定。
 *
 * @param {object} eventState 状态对象或变更对象。
 * @returns {boolean} on / open / true / home 视为活动（home 覆盖 device_tracker）。
 */
export function runtimeEntityStateIsActive(eventState) {
  const normalizedState = String(eventState?.newState?.state ?? eventState?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "open", "true", "home"].includes(normalizedState);
}
// 百分比容差：1% 以内都当作端点（完全关闭 / 完全打开），避免设备上报 0.4 之类的残值导致状态闪烁。
const PERCENT_EPSILON = 1;
/**
 * 取窗帘的当前位置百分比。
 *
 * @param {object} positionStateInput 状态对象或变更对象。
 * @returns {number|null} 夹在 0~100 的位置；没有该属性时返回 null（区别于位置就是 0）。
 */
function coverPositionPercent(positionStateInput) {
  const positionStateObject = positionStateInput?.newState || positionStateInput || {};
  const currentPositionAttribute = Number(positionStateObject.attributes?.current_position);
  if (Number.isFinite(currentPositionAttribute)) {
    return Math.max(0, Math.min(100, currentPositionAttribute));
  } else {
    return null;
  }
}
/**
 * 判断窗帘是否已到达目标位置。
 *
 * 0.5% 的容差是必要的：设备上报的位置通常有小数抖动，严格相等会让「已到位」永远不成立。
 * 比较方向随移动方向而定——上升方向是「不小于目标」，下降方向是「不大于目标」。
 *
 * @param {number} currentPosition 当前位置百分比。
 * @param {number} targetPosition 目标位置百分比。
 * @param {number} direction 移动方向，负值表示朝 0 方向移动。
 * @returns {boolean} 是否已到位。
 */
export function coverPositionReachedTarget(currentPosition, targetPosition, direction) {
  const clampedReported = Math.max(0, Math.min(100, Number(currentPosition) || 0));
  const clampedTarget = Math.max(0, Math.min(100, Number(targetPosition) || 0));
  if (direction < 0) {
    return clampedReported <= clampedTarget + 0.5;
  } else {
    return clampedReported >= clampedTarget - 0.5;
  }
}
/**
 * 计算「等待设备确认」期间该显示的位置。
 *
 * 取下发指令前的起点与目标中更靠终点的那一端：朝大值移动时取 max、朝小值移动时取 min，
 * 这样界面会立刻贴到终点侧，不会出现先回退再前进的假动画。
 *
 * @param {number} fromPosition 起点位置。
 * @param {number} toPosition 目标位置。
 * @param {number} moveDirection 移动方向。
 * @returns {number} 待显示的百分比。
 */
export function coverPendingDisplayPosition(fromPosition, toPosition, moveDirection) {
  if (moveDirection < 0) {
    return Math.min(fromPosition, toPosition);
  } else {
    return Math.max(fromPosition, toPosition);
  }
}
/**
 * 判断窗帘当前是否处于「打开」侧。
 *
 * 判定顺序固定：opening / closing 这两个动作态优先（哪怕位置还没变也说明在开 / 在关），
 * 其次看位置百分比，最后才回落到通用的 on / open 判定。
 *
 * @param {object} coverEventState 状态对象或变更对象。
 * @returns {boolean} 视为打开时返回 true。
 */
export function runtimeCoverStateIsActive(coverEventState) {
  const coverState = coverEventState?.newState || coverEventState || {};
  const rawCoverState = String(coverState.state || "")
    .trim()
    .toLowerCase();
  // opening / closing 直接给出结论，且 closing 要显式返回 false：
  // 此时位置百分比往往还是旧的高值，若走位置判断会把正在关闭的窗帘显示成打开。
  if (rawCoverState === "opening") {
    return true;
  }
  if (rawCoverState === "closing") {
    return false;
  }
  const resolvedPositionAttribute = coverPositionPercent(coverState);
  if (resolvedPositionAttribute !== null) {
    return resolvedPositionAttribute > PERCENT_EPSILON;
  } else {
    return runtimeEntityStateIsActive(coverState);
  }
}
/**
 * 在同一台设备里找出指定域 + 指定翻译键的关联实体。
 *
 * @param {Map<string, object>} entitiesById 实体元数据索引。
 * @param {string} entityId 源实体 ID。
 * @param {string} domain 目标域。
 * @param {string} translationKey 目标翻译键。
 * @param {string} [preferredEntityId] 首选的实体 ID，命中即优先。
 * @returns {object|null} 选中的实体；源实体没有 deviceId 时返回 null。
 */
export function relatedDeviceEntity(
  entitiesById,
  entityId,
  domain,
  translationKey,
  preferredEntityId = ""
) {
  const sourceEntity = entitiesById.get(entityId);
  if (!sourceEntity?.deviceId) {
    return null;
  }
  const relatedEntities = [...entitiesById.values()].filter(
    candidateEntity =>
      candidateEntity.deviceId === sourceEntity.deviceId &&
      candidateEntity.domain === domain &&
      candidateEntity.translationKey === translationKey &&
      entityMetadataIsAvailable(candidateEntity)
  );
  relatedEntities.sort((leftEntity, rightEntity) => {
    const leftEntityId = String(leftEntity.entityId || "");
    const rightEntityId = String(rightEntity.entityId || "");
    if (leftEntityId === preferredEntityId) {
      return -1;
    }
    if (rightEntityId === preferredEntityId) {
      return 1;
    }
    // 实体 ID 里带 _room_N_ 的是「按房间拆分」的那份，通常不是设备主实体，排在后面。
    const leftIsRoomEntity = /_room_\d+_/.test(leftEntityId);
    const rightIsRoomEntity = /_room_\d+_/.test(rightEntityId);
    if (leftIsRoomEntity !== rightIsRoomEntity) {
      if (leftIsRoomEntity) {
        return 1;
      } else {
        return -1;
      }
    } else {
      return (
        leftEntityId.length - rightEntityId.length || leftEntityId.localeCompare(rightEntityId)
      );
    }
  });
  return relatedEntities[0] || null;
}
/**
 * 在同一台设备里找出指定域的实体（不看翻译键）。
 *
 * 与 relatedDeviceEntity 的差别是筛选更松、并额外偏好「名字像灯」的实体，
 * 用于窗帘 / 晾衣机这类设备上附带照明的情况。
 *
 * @param {Map<string, object>} domainEntitiesById 实体元数据索引。
 * @param {string} domainEntityId 源实体 ID。
 * @param {string} matchDomain 目标域。
 * @returns {object|null} 选中的实体。
 */
export function relatedDeviceDomainEntity(domainEntitiesById, domainEntityId, matchDomain) {
  const domainSourceEntity = domainEntitiesById.get(domainEntityId);
  if (!domainSourceEntity?.deviceId) {
    return null;
  }
  const domainRelatedEntities = [...domainEntitiesById.values()].filter(
    domainCandidate =>
      domainCandidate.deviceId === domainSourceEntity.deviceId &&
      domainCandidate.domain === matchDomain &&
      entityMetadataIsAvailable(domainCandidate)
  );
  domainRelatedEntities.sort((leftDomainEntity, rightDomainEntity) => {
    const leftLooksLikeLight = /灯|照明|light/i.test(
      (leftDomainEntity.name || "") + " " + (leftDomainEntity.entityId || "")
    )
      ? 0
      : 1;
    const rightLooksLikeLight = /灯|照明|light/i.test(
      (rightDomainEntity.name || "") + " " + (rightDomainEntity.entityId || "")
    )
      ? 0
      : 1;
    return (
      leftLooksLikeLight - rightLooksLikeLight ||
      String(leftDomainEntity.entityId || "").length -
        String(rightDomainEntity.entityId || "").length ||
      String(leftDomainEntity.entityId || "").localeCompare(
        String(rightDomainEntity.entityId || "")
      )
    );
  });
  return domainRelatedEntities[0] || null;
}
// 晾衣机相关的名称正则。各厂商的英文命名（airer / clothes rack / laundry rack）与中文命名都要覆盖，
// 后续的实体查找几乎都建立在这几个模式之上。
const AIRER_NAME_PATTERN = /airer|clothes.?rack|laundry.?rack|晾衣机|晾衣架/i;
const LIGHT_NAME_PATTERN = /light|lamp|灯光|照明|灯(?:$|[\s_-])/i;
const SET_POSITION_NAME_PATTERN =
  /set[_\s-]?position|target[_\s-]?position|设定位置|设置位置|目标位置/i;
const CURRENT_POSITION_NAME_PATTERN = /current[_\s-]?position|当前位置|当前高度/i;
const MOTOR_SPEED_NAME_PATTERN = /motor[_\s-]?speed|电机速度/i;
// 晾衣机升降电机的三个动作按钮：上升 / 下降 / 暂停，按按钮名匹配。
const MOTOR_CONTROL_PATTERNS = {
  up: /motor[_\s-]?control[_\s-]?up|晾杆控制[^\n]*(?:上升|升起)/i,
  down: /motor[_\s-]?control[_\s-]?down|晾杆控制[^\n]*下降/i,
  pause: /motor[_\s-]?control[_\s-]?(?:pause|stop)|晾杆控制[^\n]*(?:停止|暂停)/i
};
/**
 * 判断窗帘控件是否应按晾衣机渲染。
 *
 * 优先级：控件显式配置的 coverKind（airer / standard / dream 都是明确答案，直接返回）→
 * 否则按实体 ID、状态里的 friendly_name、实体元数据与设备型号里的关键词推断。
 *
 * @param {object} component 控件对象。
 * @param {string} [airerComponentEntityId] 绑定的实体 ID。
 * @param {object} [componentState] 状态对象或变更对象。
 * @param {Map<string, object>} [airerEntitiesById] 实体元数据索引。
 * @param {Map<string, object>} [devicesById] 设备元数据索引。
 * @returns {boolean} 是否按晾衣机处理。
 */
export function coverComponentIsAirer(
  component,
  airerComponentEntityId = "",
  componentState = null,
  airerEntitiesById = new Map(),
  devicesById = new Map()
) {
  const coverKind = component?.properties?.coverKind;
  if (coverKind === "airer") {
    return true;
  }
  if (["standard", "dream"].includes(coverKind)) {
    return false;
  }
  const airerStateObject = componentState?.newState || componentState || {};
  const airerEntityMetadata = airerEntitiesById.get(airerComponentEntityId) || {};
  const airerDeviceMetadata = airerEntityMetadata.deviceId
    ? devicesById.get(airerEntityMetadata.deviceId) || {}
    : {};
  return AIRER_NAME_PATTERN.test(
    [
      airerComponentEntityId,
      airerStateObject.attributes?.friendly_name,
      airerEntityMetadata.name,
      airerEntityMetadata.originalName,
      airerEntityMetadata.translationKey,
      airerEntityMetadata.uniqueId,
      airerDeviceMetadata.name,
      airerDeviceMetadata.model
    ]
      .filter(Boolean)
      .join(" ")
  );
}
/**
 * 从实体 ID 里取出「晾杆编号」。
 *
 * 晾衣机的实体 ID 形如 cover.xxx_s_1_airer、light.xxx_p_2_…，其中 s / p 后的数字标识
 * 具体是哪根杆 / 哪个位置；同一根杆上的灯与位置实体必须配套，否则会串到别的杆上。
 *
 * @param {string} slotSourceEntityId 实体 ID。
 * @returns {Set<string>} 编号集合。
 */
function collectAirerSlotNumbers(slotSourceEntityId) {
  return new Set(
    [...String(slotSourceEntityId || "").matchAll(/_(?:s|p)_(\d+)(?:_|$)/gi)].map(
      slotMatch => slotMatch[1]
    )
  );
}
/**
 * 在晾衣机的同设备实体里挑出那盏照明灯。
 *
 * 用打分而不是硬匹配，因为灯可能是 light 域也可能是 switch 域，命名也各家不同。
 * 打分见下方注释，最终按 分数降序 → 实体 ID 长度升序 → 字典序 取第一个。
 *
 * @param {Map<string, object>} lightEntitiesById 实体元数据索引。
 * @param {string} lightSourceEntityId 源实体 ID。
 * @returns {object|null} 选中的灯实体。
 */
export function relatedAirerLightEntity(lightEntitiesById, lightSourceEntityId) {
  const lightSourceEntity = lightEntitiesById.get(lightSourceEntityId);
  if (!lightSourceEntity?.deviceId) {
    return null;
  }
  const lightSourceSlots = collectAirerSlotNumbers(lightSourceEntity.entityId);
  return (
    [...lightEntitiesById.values()]
      .filter(
        candidateLightEntity =>
          candidateLightEntity.entityId !== lightSourceEntityId &&
          candidateLightEntity.deviceId === lightSourceEntity.deviceId &&
          ["light", "switch"].includes(String(candidateLightEntity.domain || "")) &&
          entityMetadataIsAvailable(candidateLightEntity)
      )
      .map(lightCandidate => {
        const lightSearchText =
          (lightCandidate.entityId || "") +
          " " +
          (lightCandidate.name || "") +
          " " +
          (lightCandidate.originalName || "") +
          " " +
          (lightCandidate.translationKey || "");
        if (lightCandidate.domain === "switch" && !LIGHT_NAME_PATTERN.test(lightSearchText)) {
          return null;
        }
        const candidateSlots = collectAirerSlotNumbers(lightCandidate.entityId);
        const sharesSlot = [...lightSourceSlots].some(slotNumber => candidateSlots.has(slotNumber));
        // light 域的基础分高于 switch 域；同杆加成 360 是决定性的——
        // 一台晾衣机上可能有多组灯，只有和当前晾杆编号一致的才是对应那盏。
        let lightScore = lightCandidate.domain === "light" ? 180 : 80;
        if (sharesSlot) {
          lightScore += 360;
        }
        if (AIRER_NAME_PATTERN.test(lightSearchText)) {
          lightScore += 180;
        }
        if (LIGHT_NAME_PATTERN.test(lightSearchText)) {
          lightScore += 90;
        }
        if (/night.?light|夜灯/i.test(lightSearchText)) {
          lightScore -= 60;
        }
        return {
          item: lightCandidate,
          score: lightScore
        };
      })
      .filter(Boolean)
      .sort(
        (leftLightScore, rightLightScore) =>
          rightLightScore.score - leftLightScore.score ||
          String(leftLightScore.item.entityId || "").length -
            String(rightLightScore.item.entityId || "").length ||
          String(leftLightScore.item.entityId || "").localeCompare(
            String(rightLightScore.item.entityId || "")
          )
      )[0]?.item || null
  );
}
/**
 * 按名称模式在同设备实体里查找晾衣机的某个附属实体。
 *
 * 特殊分支：源实体没有 deviceId（HA 里未登记设备，常见于厂商直连）时，
 * 会按实体 ID 模板推算出该型号固定的附属实体 ID，见下方注释。
 *
 * @param {Map<string, object>} airerLookupEntitiesById 实体元数据索引。
 * @param {string} airerEntityId 源实体 ID。
 * @param {string} patternDomain 目标域。
 * @param {RegExp} namePattern 名称匹配模式。
 * @returns {object|null} 命中的实体。
 */
function findAirerEntityByPattern(
  airerLookupEntitiesById,
  airerEntityId,
  patternDomain,
  namePattern
) {
  const airerSourceEntity = airerLookupEntitiesById.get(airerEntityId);
  if (!airerSourceEntity?.deviceId) {
    // 该型号（_pro2 后缀）的附属实体 ID 由晾衣机实体 ID 派生，后缀 _p_4_N 是厂商约定的序号，
    // 三个分支分别对应 设定位置 / 当前位置 / 电机速度。
    const entityIdMatch = String(airerEntityId || "").match(
      /^cover\.(hyd_cn_[a-z0-9]+_pro2)_s_\d+_airer$/i
    );
    if (entityIdMatch) {
      if (patternDomain === "number" && namePattern === SET_POSITION_NAME_PATTERN) {
        return {
          entityId: "number." + entityIdMatch[1] + "_set_position_p_4_9",
          domain: "number"
        };
      } else if (patternDomain === "sensor" && namePattern === CURRENT_POSITION_NAME_PATTERN) {
        return {
          entityId: "sensor." + entityIdMatch[1] + "_current_position_p_4_11",
          domain: "sensor"
        };
      } else if (patternDomain === "sensor" && namePattern === MOTOR_SPEED_NAME_PATTERN) {
        return {
          entityId: "sensor." + entityIdMatch[1] + "_motor_speed_p_4_12",
          domain: "sensor"
        };
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  return (
    [...airerLookupEntitiesById.values()]
      .filter(
        candidate =>
          candidate.entityId !== airerEntityId &&
          candidate.deviceId === airerSourceEntity.deviceId &&
          candidate.domain === patternDomain &&
          entityMetadataIsAvailable(candidate)
      )
      .map(scoredCandidate => {
        const candidateSearchText =
          (scoredCandidate.entityId || "") +
          " " +
          (scoredCandidate.name || "") +
          " " +
          (scoredCandidate.originalName || "") +
          " " +
          (scoredCandidate.translationKey || "");
        if (!namePattern.test(candidateSearchText)) {
          return null;
        }
        let candidateScore = 0;
        if (namePattern.test(String(scoredCandidate.translationKey || ""))) {
          candidateScore += 300;
        }
        if (namePattern.test(String(scoredCandidate.entityId || ""))) {
          candidateScore += 180;
        }
        if (AIRER_NAME_PATTERN.test(candidateSearchText)) {
          candidateScore += 90;
        }
        return {
          item: scoredCandidate,
          score: candidateScore
        };
      })
      .filter(Boolean)
      .sort(
        (leftAirerScore, rightAirerScore) =>
          rightAirerScore.score - leftAirerScore.score ||
          String(leftAirerScore.item.entityId || "").length -
            String(rightAirerScore.item.entityId || "").length ||
          String(leftAirerScore.item.entityId || "").localeCompare(
            String(rightAirerScore.item.entityId || "")
          )
      )[0]?.item || null
  );
}
/**
 * 取晾衣机的「设定位置」数值实体。
 *
 * @param {Map<string, object>} positionEntitiesById 实体元数据索引。
 * @param {string} positionEntityId 源实体 ID。
 * @returns {object|null} 命中的实体。
 */
export function relatedAirerPositionNumberEntity(positionEntitiesById, positionEntityId) {
  return findAirerEntityByPattern(
    positionEntitiesById,
    positionEntityId,
    "number",
    SET_POSITION_NAME_PATTERN
  );
}
/**
 * 取晾衣机的「当前位置」传感器。
 *
 * @param {Map<string, object>} currentPositionEntitiesById 实体元数据索引。
 * @param {string} currentPositionEntityId 源实体 ID。
 * @returns {object|null} 命中的实体。
 */
export function relatedAirerCurrentPositionSensor(
  currentPositionEntitiesById,
  currentPositionEntityId
) {
  return findAirerEntityByPattern(
    currentPositionEntitiesById,
    currentPositionEntityId,
    "sensor",
    CURRENT_POSITION_NAME_PATTERN
  );
}
/**
 * 取晾衣机的电机速度传感器，用于判断升降是否已停止。
 *
 * @param {Map<string, object>} motorSpeedEntitiesById 实体元数据索引。
 * @param {string} motorSpeedEntityId 源实体 ID。
 * @returns {object|null} 命中的实体。
 */
export function relatedAirerMotorSpeedSensor(motorSpeedEntitiesById, motorSpeedEntityId) {
  return findAirerEntityByPattern(
    motorSpeedEntitiesById,
    motorSpeedEntityId,
    "sensor",
    MOTOR_SPEED_NAME_PATTERN
  );
}
/**
 * 取晾衣机的升降控制按钮。
 *
 * 只在 button 域里按 MOTOR_CONTROL_PATTERNS 的三个模式查找，
 * 查不到的动作用 null 占位，调用方据此隐藏对应按钮。
 *
 * @param {Map<string, object>} actionEntitiesById 实体元数据索引。
 * @param {string} actionEntityId 源实体 ID。
 * @returns {{up: object|null, down: object|null, pause: object|null}} 三个按钮。
 */
export function relatedAirerMotorActionEntities(actionEntitiesById, actionEntityId) {
  const actionSourceEntity = actionEntitiesById.get(actionEntityId);
  if (!actionSourceEntity?.deviceId) {
    return {
      up: null,
      down: null,
      pause: null
    };
  }
  const motorActionButtons = [...actionEntitiesById.values()].filter(
    motorButtonCandidate =>
      motorButtonCandidate.entityId !== actionEntityId &&
      motorButtonCandidate.deviceId === actionSourceEntity.deviceId &&
      motorButtonCandidate.domain === "button" &&
      entityMetadataIsAvailable(motorButtonCandidate)
  );
  return Object.fromEntries(
    Object.entries(MOTOR_CONTROL_PATTERNS).map(([actionKey, actionPattern]) => {
      const matchedButton = motorActionButtons.find(buttonCandidate =>
        actionPattern.test(
          (buttonCandidate.entityId || "") +
            " " +
            (buttonCandidate.name || "") +
            " " +
            (buttonCandidate.originalName || "") +
            " " +
            (buttonCandidate.translationKey || "")
        )
      );
      return [actionKey, matchedButton || null];
    })
  );
}
/**
 * 把晾衣机位置换算成界面上的「下降幅度」。
 *
 * 返回值是画布内的相对距离：2 表示完全收起（贴近顶部），40 表示完全放下。
 * open / closed 两个端点直接给常量，是为了让端点状态不受标定误差影响；
 * 其余情况在命令区间内做线性插值，区间长度为 0 时退化为不下落。
 *
 * @param {number} positionPercent 位置百分比。
 * @param {string} [airerStateName] 规范化后的状态名。
 * @param {object} [visualCalibration] 视觉标定：raised / lowered。
 * @returns {number} 2~40 之间的下降幅度。
 */
export function airerVisualDrop(positionPercent, airerStateName = "", visualCalibration = {}) {
  if (airerStateName === "open") {
    return 2;
  }
  if (airerStateName === "closed") {
    return 40;
  }
  const visualClampedPosition = Math.max(0, Math.min(100, Number(positionPercent) || 0));
  const visualRaised =
    visualCalibration.raised === null || visualCalibration.raised === undefined
      ? Number.NaN
      : Number(visualCalibration.raised);
  const visualLowered =
    visualCalibration.lowered === null || visualCalibration.lowered === undefined
      ? Number.NaN
      : Number(visualCalibration.lowered);
    // 收起端未知时的推断：若已知道放下端且它不小（说明数值越大越靠下），
    // 则收起端按 0 处理，否则按 100，保证两端不会落在同一侧。
  const visualCommandRaised = Number.isFinite(visualRaised)
    ? visualRaised
    : Number.isFinite(visualLowered) && visualLowered >= 50
      ? 0
      : 100;
  const visualCommandSpan =
    (Number.isFinite(visualLowered) ? visualLowered : visualCommandRaised < 50 ? 100 : 0) -
    visualCommandRaised;
  return (
    2 +
    (Math.abs(visualCommandSpan) < 0.5
      ? 0
      : Math.max(
          0,
          Math.min(1, (visualClampedPosition - visualCommandRaised) / visualCommandSpan)
        )) *
      38
  );
}
/**
 * 取晾衣机的出厂标定。
 *
 * 只有 pro2 型号带固定标定（命令值 0 为收起、100 为放下），其余型号返回全 null，
 * 交给 learnAirerPositionCalibration 在运行中学习。
 *
 * @param {Map<string, object>} calibrationEntitiesById 实体元数据索引。
 * @param {Map<string, object>} calibrationDevicesById 设备元数据索引。
 * @param {string} calibrationEntityId 实体 ID。
 * @returns {{raised: *, lowered: *, commandRaised: *, commandLowered: *}} 标定值。
 */
export function airerPositionCalibration(
  calibrationEntitiesById,
  calibrationDevicesById,
  calibrationEntityId
) {
  const calibrationEntityMetadata = calibrationEntitiesById.get(calibrationEntityId);
  const calibrationDeviceMetadata = calibrationEntityMetadata?.deviceId
    ? calibrationDevicesById.get(calibrationEntityMetadata.deviceId)
    : null;
  const calibrationSearchText =
    (calibrationDeviceMetadata?.model || "") +
    " " +
    (calibrationDeviceMetadata?.name || "") +
    " " +
    (calibrationEntityMetadata?.entityId || "") +
    " " +
    (calibrationEntityId || "");
  if (/hyd\.airer\.pro2|hyd_cn_[a-z0-9_]*_pro2(?:_|$)/i.test(calibrationSearchText)) {
    return {
      raised: null,
      lowered: null,
      commandRaised: 0,
      commandLowered: 100
    };
  } else {
    return {
      raised: null,
      lowered: null,
      commandRaised: null,
      commandLowered: null
    };
  }
}
/**
 * 根据实时读数学习「收起 / 放下」两端对应的上报位置。
 *
 * 只在电机停稳（速度绝对值小于 0.5）且命令值正好落在已知端点附近（0.5 以内）时才采样，
 * 因此只会写入真实可信的端点读数，不会把中间的移动过程当成端点。
 * 注意：函数直接修改并返回传入的 calibration 对象（既有的就地更新约定）。
 *
 * @param {object} [calibration] 标定对象，含 commandRaised / commandLowered / raised / lowered。
 * @param {*} reportedPosition 设备上报的位置。
 * @param {*} commandPosition 下发的命令位置。
 * @param {*} motorSpeed 电机速度。
 * @returns {object} 更新后的标定对象。
 */
export function learnAirerPositionCalibration(
  calibration = {},
  reportedPosition,
  commandPosition,
  motorSpeed
) {
    // 三个读数都得有效，且电机停了，才认为这次上报是可信的端点样本。
  const reportedValue = Number(reportedPosition);
  const commandValue = Number(commandPosition);
  const motorSpeedValue = Number(motorSpeed);
  const commandRaisedPosition =
    calibration.commandRaised === null || calibration.commandRaised === undefined
      ? Number.NaN
      : Number(calibration.commandRaised);
  const commandLoweredPosition =
    calibration.commandLowered === null || calibration.commandLowered === undefined
      ? Number.NaN
      : Number(calibration.commandLowered);
  if (
    !!Number.isFinite(reportedValue) &&
    !!Number.isFinite(commandValue) &&
    !!Number.isFinite(motorSpeedValue) &&
    !(Math.abs(motorSpeedValue) >= 0.5)
  ) {
    if (
      Number.isFinite(commandRaisedPosition) &&
      Math.abs(commandValue - commandRaisedPosition) <= 0.5
    ) {
      calibration.raised = Math.max(0, Math.min(100, reportedValue));
    }
    if (
      Number.isFinite(commandLoweredPosition) &&
      Math.abs(commandValue - commandLoweredPosition) <= 0.5
    ) {
      calibration.lowered = Math.max(0, Math.min(100, reportedValue));
    }
  }
  return calibration;
}
/**
 * 把设备坐标的位置换算成界面坐标。
 *
 * 设备的数值越大越靠下，而界面坐标（晾杆高度）越大越靠上，所以这里是一次反向线性映射；
 * 两端未知或几乎重合时不做换算，直接返回原值，避免出现除零或极端放大。
 *
 * @param {number} airerPosition 设备位置百分比。
 * @param {object} [presentationCalibration] 标定：raised / lowered。
 * @returns {number} 界面用位置百分比。
 */
export function airerPresentationPosition(airerPosition, presentationCalibration = {}) {
  const clampedPosition = Math.max(0, Math.min(100, Number(airerPosition) || 0));
  const raisedPosition =
    presentationCalibration.raised === null || presentationCalibration.raised === undefined
      ? Number.NaN
      : Number(presentationCalibration.raised);
  const loweredPosition =
    presentationCalibration.lowered === null || presentationCalibration.lowered === undefined
      ? Number.NaN
      : Number(presentationCalibration.lowered);
  if (!Number.isFinite(raisedPosition) && !Number.isFinite(loweredPosition)) {
    return clampedPosition;
  }
  const effectiveRaised = Number.isFinite(raisedPosition) ? raisedPosition : 0;
  const effectiveLowered = Number.isFinite(loweredPosition) ? loweredPosition : 100;
  if (Math.abs(effectiveLowered - effectiveRaised) < 0.5) {
    return clampedPosition;
  } else {
    return Math.max(
      0,
      Math.min(
        100,
        ((effectiveLowered - clampedPosition) / (effectiveLowered - effectiveRaised)) * 100
      )
    );
  }
}
/**
 * 取晾衣机的展示位置，端点状态直接给 0 / 100。
 *
 * 先按电机是否反转求出物理状态：open 一律映射成 100、closed 一律映射成 0，
 * 只有中间态才使用标定换算，保证「已完全收起 / 放下」这两个结论绝对准确。
 *
 * @param {number} statePosition 设备位置。
 * @param {object} coverStateInput 状态对象。
 * @param {object} [stateCalibration] 标定对象。
 * @param {boolean} [isReversed] 电机是否反转。
 * @returns {number} 0~100 的展示位置。
 */
export function airerPresentationPositionForState(
  statePosition,
  coverStateInput,
  stateCalibration = {},
  isReversed = false
) {
  const physicalState = physicalCoverState(coverStateInput, isReversed);
  if (physicalState === "open") {
    return 100;
  } else if (physicalState === "closed") {
    return 0;
  } else {
    return airerPresentationPosition(statePosition, stateCalibration);
  }
}
/**
 * 取晾衣机当前上报的位置。
 *
 * 读数优先级：两端标定都齐全且跨度够大时用 state 数值（此时 state 就是位置百分比）→
 * 属性的 current_position → 最后才用 state 原值。
 *
 * @param {object} entityState 状态对象。
 * @param {object} entityAttributes 状态对象（保留参数位，属性经 attributes 读取）。
 * @param {object} [reportedCalibration] 标定对象。
 * @returns {number} 上报位置。
 */
export function airerReportedPosition(entityState, entityAttributes, reportedCalibration = {}) {
  const stateNumber = Number(entityState?.state);
  const attributePosition = Number(entityAttributes?.attributes?.current_position);
  const hasRaisedPosition =
    reportedCalibration.raised !== null &&
    reportedCalibration.raised !== undefined &&
    Number.isFinite(Number(reportedCalibration.raised));
  const hasLoweredPosition =
    reportedCalibration.lowered !== null &&
    reportedCalibration.lowered !== undefined &&
    Number.isFinite(Number(reportedCalibration.lowered));
  if (
    hasRaisedPosition &&
    hasLoweredPosition &&
    Math.abs(Number(reportedCalibration.lowered) - Number(reportedCalibration.raised)) >= 0.5 &&
    Number.isFinite(stateNumber)
  ) {
    return stateNumber;
  } else if (Number.isFinite(attributePosition)) {
    return attributePosition;
  } else {
    return stateNumber;
  }
}
/**
 * 把界面百分比换算成下发命令用的设备百分比。
 *
 * 是 airerPresentationPosition 的逆运算；两端未知或重合时原样返回，
 * 让调用方至少发得出一个有意义的命令值。
 *
 * @param {number} reportedPercent 界面位置百分比。
 * @param {object} [deviceCalibration] 标定对象，优先用 commandRaised / commandLowered。
 * @returns {number} 设备命令百分比。
 */
export function airerDevicePosition(reportedPercent, deviceCalibration = {}) {
  const clampedDevicePosition = Math.max(0, Math.min(100, Number(reportedPercent) || 0));
  const commandRaised =
    deviceCalibration.commandRaised === null || deviceCalibration.commandRaised === undefined
      ? Number(deviceCalibration.raised)
      : Number(deviceCalibration.commandRaised);
  const commandLowered =
    deviceCalibration.commandLowered === null || deviceCalibration.commandLowered === undefined
      ? Number(deviceCalibration.lowered)
      : Number(deviceCalibration.commandLowered);
  if (
    !Number.isFinite(commandRaised) ||
    !Number.isFinite(commandLowered) ||
    Math.abs(commandLowered - commandRaised) < 0.5
  ) {
    return clampedDevicePosition;
  }
  const spanStart = commandRaised;
  const spanEnd = commandLowered;
  return spanEnd - (clampedDevicePosition / 100) * (spanEnd - spanStart);
}
// 与窗帘同设备、可视为「扩展功能」的域：开关、下拉、数值、按钮。
const WATER_HEATER_DOMAINS = new Set(["switch", "select", "number", "button"]);
/**
 * 取与窗帘同设备、可作为扩展功能的实体。
 *
 * @param {Map<string, object>} waterHeaterEntitiesById 实体元数据索引。
 * @param {string} waterHeaterEntityId 源实体 ID。
 * @returns {Array<object>} 排好序的实体列表；源实体没有 deviceId 时为空数组。
 */
export function relatedWaterHeaterEntities(waterHeaterEntitiesById, waterHeaterEntityId) {
  const waterHeaterSourceEntity = waterHeaterEntitiesById.get(waterHeaterEntityId);
  if (!waterHeaterSourceEntity?.deviceId) {
    return [];
  }
    // 固定展示顺序：开关 → 下拉 → 数值 → 按钮，同域内按实体 ID 字典序；
    // 用 Map 而不是对象是为了让未知域自然落到兜底值 99（排在最后）。
  const domainOrder = new Map([
    ["switch", 0],
    ["select", 1],
    ["number", 2],
    ["button", 3]
  ]);
  return [...waterHeaterEntitiesById.values()]
    .filter(
      waterHeaterCandidate =>
        waterHeaterCandidate.entityId !== waterHeaterEntityId &&
        waterHeaterCandidate.deviceId === waterHeaterSourceEntity.deviceId &&
        WATER_HEATER_DOMAINS.has(String(waterHeaterCandidate.domain || "")) &&
        entityMetadataIsAvailable(waterHeaterCandidate)
    )
    .sort(
      (leftWaterHeaterEntity, rightWaterHeaterEntity) =>
        (domainOrder.get(leftWaterHeaterEntity.domain) ?? 99) -
          (domainOrder.get(rightWaterHeaterEntity.domain) ?? 99) ||
        String(leftWaterHeaterEntity.entityId || "").localeCompare(
          String(rightWaterHeaterEntity.entityId || "")
        )
    );
}
/**
 * 生成扩展功能项的展示名。
 *
 * 设备的附属实体名常常把设备名重复拼在前面（「晾衣机 晾衣机照明」），
 * 这里按「父名 + 空格」逐层剥离；候选前缀按长度降序排列，长前缀优先，避免短前缀先匹配掉一截。
 * 剥离后为空则退回实体 ID 的对象 ID（下划线换成空格），再空则用「扩展功能」。
 *
 * @param {object} labelComponent 控件 / 实体对象，提供 originalName 与 name。
 * @param {object} entityMetadata 目标实体元数据。
 * @returns {string} 展示名。
 */
export function waterHeaterRelatedEntityLabel(labelComponent, entityMetadata) {
  let label = String(entityMetadata?.name || entityMetadata?.originalName || "")
    .replace(/\s+/g, " ")
    .trim();
  const parentNameCandidates = [
    ...new Set(
      [labelComponent?.originalName, labelComponent?.name]
        .map(nameCandidate =>
          String(nameCandidate || "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ].sort((leftParentName, rightParentName) => rightParentName.length - leftParentName.length);
  for (const parentName of parentNameCandidates) {
    while (label !== parentName && label.startsWith(parentName + " ")) {
      label = label.slice(parentName.length).trim();
    }
  }
  return (
    label ||
    (String(entityMetadata?.entityId || "").split(".", 2)[1] || "扩展功能").replace(/_/g, " ")
  );
}
/**
 * 在同一台设备里找出「电机反向」开关。
 *
 * @param {Map<string, object>} motorReverseEntitiesById 实体元数据索引。
 * @param {string} reverseEntityId 源实体 ID。
 * @returns {object|null} switch / select 域且名称匹配的实体。
 */
export function relatedCoverMotorReverseEntity(motorReverseEntitiesById, reverseEntityId) {
  const motorReverseSourceEntity = motorReverseEntitiesById.get(reverseEntityId);
  return (
    (motorReverseSourceEntity?.deviceId &&
      [...motorReverseEntitiesById.values()].find(
        motorReverseCandidate =>
          motorReverseCandidate.deviceId === motorReverseSourceEntity.deviceId &&
          ["switch", "select"].includes(String(motorReverseCandidate.domain || "")) &&
          /motor_reverse|电机反向/i.test(
            (motorReverseCandidate.entityId || "") + " " + (motorReverseCandidate.name || "")
          ) &&
          entityMetadataIsAvailable(motorReverseCandidate)
      )) ||
    null
  );
}
/**
 * 判断状态是否为「真」。
 *
 * 比通用开关判定更宽：除了 on / true，还认 1 / enabled 与中文的 开启 / 打开，
 * 因为「电机反向」这类配置开关在各固件里写法很杂。
 *
 * @param {object} truthyStateInput 状态对象或变更对象。
 * @returns {boolean} 是否为真。
 */
function stateIsTruthy(truthyStateInput) {
  const lowercasedState = String(truthyStateInput?.newState?.state ?? truthyStateInput?.state ?? "")
    .trim()
    .toLowerCase();
  return ["on", "true", "1", "enabled", "开启", "打开"].includes(lowercasedState);
}
/**
 * 通过读取「电机反向」实体判断电机是否反接。
 *
 * @param {Map<string, object>} motorEntitiesById 实体元数据索引。
 * @param {Map<string, object>} coverStateByEntityId 状态索引。
 * @param {string} motorEntityId 当前实体 ID。
 * @returns {boolean} 电机是否反转。
 */
function isCoverMotorReversed(motorEntitiesById, coverStateByEntityId, motorEntityId) {
  const motorReverseEntity = relatedCoverMotorReverseEntity(motorEntitiesById, motorEntityId);
  return (
    !!motorReverseEntity?.entityId &&
    !!stateIsTruthy(coverStateByEntityId.get(motorReverseEntity.entityId))
  );
}
/**
 * 取控件级的电机方向设置。
 *
 * 只看控件的 coverMotorDirection 属性：normal 为不反转，reversed 为反转，
 * 其余值（含未设置）都按不反转处理。
 * 后三个参数是为兼容旧调用签名保留的，当前实现不再读取它们，也不要去掉——
 * 调用方仍在按完整签名传参。
 *
 * @param {object} directionComponent 控件对象。
 * @param {Map<string, object>} componentStatesByEntityId 状态索引（当前未使用）。
 * @param {Map<string, object>} componentEntitiesById 实体元数据索引（当前未使用）。
 * @param {string} componentTargetEntityId 目标实体 ID（当前未使用）。
 * @returns {boolean} 是否反转。
 */
export function coverMotorIsReversedForComponent(
  directionComponent,
  componentStatesByEntityId,
  componentEntitiesById,
  componentTargetEntityId
) {
  const motorDirection = directionComponent?.properties?.coverMotorDirection;
  if (motorDirection === "normal") {
    return false;
  } else {
    return motorDirection === "reversed";
  }
}
/**
 * 按电机方向把展示状态还原成物理状态。
 *
 * 反转时四组状态两两互换（open↔closed、opening↔closing）；
 * 认不出的状态原样返回，不做映射。
 *
 * @param {string|object} stateInput 状态名或状态对象。
 * @param {boolean} [reverseOverride] 是否反转。
 * @returns {string} 物理状态名。
 */
export function physicalCoverState(stateInput, reverseOverride = false) {
  const stateName = String(stateInput || "");
  return (
    (reverseOverride &&
      {
        open: "closed",
        closed: "open",
        opening: "closing",
        closing: "opening"
      }[stateName]) ||
    stateName
  );
}
/**
 * 取窗帘用于展示的状态名。
 *
 * opening / closing 原样返回；其余按位置百分比归一：位置在 1% 以内视为 closed，
 * 否则视为 open。反转时要用 100 减位置再判断，因为百分比的方向也跟着反了。
 *
 * @param {object} presentationStateInput 状态对象或变更对象。
 * @param {boolean} [isReversedOverride] 电机是否反转。
 * @returns {string} open / closed / opening / closing。
 */
export function coverPresentationState(presentationStateInput, isReversedOverride = false) {
  const stateObject = presentationStateInput?.newState || presentationStateInput || {};
  const presentedState = physicalCoverState(stateObject.state, isReversedOverride);
  if (presentedState === "opening" || presentedState === "closing") {
    return presentedState;
  }
  const statePositionPercent = coverPositionPercent(stateObject);
  if (statePositionPercent === null) {
    return presentedState;
  } else if (
    (isReversedOverride ? 100 - statePositionPercent : statePositionPercent) <= PERCENT_EPSILON
  ) {
    return "closed";
  } else {
    return "open";
  }
}
/**
 * 在梦幻帘路径下复用的状态解析：只做电机方向还原，不做位置归一。
 *
 * @param {object} physicalStateInput 状态对象或变更对象。
 * @param {boolean} [motorReversed] 电机是否反转。
 * @returns {string} 物理状态名。
 */
function resolvedCoverState(physicalStateInput, motorReversed = false) {
  const coverStateObject = physicalStateInput?.newState || physicalStateInput || {};
  return physicalCoverState(coverStateObject.state, motorReversed);
}
/**
 * 取梦幻帘叶片位置的文案。
 *
 * 位置语义：0 附近是一个方向的闭合、100 附近是反方向的闭合、50 附近是 90° 全开，
 * 中间值按 0~180 度的角度线性折算（乘 1.8）。
 * 50 度附近给 2 的容差，避免「刚好 90°」因为浮点误差显示成 89°。
 *
 * @param {number} bladePosition 叶片位置百分比。
 * @returns {string} 一侧闭合 / 反向闭合 / 90°打开 / N°。
 */
export function dreamCurtainBladeLabel(bladePosition) {
  const clampedBladePosition = Math.max(0, Math.min(100, Number(bladePosition) || 0));
  if (clampedBladePosition <= PERCENT_EPSILON) {
    return "一侧闭合";
  } else if (clampedBladePosition >= 100 - PERCENT_EPSILON) {
    return "反向闭合";
  } else if (Math.abs(clampedBladePosition - 50) <= 2) {
    return "90°打开";
  } else {
    return Math.round(clampedBladePosition * 1.8) + "°";
  }
}
/**
 * 生成梦幻帘「整体 + 叶片」的组合状态文案。
 *
 * @param {string} coverStateName 状态名。
 * @param {number} bladeAngle 叶片位置。
 * @param {boolean} [reverseFlag] 电机是否反转。
 * @returns {string} 形如「整体：开启 · 叶片：90°打开」的文案。
 */
export function dreamCurtainStatusText(coverStateName, bladeAngle, reverseFlag = false) {
  const resolvedPhysicalState = physicalCoverState(coverStateName, reverseFlag);
  return (
    "整体：" +
    ({
      open: "开启",
      closed: "关闭",
      opening: "正在开启",
      closing: "正在关闭"
    }[resolvedPhysicalState] || "未知") +
    " · 叶片：" +
    dreamCurtainBladeLabel(bladeAngle)
  );
}
/**
 * 由「是否已收起」与「是否在移动」生成同样的组合文案。
 *
 * 供拿不到 cover 状态、只有收起布尔量的机型使用。
 *
 * @param {boolean} isRetracting 是否已收起。
 * @param {boolean} isMoving 是否在运动。
 * @param {number} bladePercent 叶片位置。
 * @returns {string} 组合文案。
 */
export function dreamCurtainStatusFromRetraction(isRetracting, isMoving, bladePercent) {
  return (
    "整体：" +
    (isMoving ? (isRetracting ? "正在开启" : "正在关闭") : isRetracting ? "开启" : "关闭") +
    " · 叶片：" +
    dreamCurtainBladeLabel(bladePercent)
  );
}
/**
 * 判断梦幻帘是否已收起。
 *
 * open / opening 都算收起：帘片正在向收起方向移动时，界面上也应显示为已收状态，
 * 这样按钮的语义不会在运动中途来回翻转。
 *
 * @param {object} retractionStateInput 状态对象或变更对象。
 * @param {boolean} [retractionReversed] 是否反转。
 * @returns {boolean} 是否已收起。
 */
export function dreamCurtainIsRetracted(retractionStateInput, retractionReversed = false) {
  const retractedState = physicalCoverState(retractionStateInput, retractionReversed);
  return retractedState === "open" || retractedState === "opening";
}
/**
 * 按当前收起状态取反，返回要调用的服务名。
 *
 * @param {boolean} isRetracted 是否已收起。
 * @param {string} openService 收起动作对应的服务。
 * @param {string} closeService 展开动作对应的服务。
 * @returns {string} 服务名。
 */
export function dreamCurtainToggleService(isRetracted, openService, closeService) {
  if (isRetracted) {
    return closeService;
  } else {
    return openService;
  }
}
/**
 * 为窗帘控件挑出本次「切换」要调用的服务。
 *
 * 梦幻帘与普通帘的状态解析方式不同，因此分别取 resolvedCoverState / coverPresentationState；
 * 之后再按 open / closed 与电机方向决定最终服务名。
 *
 * @param {object} toggleComponent 控件对象。
 * @param {Map<string, object>} stateByEntityId 状态索引。
 * @param {Map<string, object>} componentEntitiesByIdLookup 实体元数据索引。
 * @param {string} componentEntityId 实体 ID。
 * @returns {string} open_cover 或 close_cover。
 */
export function coverToggleServiceForComponent(
  toggleComponent,
  stateByEntityId,
  componentEntitiesByIdLookup,
  componentEntityId
) {
  const componentEntity = componentEntitiesByIdLookup.get(componentEntityId);
  const isMotorReversed = coverMotorIsReversedForComponent(
    toggleComponent,
    stateByEntityId,
    componentEntitiesByIdLookup,
    componentEntityId
  );
  const presentationState = coverComponentIsDream(
    toggleComponent,
    componentEntityId,
    componentEntity,
    stateByEntityId
  )
    ? resolvedCoverState(componentEntity, isMotorReversed)
    : coverPresentationState(componentEntity, isMotorReversed);
    // 已在打开侧就去关；但电机反接时服务名要反过来发——
    // 对反接的电机发 open_cover，物理上才是朝关的方向走。
  if (presentationState === "open" || presentationState === "opening") {
    if (isMotorReversed) {
      return "open_cover";
    } else {
      return "close_cover";
    }
  } else if (isMotorReversed) {
    return "close_cover";
  } else {
    return "open_cover";
  }
}
