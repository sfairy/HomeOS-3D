const METRIC_DEFINITIONS = {
    cpu_total_load: ["CPU 使用率", "system"],
    cpu_user_load: ["CPU 用户使用率", "system"],
    cpu_system_load: ["CPU 系统使用率", "system"],
    cpu_other_load: ["CPU 其他使用率", "system"],
    cpu_1min_load: ["平均负载 · 1 分钟", "system"],
    cpu_15min_load: ["平均负载 · 15 分钟", "system"],
    memory_real_usage: ["内存使用率", "system"],
    temperature: ["系统温度", "system"],
    cpu_temperature: ["CPU 温度", "system"],
    cpu_5min_load: ["平均负载 · 5 分钟", "system"],
    memory_available_real: ["可用内存", "system"],
    memory_total_real: ["总内存", "system"],
    uptime: ["上次启动", "system", "timestamp"],
    network_up: ["上传", "network"],
    network_down: ["下载", "network"],
    volume_percentage_used: ["使用率", "storage"],
    volume_size_used: ["已用空间", "storage"],
    volume_size_total: ["总容量", "storage"],
    volume_status: ["状态", "storage", "status"],
    volume_disk_temp_avg: ["平均磁盘温度", "storage"],
    disk_temp: ["温度", "storage"],
    disk_smart_status: ["S.M.A.R.T.", "health", "status"],
    status: ["安全状态", "health", "problem"],
    disk_exceed_bad_sector_thr: ["坏道告警", "health", "problem"],
    disk_below_remain_life_thr: ["寿命告警", "health", "problem"],
  },
  isUsableEntity = (entity: any) =>
    !entity.disabledBy && !["disabled", "missing"].includes(entity.status),
  // 绿联 UGOS：整体指标（uniqueId 形如 `cpu_usage`，key 即去掉设备前缀后的 metric）
  UGREEN_SYSTEM_METRICS = {
    cpu_usage: ["CPU 使用率", "system"],
    mem_usage: ["内存使用率", "system"],
    cpu_temperature: ["CPU 温度", "system"],
    cpu_model: ["CPU 型号", "system"],
    cpu_ghz: ["CPU 频率", "system"],
    cpu_core: ["CPU 核心数", "system"],
    cpu_thread: ["CPU 线程数", "system"],
    ram_usage_total_usable: ["可用内存总量", "system"],
    ram_usage_free: ["空闲内存", "system"],
    ram_usage_cache: ["缓存内存", "system"],
    ram_usage_shared: ["共享内存", "system"],
    ram_usage_used_gb: ["已用内存", "system"],
    last_boot_date: ["上次启动", "system", "status"],
    last_boot_time: ["上次启动时间", "system", "status"],
    total_run_time: ["累计运行时间", "system"],
    device_name: ["设备名称", "system", "status"],
    model: ["设备型号", "system", "status"],
    ugos_version: ["UGOS 版本", "system", "status"],
    ugos_update_available: ["系统更新", "system", "status"],
    power_mode: ["电源模式", "system", "status"],
    fan_mode: ["风扇模式", "system", "status"],
    cpu_fan_speed: ["CPU 风扇转速", "system"],
    server_status: ["系统状态", "health", "status"],
    status: ["系统状态码", "health", "status"],
    cpu_status: ["CPU 温度状态", "health", "status"],
    temperature_status: ["温度状态码", "health", "status"],
    temperature_message: ["温度提示", "health", "status"],
    message: ["系统提示", "health", "status"],
    fan_status_overall: ["风扇状态", "health", "status"],
    cpu_fan_status: ["CPU 风扇状态", "health", "status"],
    overall_lan_upload: ["总上传", "network"],
    overall_lan_upload_raw: ["总上传（原始值）", "network"],
    overall_lan_download: ["总下载", "network"],
    overall_lan_download_raw: ["总下载（原始值）", "network"],
    overall_disk_read_rate: ["磁盘总读取", "storage"],
    overall_disk_read_rate_raw: ["磁盘总读取（原始值）", "storage"],
    overall_disk_write_rate: ["磁盘总写入", "storage"],
    overall_disk_write_rate_raw: ["磁盘总写入（原始值）", "storage"],
    overall_volume_read_rate: ["存储卷总读取", "storage"],
    overall_volume_read_rate_raw: ["存储卷总读取（原始值）", "storage"],
    overall_volume_write_rate: ["存储卷总写入", "storage"],
    overall_volume_write_rate_raw: ["存储卷总写入（原始值）", "storage"],
  },
  // 绿联 UGOS：卷 / 磁盘子指标（key 为 uniqueId 形如 `volume1_pool1_used` 的后半段）
  UGREEN_VOLUME_METRICS = {
    total: ["总容量"],
    total_raw: ["总容量（原始值）"],
    size: ["容量"],
    used: ["已用空间"],
    used_raw: ["已用空间（原始值）"],
    free: ["空闲空间"],
    available: ["可用空间"],
    available_raw: ["可用空间（原始值）"],
    temperature: ["温度"],
    utilization: ["利用率"],
    disk_count: ["磁盘数量"],
    read_rate: ["读取速度"],
    read_rate_raw: ["读取速度（原始值）"],
    write_rate: ["写入速度"],
    write_rate_raw: ["写入速度（原始值）"],
    read_iops: ["读取 IOPS"],
    write_iops: ["写入 IOPS"],
    hit_rate: ["缓存命中率"],
    used_cache_size: ["已用缓存"],
    status: ["状态", "health", "status"],
    health: ["健康状态", "health", "status"],
    smart_last_result: ["S.M.A.R.T. 检测结果", "health", "status"],
    smart_last_test: ["上次 S.M.A.R.T. 检测", "health", "timestamp"],
    smart_next_test: ["下次 S.M.A.R.T. 检测", "health", "timestamp"],
    power_on_hours: ["通电时长", "health"],
    power_on_count: ["通电次数", "health"],
    sleep_state: ["休眠状态", "storage", "status"],
  },
  normalizeNasPlatform = (platform: any) =>
    ["fnos", "synology_dsm", "ugreen"].includes(platform) ? platform : null,
  METRIC_KEYS_BY_LENGTH = Object.keys(METRIC_DEFINITIONS).sort(
    (keyA, keyB) => keyB.length - keyA.length,
  );
function resolveMetricIdentity(sourceEntity: any) {
  const uniqueId = sourceEntity.uniqueId || "";
  if (sourceEntity.platform === "ugreen") {
    const ugreenIdentity = uniqueId.match(/^([^_]+)_(.+)$/);
    return {
      key: ugreenIdentity?.[2] || sourceEntity.translationKey,
      prefix: ugreenIdentity?.[1] || null,
    };
  }
  if (sourceEntity.platform === "synology_dsm") {
    const hostMatch = uniqueId.match(/^(.+)_[^:]+:([^:]+)$/),
      synologyMetricKey =
        hostMatch &&
        METRIC_KEYS_BY_LENGTH.find(
          (longestKey) => hostMatch[2] === longestKey || hostMatch[2].startsWith(longestKey + "_"),
        );
    return {
      key: sourceEntity.translationKey || synologyMetricKey,
      host: synologyMetricKey ? hostMatch[1] : null,
    };
  }
  const metricKey = METRIC_KEYS_BY_LENGTH.find((candidateKey) =>
    uniqueId.endsWith("_" + candidateKey),
  );
  return {
    key: sourceEntity.translationKey || metricKey,
    prefix: metricKey ? uniqueId.slice(0, -metricKey.length - 1) : null,
  };
}
// 绿联 UGOS：uniqueId 前缀与 metric 分离，卷 / 磁盘 / 网口 / 机箱风扇等按命名规则归类。
function resolveUgreenMetric(metric: any): [string, string, string] {
  const metricKey = metric.key || "",
    fallbackLabel = metric.name || metric.originalName || metric.entityId;
  if (Object.hasOwn(UGREEN_SYSTEM_METRICS, metricKey)) {
    return (UGREEN_SYSTEM_METRICS as any)[metricKey];
  }
  const volumeMatch = metricKey.match(
    /^(?:pool\d+|volume\d+_pool\d+|(?:cache_)?disk\d+_pool\d+|cache_pool\d+|standalone_disk\d+)_(.+)$/,
  );
  if (volumeMatch) {
    const volumeDefinition = (UGREEN_VOLUME_METRICS as any)[volumeMatch[1]];
    if (volumeDefinition) {
      return [
        volumeDefinition[0],
        volumeDefinition[1] || "storage",
        volumeDefinition[2] || "number",
      ];
    }
    return [fallbackLabel, "storage", "number"];
  }
  const lanMatch = metricKey.match(/^lan(\d+)_(.+)$/i);
  if (lanMatch) {
    const lanLabel = ((
      {
        upload: "上传",
        download: "下载",
        upload_raw: "上传（原始值）",
        download_raw: "下载（原始值）",
        speed: "链路速度",
        ip: "IP 地址",
        mac: "MAC 地址",
      } as Record<string, string>
    )[lanMatch[2]]);
    return [
      lanLabel ? "LAN " + lanMatch[1] + " · " + lanLabel : fallbackLabel,
      "network",
      "number",
    ];
  }
  const fanMatch = metricKey.match(/^device_fan(\d*)_(speed|status)$/);
  if (fanMatch) {
    return [
      "机箱风扇" +
        (fanMatch[1] ? " " + fanMatch[1] : "") +
        " · " +
        (fanMatch[2] === "speed" ? "转速" : "状态"),
      fanMatch[2] === "speed" ? "system" : "health",
      fanMatch[2] === "speed" ? "number" : "status",
    ];
  }
  if (/^root_summary_.*_summary$/.test(metricKey)) {
    return [fallbackLabel, "storage", "status"];
  }
  return [
    fallbackLabel,
    "system",
    metric.entityId.startsWith("binary_sensor.") ? "status" : "number",
  ];
}
const metricDefinition = (metric: any) =>
    metric.platform === "ugreen"
      ? resolveUgreenMetric(metric)
      : (METRIC_DEFINITIONS as any)[metric.key] || [
          metric.name || metric.originalName || metric.entityId,
          "system",
          metric.entityId.startsWith("binary_sensor.") ? "status" : "number",
        ],
  isSystemMetric = (checkedMetric: any) =>
    checkedMetric.platform === "ugreen"
      ? Object.hasOwn(UGREEN_SYSTEM_METRICS, checkedMetric.key) &&
        ["system", "network", "health"].includes(
          (UGREEN_SYSTEM_METRICS as any)[checkedMetric.key][1],
        )
      : Object.hasOwn(METRIC_DEFINITIONS, checkedMetric.key) &&
        ((METRIC_DEFINITIONS as any)[checkedMetric.key][1] === "system" ||
          checkedMetric.key === "status" ||
          (checkedMetric.platform === "synology_dsm" &&
            (METRIC_DEFINITIONS as any)[checkedMetric.key][1] === "network"));
export function nasProfiles(entities: any[] = [], devices: any[] = []) {
  const devicesByDeviceId = new Map(
      devices.filter(isUsableEntity).map((device) => [device.deviceId, device]),
    ),
    platformsByDeviceId = new Map(
      [...devicesByDeviceId.values()].map((deviceEntry) => [
        deviceEntry.deviceId,
        new Set((deviceEntry.registryMetadata?.integrations || []).filter(normalizeNasPlatform)),
      ]),
    );
  for (const entityRecord of entities)
    entityRecord.status !== "missing" &&
      normalizeNasPlatform(entityRecord.platform) &&
      platformsByDeviceId.get(entityRecord.deviceId)?.add(entityRecord.platform);
  const platformsOfDevice = (sourceDevice: any) => [
      ...(platformsByDeviceId.get(sourceDevice.deviceId) || []),
    ],
    profilesByIdentity = new Map(),
    profilesByEntityKey = new Map();
  for (const chainDevice of devicesByDeviceId.values()) {
    if (!chainDevice.registryMetadata || chainDevice.registryMetadata.entryType === "service")
      continue;
    const platforms = platformsOfDevice(chainDevice);
    if (platforms.length !== 1) continue;
    const devicePlatform = platforms[0],
      visitedDeviceIdSet = new Set();
    let currentDevice = chainDevice,
      isChainValid = true;
    for (
      ;
      currentDevice.registryMetadata?.viaDeviceId &&
      !(
        devicePlatform === "fnos" &&
        currentDevice.registryMetadata.viaDeviceId === currentDevice.deviceId
      );
    ) {
      if (visitedDeviceIdSet.has(currentDevice.deviceId)) {
        isChainValid = false;
        break;
      }
      visitedDeviceIdSet.add(currentDevice.deviceId);
      const parentDevice = devicesByDeviceId.get(currentDevice.registryMetadata.viaDeviceId),
        configEntryIds = currentDevice.registryMetadata.configEntryIds || [],
        parentConfigEntryIds = parentDevice?.registryMetadata?.configEntryIds || [];
      if (
        !parentDevice?.registryMetadata ||
        parentDevice.registryMetadata.entryType === "service" ||
        platformsOfDevice(parentDevice).length !== 1 ||
        platformsOfDevice(parentDevice)[0] !== devicePlatform ||
        (configEntryIds.length &&
          parentConfigEntryIds.length &&
          !configEntryIds.some((configEntryId: any) => parentConfigEntryIds.includes(configEntryId)))
      ) {
        isChainValid = false;
        break;
      }
      currentDevice = parentDevice;
    }
    if (!isChainValid) continue;
    const profileKey = devicePlatform + ":" + currentDevice.deviceId;
    (profilesByIdentity.has(profileKey) ||
      profilesByIdentity.set(profileKey, {
        device: currentDevice,
        platform: devicePlatform,
        identities: new Set(),
        metrics: [] as any[],
        registry: true,
      }),
      profilesByEntityKey.set(
        devicePlatform + ":" + chainDevice.deviceId,
        profilesByIdentity.get(profileKey),
      ));
  }
  const metricEntities = entities
    .filter(
      (candidateEntity) =>
        /^(sensor|binary_sensor)\./.test(candidateEntity.entityId) &&
        normalizeNasPlatform(candidateEntity.platform) &&
        devicesByDeviceId.has(candidateEntity.deviceId) &&
        candidateEntity.status !== "missing",
    )
    .map((mappedEntity) => ({
      ...mappedEntity,
      ...resolveMetricIdentity(mappedEntity),
    }))
    .filter(
      (metricCandidate) =>
        metricDefinition(metricCandidate)[2] !== "problem" ||
        metricCandidate.entityId.startsWith("binary_sensor."),
    );
  for (const legacyEntity of metricEntities.filter(
    (legacyMetricEntity) =>
      !devicesByDeviceId.get(legacyMetricEntity.deviceId).registryMetadata &&
      isSystemMetric(legacyMetricEntity),
  )) {
    const identityKey = legacyEntity.platform + ":" + legacyEntity.deviceId;
    profilesByIdentity.has(identityKey) ||
      profilesByIdentity.set(identityKey, {
        device: devicesByDeviceId.get(legacyEntity.deviceId),
        platform: legacyEntity.platform,
        identities: new Set(),
        metrics: [] as any[],
      });
    const identityProfile = profilesByIdentity.get(identityKey),
      hostIdentity = legacyEntity.host || legacyEntity.prefix;
    hostIdentity && identityProfile.identities.add(hostIdentity);
  }
  const profiles = [...profilesByIdentity.values()];
  for (const entityProfile of metricEntities.filter(isUsableEntity)) {
    let targetProfile = profilesByEntityKey.get(
      entityProfile.platform + ":" + entityProfile.deviceId,
    );
    if (devicesByDeviceId.get(entityProfile.deviceId).registryMetadata) {
      targetProfile && targetProfile.metrics.push(entityProfile);
      continue;
    }
    if (
      !(entityProfile.platform === "ugreen"
        ? entityProfile.key
        : Object.hasOwn(METRIC_DEFINITIONS, entityProfile.key))
    )
      continue;
    const platformProfiles = profiles.filter(
      (profile) => !profile.registry && profile.platform === entityProfile.platform,
    );
    if (
      ((targetProfile = platformProfiles.find(
        (matchedProfile) => matchedProfile.device.deviceId === entityProfile.deviceId,
      )),
      !targetProfile)
    ) {
      const identityMatches = platformProfiles.filter((candidateProfile) =>
        [...candidateProfile.identities].some((hostValue) =>
          entityProfile.host
            ? entityProfile.host === hostValue
            : entityProfile.prefix &&
              (entityProfile.prefix === hostValue ||
                entityProfile.prefix.startsWith(hostValue + "_")),
        ),
      );
      if (identityMatches.length === 1) targetProfile = identityMatches[0];
      else {
        if (!identityMatches.length) {
          const deviceName = devicesByDeviceId.get(entityProfile.deviceId)?.name,
            deviceNameMatches = platformProfiles.filter(
              (parentProfile) =>
                !(parentProfile.identities.size && (entityProfile.host || entityProfile.prefix)) &&
                parentProfile.device.name &&
                deviceName?.startsWith(parentProfile.device.name + " ("),
            );
          deviceNameMatches.length === 1 && (targetProfile = deviceNameMatches[0]);
        }
      }
    }
    targetProfile && targetProfile.metrics.push(entityProfile);
  }
  const metricKeyOrder = {
      ugreen: Object.keys(UGREEN_SYSTEM_METRICS),
      existing: Object.keys(METRIC_DEFINITIONS),
    },
    metricRank = (rankedMetric: any) => {
      const orderedKeys =
        rankedMetric.platform === "ugreen"
          ? metricKeyOrder.ugreen
          : metricKeyOrder.existing;
      return orderedKeys.includes(rankedMetric.key)
        ? orderedKeys.indexOf(rankedMetric.key)
        : orderedKeys.length;
    };
  return profiles
    .filter((keptProfile) => keptProfile.registry || keptProfile.metrics.length)
    .map((profileEntry) => {
      profileEntry.metrics.sort(
        (metricA: any, metricB: any) =>
          metricRank(metricA) - metricRank(metricB) ||
          metricA.entityId.localeCompare(metricB.entityId),
      );
      const selectedMetrics = profileEntry.metrics.slice(),
        primaryMetric = selectedMetrics.find(isSystemMetric) || selectedMetrics[0];
      return {
        deviceId: profileEntry.device.deviceId,
        name: profileEntry.device.name || primaryMetric?.name || "NAS",
        platform: profileEntry.platform,
        primaryEntityId: primaryMetric?.entityId || "",
        metrics: selectedMetrics.map((metricEntity: any) => {
          const definition = metricDefinition(metricEntity),
            metricDevice = devicesByDeviceId.get(metricEntity.deviceId),
            deviceLabel =
              metricEntity.deviceId === profileEntry.device.deviceId
                ? ""
                : metricDevice?.name?.match(/\(([^)]+)\)$/)?.[1] || metricDevice?.name || "";
          return {
            entityId: metricEntity.entityId,
            label: "" + (deviceLabel ? deviceLabel + " · " : "") + definition[0],
            group: definition[1],
            kind: definition[2] || "number",
          };
        }),
      };
    })
    .sort((leftProfile, rightProfile) => leftProfile.name.localeCompare(rightProfile.name));
}
function reconcileNasSource(existingSource: any, updatedSource: any) {
  if (!existingSource || !updatedSource || existingSource.deviceId !== updatedSource.deviceId)
    return false;
  const metricIndexByEntityId = new Map<string, { metric: any; index: number }>(
      (existingSource.metrics || []).map(
        (sourceMetric: any, metricIndex: any): [string, { metric: any; index: number }] => [
          sourceMetric.entityId,
          {
            metric: sourceMetric,
            index: metricIndex,
          },
        ],
      ),
    ),
    sortedMetrics = [...(updatedSource.metrics || [])].sort(
      (leftMetric, rightMetric) =>
        (metricIndexByEntityId.get(leftMetric.entityId)?.index ?? Infinity) -
          (metricIndexByEntityId.get(rightMetric.entityId)?.index ?? Infinity) ||
        leftMetric.entityId.localeCompare(rightMetric.entityId),
    ),
    visibleMetricIdSet = new Set(
      existingSource.visibleMetrics ||
        (existingSource.metrics || []).map((sourceMetricEntry: any) => sourceMetricEntry.entityId),
    ),
    visibleMetricIds = sortedMetrics
      .filter((retainedMetric) => visibleMetricIdSet.has(retainedMetric.entityId))
      .map((visibleMetric) => visibleMetric.entityId);
  return existingSource.name !== updatedSource.name ||
    existingSource.platform !== updatedSource.platform ||
    existingSource.primaryEntityId !== (updatedSource.primaryEntityId || "") ||
    JSON.stringify(existingSource.metrics || []) !== JSON.stringify(sortedMetrics) ||
    JSON.stringify(existingSource.visibleMetrics || []) !== JSON.stringify(visibleMetricIds)
    ? ((existingSource.name = updatedSource.name),
      (existingSource.platform = updatedSource.platform),
      (existingSource.primaryEntityId = updatedSource.primaryEntityId || ""),
      (existingSource.metrics = sortedMetrics),
      (existingSource.visibleMetrics = visibleMetricIds),
      true)
    : false;
}
export function reconcileNasDocument(appDocument: any, sourcesByDeviceId: any) {
  let hasDocumentChanged = false;
  const visitComponents = (components: any) => {
    for (const component of components || []) {
      if (component.type === "interaction3d") {
        for (const nasDevice of component.properties?.devices?.nas || [])
          reconcileNasSource(
            nasDevice.statusSource,
            sourcesByDeviceId.get(nasDevice.statusSource?.deviceId),
          ) && (hasDocumentChanged = true);
      }
      visitComponents(component.children);
    }
  };
  visitComponents(appDocument?.sharedComponents);
  for (const page of appDocument?.pages || []) visitComponents(page.components);
  return hasDocumentChanged;
}
