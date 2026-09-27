/**
 * 编辑器选择器的实体检索与控件类型名称。
 */

type AnyObj = Record<string, any>;

/**
 * 创建选择器查询函数集合。
 */
export function createEditorPickerQueries({
  entityPickerConfig: entityPickerConfig,
  pickerEntitiesForComponentType: pickerEntitiesForComponentType,
  entityPickerText: entityPickerText,
  entityDomainResolver: entityDomainResolver
}: AnyObj) {
  /**
   * 过滤并排序某控件类型的可选实体。
   */
  function editorEntityMatches(componentType: any, searchText: any) {
    const pickerConfig = entityPickerConfig(componentType),
      normalizedQuery = String(searchText || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
    return pickerEntitiesForComponentType(componentType)
      .map((entity: any, entityIndex: any) => ({ entity: entity, index: entityIndex }))
      .filter(
        ({ entity: filterEntity }: AnyObj) =>
          !filterEntity.virtual &&
          (!normalizedQuery ||
            // 展示名与实体域都参与匹配，用户输入 light 也能搜到对应灯。
            `${entityPickerText(filterEntity)} ${entityDomainResolver(filterEntity)}`
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedQuery))
      )
      .sort((leftEntity: any, rightEntity: any) => {
        // 虚拟实体排在最后；其余按推荐分降序，同分保持原下标顺序。
        const recommendationRank = (rankedEntity: any) =>
          rankedEntity?.virtual ? 100 : Number(pickerConfig.recommended(rankedEntity));
        return (
          recommendationRank(rightEntity.entity) - recommendationRank(leftEntity.entity) ||
          leftEntity.index - rightEntity.index
        );
      })
      .map(({ entity: sortedEntity }: AnyObj) => sortedEntity);
  }

  /**
   * 取控件类型的中文显示名。
   */
  function editorPickerComponentTypeLabel(pickerComponentType: any) {
    const labels: Record<string, string> = {
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
        "navigation-button": "导航按钮"
      };
    return labels[pickerComponentType] || "控件";
  }
  return Object.freeze({
    editorEntityMatches: editorEntityMatches,
    editorPickerComponentTypeLabel: editorPickerComponentTypeLabel
  });
}
