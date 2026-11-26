/**
 * 编辑器与舞台的**通用状态文案**（0.8.9 `home.js` / `studio-app.js` / `stage.js`）。
 *
 * 为什么集中：这些句子分布在保存、加载、模型删除、光影切换、缓存降级等多个入口，
 * 上游也是散写的；散写的结果是「同一件事三种说法」（例如三条不同的保存失败提示）。
 * 集中成一份后，每个入口只能从这里取，措辞无法再漂移。
 */

/** 保存 / 草稿。 */
export const SAVE_COPY = Object.freeze({
  retryable: '可重试保存。若持续失败，请打开「日志」查看这次请求。',
  retry: '重试保存',
  noChanges: '没有需要保存的修改。',
  unsavedStaysInDraft: '未保存的编辑仍在当前工作稿。',
  fixThenSave: '请按上方提示修改后再保存，更多信息可在「日志」查看。',
  recheckDraft: '请重新检查当前草稿。',
  recheck: '重新检查',
  configChecked: '当前草稿中的 3D 配置已通过检查，可以重试保存。',
  restoreRights: '请在授权页恢复 3D 权益后再保存。',
  reselectAsset: '请在引用该素材的控件、组合弹窗或字体设置中重新选择对应资源。',
  popupConflict: '请核对其他仪表盘对同一组合弹窗的修改，再处理冲突。',
  draftConflict: '请核对其他页面已保存的内容，再通过编辑器的草稿恢复提示处理冲突。',
  viewLog: '查看日志',
})

/** 加载 / 舞台。 */
export const LOADING_COPY = Object.freeze({
  planLoading: '正在加载 3D 户型…',
  planLoadingDiagram: '正在加载 3D 户型，完成后可以生成导图。',
  stageLoading: '正在加载 3D 画面…',
  stageReload: '重新载入 3D 画面',
  stageClosed: '3D 户型已关闭。',
  diagramReady: '3D 预览准备好后即可导图。',
  commandCancelled: '当前页面不可操作，指令已取消。',
  lightingFailed: '光影切换失败，请重试。',
})

/** 模型 / 装饰。 */
export const MODEL_COPY = Object.freeze({
  uploadedPick: '已上传，选择模型即可放置。',
  operationFailed: '模型操作失败，请重试。',
  stillReferenced: '该模型仍在',
  referencedSuffix: '使用。请到对应楼层的「已放置」移除模型，保存并重新打开绘制页后再删除。',
  referencedInHistory: '该模型仍在本次编辑历史或复制内容中。请先保存，再重新打开绘制页后删除。',
})

/** 灯光降级 / 状态灯。 */
export const LIGHTING_DEGRADE_COPY = Object.freeze({
  floorLightsOverCapacity: '分层灯光超出当前设备容量',
  shadowAtlasFailed: '聚光灯阴影图集生成失败，已保留分层灯光',
  statusLayerCopyFailed: '3D 状态灯底图复制失败',
})

/** 页面背景。 */
export const PAGE_BACKGROUND_COPY = Object.freeze({
  chooseSource: '为主页面或侧边栏选择内置背景或图片。',
  fillHint: '铺满背景按目标画布显示，自由布局按上面的缩放方式处理。',
  notChosen: '尚未选择背景图片',
  loadFailed: '背景图片无法加载',
})

/** 摄像头流诊断（0.8.9 `camera-mjpeg.js`）。 */
export const CAMERA_STREAM_COPY = Object.freeze({
  emptyStream: '摄像头未返回可用图片流。',
  headerTooLong: '摄像头图片流头部过长。',
  unsupportedFormat: '摄像头图片流格式不支持。',
})

/** 开合设备通用。 */
export const COVER_COPY = Object.freeze({
  positionUnknown: '位置未知',
  unavailable: '窗帘不可用',
  partlyClosed: '未完全关闭',
  legendHint: '示意',
})

/** 实时状态连接。 */
export const RUNTIME_STATUS_COPY = Object.freeze({
  reconnecting: '实时状态连接超时，正在重连',
  applied: '已应用',
})
