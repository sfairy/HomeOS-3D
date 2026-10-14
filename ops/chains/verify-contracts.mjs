/**
 * 跨语言契约链清单（`bun run verify:contracts`）。
 *
 * 三步互不依赖（前两步是 python 源码解析、第三步是独立部署护栏 + 自检），
 * 故可并发；改 `&&` 链的收益是失败时一次看到全部漂移点，而不是「修一处、再跑、再发现」。
 */
import { py, bun, node } from './common.mjs'

export default [
  // 端口是「真源在 ops/ports.mjs、其余六个面各写一遍」的典型散件：改一处漏一处的症状
  // （本机前端 502、部署后反代指向空气）隔着好几层，没有任何既有门禁看得见。
  py('ops/check/check_ports.py', '端口一致性（真源 + 11 个端口面 + deploy 兜底值）'),
  py('ops/check/check_ports_selftest.py', '端口门禁自检'),
  // 样式债跨两个前端（`homeos/frontend` + `homeos-store/frontend` + 静态运行面），所以门禁放在
  // `ops/style/`：放在任一前端包里都会让「该包脚本里出现兄弟项目路径」，正好被独立部署护栏拦下。
  node('ops/style/check-style-debt.mjs', '样式债（棘轮 + 新裸 z-index 数值硬规则）'),
  node('ops/style/_style_debt_selftest.mjs', '样式债门禁自检'),
  py('ops/check/check_shared_contracts.py', '共享契约'),
  py('ops/check/check_shared_contracts_selftest.py', '共享契约自检'),
  // 错误码是跨端契约（前端按码分派文案），但表里的码多一个不会报错、只会静默不生效，
  // 所以单列一道引用率门禁 + 自检（自检用合成副本反向压住「解析不到就放行」这类假绿）。
  py('ops/check/check_error_codes.py', '错误码引用率'),
  py('ops/check/check_error_codes_selftest.py', '错误码门禁自检'),
  // 转发桩是「搬家不打断调用方」的临时设施：断了没人知道、成链没人发现、到期没人清理。
  // 三条都在这里收口（目标可解析 + 禁止桩链 + 退役登记含期限）。
  py('ops/check/check_deprecated_stubs.py', '`@deprecated` 转发桩'),
  py('ops/check/check_deprecated_stubs_selftest.py', '转发桩门禁自检'),
  // 后端分层：依赖方向只能向下。本轮清掉的 domains→realtime/panel、modules→api 这类
  // 反向边在清完之后必须有人守着 —— 否则下一次「先跑起来」的改动会把它加回来。
  py('ops/check/check_layers.py', '后端分层依赖方向'),
  py('ops/check/check_layers_selftest.py', '分层门禁自检'),
  // 基础镜像是「同一份源码、不同时间构建出不同产物」的来源：两个 ARG 默认值 + 公网 compose 的
  // caddy 兜底值 + build.py 的镜像站改写，四处必须指向同一个 tag@digest。裸 tag 是可变引用，
  // 而上游重推 tag 不会让任何现有门禁变红。
  py('ops/check/check_docker_pins.py', '基础镜像钉版（真源 + Dockerfile FROM + 工作流无覆盖）'),
  py('ops/check/check_docker_pins_selftest.py', '基础镜像钉版门禁自检'),
  bun('verify:independence', '独立部署护栏 + 自检'),
]
