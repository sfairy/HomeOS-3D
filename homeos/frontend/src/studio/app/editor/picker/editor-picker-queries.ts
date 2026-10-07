export function createEditorPickerQueries({
  entityPickerConfig: entityPickerConfig,
  pickerEntitiesForComponentType: pickerEntitiesForComponentType,
  entityPickerText: entityPickerText,
  entityDomain: entityDomain,
}: any) {
  function matchEntities(componentType: any, queryText: any) {
    const pickerConfig = entityPickerConfig(componentType),
      normalizedQuery = String(queryText || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
    return pickerEntitiesForComponentType(componentType)
      .map((entity: any, index: any) => ({
        entity: entity,
        index: index,
      }))
      .filter(
        ({ entity: filteredEntity }: any) =>
          !filteredEntity.virtual &&
          (!normalizedQuery ||
            `${entityPickerText(filteredEntity)} ${entityDomain(filteredEntity)}`
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedQuery)),
      )
      .sort((comparedEntity: any, comparedIndex: any) => {
        const rankOf = (option: any) =>
          option?.virtual ? 100 : Number(pickerConfig.recommended(option));
        return (
          rankOf(comparedIndex.entity) - rankOf(comparedEntity.entity) ||
          comparedEntity.index - comparedIndex.index
        );
      })
      .map(({ entity: sortedEntity }: any) => sortedEntity);
  }
  function labelForComponentType(labelType: any) {
    return (
      ({
        image: "图片",
        weather: "天气",
        "line-chart": "折线图",
        "title-button": "标题按钮",
        "light-statistics": "数量统计",
        "icon-button-effect": "图标按钮（效果）",
        "icon-button": "图标按钮",
        "device-button": "设备按钮",
        "presence-sensor": "传感器",
        "vacuum-map": "扫地机地图",
        camera: "摄像头",
        "air-conditioner": "空调",
        "navigation-button": "导航按钮",
        "scene-mode": "情景模式",
      } as any)[labelType] || "控件"
    );
  }
  return Object.freeze({
    editorEntityMatches: matchEntities,
    editorPickerComponentTypeLabel: labelForComponentType,
  });
}
