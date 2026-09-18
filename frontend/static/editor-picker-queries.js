/**
 * 编辑器选择器的实体检索与控件类型名称。
 *
 * 位置：实体选择器搜索框与「选择控件」弹层的列表数据来源。
 * 职责：按关键字过滤实体并按推荐度排序，以及把控件类型映射成中文名。
 * 约定：虚拟实体不进入普通实体搜索列表（由专用入口提供）；排序以
 *   pickerConfig.recommended 给出的推荐分为主序，同名时回退到原始下标，
 *   保证排序稳定。
 */

/**
 * 创建选择器查询函数集合。
 *
 * @param {object} handlers 依赖注入。
 * @param {function(string): object} handlers.entityPickerConfig 取控件类型的 picker 配置。
 * @param {function(string): Array<object>} handlers.pickerEntitiesForComponentType 取该控件可用的实体。
 * @param {function(object): string} handlers.entityPickerText 取实体展示名称。
 * @param {function(object): string} handlers.entityDomain 取实体域。
 * @returns {{editorEntityMatches: function(string, string): Array<object>,
 *   editorPickerComponentTypeLabel: function(string): string}} 查询函数集合（已冻结）。
 */
export function createEditorPickerQueries({
  entityPickerConfig: entityPickerConfig,
  pickerEntitiesForComponentType: pickerEntitiesForComponentType,
  entityPickerText: entityPickerText,
  entityDomain: entityDomain
}) {
  /**
   * 过滤并排序某控件类型的可选实体。
   *
   * @param {string} componentType 控件类型。
   * @param {string} searchText 搜索关键字。
   * @returns {Array<object>} 排序后的实体列表。
   */
  function editorEntityMatches(componentType, searchText) {
    const pickerConfig = entityPickerConfig(componentType),
      normalizedQuery = String(searchText || "")
        .trim()
        .toLocaleLowerCase("zh-CN");
    return pickerEntitiesForComponentType(componentType)
      // 先记录原始下标，排序时作为稳定回退依据。
      .map((entity, entityIndex) => ({ entity: entity, index: entityIndex }))
      .filter(
        ({ entity: filterEntity }) =>
          !filterEntity.virtual &&
          (!normalizedQuery ||
            // 展示名与实体域都参与匹配，用户输入 light 也能搜到对应灯。
            `${entityPickerText(filterEntity)} ${entityDomain(filterEntity)}`
              .toLocaleLowerCase("zh-CN")
              .includes(normalizedQuery))
      )
      .sort((leftEntity, rightEntity) => {
        // 虚拟实体排在最后；其余按推荐分降序，同分保持原下标顺序。
        const recommendationRank = rankedEntity =>
          rankedEntity?.virtual ? 100 : Number(pickerConfig.recommended(rankedEntity));
        return (
          recommendationRank(rightEntity.entity) - recommendationRank(leftEntity.entity) ||
          leftEntity.index - rightEntity.index
        );
      })
      .map(({ entity: sortedEntity }) => sortedEntity);
  }

  /**
   * 取控件类型的中文显示名。
   *
   * @param {string} pickerComponentType 控件类型。
   * @returns {string} 中文名；未知类型回退为「控件」。
   */
  function editorPickerComponentTypeLabel(pickerComponentType) {
    return (
      {
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
      }[pickerComponentType] || "控件"
    );
  }
  return Object.freeze({
    editorEntityMatches: editorEntityMatches,
    editorPickerComponentTypeLabel: editorPickerComponentTypeLabel
  });
}
