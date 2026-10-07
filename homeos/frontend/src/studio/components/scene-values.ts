/**
 * 入户页场景壳的左栏文案（注册 / 登录 / 授权激活 / 授权恢复共用）。
 *
 * 与授权商店 `SceneStage` 同构：场景 SVG 与版式来自 `design/scene/*`（页内挂载的
 * `static/auth/scene/*.css`），这里只声明每个页面要显示的状态与档案文案。
 */

export interface SceneValues {
  /** 状态灯的文案。 */
  STATUS_LABEL: string;
  /** 主标题。 */
  TITLE: string;
  /** 副标题。 */
  TAGLINE: string;
  /** 档案区标题。 */
  DOSSIER_LABEL: string;
  /** 档案键值对。 */
  DOSSIER: Array<[string, string]>;
}

/** 所有入户页共享的壳信息。 */
export const SHARED = {
  SHELL_TITLE: "HomeOS 本机中控",
  SHELL_NAME: "本机中控",
  LOGO_SRC: "/static/assets/icons/homeos-mark-white-orange.svg",
} as const;

const VALUES: Record<string, SceneValues> = {
  register: {
    STATUS_LABEL: "尚未初始化",
    TITLE: "这台机器还没有主人",
    TAGLINE: "先注册本机唯一账号：账号、密码、邮箱与邮箱验证码，注册完即是这台机器的主人",
    DOSSIER_LABEL: "注册档案",
    DOSSIER: [
      ["账号", "本机唯一账号，注册后关闭注册入口"],
      ["邮箱", "验证码由授权商店发送与校验"],
      ["口令", "只存本机数据库，不随项目导出"],
      ["之后", "登录这台中控并检测授权"],
    ],
  },
  login: {
    STATUS_LABEL: "本机服务就绪",
    TITLE: "中控在等你回来",
    TAGLINE: "一次登录，把灯光、空调、窗帘与影音收进同一个画面",
    DOSSIER_LABEL: "本机档案",
    DOSSIER: [
      ["账号", "用户名或注册邮箱登录"],
      ["会话", "只留在本机，可服务端吊销"],
      ["网络", "不依赖公网，仅本机网段可达"],
      ["之后", "检测本机授权状态"],
    ],
  },
  activate: {
    STATUS_LABEL: "等待授权",
    TITLE: "给这台机器一枚授权",
    TAGLINE: "用购买时收到的激活码与邮箱完成绑定，授权随账号走、可自助换机",
    DOSSIER_LABEL: "授权档案",
    DOSSIER: [
      ["绑定", "一机一码，绑定本机唯一账号名"],
      ["离线", "签名租约本地验签，断网仍可用"],
      ["续租", "后台心跳续租，过期前自动刷新"],
      ["售后", "账号中心可自助解绑换机"],
    ],
  },
  recovery: {
    STATUS_LABEL: "连接异常",
    TITLE: "授权连接需要恢复",
    TAGLINE: "本机授权仍在，重新连接授权后台即可拉回最新租约",
    DOSSIER_LABEL: "恢复档案",
    DOSSIER: [
      ["状态", "本地授权保留，不因掉线失效"],
      ["动作", "先试重新连接，再考虑重新激活"],
      ["凭证", "本机保存的激活凭证仅本机可解"],
      ["兜底", "无凭证时回到激活页重新填码"],
    ],
  },
};

export function sceneValues(page: string): SceneValues & typeof SHARED {
  const found = VALUES[page] || VALUES.login!;
  return { ...SHARED, ...found };
}
