/**
 * 电视演示画面（960×540，16:9）。
 *
 * 这张贴图整块贴在电视面板正面，**画面必须铺满整张画布**：任何一条留白的边，渲染到 3D
 * 里都会被读成「电视没有全屏」。旧版把版式排在 y≈100..470，底部留了 70 px（13%）的深色
 * 空带，看上去就是画面只占上半屏。现在按满幅排：顶部通栏细线、底部通栏状态条、左右两栏
 * 的卡片都排到画布边缘。
 */
export function drawTelevisionPoster(canvasElement: any, painter: any) {
  (painter.save(),
    painter.scale(canvasElement.width / 960, canvasElement.height / 540),
    // 满幅底色 + 左右分栏（两栏都铺到画布上下边缘）。
    (painter.fillStyle = "#0b1a29"),
    painter.fillRect(0, 0, 960, 540),
    (painter.fillStyle = "#102337"),
    painter.fillRect(0, 0, 510, 540),
    (painter.fillStyle = "#0a1826"),
    painter.fillRect(510, 0, 450, 540),
    // 顶部通栏细线：上边缘有内容，不会和机身黑边连成一条。
    (painter.fillStyle = "#1d3b55"),
    painter.fillRect(0, 0, 960, 6),
    // 左栏页眉。
    (painter.fillStyle = "#ff9f36"),
    painter.fillRect(54, 44, 12, 52),
    (painter.fillStyle = "#f4f8fb"),
    (painter.font = "700 40px Arial, sans-serif"),
    painter.fillText("HOMEOS", 88, 82),
    (painter.fillStyle = "#7f93a6"),
    (painter.font = "600 14px Arial, sans-serif"),
    painter.fillText("SMART HOME, SIMPLY CONNECTED", 88, 106),
    // 左栏主标题。
    (painter.fillStyle = "#ffffff"),
    (painter.font = "700 50px sans-serif"),
    painter.fillText("让全屋设备", 54, 228),
    painter.fillText("自然协作", 54, 290),
    (painter.fillStyle = "#9cafbf"),
    (painter.font = "400 19px sans-serif"),
    painter.fillText("一张图，连接灯光、环境与家庭场景", 56, 334));
  [
    {
      label: "LIGHT",
      color: "#ff9f36",
    },
    {
      label: "CLIMATE",
      color: "#32c59b",
    },
    {
      label: "SECURITY",
      color: "#5c9dff",
    },
  ].forEach((legendItem, legendIndex) => {
    const chipX = 54 + legendIndex * 146;
    ((painter.fillStyle = "#172d40"),
      painter.beginPath(),
      painter.roundRect(chipX, 392, 130, 62, 9),
      painter.fill(),
      (painter.fillStyle = legendItem.color),
      painter.fillRect(chipX + 14, 408, 8, 30),
      (painter.fillStyle = "#dbe5ed"),
      (painter.font = "700 13px Arial, sans-serif"),
      painter.fillText(legendItem.label, chipX + 32, 428));
  });
  // 右栏：HOME STATUS 主卡。
  ((painter.fillStyle = "#15283a"),
    painter.beginPath(),
    painter.roundRect(552, 40, 366, 168, 12),
    painter.fill(),
    (painter.fillStyle = "#8295a6"),
    (painter.font = "600 14px Arial, sans-serif"),
    painter.fillText("HOME STATUS", 578, 72),
    (painter.fillStyle = "#f5f8fb"),
    (painter.font = "700 58px Arial, sans-serif"),
    painter.fillText("24°", 578, 150),
    (painter.fillStyle = "#32c59b"),
    painter.beginPath(),
    painter.arc(856, 116, 31, 0, Math.PI * 2),
    painter.fill(),
    (painter.fillStyle = "#07111d"),
    (painter.font = "700 17px Arial, sans-serif"),
    (painter.textAlign = "center"),
    painter.fillText("ON", 856, 122),
    (painter.textAlign = "left"),
    (painter.fillStyle = "#91a4b5"),
    (painter.font = "400 15px Arial, sans-serif"),
    painter.fillText("COMFORT MODE · ALL SYSTEMS READY", 578, 184));
  const statCards = [
    {
      x: 552,
      y: 228,
      color: "#ff9f36",
      value: "8",
      label: "LIGHTS",
    },
    {
      x: 742,
      y: 228,
      color: "#5c9dff",
      value: "4",
      label: "ROOMS",
    },
    {
      x: 552,
      y: 352,
      color: "#32c59b",
      value: "92%",
      label: "AIR",
    },
    {
      x: 742,
      y: 352,
      color: "#ef6580",
      value: "SAFE",
      label: "HOME",
    },
  ];
  for (const statCard of statCards)
    ((painter.fillStyle = "#15283a"),
      painter.beginPath(),
      painter.roundRect(statCard.x, statCard.y, 176, 112, 10),
      painter.fill(),
      (painter.fillStyle = statCard.color),
      painter.fillRect(statCard.x + 18, statCard.y + 18, 30, 5),
      (painter.fillStyle = "#f4f8fb"),
      (painter.font = "700 29px Arial, sans-serif"),
      painter.fillText(statCard.value, statCard.x + 18, statCard.y + 68),
      (painter.fillStyle = "#8295a6"),
      (painter.font = "600 12px Arial, sans-serif"),
      painter.fillText(statCard.label, statCard.x + 18, statCard.y + 92));
  // 底部通栏状态条：画布最下缘永远是内容，不会露出黑边。
  ((painter.fillStyle = "#0d2032"),
    painter.fillRect(0, 484, 960, 56),
    (painter.fillStyle = "#1d3b55"),
    painter.fillRect(0, 484, 960, 2),
    (painter.fillStyle = "#32c59b"),
    painter.beginPath(),
    painter.arc(58, 512, 6, 0, Math.PI * 2),
    painter.fill(),
    (painter.fillStyle = "#c7d5e1"),
    (painter.font = "600 15px Arial, sans-serif"),
    painter.fillText("SYSTEM ONLINE", 76, 518),
    (painter.fillStyle = "#6d8398"),
    (painter.font = "400 14px Arial, sans-serif"),
    (painter.textAlign = "right"),
    painter.fillText("24°C · 8 LIGHTS · 4 ROOMS · AIR 92%", 902, 518),
    (painter.textAlign = "left"),
    painter.restore());
}
