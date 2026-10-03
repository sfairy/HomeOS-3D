/**
 * 所属模块：backend/modules/earthquake
 * 职责：
 *  - 地震全局类型；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 全球/区域地震目录（CENC / USGS）— 类型自 @homeos/shared。
 *
 * 统一从共享包导出，确保前后端类型一致：
 *  - GlobalEarthquakePeriod：查询时间窗口（hour/day/week/month）
 *  - GlobalEarthquakeSource：数据源（cenc/usgs）
 *  - GlobalEarthquakeEvent：单条地震事件结构（含 magnitude/depth/lat/lon 等字段）
 *  - GlobalEarthquakeFeedResult：目录拉取结果（含 items 列表与缓存标记）
 *  - GlobalEarthquakeQuery：查询参数
 */
export type {
  GlobalEarthquakePeriod,
  GlobalEarthquakeSource,
  GlobalEarthquakeEvent,
  GlobalEarthquakeFeedResult,
  GlobalEarthquakeQuery,
} from '@homeos/shared';
