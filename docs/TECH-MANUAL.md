# SupplyDevLocal 技术手册（开发者向）

> 适用版本：v1.0.48 ｜ 最后更新：2026-09-25
> 面向后续维护/二次开发的工程师。使用说明见《用户文档》（USER-GUIDE.md）。

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────┐
│  SupplyDevLocal-vX.Y.Z.exe（PyInstaller onefile）    │
│                                                     │
│  app.py（Python 宿主）                               │
│   ├─ pywebview 窗口 → WebView2 渲染 supplydev.html   │
│   ├─ Api()：pywebview JS 桥（备份落盘/校验）          │
│   └─ BackupHandler：127.0.0.1:<随机端口> HTTP 服务    │
│       ├─ POST /backup   （X-BK-Token 头校验）        │
│       ├─ GET  /verify?token=…（完整性校验）           │
│       └─ GET  /ping                                  │
│                                                     │
│  supplydev.html（4253 行，原生 JS 单文件前端）        │
│   ├─ state：内存单一数据源                           │
│   ├─ persist() → recomputeDerived() → IndexedDB+LS   │
│   └─ bkport.js（启动时生成：window.__BKPORT/__BKTOKEN）│
└─────────────────────────────────────────────────────┘
```

**技术选型约束（架构红线）**：不引前端框架、保持单 HTML 文件、本地优先（local-first）、无外部服务依赖。

## 2. 目录与文件

| 路径 | 作用 |
|---|---|
| `supplydev.html` | 全部 UI + 业务逻辑（唯一真源） |
| `app.py` | Python 宿主：窗口、备份 HTTP 服务、文件桥 |
| `build.py` | 一键打包：读 version.txt → 递增 → PyInstaller → 改名 exe |
| `version.txt` | 版本号单一来源（如 `1.0.46`） |
| `dist/SupplyDevLocal-vX.Y.Z.exe` | 发版产物（约 14.5MB） |
| `_tests/verify.js` | Node DOM 桩回归测试（485 项断言） |
| `_tests/deadbtn.js` | 静态死按钮审计（onclick 函数存在性） |
| `_tests/c14_app_test.py` | 备份链路壳层回归（真实起服务 17 项） |
| `docs/` | 本文档与用户文档 |
| `~/.supplydev/backups/` | 运行时备份目录（滚动 7 份 + index.json） |
| `~/.supplydev/backup_debug.log` | 备份通道调试日志 |

## 3. 数据层

### 3.1 存储模型
- **权威源**：IndexedDB `supplydev_db` / store `kv`。
- **镜像**：localStorage 同步一份（key `supplydev_db`），IndexedDB 不可用时兜底。
- **变更收口**：所有业务 handler 尾部调用 `persist()` → `flushPersist()` 落盘，并写变更戳 `LS_LCHG`（周期备份的「有变更」判定依据）。**任何绕过 persist 的写路径都是缺陷**。

### 3.2 关键 localStorage 键

| 键 | 用途 |
|---|---|
| `supplydev_db` | state 镜像 |
| `supplydev_local_auth` | 登录账号（PBKDF2+盐；旧 sha256 账号登录时透明升级） |
| `supplydev_last_backup` / `supplydev_last_change` | 最近成功备份时间 / 最近变更时间 |
| `supplydev_time_offset` | 本地时间与真实时间偏移（防改系统表造假） |
| `supplydev_theme` / `supplydev_custom_cats` | 主题 / 自定义品类 |

### 3.3 state 实体（15 个 CSV 模块）
`materials / products / suppliers / orders / processes / bom / samples / quotes / issues / inspections / actions / milestones / deps / catWeights / certs`，另有运行时字段 `_audit`（滚动 300，溢出转 `_auditArc` 归档上限 2000）、`importSessions`（导入撤销栈，最多 3）。

CSV 列定义集中在 `exportModule()` 的 `cfg` 对象（supplydev.html ~行 1594）；详情页导出按 `PID_FILTER_KEYS` 过滤当前项目。

## 4. 派生数据与实时性（本项目核心机制）

### 4.1 统一响应式更新层（C13 引入）
```
任意业务变更 ──► persist() ──► recomputeDerived() ──► 落盘
```
`recomputeDerived()` 是**唯一**的派生数据重算入口，串联：
- `recalcProgress(pid)`：进度 = 里程碑完成比例。**终态守卫**：已完工/已归档项目不改写（否则订单收货后的 100% 会被里程碑比例拉回——历史 bug，已修）。
- `syncProductStatus`：状态回落 + `msRefillBaseline` 补齐基线里程碑。
- `recalcSupplierScore`：质量分/交期分按事件公式重算（无事件基线 95/90），价格分人工保真，综合评级按 `catWeights` 加权。
- `snapshotCost` / `etaDate` 等派生字段。

> **红线**：新增派生字段必须接入 recomputeDerived，禁止在各 handler 里手写重算、禁止绕过收口。

### 4.2 数据自检
`dataHealthCheck()`：调 recomputeDerived 全量重算 → 快照对比计数漂移 → toast 报告。手动入口为「🔍 自检」按钮（refreshTool + 项目详情头部，**必须唯一**）；静默模式每 10 分钟跑一次，有漂移才提示。

### 4.3 时间守卫（防陈旧）
- `startDayRollGuard`：60s 比对 `toDateString()`，翻日全量 RENDER（挂机跨天）。
- `visibilitychange` + `focus`：休眠唤醒/切回窗口立即校验（setInterval 被节流的兜底）。
- `syncTime`：时间偏移 >60s 全量 RENDER。

## 5. 备份链路（C14 定稿）

### 5.1 协议
1. app.py 启动时起 HTTP 服务（127.0.0.1 随机端口 + `secrets` token），写入页面同目录 `bkport.js`（file:// 下 URL query 会被 WebView2 剥掉，**勿改回 query 传参**）。
2. 前端唯一发送入口 `bkSendState(cb)`：`POST /backup` + `X-BK-Token` 头。服务端校验失败返回 403。
3. 备份触发点：
   - 启动 `tryBk`（经 bkSendState）；
   - `startPeriodicBackup` 每 5 分钟巡检：距上次成功备份 ≥24h **且** `LS_LCHG` 晚于上次备份 **且** 不在 CSV/JSON 导入中（`_impPrev` 防护）才发备份。
4. 落盘：`Api.save_backup()` 写 `~/.supplydev/backups/supplydev-backup-YYYYmmdd-HHMMSS.%f.json`（**微秒防同秒覆盖**），滚动保留 7 份，同时更新 `index.json`（字节数 + SHA-256）。
5. 校验：`GET /verify?token=` → `Api.verify_backup()`，对最新备份做哈希/存在性比对；前端启动 15s 后自动校验，四态：`ok / corrupt / missing / no-backup`。7 天无成功备份有提醒。

### 5.2 测试
`_tests/c14_app_test.py` 用临时沙箱目录真实起服务跑 17 项（清单写入/哈希一致/截断/篡改/缺失/滚动修剪/403）。改动备份链路后必须重跑。

## 6. 全局搜索（C14 扩容后 12 类）

`globalSearch(v)`：检索 项目/供应商/订单/客诉/物料/里程碑/报价/证书/整改/抽检/工艺/成员，命中上限 20，落点映射见 ~行 1550（报价/工艺→成本页，证书→供应商页，整改/抽检→质量页，成员→团队页）。新增可检索实体时需同步：匹配分支、落点映射、空态文案、verify 断言。

### 6.1 逾期语义（C15 定稿）

- **终态守卫**：已完工/已归档项目、已收货订单（step≥4）、已完成里程碑不计逾期；甘特/列表/banner 用 `_pDone`/`_pd2` 分流显示「✓ 已完工」类标签。
- **聚合单一来源**：`collectOverdue()` 产出全部逾期明细（订单/里程碑/打样/整改/证书），仪表盘「逾期处理」面板直接消费；新增逾期展示点禁止绕过它。
- **说明单一来源**：`ovTip(kind,name,due)` + `OV_ACT` 建议映射生成悬浮文案（title 属性内用户输入必须 esc）。

### 6.2 项目逾期口径（v1.0.50 C19 定稿）

- **统一出口**：项目层倒计时/逾期一律 `projDueState(p)` → 终态返回 `{lvl:'terminal'}`、交付里程碑已完成返回 `{lvl:'delivered'}`、其余 `overdueState(diffDays(projDueDate(p)))`；**禁止再直接写 `overdueState(diffDays(p.targetDate||p.sampleDue))`**（verify C19 源码断言拦截）。
- **分阶段用日期**：`projDueDate(p)`——立项中/打样中取 `sampleDue||targetDate`，其余状态取 `targetDate||sampleDue`（缺失自动回退）。
- **交付同步**：`projDelivered(p)` 扫描 state.milestones 中该项目的「交付」基线里程碑是否已完成；消费点=项目汇总 KPI（已逾期/即将到期/本月到期）、`projStatusMatch`（__over/__soon7/__due30）、列表倒计时列、健康度徽章（rank2 绿 ✓ 已交付）、仪表盘本月到期、甘特图 `_pDeliv` 守卫。结转「已完工」仍为人工口径，`editMilestone` 仅 toast 提示不改状态。

## 7. 测试体系（发布前全绿才算完成）

| 工具 | 内容 | 命令 |
|---|---|---|
| verify.js | 465 项断言：Node DOM 桩真实执行全部脚本，含 CRUD 行为级、**全路由 onclick 语法审计**（`new Function` 逐个解析，拦截死按钮类语法错误）、周期备份三态、评分公式 | `node _tests/verify.js` |
| deadbtn.js | 静态审计 onclick 引用的函数是否定义（**查不出语法错误**，不能替代上者） | `node _tests/deadbtn.js supplydev.html` |
| c14_app_test.py | 备份壳层回归 | `python _tests/c14_app_test.py` |
| Chrome 截图 | `--headless=new --screenshot` 真引擎渲染验证（登录守卫用**副本注入**，不改主文件） | 见 checklist |
| exe 冒烟 | 启动后 tasklist 确认进程存活 ≥1 分钟 | — |

> **历史教训**：C11 曾因 onclick 缺右括号产生死按钮且静态审计漏检 → 语法审计因此而生；构造任何行内 onclick 后必须跑 verify。Git Bash 的 grep 在模式含单引号时静默假阴性 → 改用 Grep 工具或 Python 计数。

## 8. 打包与发版

1. **红线自查**：`authRender();` 必须且只能在启动序列出现 1 次（截图验证时的临时绕过串 `authUnlock('ASACE')…` 必须恢复，grep 残留 = 0）。
2. `python build.py`（用 `C:/Program Files/Python312/python.exe`）：version.txt 自动递增 → PyInstaller onefile → 产物改名 `SupplyDevLocal-v1.0.X.exe`。
3. **warn 红线**：`build/SupplyDevLocal-vX/warn-*.txt` 中 `missing module named 'webview'` 计数必须为 0（其余 urllib py2 分支等良性告警可忽略）。
4. exe 冒烟 + dist 保留全部历史版本。
5. neat-freak 同步 README / AGENTS.md / OPTIMIZATION-ROADMAP.md / `_tests/checklist-vX.Y.Z.md` / 工作日志，全部文件 UTF-8 校验。

## 9. 安全模型（已知边界）

- 登录密码 PBKDF2+盐存储，**仅防误用，不防提权读取**：本地数据（IndexedDB/localStorage）明文，绕过 exe 可直接读。敏感字段级加密在路线图（P2）。
- 备份 token 防的是**其它网页向 127.0.0.1 CSRF 写垃圾**，不是加密。
- JSON 备份可选 AES-GCM 密码，忘密码不可恢复。

## 10. 常见改动指引

| 想做什么 | 改哪里 | 必须同步 |
|---|---|---|
| 新业务实体 | state 声明 + 视图函数 + exportModule cfg | MOD_NAMES、globalSearch、verify 断言、CSV 15→16 模块文档 |
| 新派生字段 | 接入 recomputeDerived | dataHealthCheck 快照对比项、终态守卫、verify 行为断言 |
| 新面板 | viewDashboard | 联动性依赖 §4.1（自动），加 verify 存在性断言 |
| 新导出模块 | exportModule cfg + PID_FILTER_KEYS | MOD_NAMES 中文映射、导入侧 parse 分支 |
| 改备份逻辑 | app.py BackupHandler/Api + bkSendState | c14_app_test.py 重跑、同秒文件名、_impPrev 防护不破坏 |

## 10.5 下钻协议与批量操作（v1.0.49 C17）

- **goDrill 协议**：`goDrill(route, preset)` 设置一次性 `_drill`，目标视图开头消费（viewOrder 渲染后回填 `order-filter` value，viewProjects 回填状态筛选 + `_projExtra`），消费后置空——「下钻带入、用户可改」不串扰。
- **计算型筛选**：`projStatusMatch(p, f)` 统一处理普通状态值与 `__active/__due30/__soon7/__over` 计算选项（均含终态守卫）；健康度 `projHealth(p)` 基于 `overdueState` 分级（rank 0 逾期 → 4 终态），排序与徽章共用。
- **批量操作**：`_projSel`（id→1）跨页保留；删除走 `projDelCascade()`（delProject 与批量共用的级联主体，persist/RENDER 由调用方负责）；`exportModule(name, pid, ids)` 第三参支持选中行导出。
- **立项月过滤**：趋势柱 `goDrillIdea(ym)` → `_projExtra={label,ym,test}`，渲染器以 `(!_projExtra||_projExtra.test(p))` 叠加，chip 可清除；test 必须存在（行为级断言固化）。

## 11. 版本历史速览

| 版本 | 批次 | 要点 |
|---|---|---|
| v1.0.38-41 | C6-C9 | 基础功能完善期 |
| v1.0.42 | C10 | 导出过滤/中文名/日志筛选 |
| v1.0.43 | C11 | 联动/倒计时/编辑模式（引入死按钮 P0） |
| v1.0.44 | C12 | 语法审计/数据自检/跨天守卫 |
| v1.0.45 | C13 | **persist 收口统一响应式更新层**、终态守卫、时间守卫三通道 |
| v1.0.46 | C14 | **周期备份/备份校验/审计归档/搜索 12 类** |
| v1.0.47 | C15 | **逾期终态修复/仪表盘逾期处理面板（collectOverdue+ovTip+OV_ACT 统一口径）/帮助中心板块（第 9 导航，Alt+1~9）** |
| v1.0.48 | C16 | **仪表盘/项目汇总审查收敛：逾期口径八处对齐（orderDue+终态守卫）/客诉口径×4（待办/看板/详情/报表）/搜索口径与缺列防御/趋势柱归一化/饼图颜色补全/supScore 预计算** |
