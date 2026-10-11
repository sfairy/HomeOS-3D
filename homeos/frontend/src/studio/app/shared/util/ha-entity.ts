/** HA 实体在前端各处流通时的公共形状。 */

/** 实体属性：常用字段显式列出，其余按域自行取用。 */
export type HaEntityAttributes = {
  friendly_name?: string;
  device_class?: string;
  /** 灯光支持的颜色模式（hs / rgb / xy / color_temp…）。 */
  supported_color_modes?: string[];
  color_mode?: string;
  hs_color?: number[];
  rgb_color?: number[];
  xy_color?: number[];
  min_color_temp_kelvin?: number;
  max_color_temp_kelvin?: number;
  [attributeName: string]: any;
};

/** 实体状态：既能直接是 HA 状态，也能是状态中枢包装后的 newState。 */
export type HaEntityState = {
  entityId?: string;
  entity_id?: string;
  domain?: string;
  state?: string;
  attributes?: HaEntityAttributes;
  /** 状态中枢把最新状态包在 newState 里。 */
  newState?: HaEntityState | null;
  /** 实体是否可用。 */
  available?: boolean;
  [stateKey: string]: any;
};

/** 实体目录项：编辑器与运行期共享的实体描述。 */
export type HaEntityEntry = {
  entityId?: string;
  entity_id?: string;
  domain?: string;
  name?: string;
  /** 编辑器里被改过的显示名。 */
  originalName?: string;
  /** HA 的翻译 key（用于把实体归类，例如扫地机的 charging_status）。 */
  translationKey?: string;
  translation_key?: string;
  deviceClass?: string;
  device_class?: string;
  deviceId?: string;
  device_id?: string;
  attributes?: HaEntityAttributes;
  newState?: HaEntityState | null;
  status?: string;
  enabled?: boolean;
  disabledBy?: string | null;
  disabled_by?: string | null;
  /** 运行期状态中枢写回的字段（由编辑器 picker 读取）。 */
  role?: string;
  [fieldName: string]: any;
};
