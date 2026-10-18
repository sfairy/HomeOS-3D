/**
 * 本机中控入户页（注册 / 登录 / 授权激活 / 授权恢复）的场景壳文案。
 *
 * 字段名与取值规则（`SceneShell` / `SceneValues` / `resolveSceneValues`）在共享包
 * `@homeos/shared/scene/scene-values` 里单点化：商店那侧是**同一套形状、另一套文案**，
 * 只有把形状也共享了，「某侧字段改名导致另一侧左栏整块空掉」这类错误才可能在类型层被抓到。
 * 文案是各域的内容，留在本文件。
 */
import { resolveSceneValues, type SceneValues } from '@homeos/shared/scene/scene-values'

/** 所有入户页共享的壳信息。 */
const SHARED = {
  SHELL_TITLE: 'HomeOS 本机中控',
  SHELL_NAME: '本机中控',
  LOGO_SRC: '/static/assets/icons/homeos-mark-white-orange.svg',
} as const

const VALUES: Record<string, SceneValues> = {
  register: {
    STATUS_LABEL: '尚未初始化',
    TITLE: '这台机器还没有主人',
    TAGLINE: '先注册本机唯一账号：账号、密码、邮箱与邮箱验证码，注册完即是这台机器的主人',
    DOSSIER_LABEL: '注册档案',
    DOSSIER: [
      ['账号', '本机唯一账号，注册后关闭注册入口'],
      ['邮箱', '验证码由授权商店发送与校验'],
      ['口令', '只存本机数据库，不随项目导出'],
      ['之后', '登录这台中控并检测授权'],
    ],
  },
  login: {
    STATUS_LABEL: '本机服务就绪',
    TITLE: '中控在等你回来',
    TAGLINE: '一次登录，把灯光、空调、窗帘与影音收进同一个画面',
    DOSSIER_LABEL: '本机档案',
    DOSSIER: [
      ['账号', '用户名或注册邮箱登录'],
      ['会话', '只留在本机，可服务端吊销'],
      ['网络', '不依赖公网，仅本机网段可达'],
      ['之后', '检测本机授权状态'],
    ],
  },
  reset: {
    STATUS_LABEL: '邮箱验证',
    TITLE: '把钥匙重新配一把',
    TAGLINE: '用注册邮箱收一枚验证码，验证通过即可重设本机管理员密码',
    DOSSIER_LABEL: '找回档案',
    DOSSIER: [
      ['凭据', '注册邮箱收到的 6 位验证码'],
      ['范围', '只重置本机账号，不影响商店账号'],
      ['会话', '重置成功后旧会话全部失效'],
      ['之后', '用新密码重新登录本机'],
    ],
  },
  activate: {
    STATUS_LABEL: '等待授权',
    TITLE: '给这台机器一枚授权',
    TAGLINE: '用购买时收到的激活码与邮箱完成绑定，授权随账号走、可自助换机',
    DOSSIER_LABEL: '授权档案',
    DOSSIER: [
      ['绑定', '一机一码，绑定本机唯一账号名'],
      ['离线', '签名租约本地验签，断网仍可用'],
      ['续租', '后台心跳续租，过期前自动刷新'],
      ['售后', '账号中心可自助解绑换机'],
    ],
  },
  recovery: {
    STATUS_LABEL: '连接异常',
    TITLE: '授权连接需要恢复',
    // 这张页现在只服务「授权仍在、只是暂时连不上 / 租约待重续」。
    // 未激活（UNACTIVATED）不再落到这里 —— 见 App.vue 的 licenseRecoveryVisible。
    TAGLINE: '本机授权凭证已保留，正在自动重连授权后台',
    DOSSIER_LABEL: '恢复档案',
    DOSSIER: [
      ['状态', '本地授权凭证保留，不因掉线被清除'],
      ['动作', '先自动重连，长时间失败再重新激活'],
      ['凭证', '本机保存的激活凭证仅本机可解'],
      ['兜底', '仍不可用时可回激活页重新填码'],
    ],
  },
}

/** 取某页的壳信息 + 文案；未登记的 `page` 回落到登录页。 */
export function sceneValues(page: string | undefined) {
  return resolveSceneValues(SHARED, VALUES, page, 'login')
}
