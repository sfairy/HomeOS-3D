/*
 * 样式批量应用对话框。
 *
 * 把一组属性改动应用到同类组件：对话框的打开、目标列表渲染与逐类型的落盘。
 *
 * 由 static/editor/home.js 外提而来：这里只放函数，对 home.js 模块级状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 home.js 里的 getter/setter，读到的始终是调用时刻的值。
 */

import { clone } from "../editor-utils.js?v=2609221226";
import { componentLabel } from "../editor-component-collections.js?v=2609221226";

export function createStyleApplyDialogs(ctx) {

  /**
   * 生成「应用样式」对话框里的一行复选项。用 data 属性区分两种用途（data-navigation-style-property 勾选属性、
   * data-navigation-target-id 勾选目标控件），一个对话框里两处共用此函数。复选框默认勾选，符合「默认全应用」的操作习惯。
   */
  function createStyleApplyOption({
    value: applyOptionValue,
    label: applyOptionLabel,
    detail: optionDetail,
    target: isTargetOption = false
  }) {
    const applyOptionLabelElement = document.createElement("label");
    applyOptionLabelElement.className = "navigation-style-apply-option";
    const optionCheckboxElement = document.createElement("input");
    optionCheckboxElement.type = "checkbox";
    optionCheckboxElement.checked = true;
    if (isTargetOption) {
      optionCheckboxElement.dataset.navigationTargetId = applyOptionValue;
    } else {
      optionCheckboxElement.dataset.navigationStyleProperty = applyOptionValue;
    }
    const optionSpanElement = document.createElement("span");
    optionSpanElement.textContent = applyOptionLabel;
    if (optionDetail) {
      const applyOptionDetailElement = document.createElement("small");
      applyOptionDetailElement.textContent = optionDetail;
      optionSpanElement.append(applyOptionDetailElement);
    }
    applyOptionLabelElement.append(optionCheckboxElement, optionSpanElement);
    return applyOptionLabelElement;
  }

  /**
   * 渲染「应用样式」对话框里的目标选择区，按区域（shared 侧边栏 / 具体页面路径）与页面两级分组：先按 scope 归组，再套一层
   * 固定顺序的 ["shared", "page"] 小节——用固定顺序而非数据出现顺序，让同一份目标列表每次渲染的区块顺序一致、勾选时不跳位。
   * 每组生成「n/m 个控件」摘要与全选/取消按钮，勾选框的 value 用组件 id；detailResolver 既接受函数（按组件算描述）也接受字符串。
   */
  function renderStyleApplyTargets(applyTargets, detailResolver) {
    const targetsByGroupKey = new Map();
    applyTargets.forEach(
      ({ component: styleApplyTargetComponent, page: targetPage, scope: targetScope }) => {
        const targetGroupKey = targetScope === "shared" ? "shared" : targetPage;
        if (!targetsByGroupKey.has(targetGroupKey)) {
          targetsByGroupKey.set(targetGroupKey, {
            page: targetPage,
            scope: targetScope,
            components: []
          });
        }
        targetsByGroupKey.get(targetGroupKey).components.push(styleApplyTargetComponent);
      }
    );
    const scopeSectionsByScope = new Map();
    for (const targetScopeName of ["shared", "page"]) {
      if (!applyTargets.some(targetScopeProbe => targetScopeProbe.scope === targetScopeName)) {
        continue;
      }
      const scopeSectionElement = document.createElement("section");
      scopeSectionElement.className = "navigation-style-apply-scope";
      scopeSectionElement.dataset.styleApplyScope = targetScopeName;
      const scopeHeadingElement = document.createElement("h3");
      scopeHeadingElement.textContent = targetScopeName === "shared" ? "侧边栏" : "主页面";
      scopeSectionElement.append(scopeHeadingElement);
      scopeSectionsByScope.set(targetScopeName, scopeSectionElement);
    }
    for (const {
      page: groupPage,
      scope: groupScope,
      components: groupComponents
    } of targetsByGroupKey.values()) {
      const pageGroupSectionElement = document.createElement("section");
      pageGroupSectionElement.className = "navigation-style-apply-page-group";
      const pageHeadingWrapperElement = document.createElement("div");
      pageHeadingWrapperElement.className = "navigation-style-apply-page-heading";
      const pageHeadingElement = document.createElement("strong");
      pageHeadingElement.textContent =
        groupScope === "shared" ? "所有页面共享" : groupPage?.name || "未命名页面";
      const scopeLabel =
        groupScope === "shared" ? "侧边栏" : "主页面 · " + pageHeadingElement.textContent;
      const pageControlsElement = document.createElement("div");
      pageControlsElement.className = "navigation-style-apply-page-controls";
      const pageSummaryElement = document.createElement("span");
      const pageToggleButtonElement = document.createElement("button");
      pageToggleButtonElement.type = "button";
      pageToggleButtonElement.className = "navigation-style-apply-page-toggle";
      const pageOptionsElement = document.createElement("div");
      pageOptionsElement.className = "navigation-style-apply-page-options";
      pageOptionsElement.replaceChildren(
        ...groupComponents.map(optionComponent =>
          createStyleApplyOption({
            value: optionComponent.id,
            label: componentLabel(optionComponent),
            detail:
              typeof detailResolver == "function" ? detailResolver(optionComponent) : detailResolver,
            target: true
          })
        )
      );
      const targetCheckboxElements = [
        ...pageOptionsElement.querySelectorAll("[data-navigation-target-id]")
      ];
      /**
       * 局部汇总函数：一次算出「已选/总数」与「是否全选」，同步摘要文案、全选按钮文案及其 aria-label，
       * 避免在每次 change 里重复查询 DOM。
       */
      const updatePageSelectionSummary = () => {
        const checkedCount = targetCheckboxElements.filter(
          checkboxProbe => checkboxProbe.checked
        ).length;
        const allCheckboxesChecked = checkedCount === targetCheckboxElements.length;
        pageSummaryElement.textContent =
          checkedCount + "/" + targetCheckboxElements.length + " 个控件";
        pageToggleButtonElement.textContent = allCheckboxesChecked ? "取消全选" : "全选";
        pageToggleButtonElement.setAttribute(
          "aria-label",
          (allCheckboxesChecked ? "取消选择" : "全选") + "“" + scopeLabel + "”中的控件"
        );
      };
      pageToggleButtonElement.addEventListener("click", () => {
        const nextCheckedState = !targetCheckboxElements.every(
          checkboxCandidate => checkboxCandidate.checked
        );
        targetCheckboxElements.forEach(checkboxTarget => {
          checkboxTarget.checked = nextCheckedState;
        });
        updatePageSelectionSummary();
      });
      pageOptionsElement.addEventListener("change", updatePageSelectionSummary);
      pageControlsElement.append(pageSummaryElement, pageToggleButtonElement);
      pageHeadingWrapperElement.append(pageHeadingElement, pageControlsElement);
      pageGroupSectionElement.append(pageHeadingWrapperElement, pageOptionsElement);
      updatePageSelectionSummary();
      scopeSectionsByScope.get(groupScope).append(pageGroupSectionElement);
    }
    ctx.navigationStyleApplyTargetsElement.classList.add("grouped-by-page");
    ctx.navigationStyleApplyTargetsElement.replaceChildren(...scopeSectionsByScope.values());
  }

  /**
   * 打开「应用导航按钮设置」对话框，把当前导航按钮的净样式变更复制到其他导航按钮。只有同时存在净变更
   * （collectNavigationStyleChanges）与可替换目标（findReplaceableComponents）时才弹出，否则静默返回——空对话框没有意义。
   * 各类型共用同一套对话框 DOM，这里只改写标题、摘要、属性行与目标行，并记下 appliedStyleRecord 供「应用」按钮反查来源与类型。
   */
  function openNavigationStyleApplyDialog() {
    const sourceNavigationComponent = ctx.selectedComponent();
    if (!sourceNavigationComponent || sourceNavigationComponent.type !== "navigation-button") {
      return;
    }
    const navigationStyleChanges = ctx.collectNavigationStyleChanges(sourceNavigationComponent);
    const navigationReplaceableComponents = ctx.findReplaceableComponents(sourceNavigationComponent);
    if (!!navigationStyleChanges.length && !!navigationReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用导航按钮设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到导航按钮";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceNavigationComponent) +
        "”中选定的修改应用到选中的导航按钮。图标名称、文字内容、目标页面、备注和位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...navigationStyleChanges.map(navigationStyleKey => {
          const navigationStyleDefinition = ctx.navigationStylePropertyDefinitions[navigationStyleKey];
          const navigationStyleCurrentValue = ctx.getNavigationStyleValue(
            sourceNavigationComponent,
            navigationStyleKey
          );
          return createStyleApplyOption({
            value: navigationStyleKey,
            label: navigationStyleDefinition.label,
            detail:
              navigationStyleDefinition.group +
              " · " +
              ctx.formatNavigationStyleValue(navigationStyleKey, navigationStyleCurrentValue)
          });
        })
      );
      renderStyleApplyTargets(navigationReplaceableComponents, targetNavigationComponent => {
        const targetNavigationPagePath =
          targetNavigationComponent.properties?.targetPage ||
          targetNavigationComponent.actions?.tap?.target ||
          "";
        const targetPageRecord = ctx.activeProject.document.pages.find(
          stylePageRecord => stylePageRecord.path === targetNavigationPagePath
        );
        if (targetPageRecord) {
          return "跳转到：" + targetPageRecord.name;
        } else {
          return "未设置目标页面";
        }
      });
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceNavigationComponent.id,
        type: "navigation-button"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用底图框设置」对话框，把当前底图框的净样式变更复制到其他底图框。同样要求有变更且有目标才弹出；
   * 目标行说明是固定文案（底图框没有需要额外展示的绑定信息），同时写入 appliedStyleRecord 记录本次来源。
   */
  function openPanelFrameStyleApplyDialog() {
    const sourcePanelFrameComponent = ctx.selectedComponent();
    if (!sourcePanelFrameComponent || sourcePanelFrameComponent.type !== "panel-frame") {
      return;
    }
    const panelFrameStyleChanges = ctx.collectPanelFrameStyleChanges(sourcePanelFrameComponent);
    const panelFrameReplaceableComponents = ctx.findReplaceableComponents(sourcePanelFrameComponent);
    if (!!panelFrameStyleChanges.length && !!panelFrameReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用底图框设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到底图框";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourcePanelFrameComponent) +
        "”中选定的修改应用到选中的底图框。文字内容、备注和位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...panelFrameStyleChanges.map(panelFrameStyleKey => {
          const panelFrameStyleDefinition = ctx.panelFrameStylePropertyDefinitions[panelFrameStyleKey];
          const panelFrameStyleCurrentValue = ctx.getPanelFrameStyleValue(
            sourcePanelFrameComponent,
            panelFrameStyleKey
          );
          return createStyleApplyOption({
            value: panelFrameStyleKey,
            label: panelFrameStyleDefinition.label,
            detail:
              panelFrameStyleDefinition.group +
              " · " +
              ctx.formatPanelFrameStyleValue(panelFrameStyleKey, panelFrameStyleCurrentValue)
          });
        })
      );
      renderStyleApplyTargets(panelFrameReplaceableComponents, "底图框");
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourcePanelFrameComponent.id,
        type: "panel-frame"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用摄像头实时预览设置」对话框，把当前摄像头的净变更复制到其他摄像头。摘要里明确列出「实体、备注、动作和
   * 控件位置不会改变」，减少用户对批量操作的顾虑；目标行文案固定，变更条件仍是有变更且有目标。
   */
  function openCameraStyleApplyDialog() {
    const sourceCameraComponent = ctx.selectedComponent();
    if (!sourceCameraComponent || sourceCameraComponent.type !== "camera") {
      return;
    }
    const cameraStyleChanges = ctx.collectCameraChangedProperties(sourceCameraComponent);
    const cameraReplaceableComponents = ctx.findReplaceableComponents(sourceCameraComponent);
    if (!!cameraStyleChanges.length && !!cameraReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用摄像头实时预览设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到摄像头实时预览";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceCameraComponent) +
        "”中选定的修改应用到选中的摄像头实时预览。实体、备注、动作和控件位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...cameraStyleChanges.map(cameraStyleKey => {
          const cameraStyleDefinition = ctx.cameraPropertyDefinitions[cameraStyleKey];
          const cameraStyleCurrentValue = ctx.getCameraPropertyValue(
            sourceCameraComponent,
            cameraStyleKey
          );
          return createStyleApplyOption({
            value: cameraStyleKey,
            label: cameraStyleDefinition.label,
            detail:
              cameraStyleDefinition.group +
              " · " +
              ctx.formatCameraPropertyValue(cameraStyleKey, cameraStyleCurrentValue)
          });
        })
      );
      renderStyleApplyTargets(cameraReplaceableComponents, "摄像头实时预览");
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceCameraComponent.id,
        type: "camera"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用标题按钮设置」对话框，把当前标题按钮的净变更复制到其他标题按钮。
   *
   * @returns {void}
   */
  function openTitleButtonStyleApplyDialog() {
    const sourceTitleButtonComponent = ctx.selectedComponent();
    if (!sourceTitleButtonComponent || sourceTitleButtonComponent.type !== "title-button") {
      return;
    }
    const titleButtonStyleChanges = ctx.collectTitleButtonChangedProperties(sourceTitleButtonComponent);
    const titleButtonReplaceableComponents = ctx.findReplaceableComponents(sourceTitleButtonComponent);
    if (!!titleButtonStyleChanges.length && !!titleButtonReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用标题按钮设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到标题按钮";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceTitleButtonComponent) +
        "”中选定的修改应用到选中的标题按钮。文字内容、图标名称、备注、动作和控件中心位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...titleButtonStyleChanges.map(titleButtonStyleKey => {
          const titleButtonStyleDefinition = ctx.titleButtonPropertyDefinitions[titleButtonStyleKey];
          const titleButtonStyleCurrentValue = ctx.getTitleButtonPropertyValue(
            sourceTitleButtonComponent,
            titleButtonStyleKey
          );
          return createStyleApplyOption({
            value: titleButtonStyleKey,
            label: titleButtonStyleDefinition.label,
            detail:
              titleButtonStyleDefinition.group +
              " · " +
              ctx.formatTitleButtonPropertyValue(titleButtonStyleKey, titleButtonStyleCurrentValue)
          });
        })
      );
      renderStyleApplyTargets(titleButtonReplaceableComponents, "标题按钮");
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceTitleButtonComponent.id,
        type: "title-button"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用图标按钮（效果）设置」对话框，把当前控件的净变更复制到同类型控件。
   *
   * @returns {void}
   */
  function openIconButtonEffectStyleApplyDialog() {
    const sourceIconButtonEffectComponent = ctx.selectedComponent();
    if (
      !sourceIconButtonEffectComponent ||
      sourceIconButtonEffectComponent.type !== "icon-button-effect"
    ) {
      return;
    }
    const iconButtonEffectStyleChanges = ctx.collectIconButtonEffectChangedProperties(
      sourceIconButtonEffectComponent
    );
    const iconButtonEffectReplaceableComponents = ctx.findReplaceableComponents(
      sourceIconButtonEffectComponent
    );
    if (!!iconButtonEffectStyleChanges.length && !!iconButtonEffectReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用图标按钮（效果）设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceIconButtonEffectComponent) +
        "”中选定的修改应用到选中的图标按钮（效果）。实体、备注、动作和按钮位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...iconButtonEffectStyleChanges.map(iconButtonEffectStyleKey => {
          const iconButtonEffectStyleDefinition =
            ctx.iconButtonEffectPropertyDefinitions[iconButtonEffectStyleKey];
          const iconButtonEffectStyleCurrentValue = ctx.getIconButtonEffectPropertyValue(
            sourceIconButtonEffectComponent,
            iconButtonEffectStyleKey
          );
          return createStyleApplyOption({
            value: iconButtonEffectStyleKey,
            label: iconButtonEffectStyleDefinition.label,
            detail:
              iconButtonEffectStyleDefinition.group +
              " · " +
              ctx.formatIconButtonEffectPropertyValue(
                iconButtonEffectStyleKey,
                iconButtonEffectStyleCurrentValue
              )
          });
        })
      );
      renderStyleApplyTargets(iconButtonEffectReplaceableComponents, "图标按钮（效果）");
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceIconButtonEffectComponent.id,
        type: "icon-button-effect"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用空调设置」对话框，把当前空调控件的净变更复制到其他空调控件。
   *
   * @returns {void}
   */
  function openAirConditionerStyleApplyDialog() {
    const sourceAirConditionerComponent = ctx.selectedComponent();
    if (!sourceAirConditionerComponent || sourceAirConditionerComponent.type !== "air-conditioner") {
      return;
    }
    const airConditionerStyleChanges = ctx.collectAirConditionerChangedProperties(
      sourceAirConditionerComponent
    );
    const airConditionerReplaceableComponents = ctx.findReplaceableComponents(
      sourceAirConditionerComponent
    );
    if (!!airConditionerStyleChanges.length && !!airConditionerReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用空调设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceAirConditionerComponent) +
        "”中选定的修改应用到选中的空调控件。实体、备注、文字内容、动作和按钮位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...airConditionerStyleChanges.map(airConditionerStyleKey => {
          const airConditionerStyleDefinition =
            ctx.airConditionerPropertyDefinitions[airConditionerStyleKey];
          const airConditionerStyleCurrentValue = ctx.getAirConditionerPropertyValue(
            sourceAirConditionerComponent,
            airConditionerStyleKey
          );
          return createStyleApplyOption({
            value: airConditionerStyleKey,
            label: airConditionerStyleDefinition.label,
            detail:
              airConditionerStyleDefinition.group +
              " · " +
              ctx.formatAirConditionerPropertyValue(
                airConditionerStyleKey,
                airConditionerStyleCurrentValue
              )
          });
        })
      );
      renderStyleApplyTargets(airConditionerReplaceableComponents, "空调");
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceAirConditionerComponent.id,
        type: "air-conditioner"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用图标/设备按钮或传感器设置」对话框。三种组件共用此入口：传感器按品类取中文名（resolveSensorKindLabel），
   * 设备按钮与图标按钮用固定文案，标题与目标行都带上这个名称，让用户明确批量的作用范围；appliedStyleRecord.type 记真实组件类型。
   */
  function openIconButtonStyleApplyDialog() {
    const sourceIconButtonComponent = ctx.selectedComponent();
    if (
      !sourceIconButtonComponent ||
      !["icon-button", "device-button", "presence-sensor"].includes(sourceIconButtonComponent.type)
    ) {
      return;
    }
    const iconButtonTypeLabel =
      sourceIconButtonComponent.type === "presence-sensor"
        ? ctx.resolveSensorKindLabel(sourceIconButtonComponent)
        : sourceIconButtonComponent.type === "device-button"
          ? "设备按钮"
          : "图标按钮";
    const iconButtonStyleChanges = ctx.collectIconButtonChangedProperties(sourceIconButtonComponent);
    const iconButtonReplaceableComponents = ctx.findReplaceableComponents(sourceIconButtonComponent);
    if (!!iconButtonStyleChanges.length && !!iconButtonReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用" + iconButtonTypeLabel + "设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到同类型控件";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceIconButtonComponent) +
        "”中选定的修改应用到选中的" +
        iconButtonTypeLabel +
        "。实体、备注、图标名称、文字内容和位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...iconButtonStyleChanges.map(iconButtonStyleKey => {
          const iconButtonStyleDefinition = ctx.resolveIconButtonPropertyDefinition(
            sourceIconButtonComponent,
            iconButtonStyleKey
          );
          const iconButtonStyleCurrentValue = ctx.getIconButtonPropertyValue(
            sourceIconButtonComponent,
            iconButtonStyleKey
          );
          return createStyleApplyOption({
            value: iconButtonStyleKey,
            label: iconButtonStyleDefinition.label,
            detail:
              iconButtonStyleDefinition.group +
              " · " +
              ctx.formatIconButtonPropertyValue(iconButtonStyleKey, iconButtonStyleCurrentValue)
          });
        })
      );
      renderStyleApplyTargets(iconButtonReplaceableComponents, iconButtonTypeLabel);
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceIconButtonComponent.id,
        type: sourceIconButtonComponent.type
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 打开「应用折线图设置」对话框，把当前折线图的净变更复制到其他折线图。目标行展示各自绑定的数值实体 ID
   * （缺省显示「未设置数值实体」），因为折线图之间最容易混淆的就是绑定了哪个实体。
   */
  function openLineChartStyleApplyDialog() {
    const sourceLineChartComponent = ctx.selectedComponent();
    if (!sourceLineChartComponent || sourceLineChartComponent.type !== "line-chart") {
      return;
    }
    const lineChartStyleChanges = ctx.collectLineChartChangedProperties(sourceLineChartComponent);
    const lineChartReplaceableComponents = ctx.findReplaceableComponents(sourceLineChartComponent);
    if (!!lineChartStyleChanges.length && !!lineChartReplaceableComponents.length) {
      ctx.navigationStyleApplyTitleElement.textContent = "应用折线图设置";
      ctx.navigationStyleApplyTargetHeadingElement.textContent = "应用到折线图";
      ctx.navigationStyleApplyTargetScopeElement.textContent = "按区域与页面区分";
      ctx.navigationStyleApplySummaryElement.textContent =
        "将“" +
        componentLabel(sourceLineChartComponent) +
        "”中选定的修改应用到选中的折线图。数值实体、备注、动作和位置不会改变。";
      ctx.navigationStyleApplyPropertiesElement.replaceChildren(
        ...lineChartStyleChanges.map(lineChartStyleKey => {
          const lineChartStyleDefinition = ctx.lineChartPropertyDefinitions[lineChartStyleKey];
          const lineChartStyleCurrentValue = ctx.getLineChartPropertyValue(
            sourceLineChartComponent,
            lineChartStyleKey
          );
          return createStyleApplyOption({
            value: lineChartStyleKey,
            label: lineChartStyleDefinition.label,
            detail:
              lineChartStyleDefinition.group +
              " · " +
              ctx.formatLineChartPropertyValue(lineChartStyleKey, lineChartStyleCurrentValue)
          });
        })
      );
      renderStyleApplyTargets(
        lineChartReplaceableComponents,
        styleSummaryComponent => styleSummaryComponent.bindings?.entity?.entityId || "未设置数值实体"
      );
      ctx.navigationStyleApplyMessageElement.hidden = true;
      ctx.navigationStyleApplyMessageElement.textContent = "";
      ctx.appliedStyleRecord = {
        sourceId: sourceLineChartComponent.id,
        type: "line-chart"
      };
      ctx.navigationStyleApplyDialogElement.showModal();
    }
  }

  /**
   * 把导航按钮的某个样式属性就地写入目标组件（目标为文档草稿里的副本）。宽高改变时以目标原有中心为锚点反推左上角，
   * 避免批量应用后控件跑位；scale 写 style、rotation 写 position、其余写 properties。取值先 clone，防止目标与源共享
   * 同一个数组/对象引用（如透视四角、阈值配色）。
   */
  function applyStyleChangeToComponent(styleSourceComponent, styleTargetComponent, stylePropertyKey) {
    const stylePropertyValue = clone(ctx.getNavigationStyleValue(styleSourceComponent, stylePropertyKey));
    if (stylePropertyKey === "width") {
      const styleCenterX =
        Number(styleTargetComponent.position?.x || 0) +
        Number(styleTargetComponent.position?.width || 100) / 2;
      styleTargetComponent.position = {
        ...(styleTargetComponent.position || {}),
        x: styleCenterX - Number(stylePropertyValue) / 2,
        width: Number(stylePropertyValue)
      };
      return;
    }
    if (stylePropertyKey === "height") {
      const styleCenterY =
        Number(styleTargetComponent.position?.y || 0) +
        Number(styleTargetComponent.position?.height || 100) / 2;
      styleTargetComponent.position = {
        ...(styleTargetComponent.position || {}),
        y: styleCenterY - Number(stylePropertyValue) / 2,
        height: Number(stylePropertyValue)
      };
      return;
    }
    if (stylePropertyKey === "scale") {
      styleTargetComponent.style = {
        ...(styleTargetComponent.style || {}),
        scale: Number(stylePropertyValue)
      };
      return;
    }
    if (stylePropertyKey === "rotation") {
      styleTargetComponent.position = {
        ...(styleTargetComponent.position || {}),
        rotation: Number(stylePropertyValue)
      };
      return;
    }
    styleTargetComponent.properties = {
      ...(styleTargetComponent.properties || {}),
      [stylePropertyKey]: stylePropertyValue
    };
  }

  /**
   * 把底图框的某个样式属性就地写入目标框，宽高同样以目标中心为锚点保位。
   */
  function applyPanelFrameStyleChange(
    panelFrameApplySourceComponent,
    panelFrameApplyTargetComponent,
    panelFrameApplyPropertyKey
  ) {
    const panelFrameApplyPropertyValue = clone(
      ctx.getPanelFrameStyleValue(panelFrameApplySourceComponent, panelFrameApplyPropertyKey)
    );
    if (panelFrameApplyPropertyKey === "width") {
      const panelFrameApplyCenterX =
        Number(panelFrameApplyTargetComponent.position?.x || 0) +
        Number(panelFrameApplyTargetComponent.position?.width || 100) / 2;
      panelFrameApplyTargetComponent.position = {
        ...(panelFrameApplyTargetComponent.position || {}),
        x: panelFrameApplyCenterX - Number(panelFrameApplyPropertyValue) / 2,
        width: Number(panelFrameApplyPropertyValue)
      };
      return;
    }
    if (panelFrameApplyPropertyKey === "height") {
      const panelFrameApplyCenterY =
        Number(panelFrameApplyTargetComponent.position?.y || 0) +
        Number(panelFrameApplyTargetComponent.position?.height || 100) / 2;
      panelFrameApplyTargetComponent.position = {
        ...(panelFrameApplyTargetComponent.position || {}),
        y: panelFrameApplyCenterY - Number(panelFrameApplyPropertyValue) / 2,
        height: Number(panelFrameApplyPropertyValue)
      };
      return;
    }
    if (panelFrameApplyPropertyKey === "scale") {
      panelFrameApplyTargetComponent.style = {
        ...(panelFrameApplyTargetComponent.style || {}),
        scale: Number(panelFrameApplyPropertyValue)
      };
      return;
    }
    if (panelFrameApplyPropertyKey === "rotation") {
      panelFrameApplyTargetComponent.position = {
        ...(panelFrameApplyTargetComponent.position || {}),
        rotation: Number(panelFrameApplyPropertyValue)
      };
      return;
    }
    panelFrameApplyTargetComponent.properties = {
      ...(panelFrameApplyTargetComponent.properties || {}),
      [panelFrameApplyPropertyKey]: panelFrameApplyPropertyValue
    };
  }

  /**
   * 把摄像头的某个属性就地写入目标摄像头，宽高以目标中心为锚点保位。
   */
  function applyCameraStyleChange(
    cameraApplySourceComponent,
    cameraApplyTargetComponent,
    cameraApplyPropertyKey
  ) {
    const cameraApplyPropertyValue = clone(
      ctx.getCameraPropertyValue(cameraApplySourceComponent, cameraApplyPropertyKey)
    );
    if (cameraApplyPropertyKey === "width") {
      const cameraApplyCenterX =
        Number(cameraApplyTargetComponent.position?.x || 0) +
        Number(cameraApplyTargetComponent.position?.width || 100) / 2;
      cameraApplyTargetComponent.position = {
        ...(cameraApplyTargetComponent.position || {}),
        x: cameraApplyCenterX - Number(cameraApplyPropertyValue) / 2,
        width: Number(cameraApplyPropertyValue)
      };
      return;
    }
    if (cameraApplyPropertyKey === "height") {
      const cameraApplyCenterY =
        Number(cameraApplyTargetComponent.position?.y || 0) +
        Number(cameraApplyTargetComponent.position?.height || 100) / 2;
      cameraApplyTargetComponent.position = {
        ...(cameraApplyTargetComponent.position || {}),
        y: cameraApplyCenterY - Number(cameraApplyPropertyValue) / 2,
        height: Number(cameraApplyPropertyValue)
      };
      return;
    }
    if (cameraApplyPropertyKey === "scale") {
      cameraApplyTargetComponent.style = {
        ...(cameraApplyTargetComponent.style || {}),
        scale: Number(cameraApplyPropertyValue)
      };
      return;
    }
    if (cameraApplyPropertyKey === "rotation") {
      cameraApplyTargetComponent.position = {
        ...(cameraApplyTargetComponent.position || {}),
        rotation: Number(cameraApplyPropertyValue)
      };
      return;
    }
    cameraApplyTargetComponent.properties = {
      ...(cameraApplyTargetComponent.properties || {}),
      [cameraApplyPropertyKey]: cameraApplyPropertyValue
    };
  }

  /**
   * 把折线图的某个属性就地写入目标折线图，宽高以目标中心为锚点保位。
   */
  function applyLineChartStyleChange(
    lineChartApplySourceComponent,
    lineChartApplyTargetComponent,
    lineChartApplyPropertyKey
  ) {
    const lineChartApplyPropertyValue = clone(
      ctx.getLineChartPropertyValue(lineChartApplySourceComponent, lineChartApplyPropertyKey)
    );
    if (lineChartApplyPropertyKey === "width") {
      const lineChartApplyCenterX =
        Number(lineChartApplyTargetComponent.position?.x || 0) +
        Number(lineChartApplyTargetComponent.position?.width || 100) / 2;
      lineChartApplyTargetComponent.position = {
        ...(lineChartApplyTargetComponent.position || {}),
        x: lineChartApplyCenterX - Number(lineChartApplyPropertyValue) / 2,
        width: Number(lineChartApplyPropertyValue)
      };
      return;
    }
    if (lineChartApplyPropertyKey === "height") {
      const lineChartApplyCenterY =
        Number(lineChartApplyTargetComponent.position?.y || 0) +
        Number(lineChartApplyTargetComponent.position?.height || 100) / 2;
      lineChartApplyTargetComponent.position = {
        ...(lineChartApplyTargetComponent.position || {}),
        y: lineChartApplyCenterY - Number(lineChartApplyPropertyValue) / 2,
        height: Number(lineChartApplyPropertyValue)
      };
      return;
    }
    if (lineChartApplyPropertyKey === "scale") {
      lineChartApplyTargetComponent.style = {
        ...(lineChartApplyTargetComponent.style || {}),
        scale: Number(lineChartApplyPropertyValue)
      };
      return;
    }
    if (lineChartApplyPropertyKey === "rotation") {
      lineChartApplyTargetComponent.position = {
        ...(lineChartApplyTargetComponent.position || {}),
        rotation: Number(lineChartApplyPropertyValue)
      };
      return;
    }
    lineChartApplyTargetComponent.properties = {
      ...(lineChartApplyTargetComponent.properties || {}),
      [lineChartApplyPropertyKey]: lineChartApplyPropertyValue
    };
  }

  /**
   * 把「图标按钮效果」的某个属性就地写入目标控件，宽高以目标中心为锚点保位。
   */
  function applyIconButtonEffectStyleChange(
    iconButtonEffectApplySourceComponent,
    iconButtonEffectApplyTargetComponent,
    iconButtonEffectApplyPropertyKey
  ) {
    const iconButtonEffectApplyPropertyValue = clone(
      ctx.getIconButtonEffectPropertyValue(
        iconButtonEffectApplySourceComponent,
        iconButtonEffectApplyPropertyKey
      )
    );
    if (iconButtonEffectApplyPropertyKey === "width") {
      const iconButtonEffectApplyCenterX =
        Number(iconButtonEffectApplyTargetComponent.position?.x || 0) +
        Number(iconButtonEffectApplyTargetComponent.position?.width || 100) / 2;
      iconButtonEffectApplyTargetComponent.position = {
        ...(iconButtonEffectApplyTargetComponent.position || {}),
        x: iconButtonEffectApplyCenterX - Number(iconButtonEffectApplyPropertyValue) / 2,
        width: Number(iconButtonEffectApplyPropertyValue)
      };
      return;
    }
    if (iconButtonEffectApplyPropertyKey === "height") {
      const iconButtonEffectApplyCenterY =
        Number(iconButtonEffectApplyTargetComponent.position?.y || 0) +
        Number(iconButtonEffectApplyTargetComponent.position?.height || 100) / 2;
      iconButtonEffectApplyTargetComponent.position = {
        ...(iconButtonEffectApplyTargetComponent.position || {}),
        y: iconButtonEffectApplyCenterY - Number(iconButtonEffectApplyPropertyValue) / 2,
        height: Number(iconButtonEffectApplyPropertyValue)
      };
      return;
    }
    if (iconButtonEffectApplyPropertyKey === "scale") {
      iconButtonEffectApplyTargetComponent.style = {
        ...(iconButtonEffectApplyTargetComponent.style || {}),
        scale: Number(iconButtonEffectApplyPropertyValue)
      };
      return;
    }
    if (iconButtonEffectApplyPropertyKey === "rotation") {
      iconButtonEffectApplyTargetComponent.position = {
        ...(iconButtonEffectApplyTargetComponent.position || {}),
        rotation: Number(iconButtonEffectApplyPropertyValue)
      };
      return;
    }
    iconButtonEffectApplyTargetComponent.properties = {
      ...(iconButtonEffectApplyTargetComponent.properties || {}),
      [iconButtonEffectApplyPropertyKey]: iconButtonEffectApplyPropertyValue
    };
  }

  /**
   * 把标题按钮的某个属性就地写入目标标题按钮，宽高以目标中心为锚点保位。
   */
  function applyTitleButtonStyleChange(
    titleButtonApplySourceComponent,
    titleButtonApplyTargetComponent,
    titleButtonApplyPropertyKey
  ) {
    const titleButtonApplyPropertyValue = clone(
      ctx.getTitleButtonPropertyValue(titleButtonApplySourceComponent, titleButtonApplyPropertyKey)
    );
    if (titleButtonApplyPropertyKey === "width") {
      const titleButtonApplyCenterX =
        Number(titleButtonApplyTargetComponent.position?.x || 0) +
        Number(titleButtonApplyTargetComponent.position?.width || 100) / 2;
      titleButtonApplyTargetComponent.position = {
        ...(titleButtonApplyTargetComponent.position || {}),
        x: titleButtonApplyCenterX - Number(titleButtonApplyPropertyValue) / 2,
        width: Number(titleButtonApplyPropertyValue)
      };
      return;
    }
    if (titleButtonApplyPropertyKey === "height") {
      const titleButtonApplyCenterY =
        Number(titleButtonApplyTargetComponent.position?.y || 0) +
        Number(titleButtonApplyTargetComponent.position?.height || 100) / 2;
      titleButtonApplyTargetComponent.position = {
        ...(titleButtonApplyTargetComponent.position || {}),
        y: titleButtonApplyCenterY - Number(titleButtonApplyPropertyValue) / 2,
        height: Number(titleButtonApplyPropertyValue)
      };
      return;
    }
    if (titleButtonApplyPropertyKey === "scale") {
      titleButtonApplyTargetComponent.style = {
        ...(titleButtonApplyTargetComponent.style || {}),
        scale: Number(titleButtonApplyPropertyValue)
      };
      return;
    }
    if (titleButtonApplyPropertyKey === "rotation") {
      titleButtonApplyTargetComponent.position = {
        ...(titleButtonApplyTargetComponent.position || {}),
        rotation: Number(titleButtonApplyPropertyValue)
      };
      return;
    }
    titleButtonApplyTargetComponent.properties = {
      ...(titleButtonApplyTargetComponent.properties || {}),
      [titleButtonApplyPropertyKey]: titleButtonApplyPropertyValue
    };
  }

  /**
   * 把图标/设备按钮或传感器的某个属性就地写入目标控件，宽高以目标中心为锚点保位。
   */
  function applyIconButtonStyleChange(
    iconButtonApplySourceComponent,
    iconButtonApplyTargetComponent,
    iconButtonApplyPropertyKey
  ) {
    const iconButtonApplyPropertyValue = clone(
      ctx.getIconButtonPropertyValue(iconButtonApplySourceComponent, iconButtonApplyPropertyKey)
    );
    if (iconButtonApplyPropertyKey === "width") {
      const iconButtonApplyCenterX =
        Number(iconButtonApplyTargetComponent.position?.x || 0) +
        Number(iconButtonApplyTargetComponent.position?.width || 100) / 2;
      iconButtonApplyTargetComponent.position = {
        ...(iconButtonApplyTargetComponent.position || {}),
        x: iconButtonApplyCenterX - Number(iconButtonApplyPropertyValue) / 2,
        width: Number(iconButtonApplyPropertyValue)
      };
      return;
    }
    if (iconButtonApplyPropertyKey === "height") {
      const iconButtonApplyCenterY =
        Number(iconButtonApplyTargetComponent.position?.y || 0) +
        Number(iconButtonApplyTargetComponent.position?.height || 100) / 2;
      iconButtonApplyTargetComponent.position = {
        ...(iconButtonApplyTargetComponent.position || {}),
        y: iconButtonApplyCenterY - Number(iconButtonApplyPropertyValue) / 2,
        height: Number(iconButtonApplyPropertyValue)
      };
      return;
    }
    if (iconButtonApplyPropertyKey === "scale") {
      iconButtonApplyTargetComponent.style = {
        ...(iconButtonApplyTargetComponent.style || {}),
        scale: Number(iconButtonApplyPropertyValue)
      };
      return;
    }
    if (iconButtonApplyPropertyKey === "rotation") {
      iconButtonApplyTargetComponent.position = {
        ...(iconButtonApplyTargetComponent.position || {}),
        rotation: Number(iconButtonApplyPropertyValue)
      };
      return;
    }
    iconButtonApplyTargetComponent.properties = {
      ...(iconButtonApplyTargetComponent.properties || {}),
      [iconButtonApplyPropertyKey]: iconButtonApplyPropertyValue
    };
  }

  /**
   * 把空调控件的某个属性就地写入目标空调控件，宽高以目标中心为锚点保位。
   */
  function applyAirConditionerStyleChange(
    airConditionerApplySourceComponent,
    airConditionerApplyTargetComponent,
    airConditionerApplyPropertyKey
  ) {
    const airConditionerApplyPropertyValue = clone(
      ctx.getAirConditionerPropertyValue(
        airConditionerApplySourceComponent,
        airConditionerApplyPropertyKey
      )
    );
    if (airConditionerApplyPropertyKey === "width") {
      const airConditionerApplyCenterX =
        Number(airConditionerApplyTargetComponent.position?.x || 0) +
        Number(airConditionerApplyTargetComponent.position?.width || 100) / 2;
      airConditionerApplyTargetComponent.position = {
        ...(airConditionerApplyTargetComponent.position || {}),
        x: airConditionerApplyCenterX - Number(airConditionerApplyPropertyValue) / 2,
        width: Number(airConditionerApplyPropertyValue)
      };
      return;
    }
    if (airConditionerApplyPropertyKey === "height") {
      const airConditionerApplyCenterY =
        Number(airConditionerApplyTargetComponent.position?.y || 0) +
        Number(airConditionerApplyTargetComponent.position?.height || 100) / 2;
      airConditionerApplyTargetComponent.position = {
        ...(airConditionerApplyTargetComponent.position || {}),
        y: airConditionerApplyCenterY - Number(airConditionerApplyPropertyValue) / 2,
        height: Number(airConditionerApplyPropertyValue)
      };
      return;
    }
    if (airConditionerApplyPropertyKey === "scale") {
      airConditionerApplyTargetComponent.style = {
        ...(airConditionerApplyTargetComponent.style || {}),
        scale: Number(airConditionerApplyPropertyValue)
      };
      return;
    }
    if (airConditionerApplyPropertyKey === "rotation") {
      airConditionerApplyTargetComponent.position = {
        ...(airConditionerApplyTargetComponent.position || {}),
        rotation: Number(airConditionerApplyPropertyValue)
      };
      return;
    }
    airConditionerApplyTargetComponent.properties = {
      ...(airConditionerApplyTargetComponent.properties || {}),
      [airConditionerApplyPropertyKey]: airConditionerApplyPropertyValue
    };
  }

  return { applyAirConditionerStyleChange, applyCameraStyleChange, applyIconButtonEffectStyleChange, applyIconButtonStyleChange, applyLineChartStyleChange, applyPanelFrameStyleChange, applyStyleChangeToComponent, applyTitleButtonStyleChange, createStyleApplyOption, openAirConditionerStyleApplyDialog, openCameraStyleApplyDialog, openIconButtonEffectStyleApplyDialog, openIconButtonStyleApplyDialog, openLineChartStyleApplyDialog, openNavigationStyleApplyDialog, openPanelFrameStyleApplyDialog, openTitleButtonStyleApplyDialog, renderStyleApplyTargets };
}
