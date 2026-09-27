/**
 * 实体选项面板的几块渲染：实体选择器（含配置）、图标选择器、灯光统计实体。
 */

type AnyObj = Record<string, any>;


import { TOGGLE_ENTITY_DOMAINS } from "../../shared/action-rules.js";
import { entityDomainOf } from "../../utils/entities.js";
import { entitySearchTextOf } from "../../utils/entities.js";
import { lightStatisticsEntitySupport } from "../../renderer/core/registry.js";

export function entityPickerConfig(entityPickerComponentType: any = "image", context: any) {
  const { ctx } = context;

    if (entityPickerComponentType === "light-statistics") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.lightStatisticsActionEntityButtonElement,
        menu: ctx.lightStatisticsActionEntityMenuElement,
        search: ctx.lightStatisticsActionEntitySearchInputElement,
        options: ctx.lightStatisticsActionEntityOptionsElement,
        except: "light-statistics-action-entity",
        relatedSettings: false,
        recommended: (lightStatisticsEntity: any) =>
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
        recommended: (navigationEntity: any) =>
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
        recommended: (titleButtonEntity: any) =>
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
        recommended: (vacuumMapEntity: any) =>
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
        recommended: (cameraEntity: any) => entityDomainOf(cameraEntity) === "camera"
      };
    } else if (entityPickerComponentType === "air-conditioner") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.airConditionerEntityButtonElement,
        menu: ctx.airConditionerEntityMenuElement,
        search: ctx.airConditionerEntitySearchInputElement,
        options: ctx.airConditionerEntityOptionsElement,
        except: "air-conditioner-entity",
        recommended: (airConditionerEntity: any) =>
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
        recommended: (deviceButtonEntity: any) => TOGGLE_ENTITY_DOMAINS.has(entityDomainOf(deviceButtonEntity))
      };
    } else if (entityPickerComponentType === "presence-sensor") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.iconButtonEntityButtonElement,
        menu: ctx.iconButtonEntityMenuElement,
        search: ctx.iconButtonEntitySearchInputElement,
        options: ctx.iconButtonEntityOptionsElement,
        except: "icon-button-entity",
        recommended: (presenceSensorEntity: any) => {
          // 这四个字段的拼接原先在这里手写了一遍（与 presence-runtime.js 那份逐字相同），
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
        recommended: (iconButtonEntity: any) => entityDomainOf(iconButtonEntity) === "light"
      };
    } else if (entityPickerComponentType === "icon-button-effect") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.iconButtonEffectEntityButtonElement,
        menu: ctx.iconButtonEffectEntityMenuElement,
        search: ctx.iconButtonEffectEntitySearchInputElement,
        options: ctx.iconButtonEffectEntityOptionsElement,
        except: "ibe-entity",
        recommended: (iconButtonEffectEntity: any) => entityDomainOf(iconButtonEffectEntity) === "light"
      };
    } else if (entityPickerComponentType === "weather") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.weatherEntityButtonElement,
        menu: ctx.weatherEntityMenuElement,
        search: ctx.weatherEntitySearchInputElement,
        options: ctx.weatherEntityOptionsElement,
        except: "weather-entity",
        recommended: (weatherEntity: any) => entityDomainOf(weatherEntity) === "weather"
      };
    } else if (entityPickerComponentType === "line-chart") {
      return {
        componentType: entityPickerComponentType,
        button: ctx.lineChartEntityButtonElement,
        menu: ctx.lineChartEntityMenuElement,
        search: ctx.lineChartEntitySearchInputElement,
        options: ctx.lineChartEntityOptionsElement,
        except: "line-chart-entity",
        recommended: (lineChartEntity: any) => entityDomainOf(lineChartEntity) === "sensor"
      };
    } else {
      return {
        componentType: "image",
        button: ctx.imageEntityButtonElement,
        menu: ctx.imageEntityMenuElement,
        search: ctx.imageEntitySearchInputElement,
        options: ctx.imageEntityOptionsElement,
        except: "entity",
        recommended: (imageEntity: any) => ["image", "camera"].includes(entityDomainOf(imageEntity))
      };
    }
  }

export function renderEntityPickerOptions(searchQuery: any = "", componentType: any = "image", context: any) {
  const { entityPickerConfig, ctx, selectableEntities, entityOptionLabel, entityKindLabel, entityDisplayName, registerOverflowPreviewRow } = context;

    const pickerConfig = entityPickerConfig(componentType, context);
    const selectedEntityId = ctx.selectedComponent()?.bindings?.entity?.entityId || "";
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("zh-CN");
    const sortedEntities = selectableEntities(componentType)
      .map((entityOption: any, sourceIndex: any) => ({
        entity: entityOption,
        index: sourceIndex
      }))
      .filter(
        ({ entity: filteredEntity }: AnyObj) =>
          !normalizedQuery ||
          (entityOptionLabel(filteredEntity) + " " + entityDomainOf(filteredEntity))
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedQuery)
      )
      .sort((leftOption: any, rightOption: any) => {
        /**
         * 给单个实体算排序分：虚拟实体固定最高，其余由配置的 recommended 判定。
         */
        const scoreEntity = (scoredEntity: any) =>
          scoredEntity?.virtual ? 100 : Number(pickerConfig.recommended(scoredEntity));
        return (
          scoreEntity(rightOption.entity) - scoreEntity(leftOption.entity) ||
          leftOption.index - rightOption.index
        );
      })
      .map(({ entity: mappedEntity  }: AnyObj) => mappedEntity);
    const clearOptionButton = document.createElement("button");
    clearOptionButton.type = "button";
    clearOptionButton.className =
      "inspector-entity-option inspector-entity-clear" + (selectedEntityId ? "" : " selected");
    clearOptionButton.dataset.entityId = "";
    clearOptionButton.setAttribute("role", "option");
    clearOptionButton.setAttribute("aria-selected", String(!selectedEntityId));
    clearOptionButton.textContent = "不使用实体";
    const entityOptionButtons = sortedEntities.map((listedEntity: any) => {
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

export async function renderIconOptions({
    optionsElement: iconOptionsHostElement,
    query: iconSearchQuery = "",
    currentIcon: currentIconName = "",
    clearLabel: iconClearLabel = "不使用图标",
    datasetKey: iconDatasetKey = "iconName",
    append: appendIconOptions = false
  }: AnyObj, context: any) {
  const { iconListState, ctx, encodeURIComponent } = context;

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
      const iconOptionElements = iconItems.map((iconItem: any) =>
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
    } catch (iconLoadError: any) {
      if (iconRequestGeneration === iconState.generation) {
        iconState.loading = false;
        if (iconLoadStateElement) {
          iconLoadStateElement.textContent = "图标加载失败，请稍后重试";
        }
      }
      throw iconLoadError;
    }
  }

export function renderLightStatisticsEntityOptions(entitySearchQuery: any = "", context: any) {
  const { ctx, selectableEntities, entityOptionLabel, entityKindLabel, entityDisplayName, registerOverflowPreviewRow } = context;

    if (ctx.selectedComponent()?.type !== "light-statistics") {
      return;
    }
    const normalizedEntityQuery = entitySearchQuery.trim().toLocaleLowerCase("zh-CN");
    const statisticsOptionElements = selectableEntities("light-statistics")
      .map((listedStatisticsEntity: any, statisticsEntityIndex: any) => ({
        entity: listedStatisticsEntity,
        index: statisticsEntityIndex,
        support: lightStatisticsEntitySupport(listedStatisticsEntity)
      }))
      .filter(
        ({ entity: statisticsEntityItem }: AnyObj) =>
          !normalizedEntityQuery ||
          (entityOptionLabel(statisticsEntityItem) + " " + entityDomainOf(statisticsEntityItem))
            .toLocaleLowerCase("zh-CN")
            .includes(normalizedEntityQuery)
      )
      .sort(
        (statisticsOptionA: any, statisticsOptionB: any) =>
          Number(statisticsOptionB.support.supported) - Number(statisticsOptionA.support.supported) ||
          +(entityDomainOf(statisticsOptionB.entity) === "light") -
            +(entityDomainOf(statisticsOptionA.entity) === "light") ||
          statisticsOptionA.index - statisticsOptionB.index
      )
      .map(({ entity: statisticsOptionEntity, support: statisticsOptionSupport  }: AnyObj) => {
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
