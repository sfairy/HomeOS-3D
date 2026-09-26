/*
 * 实体选项与列表。
 *
 * 可挑选实体的收集与展示（名称、副标题、类型标签）、列表的无限滚动与溢出预览，以及各类选项列表（实体 / 图标 / 灯具统计）的渲染与定位。
 *
 * 由 static/editor/home.js 外提而来：这里只放函数，对 home.js 模块级状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 home.js 里的 getter/setter，读到的始终是调用时刻的值。
 */

import {
  ACTION_TYPES,
  TOGGLE_ENTITY_DOMAINS,
  actionNeedsCurrentEntity,
  actionPopupData,
  componentActionIsSupported,
  entityIdSupportsToggle
} from "../../shared/action-rules.js?v=2609262312";
import { createIconVisibilityVirtualEntity } from "../../shared/virtual-entities.js?v=2609262312";
import { entityDomainOf, entitySearchTextOf } from "../../utils/entities.js?v=2609262312";
import { findComponent } from "../component-tree.js?v=2609262312";
import {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport
} from "../../renderer/core/registry.js?v=2609262312";
import {
  normalizedPopupClimateDeviceType,
  popupModuleEntityRecommended
} from "../editor-document-management.js?v=2609262312";
import { positionFloatingMenu } from "../../shared/menu-positioning.js?v=2609262312";
import { resolveStateEntry, stateTextOf } from "../../utils/state-entry.js?v=2609262312";

export function createEntityOptions(ctx) {

  // 取实体域统一走 utils/entities.js 的 entityDomainOf：带点号或非字符串的 domain 下，
  // 它与本文件原先那份的切分结果不同，而两边消费方都是拿去查标签表或与裸域名比较，所以只留这一个口径。
  /** 取实体在界面上展示的种类标签（如「灯光」「辅助元素」「虚拟实体」）。 */
  function entityKindLabel(entityForLabel) {
    const entityDomainName = entityDomainOf(entityForLabel);
    if (entityForLabel?.virtual) {
      return "虚拟实体";
    } else if (ctx.HELPER_ENTITY_DOMAINS.has(entityDomainName)) {
      return "辅助元素";
    } else {
      return ctx.ENTITY_DOMAIN_LABELS[entityDomainName] || entityDomainName || "实体";
    }
  }

  /**
   * 把连续空白压成单个空格并去掉首尾空白，用于拼接实体名。
   */
  function collapseWhitespace(textValue) {
    return String(textValue || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 取实体所属设备的中文名。
   */
  function deviceNameForEntity(deviceEntity) {
    return collapseWhitespace(ctx.deviceNamesByDeviceId.get(String(deviceEntity?.deviceId || "")));
  }

  /**
   * 取实体名相对于设备名的「副标题」部分。HA 的实体名常被拼成「设备名 实体名」，直接用会重复；
   * 这里按空格与间隔号「·」两种分隔尝试剥掉设备名前缀，剥不出结果时回落到 originalName，再不行返回空串。
   */
  function entityDisplaySubtitle(namedEntity, entityDeviceName = deviceNameForEntity(namedEntity)) {
    const entityName = collapseWhitespace(namedEntity?.name);
    const entityOriginalName = collapseWhitespace(namedEntity?.originalName);
    if (!entityDeviceName) {
      return entityName || entityOriginalName || namedEntity?.entityId || "";
    }
    const entitySubtitle =
      entityName === entityDeviceName
        ? ""
        : entityName.startsWith(entityDeviceName + " ")
          ? entityName.slice(entityDeviceName.length).trim()
          : entityName.startsWith(entityDeviceName + "·")
            ? entityName.slice(entityDeviceName.length + 1).trim()
            : entityName;
    if (entitySubtitle && entitySubtitle !== entityDeviceName) {
      return entitySubtitle;
    } else if (entityOriginalName && entityOriginalName !== entityDeviceName) {
      return entityOriginalName;
    } else {
      return "";
    }
  }

  /**
   * 取实体在界面上的完整展示名：设备名 + 副标题。
   *
   * 虚拟实体是渲染器自造的，没有设备归属，直接用自身的 name。
   */
  function entityDisplayName(entityForDisplay, displayNameOverride = "") {
    if (entityForDisplay?.virtual) {
      return entityForDisplay.name || entityForDisplay.entityId || "";
    }
    const displayDeviceName = deviceNameForEntity(entityForDisplay);
    const displaySubtitle =
      collapseWhitespace(displayNameOverride) ||
      entityDisplaySubtitle(entityForDisplay, displayDeviceName);
    if (displayDeviceName) {
      if (displaySubtitle && displaySubtitle !== displayDeviceName) {
        return displayDeviceName + " · " + displaySubtitle;
      } else {
        return displayDeviceName;
      }
    } else {
      return displaySubtitle || entityForDisplay?.entityId || "";
    }
  }

  /**
   * 取实体选择项的单行标签，形如「[灯光] 客厅灯 · light.living_room」。
   *
   * 展示名与实体 ID 相同时不重复追加 ID。
   */
  function entityOptionLabel(entityForOption) {
    const optionDisplayName = entityDisplayName(entityForOption);
    const optionEntityId = entityForOption?.entityId || "";
    return (
      "[" +
      entityKindLabel(entityForOption) +
      "] " +
      optionDisplayName +
      (optionDisplayName && optionDisplayName !== optionEntityId ? " · " + optionEntityId : "")
    );
  }

  /**
   * 取控件绑定（properties.entityIds）里的实体 ID 去重列表。
   */
  function componentEntityIds(componentForEntityIds = ctx.selectedComponent()) {
    return [
      ...new Set(
        (Array.isArray(componentForEntityIds?.properties?.entityIds)
          ? componentForEntityIds.properties.entityIds
          : []
        )
          .map(entityIdValue => String(entityIdValue || "").trim())
          .filter(Boolean)
      )
    ];
  }

  /**
   * 汇总灯光统计控件里某个实体的可用性与状态文案。状态取自渲染器的实际运行态（editorRenderer.states），
   * 而不是实体目录 —— 目录只说明实体存在，不能说明此刻是否可用。「无法判断:<原状态>」刻意把原始状态码
   * 带出来，方便用户到 HA 侧排查。
   */
  function lightStatisticsEntityStatus(statisticsTargetEntityId, statisticsEntity = null) {
    if (!statisticsEntity) {
      return {
        label: "实体已删除",
        tone: "missing"
      };
    }
    const statisticsStateEntry = ctx.editorRenderer?.states?.get?.(statisticsTargetEntityId);
    const statisticsEntityState = resolveStateEntry(statisticsStateEntry);
    const statisticsStateText = stateTextOf(statisticsEntityState);
    const statisticsStatus = lightStatisticsEntityStateStatus(
      statisticsEntity,
      statisticsEntityState
    );
    if (statisticsStatus === "on") {
      return {
        label: "已开启/运行",
        tone: "on"
      };
    } else if (statisticsStatus === "off") {
      return {
        label: "已关闭",
        tone: "off"
      };
    } else if (statisticsStateText === "unavailable") {
      return {
        label: "暂时不可用",
        tone: "abnormal"
      };
    } else if (statisticsStateText === "unknown") {
      return {
        label: "状态未知",
        tone: "abnormal"
      };
    } else if (statisticsStateText) {
      return {
        label: "无法判断：" + statisticsStateText,
        tone: "abnormal"
      };
    } else {
      return {
        label: "等待状态",
        tone: "abnormal"
      };
    }
  }

  /**
   * 设置灯光统计面板的提示文案（并切换错误样式）。文案为空时整条提示隐藏（用 !text 判断，顺带兜住
   * null/undefined）；错误态用 class 表达，样式交给 CSS，避免在这里写内联样式。
   */
  function setLightStatisticsMessage(statisticsMessageText = "", isStatisticsMessageError = false) {
    ctx.lightStatisticsEntityMessageElement.textContent = statisticsMessageText;
    ctx.lightStatisticsEntityMessageElement.hidden = !statisticsMessageText;
    ctx.lightStatisticsEntityMessageElement.classList.toggle("error", !!isStatisticsMessageError);
  }

  /**
   * 深度优先展开组件树，得到含所有层级子控件的扁平数组。结果数组由递归通过默认参数一路传递并原地追加，
   * 父组件先于其子组件入列；调用方拿到的是新构造的数组（默认参数），内部递归共享同一个引用。
   */
  function flattenComponents(flattenSourceComponents, flattenedResult = []) {
    for (const flattenedComponent of flattenSourceComponents || []) {
      flattenedResult.push(flattenedComponent);
      flattenComponents(flattenedComponent.children, flattenedResult);
    }
    return flattenedResult;
  }

  /**
   * 取某页实际渲染的全部组件：页面自有组件 + 该页引用的共享组件。共享组件实体存在 document.sharedComponents
   * 里，页面只持有 sharedComponentIds，所以这里要做一次 ID → 组件的解引用（失效引用直接过滤），
   * 再展开分组内部的子控件。
   */
  function componentsInPage(pageForComponents = ctx.currentPage()) {
    if (!pageForComponents || !ctx.activeProject?.document) {
      return [];
    }
    const sharedComponentsById = new Map(
      (ctx.activeProject.document.sharedComponents || []).map(sharedComponentEntry => [
        sharedComponentEntry.id,
        sharedComponentEntry
      ])
    );
    /**
     * 该页引用的共享组件实体列表（保持 sharedComponentIds 的顺序）；引用失效的会被剔除。
     */
    const pageSharedComponents = (pageForComponents.sharedComponentIds || [])
      .map(sharedComponentId => sharedComponentsById.get(sharedComponentId))
      .filter(Boolean);
    return flattenComponents([...(pageForComponents.components || []), ...pageSharedComponents]);
  }

  /**
   * 列出某类选择器可选的实体（真实实体 + 虚拟实体）。
   */
  function selectableEntities(entityQueryType = "image") {
    return [...ctx.entities, ...iconVisibilityVirtualEntities()];
  }

  /**
   * 返回当前页面适用的「图标可见性」虚拟实体（没有则空数组）。虚拟实体不是真实 HA 实体，而是
   * 「按图标效果控件的可见性来驱动某个图标显隐」的伪绑定，只有页面里存在 icon-button-effect 组件时才有意义，
   * 所以这里先扫描页面判断；只用第一个，因为一张页面通常只有一组图标效果。
   */
  function iconVisibilityVirtualEntities(pageForVirtualEntities = ctx.currentPage()) {
    if (
      componentsInPage(pageForVirtualEntities).some(
        effectComponent => effectComponent.type === "icon-button-effect"
      )
    ) {
      return [createIconVisibilityVirtualEntity(pageForVirtualEntities?.path)];
    } else {
      return [];
    }
  }

  /**
   * 登记一行「内容溢出时可悬停横向滚动」的预览目标。状态存在 WeakMap（previewTargetsByRow）里而不是 DOM
   * 属性上：行节点是复用的，WeakMap 能在节点被丢弃时自动释放，也避免把 DOM 元素序列化进 dataset；
   * data-overflow-scroll-preview* 标记只是给选择器与调试用的镜像。
   */
  function registerOverflowPreviewRow(previewRowElement, previewTargetList) {
    /**
     * 规范化后的待滚动元素数组；单个元素与数组都接受，空值在这里剔除。
     */
    const previewTargets = (
      Array.isArray(previewTargetList) ? previewTargetList : [previewTargetList]
    ).filter(Boolean);
    for (const previewTarget of previewTargets) {
      previewTarget.dataset.overflowScrollPreview = "true";
    }
    if (previewRowElement && previewTargets.length) {
      previewRowElement.dataset.overflowScrollPreviewRow = "true";
      previewTargetsByRow.set(previewRowElement, previewTargets);
    }
  }

  /**
   * 取（必要时创建）选择器按钮内承载文案的 .inspector-picker-value 元素。
   *
   * 首次接管时把按钮原有的纯文本搬进新元素，兼容旧标记结构下按钮直接放文本的写法。
   */
  function ensurePickerValueElement(pickerValueHostElement) {
    if (!pickerValueHostElement) {
      return null;
    }
    let pickerValueElement = pickerValueHostElement.querySelector(".inspector-picker-value");
    if (!pickerValueElement) {
      pickerValueElement = document.createElement("span");
      pickerValueElement.className = "inspector-picker-value";
      pickerValueElement.textContent = pickerValueHostElement.textContent.trim();
      pickerValueHostElement.replaceChildren(pickerValueElement);
    }
    registerOverflowPreviewRow(pickerValueHostElement, pickerValueElement);
    return pickerValueElement;
  }

  /**
   * 更新选择器按钮的显示文案与 title。
   */
  function setPickerButtonLabel(pickerButtonElement, pickerButtonLabel, pickerButtonTitle = "") {
    const pickerValueTarget = ensurePickerValueElement(pickerButtonElement);
    if (pickerValueTarget) {
      pickerValueTarget.textContent = pickerButtonLabel;
      pickerValueTarget.title = pickerButtonTitle || pickerButtonLabel;
      pickerButtonElement.title = pickerButtonTitle || pickerButtonLabel;
    }
  }

  /**
   * 取某种组件的实体选择器配置（触发按钮、下拉菜单、搜索框、选项容器），含 except（菜单互斥分组名）与
   * recommended（推荐判定，如灯光效果推荐 light 域）。用 if/else 链而非查表对象，因为每项直接引用模块级 DOM 常量，
   * 查表会在模块初始化时就把所有常量求值一遍；未知类型回落到图片选择器配置。
   */
  function entityPickerConfig(entityPickerComponentType = "image") {
    if (entityPickerComponentType === "light-statistics") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.lightStatisticsActionEntityButtonElement,
        menu: ctx.lightStatisticsActionEntityMenuElement,
        search: ctx.lightStatisticsActionEntitySearchInputElement,
        options: ctx.lightStatisticsActionEntityOptionsElement,
        except: "light-statistics-action-entity",
        relatedSettings: false,
        recommended: lightStatisticsEntity =>
          TOGGLE_ENTITY_DOMAINS.has(entityDomainOf(lightStatisticsEntity)) ? 2 : 0
      };
    } else if (entityPickerComponentType === "navigation-button") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.navigationEntityButtonElement,
        menu: ctx.navigationEntityMenuElement,
        search: ctx.navigationEntitySearchInputElement,
        options: ctx.navigationEntityOptionsElement,
        except: "navigation-entity",
        recommended: navigationEntity =>
          navigationEntity?.virtual
            ? 3
            : TOGGLE_ENTITY_DOMAINS.has(entityDomainOf(navigationEntity))
              ? 2
              : 0
      };
    } else if (entityPickerComponentType === "title-button") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.titleButtonEntityButtonElement,
        menu: ctx.titleButtonEntityMenuElement,
        search: ctx.titleButtonEntitySearchInputElement,
        options: ctx.titleButtonEntityOptionsElement,
        except: "title-button-entity",
        recommended: titleButtonEntity =>
          titleButtonEntity?.virtual
            ? 3
            : TOGGLE_ENTITY_DOMAINS.has(entityDomainOf(titleButtonEntity))
              ? 2
              : 0
      };
    } else if (entityPickerComponentType === "vacuum-map") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.vacuumMapEntityButtonElement,
        menu: ctx.vacuumMapEntityMenuElement,
        search: ctx.vacuumMapEntitySearchInputElement,
        options: ctx.vacuumMapEntityOptionsElement,
        except: "vacuum-map-entity",
        recommended: vacuumMapEntity =>
          ["camera", "image"].includes(entityDomainOf(vacuumMapEntity))
            ? /(?:^|[_.\s-])map(?:$|[_.\s-])|地图/i.test(
                (vacuumMapEntity.entityId || "") + " " + (vacuumMapEntity.name || "")
              )
              ? 2
              : 1
            : 0
      };
    } else if (entityPickerComponentType === "camera") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.cameraEntityButtonElement,
        menu: ctx.cameraEntityMenuElement,
        search: ctx.cameraEntitySearchInputElement,
        options: ctx.cameraEntityOptionsElement,
        except: "camera-entity",
        recommended: cameraEntity => entityDomainOf(cameraEntity) === "camera"
      };
    } else if (entityPickerComponentType === "air-conditioner") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.airConditionerEntityButtonElement,
        menu: ctx.airConditionerEntityMenuElement,
        search: ctx.airConditionerEntitySearchInputElement,
        options: ctx.airConditionerEntityOptionsElement,
        except: "air-conditioner-entity",
        recommended: airConditionerEntity =>
          entityDomainOf(airConditionerEntity) === "climate"
            ? 2
            : entityDomainOf(airConditionerEntity) === "fan"
              ? 1
              : 0
      };
    } else if (entityPickerComponentType === "device-button") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.iconButtonEntityButtonElement,
        menu: ctx.iconButtonEntityMenuElement,
        search: ctx.iconButtonEntitySearchInputElement,
        options: ctx.iconButtonEntityOptionsElement,
        except: "icon-button-entity",
        recommended: deviceButtonEntity => TOGGLE_ENTITY_DOMAINS.has(entityDomainOf(deviceButtonEntity))
      };
    } else if (entityPickerComponentType === "presence-sensor") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.iconButtonEntityButtonElement,
        menu: ctx.iconButtonEntityMenuElement,
        search: ctx.iconButtonEntitySearchInputElement,
        options: ctx.iconButtonEntityOptionsElement,
        except: "icon-button-entity",
        recommended: presenceSensorEntity => {
          // 这四个字段的拼接原先在这里手写了一遍（与 presence-runtime.js 那份逐字相同），
          // 现在统一走 utils/entities.js 的 entitySearchTextOf：字段清单只有一处定义，
          // 加字段时不会再漏掉某一个调用点（漏了的表现为「这台设备认不出来」）。
          const entitySearchBlob = entitySearchTextOf(presenceSensorEntity);
          const sensorKind = ctx.selectedComponent()?.properties?.sensorKind || "presence";
          const entityDomainValue = entityDomainOf(presenceSensorEntity);
          if (entityDomainValue === "event") {
            if (
              sensorKind === "presence" &&
              /motion|occupancy|presence|pir|moving|移动|运动|人体|有人/i.test(entitySearchBlob)
            ) {
              return 4;
            } else {
              return 0;
            }
          } else if (entityDomainValue !== "binary_sensor") {
            return 0;
          } else if (sensorKind === "water-leak") {
            if (/moisture|water|leak|flood|wet|水浸|漏水|积水|湿/i.test(entitySearchBlob)) {
              return 3;
            } else {
              return 1;
            }
          } else if (sensorKind === "smoke") {
            if (/smoke|fire|烟雾|烟感|火警/i.test(entitySearchBlob)) {
              return 3;
            } else {
              return 1;
            }
          } else if (sensorKind === "natural-gas") {
            if (/natural[_ -]?gas|combustible|gas|燃气|天然气|可燃气/i.test(entitySearchBlob)) {
              return 3;
            } else {
              return 1;
            }
          } else if (sensorKind === "door-window") {
            if (/door|window|contact|opening|门|窗|接触/i.test(entitySearchBlob)) {
              return 3;
            } else {
              return 1;
            }
          } else if (/presence|occupancy|人在|有人|存在|人体/i.test(entitySearchBlob)) {
            return 3;
          } else if (/motion|移动|运动/i.test(entitySearchBlob)) {
            return 1;
          } else {
            return 2;
          }
        }
      };
    } else if (entityPickerComponentType === "icon-button") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.iconButtonEntityButtonElement,
        menu: ctx.iconButtonEntityMenuElement,
        search: ctx.iconButtonEntitySearchInputElement,
        options: ctx.iconButtonEntityOptionsElement,
        except: "icon-button-entity",
        recommended: iconButtonEntity => entityDomainOf(iconButtonEntity) === "light"
      };
    } else if (entityPickerComponentType === "icon-button-effect") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.iconButtonEffectEntityButtonElement,
        menu: ctx.iconButtonEffectEntityMenuElement,
        search: ctx.iconButtonEffectEntitySearchInputElement,
        options: ctx.iconButtonEffectEntityOptionsElement,
        except: "ibe-entity",
        recommended: iconButtonEffectEntity => entityDomainOf(iconButtonEffectEntity) === "light"
      };
    } else if (entityPickerComponentType === "weather") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.weatherEntityButtonElement,
        menu: ctx.weatherEntityMenuElement,
        search: ctx.weatherEntitySearchInputElement,
        options: ctx.weatherEntityOptionsElement,
        except: "weather-entity",
        recommended: weatherEntity => entityDomainOf(weatherEntity) === "weather"
      };
    } else if (entityPickerComponentType === "line-chart") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.lineChartEntityButtonElement,
        menu: ctx.lineChartEntityMenuElement,
        search: ctx.lineChartEntitySearchInputElement,
        options: ctx.lineChartEntityOptionsElement,
        except: "line-chart-entity",
        recommended: lineChartEntity => entityDomainOf(lineChartEntity) === "sensor"
      };
    } else {
      return {
        componentType: "image",
        button: ctx.imageEntityButtonElement,
        menu: ctx.imageEntityMenuElement,
        search: ctx.imageEntitySearchInputElement,
        options: ctx.imageEntityOptionsElement,
        except: "entity",
        recommended: imageEntity => ["image", "camera"].includes(entityDomainOf(imageEntity))
      };
    }
  }

  /**
   * 渲染实体选择器的候选列表：虚拟实体固定 100 分排最前（它们代表图标可见性这类特殊绑定），其余按组件自带的
   * recommended 判定给分（true=1 / false=0），同分保持原始顺序避免抖动。匹配用「显示名 + domain」拼接后做小写包含判断，
   * 输入 light 既能命中域也能命中实体名；选中项用 class 与 aria-selected 双标。
   */
  function renderEntityPickerOptions(searchQuery = "", componentType = "image") {
    const pickerConfig = entityPickerConfig(componentType);
    const selectedEntityId = ctx.selectedComponent()?.bindings?.entity?.entityId || "";
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");
    const sortedEntities = selectableEntities(componentType)
      .map((entityOption, sourceIndex) => ({
        entity: entityOption,
        index: sourceIndex
      }))
      .filter(
        ({ entity: filteredEntity }) =>
          !normalizedQuery ||
          (entityOptionLabel(filteredEntity) + " " + entityDomainOf(filteredEntity))
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery)
      )
      .sort((leftOption, rightOption) => {
        /**
         * 给单个实体算排序分：虚拟实体固定最高，其余由配置的 recommended 判定。
         */
        const scoreEntity = scoredEntity =>
          scoredEntity?.virtual ? 100 : Number(pickerConfig.recommended(scoredEntity));
        return (
          scoreEntity(rightOption.entity) - scoreEntity(leftOption.entity) ||
          leftOption.index - rightOption.index
        );
      })
      .map(({ entity: mappedEntity }) => mappedEntity);
    const clearOptionButton = document.createElement("button");
    clearOptionButton.type = "button";
    clearOptionButton.className =
      "inspector-entity-option inspector-entity-clear" + (selectedEntityId ? "" : " selected");
    clearOptionButton.dataset.entityId = "";
    clearOptionButton.setAttribute("role", "option");
    clearOptionButton.setAttribute("aria-selected", String(!selectedEntityId));
    clearOptionButton.textContent = "不使用实体";
    const entityOptionButtons = sortedEntities.map(listedEntity => {
      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className =
        "inspector-entity-option" + (listedEntity.entityId === selectedEntityId ? " selected" : "");
      optionButton.dataset.entityId = listedEntity.entityId;
      optionButton.setAttribute("role", "option");
      optionButton.setAttribute("aria-selected", String(listedEntity.entityId === selectedEntityId));
      const optionContentElement = document.createElement("span");
      optionContentElement.className = "inspector-entity-option-content";
      optionContentElement.title = entityOptionLabel(listedEntity);
      const nameLineElement = document.createElement("span");
      nameLineElement.className = "inspector-entity-option-line inspector-entity-name-line";
      const kindLabelElement = document.createElement("span");
      kindLabelElement.className = "inspector-entity-kind";
      kindLabelElement.textContent = "[" + entityKindLabel(listedEntity) + "] ";
      const nameElement = document.createElement("span");
      nameElement.className = "inspector-entity-name";
      nameElement.textContent = entityDisplayName(listedEntity);
      nameLineElement.append(kindLabelElement, nameElement);
      const idElement = document.createElement("span");
      idElement.className = "inspector-entity-option-line inspector-entity-id";
      idElement.textContent = listedEntity.entityId;
      idElement.title = listedEntity.entityId;
      optionContentElement.append(nameLineElement, idElement);
      registerOverflowPreviewRow(optionButton, nameLineElement);
      optionButton.append(optionContentElement);
      return optionButton;
    });
    const emptyStateElement = document.createElement("div");
    emptyStateElement.className = "inspector-picker-empty";
    if (!sortedEntities.length) {
      emptyStateElement.textContent = "没有匹配的实体";
    }
    pickerConfig.options.replaceChildren(
      clearOptionButton,
      ...entityOptionButtons,
      ...(emptyStateElement.textContent ? [emptyStateElement] : [])
    );
    pickerConfig.options.scrollTop = 0;
  }

  /**
   * 把控件当前绑定的实体回填到选择器按钮上（文档 → 表单）。绑定的实体可能已不存在，此时直接显示原始
   * entityId 兜底而不是显示空。回填时清空搜索框，下拉若正开着就按新类型重渲染候选；最后同步「复制 ID」
   * 按钮与关联实体配置块 —— 换控件后锚点位置也会变，所以这两步必须放在回填之后。
   */
  function syncEntityPickerValue(component) {
    const componentPickerConfig = entityPickerConfig(component.type);
    const boundEntityId = component.bindings?.entity?.entityId || "";
    const matchedEntity = selectableEntities(component.type).find(
      candidateEntity => candidateEntity.entityId === boundEntityId
    );
    const pickerLabel = matchedEntity
      ? entityOptionLabel(matchedEntity)
      : boundEntityId || "不使用实体";
    let valueElement = componentPickerConfig.button.querySelector(".inspector-picker-value");
    if (!valueElement) {
      valueElement = document.createElement("span");
      valueElement.className = "inspector-picker-value";
      componentPickerConfig.button.replaceChildren(valueElement);
      registerOverflowPreviewRow(componentPickerConfig.button, valueElement);
    }
    valueElement.textContent = pickerLabel;
    valueElement.title = pickerLabel;
    componentPickerConfig.button.dataset.entityId = boundEntityId;
    componentPickerConfig.button._entityCopySync?.();
    componentPickerConfig.search.value = "";
    if (!componentPickerConfig.menu.hidden) {
      renderEntityPickerOptions("", component.type);
    }
    ctx.updateRelatedPopup(
      component,
      componentPickerConfig.relatedSettings === false
        ? null
        : componentPickerConfig.button.closest(".inspector-picker")
    );
  }

  /**
   * 把实体下拉摆到按钮下方（空间不足则翻到上方）。阈值同 positionLightStatisticsEntityMenu
   * （clamped 宽 / 高度 150~430 / 列表扣 58px）；句柄由 entityPickerConfig 按类型解析。
   */
  function positionEntityPickerMenu(pickerComponentType = "image") {
    const activePickerConfig = entityPickerConfig(pickerComponentType);
    positionFloatingMenu({
      anchorElement: activePickerConfig.button,
      menuElement: activePickerConfig.menu,
      optionsElement: activePickerConfig.options,
      widthMode: "clamped",
      maxHeightPx: 430,
      listTrimPx: 58
    });
  }

  /**
   * 把图片素材下拉摆到触发按钮下方。直接复用通用的实体选择器菜单定位逻辑（传入 "image" 取图片类的
   * 锚点配置），保持所有下拉的定位规则一致。
   */
  function positionImagePickerMenu() {
    positionEntityPickerMenu("image");
  }

  /**
   * 按实体 ID 取显示名。
   */
  function popupEntityDisplayName(entityIdKey) {
    return (
      ctx.entities.find(matchedCatalogEntity => matchedCatalogEntity.entityId === entityIdKey)?.name ||
      entityIdKey ||
      "未选择实体"
    );
  }

  /**
   * 同步所有弹窗动作区块的实体输入框与按钮显示。新加的动作块实体为空时默认填第一个实体，避免出现空绑定；
   * 随后刷新按钮文案，且只对已经展开的实体下拉重渲染选项（隐藏的下拉不必浪费一次渲染）。
   */
  function syncPopupEntityInputs() {
    for (const popupEntityInput of document.querySelectorAll("[data-popup-entity]")) {
      const popupTriggerElement = popupEntityInput.closest("[data-action-trigger]");
      if (!popupEntityInput.value && ctx.entities[0]?.entityId) {
        popupEntityInput.value = ctx.entities[0].entityId;
      }
      ctx.syncPopupEntityButton(popupTriggerElement);
      const entityMenuPopupElement = popupTriggerElement?.querySelector("[data-popup-entity-menu]");
      if (entityMenuPopupElement && !entityMenuPopupElement.hidden) {
        ctx.renderPopupEntityOptions(
          popupTriggerElement,
          popupTriggerElement.querySelector("[data-popup-entity-search]")?.value || ""
        );
      }
    }
  }

  /**
   * 同步组合弹窗 climate 模块的「设备类型」分段控件（自动识别 / 空调 / 浴霸）。该行只在模块类型为 climate
   * 时显示；写回时同时清掉模块上旧的顶层 deviceType 字段，避免 properties.deviceType 与顶层字段两份值不一致。
   */
  function syncPopupModuleDeviceType(
    deviceTypeName = ctx.popupModuleFormElement.elements.deviceType.value
  ) {
    const isClimatePopup = ctx.popupModuleFormElement.elements.type.value === "climate";
    const normalizedDeviceType = normalizedPopupClimateDeviceType(deviceTypeName);
    ctx.popupModuleClimateDeviceTypeElement.hidden = !isClimatePopup;
    ctx.popupModuleFormElement.elements.deviceType.value = normalizedDeviceType;
    for (const climateDeviceTypeButtonElement of ctx.popupModuleClimateDeviceTypeElement.querySelectorAll(
      "[data-popup-module-device-type]"
    )) {
      const isDeviceTypeOptionActive =
        climateDeviceTypeButtonElement.dataset.popupModuleDeviceType === normalizedDeviceType;
      climateDeviceTypeButtonElement.classList.toggle("active", isDeviceTypeOptionActive);
      climateDeviceTypeButtonElement.setAttribute("aria-pressed", String(isDeviceTypeOptionActive));
    }
  }

  /**
   * 回填组合弹窗模块的实体选择按钮：文案、dataset 与按钮内的复制同步钩子。
   */
  function syncPopupModuleEntityButton() {
    const moduleEntityId = ctx.popupModuleFormElement.elements.entityId.value;
    const moduleEntity = ctx.entities.find(entity => entity.entityId === moduleEntityId);
    const moduleEntityLabel = moduleEntity
      ? "[" + entityKindLabel(moduleEntity) + "] " + entityDisplayName(moduleEntity)
      : moduleEntityId || "选择实体";
    setPickerButtonLabel(
      ctx.popupModuleEntityButtonElement,
      moduleEntityLabel,
      moduleEntityId || moduleEntityLabel
    );
    ctx.popupModuleEntityButtonElement.dataset.entityId = moduleEntityId;
    ctx.popupModuleEntityButtonElement._entityCopySync?.();
  }

  /**
   * 渲染组合弹窗模块的实体候选列表。排序策略：先用 popupModuleEntityRecommended 把与模块类型匹配的实体
   * 排前面，再按目录原始下标做稳定排序，保证同推荐度时顺序可预期。
   */
  function renderPopupModuleEntityOptions(searchText = ctx.popupModuleEntitySearchInputElement.value) {
    const boundModuleEntityId = ctx.popupModuleFormElement.elements.entityId.value;
    const normalizedSearch = String(searchText || "")
      .trim()
      .toLocaleLowerCase("zh-CN");
    const candidateModuleEntities = ctx.entities
      .map((entityWithIndex, catalogIndex) => ({
        entity: entityWithIndex,
        index: catalogIndex
      }))
      .filter(
        ({ entity: filteredEntityOption }) =>
          !normalizedSearch ||
          (entityOptionLabel(filteredEntityOption) + " " + filteredEntityOption.entityId)
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedSearch)
      )
      .sort(
        (leftCandidate, rightCandidate) =>
          Number(
            popupModuleEntityRecommended(
              rightCandidate.entity,
              ctx.popupModuleFormElement.elements.type.value
            )
          ) -
            Number(
              popupModuleEntityRecommended(
                leftCandidate.entity,
                ctx.popupModuleFormElement.elements.type.value
              )
            ) || leftCandidate.index - rightCandidate.index
      )
      .map(({ entity: orderedEntity }) => orderedEntity);
    ctx.popupModuleEntityOptionsElement.replaceChildren(
      ...candidateModuleEntities.map(moduleEntityOption => {
        const moduleOptionButton = document.createElement("button");
        moduleOptionButton.type = "button";
        moduleOptionButton.className =
          "inspector-entity-option" +
          (moduleEntityOption.entityId === boundModuleEntityId ? " selected" : "");
        moduleOptionButton.dataset.popupModuleEntityId = moduleEntityOption.entityId;
        moduleOptionButton.setAttribute("role", "option");
        moduleOptionButton.setAttribute(
          "aria-selected",
          String(moduleEntityOption.entityId === boundModuleEntityId)
        );
        const moduleOptionContentElement = document.createElement("span");
        moduleOptionContentElement.className = "inspector-entity-option-content";
        const moduleNameLineElement = document.createElement("span");
        moduleNameLineElement.className = "inspector-entity-option-line inspector-entity-name-line";
        moduleNameLineElement.textContent =
          "[" + entityKindLabel(moduleEntityOption) + "] " + entityDisplayName(moduleEntityOption);
        const moduleIdElement = document.createElement("span");
        moduleIdElement.className = "inspector-entity-option-line inspector-entity-id";
        moduleIdElement.textContent = moduleEntityOption.entityId;
        moduleOptionContentElement.append(moduleNameLineElement, moduleIdElement);
        registerOverflowPreviewRow(moduleOptionButton, moduleNameLineElement);
        moduleOptionButton.append(moduleOptionContentElement);
        return moduleOptionButton;
      })
    );
    if (!candidateModuleEntities.length) {
      const moduleNoMatchElement = document.createElement("div");
      moduleNoMatchElement.className = "inspector-picker-empty";
      moduleNoMatchElement.textContent = "没有匹配的实体";
      ctx.popupModuleEntityOptionsElement.append(moduleNoMatchElement);
    }
  }

  /**
   * 取（必要时初始化）某个图标列表容器的滚动加载状态。状态按容器存在 WeakMap 里：同一个页面同时挂着
   * 导航、图标按钮、标题按钮等多份图标下拉，关键字与分页位置必须互不影响；generation 用于丢弃过期请求。
   */
  function iconListState(iconOptionsElement) {
    let iconListStateValue = ctx.iconListStateByElement.get(iconOptionsElement);
    if (!iconListStateValue) {
      iconListStateValue = {
        query: "",
        offset: 0,
        total: 0,
        loading: false,
        complete: false,
        generation: 0
      };
      ctx.iconListStateByElement.set(iconOptionsElement, iconListStateValue);
    }
    return iconListStateValue;
  }

  /**
   * 移除图标名悬浮提示。
   */
  function hideIconTooltip() {
    ctx.iconTooltipElement?.remove();
    ctx.iconTooltipElement = null;
  }

  /**
   * 在锚点元素上方居中显示图标名气泡（空间不足改到下方）。气泡挂在最近的 <dialog> 内而非 body：
   * 模态对话框处于浏览器 top layer，挂到 body 会被背板遮住看不见。
   * 水平位置夹到距视口边缘 8px 内（含气泡自身宽度，给阴影留视觉余量）。
   */
  function showIconTooltip(tooltipAnchorElement, tooltipText) {
    hideIconTooltip();
    const tooltipDialogElement = tooltipAnchorElement.closest("dialog");
    if (!tooltipDialogElement?.open || !tooltipText) {
      return;
    }
    const tooltipContentElement = document.createElement("div");
    tooltipContentElement.className = "editor-icon-name-tooltip";
    tooltipContentElement.textContent = tooltipText;
    tooltipDialogElement.append(tooltipContentElement);
    const anchorRect = tooltipAnchorElement.getBoundingClientRect();
    const tooltipRect = tooltipContentElement.getBoundingClientRect();
    const tooltipLeftPx = Math.min(
      window.innerWidth - tooltipRect.width - 8,
      Math.max(8, anchorRect.left + (anchorRect.width - tooltipRect.width) / 2)
    );
    let tooltipTopPx = anchorRect.top - tooltipRect.height - 8;
    if (tooltipTopPx < 8) {
      tooltipTopPx = anchorRect.bottom + 8;
    }
    tooltipContentElement.style.left = tooltipLeftPx + "px";
    tooltipContentElement.style.top = tooltipTopPx + "px";
    ctx.iconTooltipElement = tooltipContentElement;
  }

  /**
   * 给元素挂上图标名提示的显示/隐藏交互。鼠标（pointerenter/leave）与键盘（focus/blur）两条路径都挂：
   * 只挂鼠标的话键盘用户看不到完整图标名。
   */
  function attachIconTooltip(tooltipTargetElement, tooltipLabelText) {
    tooltipTargetElement.addEventListener("pointerenter", () =>
      showIconTooltip(tooltipTargetElement, tooltipLabelText)
    );
    tooltipTargetElement.addEventListener("pointerleave", hideIconTooltip);
    tooltipTargetElement.addEventListener("focus", () =>
      showIconTooltip(tooltipTargetElement, tooltipLabelText)
    );
    tooltipTargetElement.addEventListener("blur", hideIconTooltip);
  }

  /**
   * 渲染（或追加）一页图标选项并维护滚动分页：append 为 false 或关键字变化时重置列表、分页归零并 generation + 1，
   * 让在途旧请求作废；首项固定为「不使用图标」；loading / complete 挡掉滚动事件触发的重复请求；
   * 失败时复位 loading 并把异常继续抛出，交给调用方决定提示方式。
   */
  async function renderIconOptions({
    optionsElement: iconOptionsHostElement,
    query: iconSearchQuery = "",
    currentIcon: currentIconName = "",
    clearLabel: iconClearLabel = "不使用图标",
    datasetKey: iconDatasetKey = "iconName",
    append: appendIconOptions = false
  }) {
    const normalizedIconQuery = String(iconSearchQuery || "").trim();
    const iconState = iconListState(iconOptionsHostElement);
    if (!appendIconOptions || iconState.query !== normalizedIconQuery) {
      iconState.query = normalizedIconQuery;
      iconState.offset = 0;
      iconState.total = 0;
      iconState.loading = false;
      iconState.complete = false;
      iconState.generation += 1;
      const iconLoadingElement = document.createElement("div");
      iconLoadingElement.className = "navigation-icon-load-state";
      iconLoadingElement.textContent = "正在加载图标…";
      iconOptionsHostElement.replaceChildren(
        ctx.createIconPickerClearOption(currentIconName, iconClearLabel, iconDatasetKey),
        iconLoadingElement
      );
      iconOptionsHostElement.scrollTop = 0;
    }
    if (iconState.loading || iconState.complete) {
      return;
    }
    const iconRequestGeneration = iconState.generation;
    const iconLoadStateElement = iconOptionsHostElement.querySelector(".navigation-icon-load-state");
    iconState.loading = true;
    if (iconLoadStateElement) {
      iconLoadStateElement.textContent = iconState.offset ? "正在加载更多图标…" : "正在加载图标…";
    }
    try {
      const iconsResponse = await ctx.requestJson(
        "/icons?query=" +
          encodeURIComponent(iconState.query) +
          "&limit=" +
          ctx.ICON_PAGE_SIZE +
          "&offset=" +
          iconState.offset
      );
      if (iconRequestGeneration !== iconState.generation) {
        return;
      }
      const iconItems = iconsResponse.items || [];
      const iconOptionElements = iconItems.map(iconItem =>
        ctx.createIconPickerOption(iconItem, currentIconName, iconDatasetKey)
      );
      if (iconLoadStateElement && iconOptionElements.length) {
        iconLoadStateElement.before(...iconOptionElements);
      }
      iconState.offset += iconItems.length;
      iconState.total = Math.max(Number(iconsResponse.total) || 0, iconState.offset);
      iconState.complete = !iconItems.length || iconState.offset >= iconState.total;
      iconState.loading = false;
      if (iconLoadStateElement) {
        iconLoadStateElement.textContent = iconState.total
          ? iconState.complete
            ? "已显示全部 " + iconState.total + " 个图标"
            : "已加载 " + iconState.offset + " / " + iconState.total + " · 继续向下滚动"
          : "没有匹配的图标";
      }
    } catch (iconLoadError) {
      if (iconRequestGeneration === iconState.generation) {
        iconState.loading = false;
        if (iconLoadStateElement) {
          iconLoadStateElement.textContent = "图标加载失败，请稍后重试";
        }
      }
      throw iconLoadError;
    }
  }

  /**
   * 给滚动容器挂上「滚到底部自动加载下一页」的行为。阈值 120px：提前一屏的一小段距离就开始加载，
   * 用这段距离抵消网络往返时间，用户继续滚动时新内容通常已经就位；重复触发由调用方（loadMoreIcons）
   * 内部的状态位挡掉，这里只负责判断位置。
   */
  function attachInfiniteScroll(infiniteScrollElement, loadMoreIcons) {
    infiniteScrollElement.addEventListener("scroll", () => {
      if (
        !(
          infiniteScrollElement.scrollHeight -
            infiniteScrollElement.scrollTop -
            infiniteScrollElement.clientHeight >
          120
        )
      ) {
        loadMoreIcons().catch(ctx.handleOperationError);
      }
    });
  }

  /**
   * 加载导航控件的图标候选。
   */
  async function loadNavigationIconOptions(
    navigationIconQuery = "",
    { append: appendNavigationIcons = false } = {}
  ) {
    return renderIconOptions({
      optionsElement: ctx.navigationIconOptionsElement,
      query: navigationIconQuery,
      currentIcon: ctx.selectedComponent()?.properties?.icon || "",
      append: appendNavigationIcons
    });
  }

  /**
   * 加载图标按钮「效果图标」的候选列表。
   */
  async function loadIconButtonEffectIconOptions(
    effectIconQuery = "",
    { append: appendEffectIcons = false } = {}
  ) {
    return renderIconOptions({
      optionsElement: ctx.iconButtonEffectIconOptionsElement,
      query: effectIconQuery,
      currentIcon: ctx.selectedComponent()?.properties?.icon || "",
      append: appendEffectIcons
    });
  }

  /**
   * 加载图标按钮「常态图标」的候选列表。设备按钮未指定图标时首项文案是「跟随实体图标」（图标来自实体绑定），
   * 其余图标按钮则是「不使用图标」——与运行时的图标回退策略保持一致。
   */
  async function loadIconButtonIconOptions(
    iconButtonIconQuery = "",
    { append: appendIconButtonIcons = false } = {}
  ) {
    const iconButtonIconComponent = ctx.selectedComponent();
    return renderIconOptions({
      optionsElement: ctx.iconButtonIconOptionsElement,
      query: iconButtonIconQuery,
      currentIcon: iconButtonIconComponent?.properties?.icon || "",
      clearLabel: iconButtonIconComponent?.type === "device-button" ? "跟随实体图标" : "不使用图标",
      append: appendIconButtonIcons
    });
  }

  /**
   * 加载标题按钮图标的候选列表。
   */
  async function loadTitleButtonIconOptions(
    titleIconQuery = "",
    { append: appendTitleIcons = false } = {}
  ) {
    return renderIconOptions({
      optionsElement: ctx.titleButtonIconOptionsElement,
      query: titleIconQuery,
      currentIcon: ctx.selectedComponent()?.properties?.icon || "",
      append: appendTitleIcons
    });
  }

  /**
   * 加载统计控件图标的候选列表。默认图标只在 properties 里根本没有 icon 字段时才补上（用 hasOwn 判断）：
   * 用户主动清空图标会留下空串字段，那种情况必须尊重；datasetKey 换成 lightStatisticsIconName，
   * 与其它图标下拉的 data 键区分开。
   */
  async function loadLightStatisticsIconOptions(
    statisticsIconQuery = "",
    { append: appendStatisticsIcons = false } = {}
  ) {
    const statisticsIconProperties = ctx.selectedComponent()?.properties || {};
    const statisticsDefaultIcon = String(
      Object.hasOwn(statisticsIconProperties, "icon")
        ? statisticsIconProperties.icon || ""
        : "mdi:lightbulb-group-outline"
    );
    return renderIconOptions({
      optionsElement: ctx.lightStatisticsIconOptionsElement,
      query: statisticsIconQuery,
      currentIcon: statisticsDefaultIcon,
      datasetKey: "lightStatisticsIconName",
      append: appendStatisticsIcons
    });
  }

  /**
   * 把导航图标下拉摆到按钮下方（空间不足则翻到上方）。
   * 间距 / 高度 / 列表阈值全取 positionFloatingMenu 的默认值，差别只在锚点是按钮的父元素。
   */
  function positionNavigationIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.navigationIconButtonElement.parentElement,
      menuElement: ctx.navigationIconMenuElement,
      optionsElement: ctx.navigationIconOptionsElement
    });
  }

  /**
   * 把图标按钮「效果」图标下拉摆到按钮下方（空间不足则翻到上方）。
   *
   * 阈值与 positionNavigationIconMenu 相同（gap 5 / margin 8 / 高度 150~390 / 阈值 250）。
   */
  function positionIconButtonEffectIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.iconButtonEffectIconButtonElement.parentElement,
      menuElement: ctx.iconButtonEffectIconMenuElement,
      optionsElement: ctx.iconButtonEffectIconOptionsElement
    });
  }

  /**
   * 把图标按钮的图标下拉摆到按钮下方（空间不足则翻到上方）。
   *
   * 阈值与 positionNavigationIconMenu 相同（gap 5 / margin 8 / 高度 150~390 / 阈值 250）。
   */
  function positionIconButtonIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.iconButtonIconButtonElement.parentElement,
      menuElement: ctx.iconButtonIconMenuElement,
      optionsElement: ctx.iconButtonIconOptionsElement
    });
  }

  /**
   * 把标题按钮图标下拉摆到按钮下方（空间不足则翻到上方）。
   *
   * 阈值与 positionNavigationIconMenu 相同（gap 5 / margin 8 / 高度 150~390 / 阈值 250）。
   */
  function positionTitleButtonIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.titleButtonIconButtonElement.parentElement,
      menuElement: ctx.titleButtonIconMenuElement,
      optionsElement: ctx.titleButtonIconOptionsElement
    });
  }

  /**
   * 把灯光统计的图标下拉摆到按钮下方（空间不足则翻到上方）。
   *
   * 阈值与 positionNavigationIconMenu 相同（gap 5 / margin 8 / 高度 150~390 / 阈值 250）。
   */
  function positionLightStatisticsIconMenu() {
    positionFloatingMenu({
      anchorElement: ctx.lightStatisticsIconButtonElement.parentElement,
      menuElement: ctx.lightStatisticsIconMenuElement,
      optionsElement: ctx.lightStatisticsIconOptionsElement
    });
  }

  /**
   * 把灯光统计的实体下拉摆到按钮下方（空间不足则翻到上方）。
   *
   * 比图标下拉更宽更高：高度上限 430、列表扣 58px；宽度先取锚点宽再压进视口（clamped）。
   */
  function positionLightStatisticsEntityMenu() {
    positionFloatingMenu({
      anchorElement: ctx.lightStatisticsEntityButtonElement,
      menuElement: ctx.lightStatisticsEntityMenuElement,
      optionsElement: ctx.lightStatisticsEntityOptionsElement,
      widthMode: "clamped",
      maxHeightPx: 430,
      listTrimPx: 58
    });
  }

  /**
   * 复位统计实体选择器的临时选择状态。statisticsEntityId / statisticsReplaceIndex 是选择器与文档之间
   * 的暂存中介，复位是为了让下一次「加入」不会带上上一次的实体或替换下标。
   */
  function resetLightStatisticsPicker({ clearMessage: shouldClearMessage = true } = {}) {
    ctx.statisticsEntityId = "";
    ctx.statisticsReplaceIndex = -1;
    ctx.statisticsComponentId = "";
    ctx.lightStatisticsEntityPendingElement.hidden = true;
    setPickerButtonLabel(ctx.lightStatisticsEntityButtonElement, "选择一个实体");
    if (shouldClearMessage) {
      setLightStatisticsMessage("");
    }
  }

  /**
   * 渲染统计控件的实体候选列表。排序刻意分三级：支持统计的实体优先，其次是 light 域实体，最后才回到
   * 原始顺序 —— 统计控件只对部分实体有意义，把不可用的沉到后面能少滚几屏。
   */
  function renderLightStatisticsEntityOptions(entitySearchQuery = "") {
    if (ctx.selectedComponent()?.type !== "light-statistics") {
      return;
    }
    const normalizedEntityQuery = entitySearchQuery.trim().toLocaleLowerCase("zh-CN");
    const statisticsOptionElements = selectableEntities("light-statistics")
      .map((listedStatisticsEntity, statisticsEntityIndex) => ({
        entity: listedStatisticsEntity,
        index: statisticsEntityIndex,
        support: lightStatisticsEntitySupport(listedStatisticsEntity)
      }))
      .filter(
        ({ entity: statisticsEntityItem }) =>
          !normalizedEntityQuery ||
          (entityOptionLabel(statisticsEntityItem) + " " + entityDomainOf(statisticsEntityItem))
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedEntityQuery)
      )
      .sort(
        (statisticsOptionA, statisticsOptionB) =>
          Number(statisticsOptionB.support.supported) - Number(statisticsOptionA.support.supported) ||
          +(entityDomainOf(statisticsOptionB.entity) === "light") -
            +(entityDomainOf(statisticsOptionA.entity) === "light") ||
          statisticsOptionA.index - statisticsOptionB.index
      )
      .map(({ entity: statisticsOptionEntity, support: statisticsOptionSupport }) => {
        const statisticsOptionButtonElement = document.createElement("button");
        statisticsOptionButtonElement.type = "button";
        statisticsOptionButtonElement.className =
          "inspector-entity-option" +
          (statisticsOptionEntity.entityId === ctx.statisticsEntityId ? " selected" : "");
        statisticsOptionButtonElement.dataset.lightStatisticsEntityId =
          statisticsOptionEntity.entityId;
        statisticsOptionButtonElement.setAttribute("role", "option");
        statisticsOptionButtonElement.setAttribute(
          "aria-selected",
          String(statisticsOptionEntity.entityId === ctx.statisticsEntityId)
        );
        const statisticsOptionContentElement = document.createElement("span");
        statisticsOptionContentElement.className = "inspector-entity-option-content";
        statisticsOptionContentElement.title = entityOptionLabel(statisticsOptionEntity);
        const statisticsOptionNameLineElement = document.createElement("span");
        statisticsOptionNameLineElement.className =
          "inspector-entity-option-line inspector-entity-name-line";
        const statisticsOptionKindElement = document.createElement("span");
        statisticsOptionKindElement.className = "inspector-entity-kind";
        statisticsOptionKindElement.textContent =
          "[" + entityKindLabel(statisticsOptionEntity) + "] ";
        const statisticsOptionNameElement = document.createElement("span");
        statisticsOptionNameElement.className = "inspector-entity-name";
        statisticsOptionNameElement.textContent = entityDisplayName(statisticsOptionEntity);
        statisticsOptionNameLineElement.append(
          statisticsOptionKindElement,
          statisticsOptionNameElement
        );
        const statisticsOptionIdElement = document.createElement("span");
        statisticsOptionIdElement.className = "inspector-entity-option-line inspector-entity-id";
        statisticsOptionIdElement.textContent = statisticsOptionEntity.entityId;
        statisticsOptionIdElement.title = statisticsOptionEntity.entityId;
        statisticsOptionContentElement.append(
          statisticsOptionNameLineElement,
          statisticsOptionIdElement
        );
        registerOverflowPreviewRow(statisticsOptionButtonElement, statisticsOptionNameLineElement);
        statisticsOptionButtonElement.append(statisticsOptionContentElement);
        return statisticsOptionButtonElement;
      });
    if (!statisticsOptionElements.length) {
      const statisticsOptionsEmptyElement = document.createElement("div");
      statisticsOptionsEmptyElement.className = "inspector-picker-empty";
      statisticsOptionsEmptyElement.textContent = "没有匹配的实体";
      statisticsOptionElements.push(statisticsOptionsEmptyElement);
    }
    ctx.lightStatisticsEntityOptionsElement.replaceChildren(...statisticsOptionElements);
    ctx.lightStatisticsEntityOptionsElement.scrollTop = 0;
  }

  /**
   * 选中候选实体并立即写入统计控件。
   *
   * 已存在（且不是要替换的那个下标）时直接报错返回，避免同一实体被加两次。
   */
  function pickLightStatisticsEntity(
    pickedStatisticsEntityId,
    statisticsReplaceIndexTarget = ctx.statisticsReplaceIndex
  ) {
    const statisticsPickerComponent = ctx.selectedComponent();
    if (
      statisticsPickerComponent?.type !== "light-statistics" ||
      !selectableEntities("light-statistics").find(
        statisticsEntityCandidate => statisticsEntityCandidate.entityId === pickedStatisticsEntityId
      )
    ) {
      return;
    }
    const existingStatisticsIndex =
      componentEntityIds(statisticsPickerComponent).indexOf(pickedStatisticsEntityId);
    if (existingStatisticsIndex >= 0 && existingStatisticsIndex !== statisticsReplaceIndexTarget) {
      setLightStatisticsMessage("该实体已添加，请选择其它实体。", true);
      return;
    }
    ctx.statisticsEntityId = pickedStatisticsEntityId;
    ctx.statisticsReplaceIndex = Number.isInteger(statisticsReplaceIndexTarget)
      ? statisticsReplaceIndexTarget
      : -1;
    ctx.statisticsComponentId = statisticsPickerComponent.id;
    return addLightStatisticsEntity();
  }

  /**
   * 把当前选中的实体加入统计控件（替换模式下改写对应下标）。校验做了两层：mutateDocument 之外先拦一次
   * 用于即时提示，文档修改函数内部再拦一次，防止用户点得很快时「文档已被改过」的竞态；结果用结果码
   * 而不是异常表达，因为这不是错误而是一种需要提示的业务分支。
   */
  function addLightStatisticsEntity() {
    const statisticsTargetComponentId = ctx.selectedComponentId;
    const statisticsEntityIdToAdd = ctx.statisticsEntityId;
    const statisticsReplaceIndexValue = ctx.statisticsReplaceIndex;
    const statisticsEntityForAdd = ctx.entities.find(
      statisticsEntityEntry => statisticsEntityEntry.entityId === statisticsEntityIdToAdd
    );
    if (!statisticsTargetComponentId || !statisticsEntityIdToAdd || !statisticsEntityForAdd) {
      return;
    }
    const statisticsCurrentComponent = ctx.selectedComponent();
    if (
      statisticsReplaceIndexValue < 0 &&
      componentEntityIds(statisticsCurrentComponent).length >= ctx.MAX_LIGHT_STATISTICS_ENTITIES
    ) {
      setLightStatisticsMessage(
        "每个统计控件最多添加 " + ctx.MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。",
        true
      );
      return;
    }
    return ctx.mutateDocument(statisticsAddDocument => {
      const statisticsAddComponent = findComponent(
        statisticsAddDocument,
        statisticsTargetComponentId
      )?.component;
      if (!statisticsAddComponent || statisticsAddComponent.type !== "light-statistics") {
        return "component-invalid";
      }
      const statisticsEntityIds = componentEntityIds(statisticsAddComponent);
      const existingEntityIndex = statisticsEntityIds.indexOf(statisticsEntityIdToAdd);
      if (existingEntityIndex >= 0 && existingEntityIndex !== statisticsReplaceIndexValue) {
        return "duplicate";
      }
      const replacedStatisticsEntityId =
        statisticsReplaceIndexValue >= 0 && statisticsReplaceIndexValue < statisticsEntityIds.length
          ? statisticsEntityIds[statisticsReplaceIndexValue]
          : "";
      if (
        !replacedStatisticsEntityId &&
        statisticsEntityIds.length >= ctx.MAX_LIGHT_STATISTICS_ENTITIES
      ) {
        return "limit-reached";
      }
      if (statisticsReplaceIndexValue >= 0 && !replacedStatisticsEntityId) {
        return "component-invalid";
      }
      if (replacedStatisticsEntityId) {
        statisticsEntityIds.splice(statisticsReplaceIndexValue, 1, statisticsEntityIdToAdd);
      } else {
        statisticsEntityIds.push(statisticsEntityIdToAdd);
      }
      const statisticsEntityLabels = {
        ...(statisticsAddComponent.properties?.entityLabels || {})
      };
      if (replacedStatisticsEntityId && replacedStatisticsEntityId !== statisticsEntityIdToAdd) {
        delete statisticsEntityLabels[replacedStatisticsEntityId];
      }
      statisticsEntityLabels[statisticsEntityIdToAdd] = entityDisplayName(statisticsEntityForAdd);
      statisticsAddComponent.properties = {
        ...(statisticsAddComponent.properties || {}),
        entityIds: statisticsEntityIds,
        entityLabels: statisticsEntityLabels
      };
      if (replacedStatisticsEntityId) {
        return "replaced";
      } else {
        return "added";
      }
    }).then(statisticsAddResult =>
      statisticsAddResult === "limit-reached"
        ? (setLightStatisticsMessage(
            "每个统计控件最多添加 " + ctx.MAX_LIGHT_STATISTICS_ENTITIES + " 个实体。",
            true
          ),
          statisticsAddResult)
        : statisticsAddResult === "duplicate"
          ? (setLightStatisticsMessage("该实体已添加，请选择其它实体。", true), statisticsAddResult)
          : statisticsAddResult === "component-invalid"
            ? (setLightStatisticsMessage("当前统计控件已发生变化，请重新选择。", true),
              statisticsAddResult)
            : ((statisticsAddResult !== "added" && statisticsAddResult !== "replaced") ||
                (resetLightStatisticsPicker({
                  clearMessage: false
                }),
                setLightStatisticsMessage(
                  statisticsAddResult === "replaced" ? "已更换统计实体。" : "已加入统计列表。"
                )),
              statisticsAddResult)
    );
  }

  /**
   * 从灯光统计组件的实体列表里移除指定下标的实体，并同步清理 properties.entityLabels 里对应的标签，
   * 否则该实体的名字会残留，之后用同一 entityId 加回来时会显示成旧名字。下标校验用 Number.isInteger 且非负，
   * 非法下标 splice 会静默删掉别的实体。经 mutateDocument 改写文档并进入撤销历史。
   */
  function removeLightStatisticsEntity(statisticsRemoveIndex) {
    const statisticsRemoveComponentId = ctx.selectedComponentId;
    if (
      !!statisticsRemoveComponentId &&
      !!Number.isInteger(statisticsRemoveIndex) &&
      !(statisticsRemoveIndex < 0)
    ) {
      ctx.mutateDocument(statisticsRemoveDocument => {
        const statisticsRemoveComponent = findComponent(
          statisticsRemoveDocument,
          statisticsRemoveComponentId
        )?.component;
        if (!statisticsRemoveComponent || statisticsRemoveComponent.type !== "light-statistics") {
          return;
        }
        const statisticsRemoveEntityIds = componentEntityIds(statisticsRemoveComponent);
        const [removedStatisticsEntityId] = statisticsRemoveEntityIds.splice(
          statisticsRemoveIndex,
          1
        );
        const statisticsRemoveEntityLabels = {
          ...(statisticsRemoveComponent.properties?.entityLabels || {})
        };
        if (removedStatisticsEntityId) {
          delete statisticsRemoveEntityLabels[removedStatisticsEntityId];
        }
        statisticsRemoveComponent.properties = {
          ...(statisticsRemoveComponent.properties || {}),
          entityIds: statisticsRemoveEntityIds,
          entityLabels: statisticsRemoveEntityLabels
        };
      });
      resetLightStatisticsPicker();
    }
  }

  /**
   * 渲染「已加入统计」的实体行（名称、ID、运行状态与更换 / 删除按钮）。实体可能已从系统里消失，
   * 此时回落到 entityLabels 里存下的历史名称，并给整行加 missing 类，让用户知道它已经不可用。
   */
  function renderLightStatisticsEntities(statisticsRowComponent = ctx.selectedComponent()) {
    if (statisticsRowComponent?.type !== "light-statistics") {
      return;
    }
    const statisticsRowEntityIds = componentEntityIds(statisticsRowComponent);
    const statisticsRowEntityLabels = statisticsRowComponent.properties?.entityLabels || {};
    ctx.lightStatisticsEntityCountElement.textContent = statisticsRowEntityIds.length + " 个";
    const statisticsRowElements = statisticsRowEntityIds.map(
      (statisticsRowEntityId, statisticsRowIndex) => {
        const statisticsRowEntityEntry =
          selectableEntities("light-statistics").find(
            statisticsRowEntity => statisticsRowEntity.entityId === statisticsRowEntityId
          ) || null;
        const statisticsRowStatus = lightStatisticsEntityStatus(
          statisticsRowEntityId,
          statisticsRowEntityEntry
        );
        const statisticsRowElement = document.createElement("div");
        statisticsRowElement.className =
          "light-statistics-entity-row " +
          statisticsRowStatus.tone +
          (statisticsRowEntityEntry ? "" : " missing");
        const statisticsRowCopyElement = document.createElement("div");
        const statisticsRowNameElement = document.createElement("strong");
        statisticsRowNameElement.textContent = statisticsRowEntityEntry
          ? entityDisplayName(statisticsRowEntityEntry)
          : statisticsRowEntityLabels[statisticsRowEntityId] || statisticsRowEntityId;
        const statisticsRowMetaElement = document.createElement("small");
        statisticsRowMetaElement.textContent =
          statisticsRowEntityId + " · " + statisticsRowStatus.label;
        statisticsRowCopyElement.append(statisticsRowNameElement, statisticsRowMetaElement);
        const statisticsRowActionsElement = document.createElement("span");
        statisticsRowActionsElement.className = "light-statistics-entity-actions";
        const statisticsRowReplaceButtonElement = document.createElement("button");
        statisticsRowReplaceButtonElement.type = "button";
        statisticsRowReplaceButtonElement.dataset.lightStatisticsReplaceIndex =
          String(statisticsRowIndex);
        statisticsRowReplaceButtonElement.textContent = "更换";
        const statisticsRowRemoveButtonElement = document.createElement("button");
        statisticsRowRemoveButtonElement.type = "button";
        statisticsRowRemoveButtonElement.dataset.lightStatisticsRemoveIndex =
          String(statisticsRowIndex);
        statisticsRowRemoveButtonElement.textContent = "删除";
        statisticsRowActionsElement.append(
          statisticsRowReplaceButtonElement,
          statisticsRowRemoveButtonElement
        );
        statisticsRowElement.append(statisticsRowCopyElement, statisticsRowActionsElement);
        return statisticsRowElement;
      }
    );
    ctx.lightStatisticsEntityListElement.replaceChildren(...statisticsRowElements);
  }

  /**
   * 停止某一行的悬停滚动并复位。定时器与动画帧都要清：元素被移除后 rAF 会一直跑下去；
   * scrollLeft 归零则是为了下次悬停仍从行首开始滚。
   */
  function stopHoverScroll(hoverScrollRowElement) {
    const hoverScrollState = hoverScrollStateByRow.get(hoverScrollRowElement);
    if (hoverScrollState) {
      window.clearTimeout(hoverScrollState.timer);
      window.cancelAnimationFrame(hoverScrollState.frame);
      hoverScrollStateByRow.delete(hoverScrollRowElement);
    }
    hoverScrollRowElement.scrollLeft = 0;
    hoverScrollRowElement.classList.remove("hover-scrolling");
  }

  /**
   * 从事件目标向上找到可横向滚动的预览元素。先按选择器找直接命中项，找不到再退回到所在行登记的
   * 第一个目标 —— 这样鼠标落在行内空白处也能触发滚动预览。
   */
  function findOverflowPreviewTarget(closestSourceElement) {
    const previewTargetElement = closestSourceElement.closest?.(HOVER_SCROLL_TARGET_SELECTOR);
    if (previewTargetElement) {
      return previewTargetElement;
    }
    const previewRowSourceElement = closestSourceElement.closest?.(
      "[data-overflow-scroll-preview-row]"
    );
    return previewTargetsByRow.get(previewRowSourceElement)?.[0] || null;
  }

  /**
   * 找到元素所属的滚动预览行。
   */
  function findOverflowRow(overflowRowCandidate) {
    return (
      overflowRowCandidate?.closest?.("[data-overflow-scroll-preview-row]") || overflowRowCandidate
    );
  }

  const hoverScrollStateByRow = new WeakMap();

  const previewTargetsByRow = new WeakMap();

  const HOVER_SCROLL_TARGET_SELECTOR =
    "[data-overflow-scroll-preview], .inspector-picker-value, .inspector-entity-name-line";

  return { HOVER_SCROLL_TARGET_SELECTOR, addLightStatisticsEntity, attachIconTooltip, attachInfiniteScroll, collapseWhitespace, componentEntityIds, componentsInPage, deviceNameForEntity, ensurePickerValueElement, entityDisplayName, entityDisplaySubtitle, entityKindLabel, entityOptionLabel, entityPickerConfig, findOverflowPreviewTarget, findOverflowRow, flattenComponents, hideIconTooltip, hoverScrollStateByRow, iconListState, iconVisibilityVirtualEntities, lightStatisticsEntityStatus, loadIconButtonEffectIconOptions, loadIconButtonIconOptions, loadLightStatisticsIconOptions, loadNavigationIconOptions, loadTitleButtonIconOptions, pickLightStatisticsEntity, popupEntityDisplayName, positionEntityPickerMenu, positionIconButtonEffectIconMenu, positionIconButtonIconMenu, positionImagePickerMenu, positionLightStatisticsEntityMenu, positionLightStatisticsIconMenu, positionNavigationIconMenu, positionTitleButtonIconMenu, previewTargetsByRow, registerOverflowPreviewRow, removeLightStatisticsEntity, renderEntityPickerOptions, renderIconOptions, renderLightStatisticsEntities, renderLightStatisticsEntityOptions, renderPopupModuleEntityOptions, resetLightStatisticsPicker, selectableEntities, setLightStatisticsMessage, setPickerButtonLabel, showIconTooltip, stopHoverScroll, syncEntityPickerValue, syncPopupEntityInputs, syncPopupModuleDeviceType, syncPopupModuleEntityButton };
}
