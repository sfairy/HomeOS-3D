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
        image: "\u56FE\u7247",
        weather: "\u5929\u6C14",
        "line-chart": "\u6298\u7EBF\u56FE",
        "title-button": "\u6807\u9898\u6309\u94AE",
        "light-statistics": "\u6570\u91CF\u7EDF\u8BA1",
        "icon-button-effect": "\u56FE\u6807\u6309\u94AE\uFF08\u6548\u679C\uFF09",
        "icon-button": "\u56FE\u6807\u6309\u94AE",
        "device-button": "\u8BBE\u5907\u6309\u94AE",
        "presence-sensor": "\u4F20\u611F\u5668",
        "vacuum-map": "\u626B\u5730\u673A\u5730\u56FE",
        camera: "\u6444\u50CF\u5934",
        "air-conditioner": "\u7A7A\u8C03",
        "navigation-button": "\u5BFC\u822A\u6309\u94AE"
      }[pickerComponentType] || "\u63A7\u4EF6"
    );
  }
  return Object.freeze({
    editorEntityMatches: editorEntityMatches,
    editorPickerComponentTypeLabel: editorPickerComponentTypeLabel
  });
}
