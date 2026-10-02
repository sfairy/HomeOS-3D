export const GENERIC_DEVICE_PROFILES = Object.freeze({
    smallcar: Object.freeze({
      collection: "cars",
      modelType: "smallcar",
      modelTypes: Object.freeze(["smallcar", "suv", "scooter"]),
      label: "汽车",
      icon: "mdi:car-electric",
      height: 1.5,
      statusIndicator: false,
    }),
    fridge: Object.freeze({
      collection: "fridges",
      modelType: "fridge",
      label: "冰箱",
      icon: "mdi:fridge-outline",
      height: 1.85,
    }),
    freezer: Object.freeze({
      collection: "freezers",
      modelType: "freezer",
      label: "冰柜",
      icon: "mdi:fridge-bottom",
      height: 0.85,
    }),
    dishwasher: Object.freeze({
      collection: "dishwashers",
      modelType: "dishwasher",
      label: "洗碗机",
      icon: "mdi:dishwasher",
      height: 0.82,
    }),
    washer: Object.freeze({
      collection: "washers",
      modelType: "washer",
      label: "洗衣机",
      icon: "mdi:washing-machine",
      height: 0.85,
    }),
    dryer: Object.freeze({
      collection: "dryers",
      modelType: "dryer",
      label: "烘干机",
      icon: "mdi:tumble-dryer",
      height: 0.85,
    }),
    plant: Object.freeze({
      collection: "plants",
      modelType: "plant",
      label: "绿植",
      icon: "mdi:flower",
      height: 1.6,
      statusIndicator: false,
    }),
  }),
  GENERIC_DEVICE_KINDS = Object.freeze(Object.keys(GENERIC_DEVICE_PROFILES)),
  GENERIC_DEVICE_COLLECTIONS = Object.freeze(
    GENERIC_DEVICE_KINDS.map((listedKind) => GENERIC_DEVICE_PROFILES[listedKind].collection),
  ),
  isGenericDeviceKind = (candidateKind) => Object.hasOwn(GENERIC_DEVICE_PROFILES, candidateKind),
  genericDeviceProfile = (requestedKind) =>
    isGenericDeviceKind(requestedKind) ? GENERIC_DEVICE_PROFILES[requestedKind] : null;
export function genericDeviceMetadata(placements = []) {
  return Object.fromEntries(
    GENERIC_DEVICE_KINDS.map((deviceKind) => {
      const deviceProfile = genericDeviceProfile(deviceKind);
      return [
        deviceProfile.collection,
        placements
          .filter((placement) =>
            (deviceProfile.modelTypes || [deviceProfile.modelType]).includes(placement.type),
          )
          .map((entry, entryIndex) => ({
            id: entry.id,
            type: entry.type,
            name: entry.name || deviceProfile.label + " " + (entryIndex + 1),
            x: entry.x,
            y: entry.y,
            height:
              (Number(entry.elevation) || 0) +
              (Number(entry.height) || deviceProfile.height) *
                (deviceKind === "smallcar" ? 1 : 0.5) +
              (deviceKind === "smallcar" ? 0.25 : 0),
          })),
      ];
    }),
  );
}
