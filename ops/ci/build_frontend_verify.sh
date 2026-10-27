#!/usr/bin/env bash
#
# 前端产物构建 + 结构断言：装依赖 → 校验 three 运行时副本 → `bun run build:frontend` → 校验 dist/ 的关键产物。
#
# 为什么抽成脚本：它是「构建能不能过」这件事的**唯一**实现，调用方有两个 ——
#   1. `.github/workflows/checks.yml` 的 build job（= `bun run gate:build`，构建出的 dist/
#      作为制品交给镜像矩阵）；
#   2. 本地 `bun run gate:build`（同一份清单，先把 dist/ 清空）。
# 此前还有第三个调用方 `.github/workflows/build-check.yml`（只构建、不推镜像），它与
# checks.yml 的 build job 跑的是同一段逻辑却各写一份 workflow —— 已删除，见 ops/gates.mjs。
#
# 在本地跑得通不等于在 CI 上跑得通：`dist/` 被 gitignore，本地可能有旧产物兜着。
# 2026-10-10 的构建锁 ENOENT 就是「本地绿、CI 红」—— 锁文件父目录 `dist/homeos/` 在
# 干净检出里不存在。`gate:build` 会先 `rm -rf dist`，所以要复现就整个走它，别手工跑本脚本。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

bun install --frozen-lockfile

# three 运行时副本的漂移检查：副本（public/static/vendor/three/<版本>/）由
# `homeos/frontend/scripts/build-three-vendor.mjs` 从 node_modules/three 单向生成，
# 但它是提交进仓库的静态资源，npm 侧升级后不会自动跟着变。
# 放在 build 之前：这条挂掉时能直接指出「npm 升了 three、副本没跟上」，
# 而如果等到 dist 断言，症状只会是「某个 /static/vendor/three/... 路径 404」，
# 排查方向完全不同。
bun run --cwd homeos/frontend sync:three:check

bun run build:frontend

# 前端产物是 Vite 压缩产物（**不混淆**，见 ops/BUILD.md）。
# 这条断言防止 `_0x` 标识符重新出现：混淆对体积的代价是 5.6x、且线上堆栈会彻底失去可读性。
if grep -q '_0x' dist/homeos/frontend/static/assets/index-*.js; then
    echo "主应用产物出现了 _0x 标识符：前端构建不应再走混淆（见 ops/BUILD.md）。" >&2
    exit 1
fi
# 3D 外置运行时（three）必须同时满足两件事，缺一件都会让 studio 白屏：
#   ① 文件真的在产物里；
#   ② 每个文件都进了匿名白名单 —— studio chunk 用根绝对 URL 静态 import 它们，
#      白名单之外一律走登录门禁，未登录 / 会话失效时整条 import 图失败，浏览器只报
#      「Failed to fetch dynamically imported module: shared-xxxx.js」，指不到真正的原因。
three_vendor_root=dist/homeos/frontend/static/vendor/three
# 目录名取第一层子目录（形如 0.186.1）。用 find 而不是 ls：ls 的输出要再经 head 才能
# 取一个，且对非字母数字文件名不安全（SC2012）；find -print -quit 天然只给一个、无管道。
three_vendor_version=$(find "$three_vendor_root" -mindepth 1 -maxdepth 1 -type d -print -quit)
test -n "$three_vendor_version"
three_vendor_version=${three_vendor_version##*/}
three_vendor_dir="${three_vendor_root}/${three_vendor_version}/"
three_vendor_rel="/static/vendor/three/${three_vendor_version}/"
for addon in \
    three.module.min.js \
    three.core.min.js \
    OrbitControls.js \
    RoundedBoxGeometry.js \
    BufferGeometryUtils.js \
    GLTFLoader.js \
    DRACOLoader.js; do
    test -f "${three_vendor_dir}${addon}"
    if ! grep -q "\"${three_vendor_rel}${addon}\"" dist/homeos/frontend/public-static.json; then
        echo "匿名白名单漏了 ${three_vendor_rel}${addon}：3D 外置运行时未登录时会被门禁挡下。" >&2
        exit 1
    fi
done
# 哈希 chunk 与商店同构地落在 /static/assets/ 这一层（扁平，不建 js/ css/ 子目录）：
# 根级 dist/homeos/frontend/assets 必须不存在 —— 后端已不再挂载 /assets，留在这里
# 只会得到一堆「文件在、线上 404」的产物。
test ! -e dist/homeos/frontend/assets
test ! -e dist/homeos/frontend/static/assets/js
test ! -e dist/homeos/frontend/static/assets/css
test -f dist/homeos/frontend/static/assets/index-*.js
test -f dist/homeos/frontend/static/assets/index-*.css
# 外壳必须真的引用新路径；否则说明 output 模板与 assetsDir 有一处没改。
grep -q '/static/assets/index-' dist/homeos/frontend/index.html
# 第三方插件整棵子树原样复制：public/static/vendor 由 Vite 逐字节搬进产物，不经任何改写。
if ! diff -rq homeos/frontend/public/static/vendor dist/homeos/frontend/static/vendor; then
    echo "static/vendor 与源不一致：第三方插件目录必须原样复制。" >&2
    exit 1
fi
test -f dist/homeos-store/frontend/static/store.css
test -f dist/homeos-store/frontend/static/store-home.css
# 首页样式是独立文件：index.html 里必须排在 store.css 之后（同优先级后加载者赢），
# 漏掉这一条时页面不报错、只是首页静默套用旧样式 —— 只能在产物层断言。
store_line=$(grep -n '/store-static/store.css' dist/homeos-store/frontend/index.html | head -1 | cut -d: -f1)
home_line=$(grep -n '/store-static/store-home.css' dist/homeos-store/frontend/index.html | head -1 | cut -d: -f1)
test -n "$store_line"
test -n "$home_line"
test "$store_line" -lt "$home_line"
test -f dist/homeos/frontend/index.html
test -f dist/homeos-store/frontend/index.html

echo "前端产物构建与结构断言通过。"
