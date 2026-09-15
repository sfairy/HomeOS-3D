/**
 * NAS 设备目录（Profiles）。
 *
 * 位置：舞台页的「设备」页签需要把 HA 里散落的 NAS 相关实体（系统 / 存储 / 健康 / 网络）
 *   归并成「一台 NAS = 一个 profile」，本模块负责这套归并规则；数据来自 /api/ha 的
 *   实体表与设备注册表，本文件不发请求。
 * 对外导出：nasProfiles。
 * 全局约定：
 *   - 只认 fnos 与 synology_dsm 两个集成（见 normalizeNasPlatform），其它平台即使有同名实体也不进面板；
 *   - 指标白名单 METRIC_DEFINITIONS 同时决定「展示哪些指标」「中文标签」「分组」与排序，
 *     顺序即面板上的展示顺序；新增指标必须同时补进这张表；
 *   - 群晖（synology_dsm）的 uniqueId 里编码了主机名与指标名，解析规则见 resolveMetricIdentity，
 *     它同时也是「同一台机器的多条实体链」的归并依据。
 * 副作用：无，纯函数。
 */

// 指标白名单：键为 HA 的指标名，值为 [中文标签, 分组, 值类型]。
// 值类型缺省为 number；status 表示布尔状态，problem 表示「为真即告警」需要高亮。
// 这张表既是白名单又是排序表，因此未登记的指标不会出现在面板上（见 metricDefinition 的兜底分支）。
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
  disk_below_remain_life_thr: ["寿命告警", "health", "problem"]
};
// 禁用与丢失的实体不参与聚合：它们的数据已不可信。
const isUsableEntity = entity =>
  !entity.disabledBy && !["disabled", "missing"].includes(entity.status);
// 平台白名单：只有这两个集成提供的实体才可能是 NAS 指标。
const normalizeNasPlatform = platform =>
  ["fnos", "synology_dsm"].includes(platform) ? platform : null;
// 按键名降序排列：匹配 uniqueId 后缀时必须先试长键，
// 否则 cpu_5min_load 会被更短的 cpu_load 之类提前命中，解析出错误的主机名。
const METRIC_KEYS_BY_LENGTH = Object.keys(METRIC_DEFINITIONS).sort(
  (keyA, keyB) => keyB.length - keyA.length
);
/**
 * 从实体的 uniqueId 中解析出「指标键」与「主机标识」。
 *
 * 群晖的 uniqueId 形如 `<主机名>_<实例>:<指标>`，主机名是同一台机器多条实体链的合并依据；
 * 其它平台没有固定格式，退化为「后缀匹配指标名，剩下的前缀即主机标识」。
 *
 * @param {object} sourceEntity 实体记录，至少含 uniqueId；群晖还会给 platform 与 translationKey。
 * @returns {{key: (string|undefined), host?: (string|null), prefix?: (string|null)}}
 *   指标白名单里的键（匹配不上时为 undefined），以及主机标识。
 */
function resolveMetricIdentity(sourceEntity) {
  const uniqueId = sourceEntity.uniqueId || "";
  // 群晖分支：uniqueId 的分隔格式是固定的，正则的组 1 是主机名，组 2 是指标名。
  if (sourceEntity.platform === "synology_dsm") {
    const hostMatch = uniqueId.match(/^(.+)_[^:]+:([^:]+)$/);
    // 指标名允许再接一段子指标后缀（startsWith(key + "_")），因此仍按最长键优先匹配。
    const synologyMetricKey =
      hostMatch &&
      METRIC_KEYS_BY_LENGTH.find(
        longestKey => hostMatch[2] === longestKey || hostMatch[2].startsWith(longestKey + "_")
      );
    // 匹配不上指标名时 host 为 null：这条实体不属于任何已知 NAS 指标，调用方会据此过滤。
    return {
      key: sourceEntity.translationKey || synologyMetricKey,
      host: synologyMetricKey ? hostMatch[1] : null
    };
  }
  // 非群晖平台：指标名是 uniqueId 的后缀，去掉「_指标名」后剩下的就是主机前缀。
  const metricKey = METRIC_KEYS_BY_LENGTH.find(candidateKey =>
    uniqueId.endsWith("_" + candidateKey)
  );
  return {
    key: sourceEntity.translationKey || metricKey,
    prefix: metricKey ? uniqueId.slice(0, -metricKey.length - 1) : null
  };
}
// 白名单里查不到的指标一律用实体自身名称兜底（分组按 system，类型按域名区分），
// 这样后续即使 HA 集成新增指标，面板也不至于整条丢数据。
const metricDefinition = metric =>
  METRIC_DEFINITIONS[metric.key] || [
    metric.name || metric.originalName || metric.entityId,
    "system",
    metric.entityId.startsWith("binary_sensor.") ? "status" : "number"
  ];
// 「系统指标」用于为每台 NAS 挑一个代表实体（见 nasProfiles 结尾）：
// 白名单里的 system 分组、状态指标，以及群晖的 network（DSM 把网速归入系统概览）。
const isSystemMetric = checkedMetric =>
  Object.hasOwn(METRIC_DEFINITIONS, checkedMetric.key) &&
  (METRIC_DEFINITIONS[checkedMetric.key][1] === "system" ||
    checkedMetric.key === "status" ||
    (checkedMetric.platform === "synology_dsm" &&
      METRIC_DEFINITIONS[checkedMetric.key][1] === "network"));
/**
 * 把 HA 实体与设备注册表聚合成 NAS profile 列表。
 *
 * 三个阶段的顺序不能颠倒：
 *   1) 从设备注册表建 profile，并沿 viaDeviceId 链路向上合并（同一台 NAS 常被拆成多台子设备）；
 *   2) 把指标实体解析出主机标识；
 *   3) 把指标归属到 profile（先按设备 ID，再按主机标识，最后按设备名前缀兜底）。
 *
 * @param {Array<object>} [entities] 实体列表。
 * @param {Array<object>} [devices] 设备注册表。
 * @returns {Array<object>} 每个 profile 含 deviceId、name、platform、primaryEntityId 与 metrics
 *   （每项为 {entityId, label, group, kind}），按名称排序。
 */
export function nasProfiles(entities = [], devices = []) {
  // 设备注册表按 deviceId 建索引：后面所有归属判断都以它为准。
  const devicesByDeviceId = new Map(
    devices.filter(isUsableEntity).map(device => [device.deviceId, device])
  );
  // 记录「这台设备暴露了哪些 NAS 平台」：平台数恰好为 1 的设备才是干净的 NAS，
  // 多平台的通常是容器 / 网关设备，归并结果不可靠。
  const platformsByDeviceId = new Map(
    [...devicesByDeviceId.values()].map(deviceEntry => [
      deviceEntry.deviceId,
      new Set((deviceEntry.registryMetadata?.integrations || []).filter(normalizeNasPlatform))
    ])
  );
  // 实体表里也带 platform（注册表偶尔缺失），因此再补一轮。
  // missing 实体的平台信息不可信；设备未登记时静默跳过。
  for (const entityRecord of entities) {
    if (entityRecord.status !== "missing" && normalizeNasPlatform(entityRecord.platform)) {
      platformsByDeviceId.get(entityRecord.deviceId)?.add(entityRecord.platform);
    }
  }
  // 统一取值：未登记的设备返回空数组。
  const platformsOfDevice = sourceDevice => [
    ...(platformsByDeviceId.get(sourceDevice.deviceId) || [])
  ];
  // 两张索引配合使用：identity（平台 + 真实设备 ID）用于建档，
  // entityKey（平台 + 链上任意设备 ID）用于归属 —— 实体表里出现的是子设备 ID，
  // 而 profile 建在链路顶端的宿主设备上，只有它能同时命中两侧。
  const profilesByIdentity = new Map();
  const profilesByEntityKey = new Map();
  // 第一遍：来自注册表的设备建档。service 类型只是集成入口（例如 DSM 的服务实体），本身不是设备。
  for (const chainDevice of devicesByDeviceId.values()) {
    if (!chainDevice.registryMetadata || chainDevice.registryMetadata.entryType === "service") {
      continue;
    }
    // 平台数必须恰好为 1：多平台设备在建档阶段就被排除。
    const platforms = platformsOfDevice(chainDevice);
    if (platforms.length !== 1) {
      continue;
    }
    const devicePlatform = platforms[0];
    // viaDeviceId 串成设备链时，profile 要建在链路顶端的宿主设备上；
    // visited 用于防御环形引用（数据异常时不至于死循环）。
    const visitedDeviceIds = new Set();
    let currentDevice = chainDevice;
    let isChainValid = true;
    while (currentDevice.registryMetadata?.viaDeviceId) {
      if (visitedDeviceIds.has(currentDevice.deviceId)) {
        isChainValid = false;
        break;
      }
      visitedDeviceIds.add(currentDevice.deviceId);
      const parentDevice = devicesByDeviceId.get(currentDevice.registryMetadata.viaDeviceId);
      const configEntryIds = currentDevice.registryMetadata.configEntryIds || [];
      const parentConfigEntryIds = parentDevice?.registryMetadata?.configEntryIds || [];
      // 父设备必须存在、不是 service、平台与当前设备一致，
      // 且（双方都声明了 configEntryIds 时）至少有一个配置入口重合 ——
      // 否则只能认为它们「挂在同一台 HA 主机下」，不能合成一台 NAS。
      if (
        !parentDevice?.registryMetadata ||
        parentDevice.registryMetadata.entryType === "service" ||
        platformsOfDevice(parentDevice).length !== 1 ||
        platformsOfDevice(parentDevice)[0] !== devicePlatform ||
        (configEntryIds.length &&
          parentConfigEntryIds.length &&
          !configEntryIds.some(configEntryId => parentConfigEntryIds.includes(configEntryId)))
      ) {
        isChainValid = false;
        break;
      }
      currentDevice = parentDevice;
    }
    if (!isChainValid) {
      continue;
    }
    // profileKey 用链路顶端（宿主）的设备 ID：同一台 NAS 的多个子设备因此落进同一个 profile。
    const profileKey = devicePlatform + ":" + currentDevice.deviceId;
    if (!profilesByIdentity.has(profileKey)) {
      // registry: true 标记「来自注册表」，与后面靠系统指标兜底建出来的 profile 区分开。
      profilesByIdentity.set(profileKey, {
        device: currentDevice,
        platform: devicePlatform,
        identities: new Set(),
        metrics: [],
        registry: true
      });
    }
    // 链上每个设备 ID 都登记指向同一个 profile：实体表用的是子设备 ID，也能找到宿主。
    profilesByEntityKey.set(
      devicePlatform + ":" + chainDevice.deviceId,
      profilesByIdentity.get(profileKey)
    );
  }
  // 第二遍：挑出候选指标实体。规则自上而下是 —— 只认 sensor / binary_sensor 域、
  // 平台在 NAS 白名单内、设备已登记、状态不是 missing；
  // 随后解析出主机标识，最后再用一条过滤剔除「problem 类却落在 sensor 域」的误匹配。
  const metricEntities = entities
    .filter(
      candidateEntity =>
        /^(sensor|binary_sensor)\./.test(candidateEntity.entityId) &&
        normalizeNasPlatform(candidateEntity.platform) &&
        devicesByDeviceId.has(candidateEntity.deviceId) &&
        candidateEntity.status !== "missing"
    )
    .map(mappedEntity => ({
      ...mappedEntity,
      ...resolveMetricIdentity(mappedEntity)
    }))
    .filter(
      metricCandidate =>
        metricDefinition(metricCandidate)[2] !== "problem" ||
        metricCandidate.entityId.startsWith("binary_sensor.")
    );
  // 没有注册表信息的设备（旧版集成）按「平台 + 设备 ID」建兜底 profile，
  // 并记下主机标识，供后面把同主机的指标归到一起。
  for (const legacyEntity of metricEntities.filter(
    legacyMetricEntity =>
      !devicesByDeviceId.get(legacyMetricEntity.deviceId).registryMetadata &&
      isSystemMetric(legacyMetricEntity)
  )) {
    const identityKey = legacyEntity.platform + ":" + legacyEntity.deviceId;
    if (!profilesByIdentity.has(identityKey)) {
      profilesByIdentity.set(identityKey, {
        device: devicesByDeviceId.get(legacyEntity.deviceId),
        platform: legacyEntity.platform,
        identities: new Set(),
        metrics: []
      });
    }
    const identityProfile = profilesByIdentity.get(identityKey);
    // host / prefix 是解析阶段的两个产物，统一当作「主机标识」使用。
    const hostIdentity = legacyEntity.host || legacyEntity.prefix;
    if (hostIdentity) {
      identityProfile.identities.add(hostIdentity);
    }
  }
  // 到这里 profile 集合已经固定，下面进入归属阶段。
  const profiles = [...profilesByIdentity.values()];
  // 第三遍：把每个指标实体挂到唯一的 profile 上。
  for (const entityProfile of metricEntities.filter(isUsableEntity)) {
    let targetProfile = profilesByEntityKey.get(
      entityProfile.platform + ":" + entityProfile.deviceId
    );
    // 有注册表的设备必须命中 entityKey 索引才算归属成功，不参与后面的模糊匹配 ——
    // 后者可能把同一主机上另一台 NAS 的指标混进来。
    if (devicesByDeviceId.get(entityProfile.deviceId).registryMetadata) {
      if (targetProfile) {
        targetProfile.metrics.push(entityProfile);
      }
      continue;
    }
    // 无注册表的旧设备只能靠主机标识 / 设备名模糊匹配，未登记的指标名不冒这个风险。
    if (!Object.hasOwn(METRIC_DEFINITIONS, entityProfile.key)) {
      continue;
    }
    const platformProfiles = profiles.filter(
      profile => !profile.registry && profile.platform === entityProfile.platform
    );
    targetProfile = platformProfiles.find(
      matchedProfile => matchedProfile.device.deviceId === entityProfile.deviceId
    );
    if (!targetProfile) {
      // 主机标识唯一命中才认：命中多条说明有歧义，宁可不归属也不要张冠李戴。
      const identityMatches = platformProfiles.filter(candidateProfile =>
        [...candidateProfile.identities].some(hostValue =>
          entityProfile.host
            ? entityProfile.host === hostValue
            : entityProfile.prefix &&
              (entityProfile.prefix === hostValue ||
                entityProfile.prefix.startsWith(hostValue + "_"))
        )
      );
      if (identityMatches.length === 1) {
        targetProfile = identityMatches[0];
      } else if (!identityMatches.length) {
        const deviceName = devicesByDeviceId.get(entityProfile.deviceId)?.name;
        const deviceNameMatches = platformProfiles.filter(
          parentProfile =>
            (!parentProfile.identities.size || (!entityProfile.host && !entityProfile.prefix)) &&
            parentProfile.device.name &&
            deviceName?.startsWith(parentProfile.device.name + " (")
        );
        if (deviceNameMatches.length === 1) {
          targetProfile = deviceNameMatches[0];
        }
      }
    }
    if (targetProfile) {
      targetProfile.metrics.push(entityProfile);
    }
  }
  // 排序口径：先按白名单顺序（即 METRIC_DEFINITIONS 的书写顺序），
  // 同组同名再按 entityId 兜底，保证每次渲染顺序稳定。
  const metricKeyOrder = Object.keys(METRIC_DEFINITIONS);
  // 指标排序权重：白名单 METRIC_DEFINITIONS 内的按下标排（越小越靠前），
  // 不在白名单里的统一返回白名单长度，排到最后，不会插到白名单指标中间。
  const metricRank = rankedMetric =>
    metricKeyOrder.includes(rankedMetric.key)
      ? metricKeyOrder.indexOf(rankedMetric.key)
      : metricKeyOrder.length;
  // 收尾四件事：只保留「有指标」或「来自注册表」的 profile；指标按白名单排序并截到 48 条
  // （一次渲染的上限，再多对用户没意义）；挑一个主指标（优先系统指标）作行摘要；
  // 指标来自子设备时，把设备名括号内的部分作为前缀标出来，最后整体按 NAS 名称排序。
  return profiles
    .filter(keptProfile => keptProfile.registry || keptProfile.metrics.length)
    .map(profileEntry => {
      profileEntry.metrics.sort(
        (metricA, metricB) =>
          metricRank(metricA) - metricRank(metricB) ||
          metricA.entityId.localeCompare(metricB.entityId)
      );
      const selectedMetrics = profileEntry.metrics.slice(0, 48);
      const primaryMetric = selectedMetrics.find(isSystemMetric) || selectedMetrics[0];
      return {
        deviceId: profileEntry.device.deviceId,
        name: profileEntry.device.name || primaryMetric?.name || "NAS",
        platform: profileEntry.platform,
        primaryEntityId: primaryMetric?.entityId || "",
        metrics: selectedMetrics.map(metricEntity => {
          const definition = metricDefinition(metricEntity);
          const metricDevice = devicesByDeviceId.get(metricEntity.deviceId);
          const deviceLabel =
            metricEntity.deviceId === profileEntry.device.deviceId
              ? ""
              : metricDevice?.name?.match(/\(([^)]+)\)$/)?.[1] || metricDevice?.name || "";
          return {
            entityId: metricEntity.entityId,
            label: "" + (deviceLabel ? deviceLabel + " · " : "") + definition[0],
            group: definition[1],
            kind: definition[2] || "number"
          };
        })
      };
    })
    .sort((leftProfile, rightProfile) => leftProfile.name.localeCompare(rightProfile.name));
}
