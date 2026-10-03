# 升级与回滚（中心商店 + 多客户机）

分发式部署的升级核心只有两条：

1. **先升中心商店，再升客户机**（授权协议的 `keyId` / `generation` / `clientVersion`
   都是运行期校验的，顺序反了会出现「旧客户端连新商店」的短暂窗口）；
2. **中心和所有客户机用同一个 tag** —— 现在是**钉版本**的（`deploy.sh` 会把解析结果写回
   `.env` 的 `HOMEOS_VERSION` / `HOMEOS_IMAGE`），所以不会各自漂到 `latest`。

工具：`ops/deploy/upgrade.sh`（升级）与 `ops/deploy/deploy.sh --dry-run`（预演）。

---

## 0. 升级前

```bash
# 中心厂商机与每台客户机都可以先看现状
./ops/deploy/upgrade.sh --check
```

输出本机 `.env` 钉住的版本、`package.json` 版本与容器里实际运行的版本。三者应当一致。

发布前置（在开发机）：

- [ ] 版本号已改（仓库根 `package.json` 的 `version`）→ CI 才会构建 `1.0.1` 这个 tag；
- [ ] GitHub Actions（Docker 工作流，手动 dispatch）已跑完，GHCR 里有该 tag 的
      `amd64` + `arm64` manifest（`docker buildx imagetools inspect` 可查）；
- [ ] 记录本次的版本号与变更点，准备通知客户。

> 镜像 tag 来自仓库根 `package.json` 的 `version`，并同时打 `latest`。**生产别用 latest**。

---

## 1. 升中心商店

```bash
# 厂商机
./ops/deploy/upgrade.sh --role store --version 1.0.1
```

等价的裸命令（脚本只是显式带上版本并写回 `.env`）：

```bash
docker compose -f docker-compose.store.yml pull && docker compose -f docker-compose.store.yml up -d
```

> **公网接入（`docker-compose.store.public.yml`）时不要照抄上面这条裸命令。** 漏掉叠加
> 文件会让商店容器被**用内网环境变量重建**（回调地址、Cookie Secure、可信代理一起退回），
> 而容器依旧 healthy，很难发现。用 `upgrade.sh --role store` 就没这个问题——它会按 `.env`
> 里的 `STORE_DOMAIN` 自动带上叠加；要手动跑 compose 就两个文件都带：

```bash
docker compose -f docker-compose.store.yml -f docker-compose.store.public.yml pull
docker compose -f docker-compose.store.yml -f docker-compose.store.public.yml up -d
```

验收：

- [ ] `docker compose -f docker-compose.store.yml ps` 里商店是 `healthy`；
- [ ] `curl -fsS <商店地址>/healthz`；
- [ ] `curl -fsS <商店地址>/v2/keys | head -c 200` 能取回公钥（客户机全靠它）；
- [ ] `/admin` 能登录，授权列表 / 设备绑定页面正常。

### 商店启动即迁移（结构变更都在这一步发生）

商店现在也走 Alembic（`homeos-store/db/migrations`），迁移在**容器启动时**同步执行，
不再有「启动时按 ORM 补列」。运维只需要知道三件事：

1. **动结构前一定先留快照**。迁移开始前会在商店数据目录写一份
   `store.db.pre-migrate-<UTC 时间戳>.bak`（`VACUUM INTO` 出来的完整副本），同名前缀
   只保留最近 3 份。确认升级无误后可以自己删。
2. **写不出快照就不启动**，这是有意的：在没有退路的情况下改结构，比一次启动失败危险得多。
   报错信息里会写明是哪个路径不可写 —— 通常意味着数据卷挂载或磁盘空间有问题，先解决它，
   不要去关掉这条检查。
3. **看 `/healthz` 的 `schema` 字段**。`schema.ok=false` 表示库结构与代码期望的不一致，
   `drift` 里逐项列出差异（缺列 / 幽灵列 / 缺索引 / 多余索引）。它**刻意不改**
   `status`：结构漂移重启一百次也不会变，那是要告警给人看的，不是要编排器自愈的。

> 升级后如果 `/healthz` 的 `schema.ok` 是 `false`，请把该字段原样发回来 —— 那说明迁移
> 漏了东西，属于要修代码的问题，重启和回滚都解决不了。

---

## 2. 逐个升客户机

对**每一台**客户机：

```bash
# 客户机（把版本换成与中心一致的那个）
./ops/deploy/upgrade.sh --role app --version 1.0.1
```

首次升级若 `.env` 里还没写商店地址：

```bash
./ops/deploy/upgrade.sh --role app --version 1.0.1 --license-server http://<中心商店>:8802
```

裸命令（客户精简包目录里）：

```bash
docker compose -f docker-compose.app.yml pull && docker compose -f docker-compose.app.yml up -d
```

验收（每台）：

- [ ] 容器 `healthy`；
- [ ] 主应用能登录，`/license` 显示已激活、心跳正常；
- [ ] `docker logs homeos-3d | grep 授权` 没有「取回公钥失败」；
- [ ] 若报「已绑定其他设备」→ 宿主指纹变了，不是版本问题：请到商店后台解绑后重新激活
      （见 [SPLIT-DEPLOY.md](SPLIT-DEPLOY.md) 的授权身份一节）。

**逐台还是批量**：客户机各自独立、失败互不影响，建议逐台升，一台异常不会拖住其余客户。
客户数量多时按下表跑即可：

| 顺序 | 机器 | 角色 | 命令 |
| --- | --- | --- | --- |
| 1 | 厂商机 | store | `upgrade.sh --role store --version 1.0.1` |
| 2..N | 各客户机 | app | `upgrade.sh --role app --version 1.0.1` |

---

## 3. 客户升级通知模板

发到客户群 / 工单里即可（把 `<>` 替换成实际值）：

```text
【HomeOS 升级通知】版本 1.0.1

升级内容：<一句话>
需要时间：约 3~5 分钟（期间服务会短暂重启）
影响范围：<只升主应用 / 无数据变更>

请在维护窗口内执行：
  cd <安装目录>
  ./ops/deploy/upgrade.sh --role app --version 1.0.1

升级不会动数据卷，激活状态保持不变。
若升级后无法登录或提示设备绑定异常，请把 `docker logs homeos-3d | tail -n 50`
的输出发给我们。

回滚（如需）：./ops/deploy/upgrade.sh --role app --version <上一个版本>
```

---

## 4. 回滚

把版本换成上一个 tag 重跑同一条命令即可（镜像仍在 GHCR，卷不动）：

```bash
./ops/deploy/upgrade.sh --role store --version 1.0.0     # 中心
./ops/deploy/upgrade.sh --role app   --version 1.0.0     # 客户机
```

回滚顺序与升级**相反**：先回滚客户机，再回滚中心商店（避免新商店 + 旧客户端的组合停留太久）。

⚠️ **回滚不回滚数据**。若新版本做过不可逆的数据结构迁移，回滚前先备份数据卷，并确认旧
版本能读新结构，否则宁可不回滚。升级前建议统一快照：

> 商店的迁移链已压缩为单一基线 `0001`：老库（`0002` 时代及之前的结构）**不能直升**，也
> 不可降级。要退回旧版本或从老库迁移，请从数据目录里的 `store.db.pre-migrate-*.bak`
> 恢复 / 重建，而不是只把镜像 tag 换回去 —— 换回旧镜像不会把删掉的列变回来，但旧代码如果
> 还在读它们就会直接报错。

```bash
mkdir -p backup
docker run --rm -v homeos-3d_homeos-3d-data:/data -v "$PWD/backup":/backup alpine \
  tar -C /data -czf /backup/app-data-$(date +%Y%m%d).tgz .
```

---

## 5. 铁律

- **不要 `docker compose down -v`**：会删卷。商店授权私钥卷
  `homeos-3d-store_homeos-3d-license-keys` 丢了 = 所有已激活客户全部失效。
- **不要跳过中心先升客户机**。
- **不要中心与客户机用不同 tag**；`upgrade.sh --check` 可随时核对。
- 升级只 pull + up；数据卷（含公钥缓存 `/data/client-keys`）不动。
