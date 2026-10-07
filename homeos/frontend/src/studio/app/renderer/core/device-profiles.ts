const xiaomiPlatformSet = new Set(["xiaomi_miot", "xiaomi_home"]);
function entitySearchText(...searchParts: any[]) {
  return searchParts
    .flat()
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function entityIsUsable(candidateEntity: any) {
  return (
    !!candidateEntity?.entityId &&
    !candidateEntity.disabledBy &&
    candidateEntity.status !== "missing" &&
    candidateEntity.status !== "disabled"
  );
}
function scoreEntityForRole(entity: any, entityRole: any) {
  const domain = String(entity?.domain || entity?.entityId || "").split(".", 1)[0],
    roleSearchText = entitySearchText(
      entity?.entityId,
      entity?.name,
      entity?.originalName,
      entity?.translationKey,
      entity?.uniqueId,
    ),
    originalNameLower = String(entity?.originalName || "")
      .trim()
      .toLowerCase();
  if (entityRole === "climate")
    return domain === "climate"
      ? 100 + (/ptc.?bath|bath.?heater|浴霸|风暖/.test(roleSearchText) ? 40 : 0)
      : -1;
  if (entityRole === "cover") return domain === "cover" ? 100 : -1;
  if (entityRole === "fan")
    return domain === "fan"
      ? 100 + (/air.?purifier|airp|空气净化/.test(roleSearchText) ? 20 : 0)
      : -1;
  if (entityRole === "light") {
    if (domain !== "light") return -1;
    let lightScore = 100;
    return (
      String(entity.translationKey || "").toLowerCase() === "light" && (lightScore += 80),
      ["灯", "灯光", "照明"].includes(originalNameLower) && (lightScore += 70),
      /(?:^|[_\s-])s_?2(?:[_\s-]|$)/.test(roleSearchText) && (lightScore += 25),
      /indicator|ambient|night.?light|指示灯|氛围灯|夜灯/.test(roleSearchText) &&
        (lightScore -= 140),
      lightScore
    );
  }
  return entityRole === "power"
    ? ["switch", "input_boolean"].includes(domain)
      ? 100 +
        (/(?:^|[_\s-])(on|power|heating)(?:[_\s-]|$)|开关|取暖|加热/.test(roleSearchText) ? 35 : 0)
      : -1
    : entityRole === "mode"
      ? domain !== "select"
        ? -1
        : 100 + (/mode|preset|模式|档位/.test(roleSearchText) ? 35 : 0)
      : entityRole === "temperature"
        ? ["sensor", "number"].includes(domain)
          ? /temperature|target.?temp|温度/.test(roleSearchText)
            ? 130
            : 20
          : -1
        : entityRole === "humidity"
          ? domain === "sensor" && /humidity|湿度/.test(roleSearchText)
            ? 130
            : -1
          : entityRole === "pm25"
            ? domain === "sensor" && /pm.?2[._ ]?5|pm25|particulate|颗粒物/.test(roleSearchText)
              ? 140
              : -1
            : entityRole === "hcho"
              ? domain !== "sensor" ||
                !/hcho|formaldehyde|甲醛/.test(roleSearchText) ||
                /original|raw|tag|serial|(?:^|[_\s-])sn(?:[_\s-]|$)|原始|标签|流水号|编号/.test(
                  roleSearchText,
                )
                ? -1
                : /density|concentration|密度|浓度/.test(roleSearchText)
                  ? 190
                  : 160
              : entityRole === "pm10"
                ? domain === "sensor" && /pm.?10|粉尘/.test(roleSearchText)
                  ? 150
                  : -1
                : entityRole === "filterLeftTime"
                  ? domain !== "sensor" || /used|elapsed|已使用/.test(roleSearchText)
                    ? -1
                    : /filter.*(?:left|remaining).*(?:time|hour)|(?:left|remaining).*(?:time|hour).*filter|滤芯.*(?:剩余时间|剩余时长)/.test(
                          roleSearchText,
                        )
                      ? 180
                      : -1
                  : entityRole === "filterLife"
                    ? domain !== "sensor" ||
                      /serial|factory|product|tag|date|(?:^|[_\s-])sn(?:[_\s-]|$)|used|time|hour|流水号|工厂|生产|标签|类型码|已使用|剩余时间|剩余时长/.test(
                        roleSearchText,
                      )
                      ? -1
                      : /filter.*(?:life|level)|(?:life|level).*filter|滤芯.*寿命|剩余寿命/.test(
                            roleSearchText,
                          )
                        ? 180
                        : /滤芯/.test(roleSearchText)
                          ? 135
                          : -1
                    : entityRole === "airQuality" &&
                        domain === "sensor" &&
                        /air.?quality|aqi|空气质量/.test(roleSearchText)
                      ? 130
                      : -1;
}
function pickBestEntityForRole(entityList: any, targetRole: any) {
  return (
    entityList
      .map((scoredEntityInput: any) => ({
        entity: scoredEntityInput,
        score: scoreEntityForRole(scoredEntityInput, targetRole),
      }))
      .filter((scoredEntry: any) => scoredEntry.score >= 0)
      .sort(
        (leftScoredEntry: any, rightScoredEntry: any) =>
          rightScoredEntry.score - leftScoredEntry.score ||
          String(leftScoredEntry.entity.entityId || "").length -
            String(rightScoredEntry.entity.entityId || "").length ||
          String(leftScoredEntry.entity.entityId || "").localeCompare(
            String(rightScoredEntry.entity.entityId || ""),
          ),
      )[0]?.entity || null
  );
}
function pickBestBedControlEntity(entities: any, role: any) {
  return (
    entities
      .filter((bedEntity: any) => {
        const bedEntityDomain = String(bedEntity?.domain || bedEntity?.entityId || "").split(
            ".",
            1,
          )[0],
          bedEntitySearchText = entitySearchText(
            bedEntity?.entityId,
            bedEntity?.name,
            bedEntity?.originalName,
            bedEntity?.translationKey,
            bedEntity?.uniqueId,
          );
        return role === "backrest"
          ? bedEntityDomain === "number" && /backrest|靠背/.test(bedEntitySearchText)
          : role === "leg"
            ? bedEntityDomain === "number" && /leg|腿部|腿/.test(bedEntitySearchText)
            : role === "waist"
              ? bedEntityDomain === "number" && /waist|腰部|腰/.test(bedEntitySearchText)
              : role === "mode"
                ? bedEntityDomain === "select" &&
                  /mode|模式/.test(bedEntitySearchText) &&
                  !/memory|记忆|姿势/.test(bedEntitySearchText)
                : role === "memory"
                  ? ["button", "select"].includes(bedEntityDomain) &&
                    /memory|记忆|姿势/.test(bedEntitySearchText)
                  : false;
      })
      .sort((leftEntity: any, rightEntity: any) =>
        String(leftEntity.entityId || "").localeCompare(String(rightEntity.entityId || "")),
      )[0] || null
  );
}
function xiaomiIntegration(entityMetadata: any) {
  const platform = String(entityMetadata?.platform || "")
    .trim()
    .toLowerCase();
  return xiaomiPlatformSet.has(platform) ? platform : "";
}
export function resolveXiaomiDeviceProfile(
  entityId: any,
  entitiesById = new Map(),
  devicesById = new Map(),
  statesByEntityId = new Map(),
) {
  const primaryEntity = entitiesById?.get?.(entityId) || null,
    integration = xiaomiIntegration(primaryEntity);
  if (!primaryEntity || !integration) return null;
  const deviceId = String(primaryEntity.deviceId || ""),
    deviceMetadata = (deviceId && devicesById?.get?.(deviceId)) || null,
    deviceEntities = [...(entitiesById?.values?.() || [])].filter(
      (sameDeviceCandidate) =>
        entityIsUsable(sameDeviceCandidate) &&
        (deviceId
          ? sameDeviceCandidate.deviceId === deviceId
          : sameDeviceCandidate.entityId === entityId) &&
        xiaomiIntegration(sameDeviceCandidate) === integration,
    );
  !deviceEntities.some((candidate) => candidate.entityId === primaryEntity.entityId) &&
    entityIsUsable(primaryEntity) &&
    deviceEntities.push(primaryEntity);
  const stateEntry = statesByEntityId?.get?.(entityId),
    stateObject = stateEntry?.newState || stateEntry || {},
    searchText = entitySearchText(
      integration,
      deviceMetadata?.name,
      deviceMetadata?.manufacturer,
      deviceMetadata?.model,
      stateObject?.attributes?.friendly_name,
      deviceEntities.flatMap((profileCandidate) => [
        profileCandidate.entityId,
        profileCandidate.name,
        profileCandidate.originalName,
        profileCandidate.translationKey,
        profileCandidate.uniqueId,
      ]),
    ),
    roleEntityIds = Object.fromEntries(
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
        "airQuality",
      ]
        .map((roleKey) => [roleKey, pickBestEntityForRole(deviceEntities, roleKey)?.entityId || ""])
        .filter(([, resolvedEntityId]) => resolvedEntityId),
    ),
    bedControlEntityIds: {
      backrest: string;
      leg: string;
      waist: string;
      mode: string;
      memory1?: string;
      memory2?: string;
    } = {
      backrest: pickBestBedControlEntity(deviceEntities, "backrest")?.entityId || "",
      leg: pickBestBedControlEntity(deviceEntities, "leg")?.entityId || "",
      waist: pickBestBedControlEntity(deviceEntities, "waist")?.entityId || "",
      mode: pickBestBedControlEntity(deviceEntities, "mode")?.entityId || "",
    },
    selectEntities = deviceEntities
      .filter(
        (selectEntity) =>
          String(selectEntity?.domain || selectEntity?.entityId || "").split(".", 1)[0] ===
          "select",
      )
      .sort((leftSelectEntity, rightSelectEntity) =>
        String(leftSelectEntity.entityId || "").localeCompare(
          String(rightSelectEntity.entityId || ""),
        ),
      );
  if (selectEntities.length) {
    const scoreSelectEntity = (rankedSelectEntity: any) => {
        const selectSearchText = entitySearchText(
            rankedSelectEntity.entityId,
            rankedSelectEntity.name,
            rankedSelectEntity.originalName,
            rankedSelectEntity.translationKey,
            rankedSelectEntity.uniqueId,
          ),
          selectOptions = statesByEntityId?.get?.(rankedSelectEntity.entityId)?.attributes?.options,
          modeScoreBonus = /mode|模式|工作模式|operation|function/.test(selectSearchText) ? 320 : 0,
          memoryScorePenalty = /memory|记忆|姿势/.test(selectSearchText) ? -520 : 0;
        return (
          modeScoreBonus + memoryScorePenalty + Math.min(80, Number(selectOptions?.length || 0) * 8)
        );
      },
      nonMemorySelects = selectEntities.filter(
        (filteredSelectEntity) =>
          !/memory|记忆|姿势/.test(
            entitySearchText(
              filteredSelectEntity.entityId,
              filteredSelectEntity.name,
              filteredSelectEntity.originalName,
              filteredSelectEntity.translationKey,
              filteredSelectEntity.uniqueId,
            ),
          ),
      ),
      rankedSelects = (nonMemorySelects.length ? nonMemorySelects : selectEntities).sort(
        (leftRankedSelect, rightRankedSelect) =>
          scoreSelectEntity(rightRankedSelect) - scoreSelectEntity(leftRankedSelect) ||
          String(leftRankedSelect.entityId || "").localeCompare(
            String(rightRankedSelect.entityId || ""),
          ),
      );
    bedControlEntityIds.mode = rankedSelects[0]?.entityId || bedControlEntityIds.mode;
  }
  const memoryEntities = deviceEntities
      .filter((memoryEntity) => {
        const memoryDomain = String(memoryEntity?.domain || memoryEntity?.entityId || "").split(
            ".",
            1,
          )[0],
          memorySearchText = entitySearchText(
            memoryEntity?.entityId,
            memoryEntity?.name,
            memoryEntity?.originalName,
            memoryEntity?.translationKey,
            memoryEntity?.uniqueId,
          );
        return (
          ["button", "select"].includes(memoryDomain) && /memory|记忆|姿势/.test(memorySearchText)
        );
      })
      .sort((leftMemoryEntity, rightMemoryEntity) =>
        String(leftMemoryEntity.entityId || "").localeCompare(
          String(rightMemoryEntity.entityId || ""),
        ),
      ),
    buttonEntities = deviceEntities
      .filter(
        (buttonEntity) =>
          String(buttonEntity?.domain || buttonEntity?.entityId || "").split(".", 1)[0] ===
          "button",
      )
      .sort((leftButtonEntity, rightButtonEntity) =>
        String(leftButtonEntity.entityId || "").localeCompare(
          String(rightButtonEntity.entityId || ""),
        ),
      ),
    remainingSelectEntities = deviceEntities
      .filter(
        (remainingSelectEntity) =>
          String(remainingSelectEntity?.domain || remainingSelectEntity?.entityId || "").split(
            ".",
            1,
          )[0] === "select" && remainingSelectEntity.entityId !== bedControlEntityIds.mode,
      )
      .sort((leftRemainingSelect, rightRemainingSelect) =>
        String(leftRemainingSelect.entityId || "").localeCompare(
          String(rightRemainingSelect.entityId || ""),
        ),
      ),
    buttonOrSelectEntities = buttonEntities.length ? buttonEntities : remainingSelectEntities,
    memoryCandidateEntities = memoryEntities.length ? memoryEntities : buttonOrSelectEntities;
  ((bedControlEntityIds.memory1 = memoryCandidateEntities[0]?.entityId || ""),
    (bedControlEntityIds.memory2 = memoryCandidateEntities[1]?.entityId || ""));
  const isElectricBed = /electric.?bed|smart.?bed|bed\.\d+|milan|电动床|智能床/.test(searchText),
    hasAllBedControls = !!(
      bedControlEntityIds.backrest &&
      bedControlEntityIds.leg &&
      bedControlEntityIds.waist &&
      bedControlEntityIds.mode
    ),
    primaryDomain = String(primaryEntity.domain || primaryEntity.entityId || "").split(".", 1)[0],
    isBathHeater = /bath.?heater|ptc.?bath|(?:^|[._-])bhf(?:[._-]|$)|浴霸|风暖|暖风机/.test(
      searchText,
    ),
    isAirConditioner = /air.?condition|aircondition|aircon|空调/.test(searchText),
    isAirPurifier = /air.?purifier|(?:^|[._-])airp(?:[._-]|$)|空气净化/.test(searchText);
  let deviceType = "generic";
  isElectricBed || hasAllBedControls
    ? (deviceType = "electric-bed")
    : isBathHeater && (roleEntityIds.climate || roleEntityIds.fan)
      ? (deviceType = "bath-heater")
      : isAirConditioner && roleEntityIds.climate
        ? (deviceType = "air-conditioner")
        : roleEntityIds.cover
          ? (deviceType = "cover")
          : isAirPurifier && roleEntityIds.fan
            ? (deviceType = "air-purifier")
            : roleEntityIds.climate
              ? (deviceType = primaryDomain === "climate" ? "air-conditioner" : "generic")
              : roleEntityIds.fan
                ? (deviceType = "fan")
                : roleEntityIds.light && primaryDomain === "light"
                  ? (deviceType = "light")
                  : roleEntityIds.power &&
                    ["switch", "input_boolean"].includes(primaryDomain) &&
                    (deviceType = "switch");
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
        entityId,
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
      ...(deviceType === "electric-bed" ? bedControlEntityIds : {}),
    },
    entityIds: deviceEntities.map((deviceEntity) => deviceEntity.entityId),
    confidence: deviceType === "generic" ? "standard-fallback" : "xiaomi-profile",
  };
}
export function applyXiaomiDeviceProfile(component: any, profile: any) {
  if (!component || !profile) return component;
  const nextProperties = {
    ...(component.properties || {}),
  };
  return (
    (!nextProperties.deviceType || nextProperties.deviceType === "auto") &&
      ["air-conditioner", "bath-heater"].includes(profile.deviceType) &&
      (nextProperties.deviceType = profile.deviceType),
    (!nextProperties.coverKind || nextProperties.coverKind === "auto") &&
      profile.coverKind &&
      (nextProperties.coverKind = profile.coverKind),
    {
      ...component,
      properties: nextProperties,
    }
  );
}
