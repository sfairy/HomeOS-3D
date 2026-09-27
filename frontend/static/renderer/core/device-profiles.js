/**
 * 小米设备的档案识别与角色实体匹配：用「平台白名单 + 名称关键词打分」把同一台设备的
 */
// 取域走 `utils/entities.js` 的 `entityDomainOf`。
import { entityDomainOf, entitySearchText } from "../../utils/entities.js?v=2609271508";
import { resolveStateEntry } from "../../utils/state-entry.js?v=2609271508";

// 认定为小米生态的 HA 集成平台名：分别是旧版 MIoT 与新版 Xiaomi Home 集成。
const XIAOMI_PLATFORMS = new Set(["xiaomi_miot", "xiaomi_home"]);
/**
 * 判断实体是否可用于档案匹配。
 */
function entityIsUsable(candidateEntity) {
  return (
    !!candidateEntity?.entityId &&
    !candidateEntity.disabledBy &&
    candidateEntity.status !== "missing" &&
    candidateEntity.status !== "disabled"
  );
}
function scoreEntityForRole(entity, entityRole) {
  const domain = entityDomainOf(entity);
  const roleSearchText = entitySearchText(
    entity?.entityId,
    entity?.name,
    entity?.originalName,
    entity?.translationKey,
    entity?.uniqueId
  );
  const originalNameLower = String(entity?.originalName || "")
    .trim()
    .toLowerCase();
  if (entityRole === "climate") {
    if (domain === "climate") {
      return 100 + (/ptc.?bath|bath.?heater|浴霸|风暖/.test(roleSearchText) ? 40 : 0);
    } else {
      return -1;
    }
  }
  if (entityRole === "cover") {
    if (domain === "cover") {
      return 100;
    } else {
      return -1;
    }
  }
  if (entityRole === "fan") {
    if (domain === "fan") {
      return 100 + (/air.?purifier|airp|空气净化/.test(roleSearchText) ? 20 : 0);
    } else {
      return -1;
    }
  }
    // 灯的识别最讲究：同一台净化器 / 浴霸上常带多个附属小灯，
  if (entityRole === "light") {
    if (domain !== "light") {
      return -1;
    }
    let lightScore = 100;
    if (String(entity.translationKey || "").toLowerCase() === "light") {
      lightScore += 80;
    }
    if (["灯", "灯光", "照明"].includes(originalNameLower)) {
      lightScore += 70;
    }
    if (/(?:^|[_\s-])s_?2(?:[_\s-]|$)/.test(roleSearchText)) {
      lightScore += 25;
    }
      // 指示 / 氛围 / 夜灯属于装饰性或状态提示灯，不是用户想开的那盏灯。
    if (/indicator|ambient|night.?light|指示灯|氛围灯|夜灯/.test(roleSearchText)) {
      lightScore -= 140;
    }
    return lightScore;
  }
  if (entityRole === "power") {
    if (["switch", "input_boolean"].includes(domain)) {
      return (
        100 +
        (/(?:^|[_\s-])(on|power|heating)(?:[_\s-]|$)|开关|取暖|加热/.test(roleSearchText) ? 35 : 0)
      );
    } else {
      return -1;
    }
  } else if (entityRole === "mode") {
    if (domain !== "select") {
      return -1;
    } else {
      return 100 + (/mode|preset|模式|档位/.test(roleSearchText) ? 35 : 0);
    }
  } else if (entityRole === "temperature") {
    if (["sensor", "number"].includes(domain)) {
      if (/temperature|target.?temp|温度/.test(roleSearchText)) {
        return 130;
      } else {
        return 20;
      }
    } else {
      return -1;
    }
  } else if (entityRole === "humidity") {
    if (domain === "sensor" && /humidity|湿度/.test(roleSearchText)) {
      return 130;
    } else {
      return -1;
    }
  } else if (entityRole === "pm25") {
    if (domain === "sensor" && /pm.?2[._ ]?5|pm25|particulate|颗粒物/.test(roleSearchText)) {
      return 140;
    } else {
      return -1;
    }
  } else if (entityRole === "hcho") {
    if (
      domain !== "sensor" ||
      !/hcho|formaldehyde|甲醛/.test(roleSearchText) ||
      /original|raw|tag|serial|(?:^|[_\s-])sn(?:[_\s-]|$)|原始|标签|流水号|编号/.test(
        roleSearchText
      )
    ) {
      return -1;
    } else if (/density|concentration|密度|浓度/.test(roleSearchText)) {
      return 190;
    } else {
      return 160;
    }
  } else if (entityRole === "pm10") {
    if (domain === "sensor" && /pm.?10|粉尘/.test(roleSearchText)) {
      return 150;
    } else {
      return -1;
    }
  } else if (entityRole === "filterLeftTime") {
    if (domain !== "sensor" || /used|elapsed|已使用/.test(roleSearchText)) {
      return -1;
    } else if (
      /filter.*(?:left|remaining).*(?:time|hour)|(?:left|remaining).*(?:time|hour).*filter|滤芯.*(?:剩余时间|剩余时长)/.test(
        roleSearchText
      )
    ) {
      return 180;
    } else {
      return -1;
    }
  } else if (entityRole === "filterLife") {
    if (
      domain !== "sensor" ||
      /serial|factory|product|tag|date|(?:^|[_\s-])sn(?:[_\s-]|$)|used|time|hour|流水号|工厂|生产|标签|类型码|已使用|剩余时间|剩余时长/.test(
        roleSearchText
      )
    ) {
      return -1;
    } else if (
      /filter.*(?:life|level)|(?:life|level).*filter|滤芯.*寿命|剩余寿命/.test(roleSearchText)
    ) {
      return 180;
    } else if (/滤芯/.test(roleSearchText)) {
      return 135;
    } else {
      return -1;
    }
  } else if (
    entityRole === "airQuality" &&
    domain === "sensor" &&
    /air.?quality|aqi|空气质量/.test(roleSearchText)
  ) {
    return 130;
  } else {
    return -1;
  }
}
/**
 * 在候选实体里挑出最匹配某个角色的一个。
 */
function pickBestEntityForRole(entityList, targetRole) {
  return (
    entityList
      .map(scoredEntityInput => ({
        entity: scoredEntityInput,
        score: scoreEntityForRole(scoredEntityInput, targetRole)
      }))
      .filter(scoredEntry => scoredEntry.score >= 0)
      .sort(
        (leftScoredEntry, rightScoredEntry) =>
          rightScoredEntry.score - leftScoredEntry.score ||
          String(leftScoredEntry.entity.entityId || "").length -
            String(rightScoredEntry.entity.entityId || "").length ||
          String(leftScoredEntry.entity.entityId || "").localeCompare(
            String(rightScoredEntry.entity.entityId || "")
          )
      )[0]?.entity || null
  );
}
/**
 * 在候选实体里挑出电动床的某个可控部位。
 */
function pickBestBedControlEntity(entities, role) {
  return (
    entities
      .filter(bedEntity => {
        const bedEntityDomain = entityDomainOf(bedEntity);
        const bedEntitySearchText = entitySearchText(
          bedEntity?.entityId,
          bedEntity?.name,
          bedEntity?.originalName,
          bedEntity?.translationKey,
          bedEntity?.uniqueId
        );
        if (role === "backrest") {
          return bedEntityDomain === "number" && /backrest|靠背/.test(bedEntitySearchText);
        } else if (role === "leg") {
          return bedEntityDomain === "number" && /leg|腿部|腿/.test(bedEntitySearchText);
        } else if (role === "waist") {
          return bedEntityDomain === "number" && /waist|腰部|腰/.test(bedEntitySearchText);
        } else if (role === "mode") {
          return (
            bedEntityDomain === "select" &&
            /mode|模式/.test(bedEntitySearchText) &&
            !/memory|记忆|姿势/.test(bedEntitySearchText)
          );
        } else if (role === "memory") {
          return (
            ["button", "select"].includes(bedEntityDomain) &&
            /memory|记忆|姿势/.test(bedEntitySearchText)
          );
        } else {
          return false;
        }
      })
      .sort((leftEntity, rightEntity) =>
        String(leftEntity.entityId || "").localeCompare(String(rightEntity.entityId || ""))
      )[0] || null
  );
}
/**
 * 取实体所属的小米集成标识。
 */
function xiaomiIntegration(entityMetadata) {
  const platform = String(entityMetadata?.platform || "")
    .trim()
    .toLowerCase();
  if (XIAOMI_PLATFORMS.has(platform)) {
    return platform;
  } else {
    return "";
  }
}
/**
 * 解析一台小米设备的完整档案：确认平台属小米 → 收集同设备可用实体 → 拼检索文本 → 逐个角色竞聘 →
 */
export function resolveXiaomiDeviceProfile(
  entityId,
  entitiesById = new Map(),
  devicesById = new Map(),
  statesByEntityId = new Map()
) {
  const primaryEntity = entitiesById?.get?.(entityId) || null;
  const integration = xiaomiIntegration(primaryEntity);
  if (!primaryEntity || !integration) {
    return null;
  }
  const deviceId = String(primaryEntity.deviceId || "");
  // 设备档案可能缺失（设备索引未下发或该设备未注册），此时退回只用实体自身字段做识别。
  const deviceMetadata = (deviceId && devicesById?.get?.(deviceId)) || null;
    // 同设备实体是档案的基础：来源是「同一 deviceId」的可用实体，且必须属于同一集成版本，
  const deviceEntities = [...(entitiesById?.values?.() || [])].filter(
    sameDeviceCandidate =>
      entityIsUsable(sameDeviceCandidate) &&
      (deviceId
        ? sameDeviceCandidate.deviceId === deviceId
        : sameDeviceCandidate.entityId === entityId) &&
      xiaomiIntegration(sameDeviceCandidate) === integration
  );
  if (
    !deviceEntities.some(candidate => candidate.entityId === primaryEntity.entityId) &&
    entityIsUsable(primaryEntity)
  ) {
    deviceEntities.push(primaryEntity);
  }
  const stateEntry = statesByEntityId?.get?.(entityId);
  const stateObject = resolveStateEntry(stateEntry, {});
  const searchText = entitySearchText(
    integration,
    deviceMetadata?.name,
    deviceMetadata?.manufacturer,
    deviceMetadata?.model,
    stateObject?.attributes?.friendly_name,
    deviceEntities.flatMap(profileCandidate => [
      profileCandidate.entityId,
      profileCandidate.name,
      profileCandidate.originalName,
      profileCandidate.translationKey,
      profileCandidate.uniqueId
    ])
  );
    // 逐角色竞聘后丢掉空结果：roles 里只会出现真正解析到的键，
  const roleEntityIds = Object.fromEntries(
    [
      "climate",
      "cover",
      "fan",
      "light",
      "power",
      "mode",
      "temperature",
      "humidity",
      "pm25",
      "hcho",
      "pm10",
      "filterLife",
      "filterLeftTime",
      "airQuality"
    ]
      .map(roleKey => [roleKey, pickBestEntityForRole(deviceEntities, roleKey)?.entityId || ""])
      .filter(([, resolvedEntityId]) => resolvedEntityId)
  );
    // 电动床的四个主控部位；缺哪一个就意味着这台床不支持该调节方向。
  const bedControlEntityIds = {
    backrest: pickBestBedControlEntity(deviceEntities, "backrest")?.entityId || "",
    leg: pickBestBedControlEntity(deviceEntities, "leg")?.entityId || "",
    waist: pickBestBedControlEntity(deviceEntities, "waist")?.entityId || "",
    mode: pickBestBedControlEntity(deviceEntities, "mode")?.entityId || ""
  };
  const selectEntities = deviceEntities
    .filter(
      selectEntity => entityDomainOf(selectEntity) === "select"
    )
    .sort((leftSelectEntity, rightSelectEntity) =>
      String(leftSelectEntity.entityId || "").localeCompare(
        String(rightSelectEntity.entityId || "")
      )
    );
  if (selectEntities.length) {
      // 下拉实体（select）是电动床模式的主要载体，这里单独再排一次序：
    const scoreSelectEntity = rankedSelectEntity => {
      const selectSearchText = entitySearchText(
        rankedSelectEntity.entityId,
        rankedSelectEntity.name,
        rankedSelectEntity.originalName,
        rankedSelectEntity.translationKey,
        rankedSelectEntity.uniqueId
      );
      const selectOptions = statesByEntityId?.get?.(rankedSelectEntity.entityId)?.attributes
        ?.options;
      const modeScoreBonus = /mode|模式|工作模式|operation|function/.test(selectSearchText)
        ? 320
        : 0;
      const memoryScorePenalty = /memory|记忆|姿势/.test(selectSearchText) ? -520 : 0;
      return (
        modeScoreBonus + memoryScorePenalty + Math.min(80, Number(selectOptions?.length || 0) * 8)
      );
    };
    const nonMemorySelects = selectEntities.filter(
      filteredSelectEntity =>
        !/memory|记忆|姿势/.test(
          entitySearchText(
            filteredSelectEntity.entityId,
            filteredSelectEntity.name,
            filteredSelectEntity.originalName,
            filteredSelectEntity.translationKey,
            filteredSelectEntity.uniqueId
          )
        )
    );
    // 候选优先取非记忆下拉；若整台设备的 select 全是记忆类（少见），退回全集以免模式位无候选。
    const rankedSelects = (nonMemorySelects.length ? nonMemorySelects : selectEntities).sort(
      (leftRankedSelect, rightRankedSelect) =>
        scoreSelectEntity(rightRankedSelect) - scoreSelectEntity(leftRankedSelect) ||
        String(leftRankedSelect.entityId || "").localeCompare(
          String(rightRankedSelect.entityId || "")
        )
    );
    bedControlEntityIds.mode = rankedSelects[0]?.entityId || bedControlEntityIds.mode;
  }
  const memoryEntities = deviceEntities
    .filter(memoryEntity => {
      const memoryDomain = entityDomainOf(memoryEntity);
      const memorySearchText = entitySearchText(
        memoryEntity?.entityId,
        memoryEntity?.name,
        memoryEntity?.originalName,
        memoryEntity?.translationKey,
        memoryEntity?.uniqueId
      );
      return (
        ["button", "select"].includes(memoryDomain) && /memory|记忆|姿势/.test(memorySearchText)
      );
    })
    .sort((leftMemoryEntity, rightMemoryEntity) =>
      String(leftMemoryEntity.entityId || "").localeCompare(
        String(rightMemoryEntity.entityId || "")
      )
    );
  const buttonEntities = deviceEntities
    .filter(
      buttonEntity => entityDomainOf(buttonEntity) === "button"
    )
    .sort((leftButtonEntity, rightButtonEntity) =>
      String(leftButtonEntity.entityId || "").localeCompare(
        String(rightButtonEntity.entityId || "")
      )
    );
  const remainingSelectEntities = deviceEntities
    .filter(
      remainingSelectEntity =>
        entityDomainOf(remainingSelectEntity) === "select" &&
        remainingSelectEntity.entityId !== bedControlEntityIds.mode
    )
    .sort((leftRemainingSelect, rightRemainingSelect) =>
      String(leftRemainingSelect.entityId || "").localeCompare(
        String(rightRemainingSelect.entityId || "")
      )
    );
  const buttonOrSelectEntities = buttonEntities.length ? buttonEntities : remainingSelectEntities;
  const memoryCandidateEntities = memoryEntities.length ? memoryEntities : buttonOrSelectEntities;
    // 按候选顺序取前两个：下标 0 为记忆 1、下标 1 为记忆 2，缺位时留空串表示不可用。
  bedControlEntityIds.memory1 = memoryCandidateEntities[0]?.entityId || "";
  bedControlEntityIds.memory2 = memoryCandidateEntities[1]?.entityId || "";
    // 设备类型判断所需的几个特征先各自算好，下面按固定优先级串成一棵判定树。
  const isElectricBed = /electric.?bed|smart.?bed|bed\.\d+|milan|电动床|智能床/.test(searchText);
  const hasAllBedControls =
    !!bedControlEntityIds.backrest &&
    !!bedControlEntityIds.leg &&
    !!bedControlEntityIds.waist &&
    !!bedControlEntityIds.mode;
  const primaryDomain = entityDomainOf(primaryEntity);
  const isBathHeater = /bath.?heater|ptc.?bath|(?:^|[._-])bhf(?:[._-]|$)|浴霸|风暖|暖风机/.test(
    searchText
  );
  const isAirConditioner = /air.?condition|aircondition|aircon|空调/.test(searchText);
  const isAirPurifier = /air.?purifier|(?:^|[._-])airp(?:[._-]|$)|空气净化/.test(searchText);
  let deviceType = "generic";
    // 判定顺序即优先级，不能重排：名称明确是床、或四个部位全齐才算电动床；
  if (isElectricBed || hasAllBedControls) {
    deviceType = "electric-bed";
  } else if (isBathHeater && (roleEntityIds.climate || roleEntityIds.fan)) {
    deviceType = "bath-heater";
  } else if (isAirConditioner && roleEntityIds.climate) {
    deviceType = "air-conditioner";
  } else if (roleEntityIds.cover) {
    deviceType = "cover";
  } else if (isAirPurifier && roleEntityIds.fan) {
    deviceType = "air-purifier";
  } else if (roleEntityIds.climate) {
    deviceType = primaryDomain === "climate" ? "air-conditioner" : "generic";
  } else if (roleEntityIds.fan) {
    deviceType = "fan";
  } else if (roleEntityIds.light && primaryDomain === "light") {
    deviceType = "light";
  } else if (roleEntityIds.power && ["switch", "input_boolean"].includes(primaryDomain)) {
    deviceType = "switch";
  }
    // 窗帘的细分类型只影响控件的交互形态（晾衣机 / 梦幻帘 / 普通帘），
  const coverKind =
    roleEntityIds.cover && /airer|clothes.?rack|laundry.?rack|晾衣机|晾衣架/.test(searchText)
      ? "airer"
      : roleEntityIds.cover && /dream|vertical|novo\.curtain|梦幻|竖帘|垂直帘/.test(searchText)
        ? "dream"
        : roleEntityIds.cover
          ? "standard"
          : "";
  return {
    integration: integration,
    integrationLabel: integration === "xiaomi_home" ? "Xiaomi Home" : "Xiaomi Miot",
    deviceId: deviceId,
    deviceName: String(
      deviceMetadata?.name ||
        stateObject?.attributes?.friendly_name ||
        primaryEntity.name ||
        entityId
    ),
    manufacturer: String(deviceMetadata?.manufacturer || ""),
    model: String(deviceMetadata?.model || ""),
    deviceType: deviceType,
    coverKind: coverKind,
    roles: {
      primary:
        roleEntityIds.climate ||
        roleEntityIds.cover ||
        roleEntityIds.fan ||
        roleEntityIds.light ||
        roleEntityIds.power ||
        entityId,
      ...roleEntityIds,
      ...(deviceType === "electric-bed" ? bedControlEntityIds : {})
    },
    entityIds: deviceEntities.map(deviceEntity => deviceEntity.entityId),
    confidence: deviceType === "generic" ? "standard-fallback" : "xiaomi-profile"
  };
}
/**
 * 把档案里能推断出的控件属性回填到组件上。
 */
export function applyXiaomiDeviceProfile(component, profile) {
  if (!component || !profile) {
    return component;
  }
  const nextProperties = {
    ...(component.properties || {})
  };
  if (
    (!nextProperties.deviceType || nextProperties.deviceType === "auto") &&
    ["air-conditioner", "bath-heater"].includes(profile.deviceType)
  ) {
    nextProperties.deviceType = profile.deviceType;
  }
  if ((!nextProperties.coverKind || nextProperties.coverKind === "auto") && profile.coverKind) {
    nextProperties.coverKind = profile.coverKind;
  }
  return {
    ...component,
    properties: nextProperties
  };
}
