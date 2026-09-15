/**
 * 电视 / 显示屏待机画面（poster）的 Canvas 2D 绘制。
 *
 * 位置：3D 工作室在没有真实电视画面时，用本模块把一张品牌宣传图渲染到
 *   电视屏幕的贴图 Canvas 上，作为待机海报。
 * 对外：只导出 drawTelevisionPoster 一个纯绘制函数，不持有状态。
 * 坐标约定：内部统一按 960×540 的「设计坐标系」作画（16:9 基准），
 *   函数开头用 scale 把它映射到实际画布尺寸，因此所有数值都是设计稿上的像素。
 */

/**
 * 在给定 2D 上下文上绘制待机海报。
 *
 * @param {{width: number, height: number}} canvasSize 目标画布尺寸（真实像素）。
 * @param {CanvasRenderingContext2D} context 目标绘制上下文。
 * @returns {void}
 */
export function drawTelevisionPoster(canvasSize, context) {
  // 先 save 再改缩放与文本对齐，函数结束 restore，保证不污染调用方的上下文状态。
  context.save();
  // 设计稿固定 960×540，按实际画布比例拉伸，两轴分别缩放以铺满不裁切。
  context.scale(canvasSize.width / 960, canvasSize.height / 540);
  context.fillStyle = "#07111d";
  context.fillRect(0, 0, 960, 540);
  // 左侧品牌区（0~510）底色略亮于整体背景，形成左右分栏。
  context.fillStyle = "#0f2031";
  context.fillRect(0, 0, 510, 540);
  // 品牌标题前的橙色竖条，是这套海报的统一标识元素。
  context.fillStyle = "#ff9f36";
  context.fillRect(54, 54, 12, 54);
  context.fillStyle = "#f4f8fb";
  context.font = "700 42px Arial, sans-serif";
  context.fillText("HomeOS", 88, 92);
  context.fillStyle = "#7f93a6";
  context.font = "600 15px Arial, sans-serif";
  context.fillText("SMART HOME, SIMPLY CONNECTED", 88, 119);
  // 中文主标题：两行固定断句，避免依赖字体度量做自动换行。
  context.fillStyle = "#ffffff";
  context.font = "700 48px sans-serif";
  context.fillText("让全屋设备", 54, 224);
  context.fillText("自然协作", 54, 286);
  context.fillStyle = "#9cafbf";
  context.font = "400 20px sans-serif";
  context.fillText("一张图，连接灯光、环境与家庭场景", 56, 331);
  // 三个分类图例横向等距排列，间距 142 与下方圆角卡片宽度绑定。
  [
    {
      label: "LIGHT",
      color: "#ff9f36"
    },
    {
      label: "CLIMATE",
      color: "#32c59b"
    },
    {
      label: "SECURITY",
      color: "#5c9dff"
    }
  ].forEach((legendItem, legendIndex) => {
    const legendX = 54 + legendIndex * 142;
    context.fillStyle = "#172d40";
    context.beginPath();
    context.roundRect(legendX, 398, 126, 54, 8);
    context.fill();
    // 卡片里的彩色小竖条用于区分分类，颜色取自图例自身。
    context.fillStyle = legendItem.color;
    context.fillRect(legendX + 14, 414, 8, 22);
    context.fillStyle = "#dbe5ed";
    context.font = "700 13px Arial, sans-serif";
    context.fillText(legendItem.label, legendX + 32, 432);
  });
  // 右侧状态区（x = 510 起）整块压深，作为数据卡片的背景。
  context.fillStyle = "#0a1624";
  context.fillRect(510, 0, 450, 540);
  // 顶部「HOME STATUS」大卡：先圆角底色，再依次画标题、主数值、状态圆点与副标题。
  context.fillStyle = "#15283a";
  context.beginPath();
  context.roundRect(552, 44, 366, 164, 12);
  context.fill();
  context.fillStyle = "#8295a6";
  context.font = "600 14px Arial, sans-serif";
  context.fillText("HOME STATUS", 578, 76);
  context.fillStyle = "#f5f8fb";
  context.font = "700 58px Arial, sans-serif";
  context.fillText("24°", 578, 148);
  // 运行状态圆点固定在卡片右上角；填色后要把 textAlign 改回 left，避免影响后续文本。
  context.fillStyle = "#32c59b";
  context.beginPath();
  context.arc(856, 118, 31, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#07111d";
  context.font = "700 17px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("ON", 856, 124);
  context.textAlign = "left";
  context.fillStyle = "#91a4b5";
  context.font = "400 15px Arial, sans-serif";
  context.fillText("COMFORT MODE · ALL SYSTEMS READY", 578, 181);
  // 下方四张小卡片按 2×2 排布：x 与 y 直接写死，与上面大卡的边距保持一致。
  const statusCards = [
    {
      x: 552,
      y: 230,
      color: "#ff9f36",
      value: "8",
      label: "LIGHTS"
    },
    {
      x: 742,
      y: 230,
      color: "#5c9dff",
      value: "4",
      label: "ROOMS"
    },
    {
      x: 552,
      y: 360,
      color: "#32c59b",
      value: "92%",
      label: "AIR"
    },
    {
      x: 742,
      y: 360,
      color: "#ef6580",
      value: "SAFE",
      label: "HOME"
    }
  ];
  for (const card of statusCards) {
    context.fillStyle = "#15283a";
    context.beginPath();
    context.roundRect(card.x, card.y, 176, 108, 10);
    context.fill();
    // 卡片左上角的短色条即分类标识，与左侧图例同色系。
    context.fillStyle = card.color;
    context.fillRect(card.x + 18, card.y + 18, 30, 5);
    context.fillStyle = "#f4f8fb";
    context.font = "700 29px Arial, sans-serif";
    context.fillText(card.value, card.x + 18, card.y + 66);
    context.fillStyle = "#8295a6";
    context.font = "600 12px Arial, sans-serif";
    context.fillText(card.label, card.x + 18, card.y + 89);
  }
  context.restore();
}
