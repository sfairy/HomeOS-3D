/** 场景壳的左栏文案（移植自 backend/src/api/page_shell.py 的 SCENE_VALUES_BY_PAGE）。 */

export interface SceneValues {
  STATUS_LABEL: string;
  TITLE: string;
  TAGLINE: string;
  DOSSIER_LABEL: string;
  DOSSIER: Array<[string, string]>;
}

const SHARED = {
  SHELL_TITLE: "HomeOS 授权服务中心",
  SHELL_NAME: "授权中心",
  LOGO_SRC: "/store-static/homeos-mark.svg",
};

const VALUES: Record<string, SceneValues> = {
  store: {
    STATUS_LABEL: "授权服务就绪",
    TITLE: "账号就是你的授权凭证",
    TAGLINE: "注册、下单、拿码，一台机器一份授权，全挂在这个账号上",
    DOSSIER_LABEL: "授权档案",
    DOSSIER: [
      ["账号", "邮箱即账号，验证码注册"],
      ["授权", "一机一码，可自助解绑换机"],
      ["发码", "支付成功后自动发码"],
      ["售后", "订单号 + 下单邮箱即可查询"],
    ],
  },
  setup: {
    STATUS_LABEL: "尚未初始化",
    TITLE: "这台机器还没有店长",
    TAGLINE: "先把管理员定下来，商品、订单与授权才有归属",
    DOSSIER_LABEL: "部署档案",
    DOSSIER: [
      ["身份", "管理员账号只建在这台机器上"],
      ["权限", "商品、订单、授权码与站点配置"],
      ["数据", "订单与激活码落在本机数据库"],
      ["之后", "进后台开张上架"],
    ],
  },
  admin: {
    STATUS_LABEL: "授权服务就绪",
    TITLE: "后台只开给本机的管理员",
    TAGLINE: "运营动作全部在这套部署上完成，不等云端下发",
    DOSSIER_LABEL: "后台档案",
    DOSSIER: [
      ["账号", "初始化时创建，不开放注册"],
      ["权限", "只认本机管理员，越权一律拒绝"],
      ["数据", "订单、授权与审计都留在本机库"],
      ["建议", "经 HTTPS 或反代，不直连公网"],
    ],
  },
};

export function sceneValues(page: string): SceneValues & typeof SHARED {
  const found = VALUES[page] || VALUES.store!;
  return { ...SHARED, ...found };
}
