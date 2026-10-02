# SupplyDevLocal 技术手册（开发者向）

> 适用版本：v1.0.65（构建时自动同步） ｜ 最后更新：2026-10-02
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
│   ├─ BackupHandler：127.0.0.1:<随机端口> HTTP 服务    │
│   │   ├─ POST /backup   （X-BK-Token 头校验）        │
│   │   ├─ GET  /verify?token=…（完整性校验）           │
│   │   └─ GET  /ping                                  │
│   └─ _start_tray：pystray 托盘（显示主窗口/保存退出）  │
│                                                     │
│  supplydev.html（约 4900 行，原生 JS 单文件前端）      │
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
| `app.py` | Python 宿主：窗口、备份 HTTP 服务、文件桥、系统托盘（pystray） |
| `build.py` | 一键打包：读 version.txt → 递增 → PyInstaller → Inno Setup 双产物 |
| `installer.iss` | Inno Setup 6 安装包脚本（版本号 `/DMyAppVersion` 强制注入，`#ifndef` 即 `#error`） |
| `version.txt` | 版本号单一来源（如 `1.0.65`） |
| `dist/SupplyDevLocal-vX.Y.Z.exe` | 绿色版产物（约 31.8MB） |
| `dist/SupplyDevLocal-setup-vX.Y.Z.exe` | 安装版产物（约 33.5MB） |
| `_tests/verify.js` | Node DOM 桩回归测试（728 项断言） |
| `_tests/deadbtn.js` | 静态死按钮审计（onclick 函数存在性） |
| `_tests/c14_app_test.py` | 备份链路壳层回归（真实起服务 17 项） |
| `docs/` | 本文档、用户文档与各版本 checklist |
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

milestones 实体自 C22 起扩展三字段：`kind`（`'group'` 阶段分组 / `'task'` 任务 / 空=里程碑）、`parentId`（归属分组 id，仅一级）、`endDate`（工期条结束日期）。旧数据无新字段=顶层里程碑，零迁移。

CSV 列定义集中在 `exportModule()` 的 `cfg` 对象；详情页导出按 `PID_FILTER_KEYS` 过滤当前项目。

## 4. 派生数据与实时性（本项目核心机制）

### 4.1 统一响应式更新层（C13 引入）
```
任意业务变更 ──► persist() ──► recomputeDerived() ──► 落盘
```
`recomputeDerived()` 是**唯一**的派生数据重算入口，串联：
- `recalcProgress(pid)`：进度 = 里程碑/任务完成比例（任务与里程碑节点同权计数，分组排除）。**终态守卫**：已完工/已归档项目不改写（否则订单收货后的 100% 会被里程碑比例拉回——历史 bug，已修）。
- `syncProductStatus`：状态回落 + `msRefillBaseline` 补齐基线里程碑（含「交付」基线：targetDate 变化时仅未用户化的基线跟随，拖拽过日期即视为用户口径）。
- `recalcSupplierScore`：质量分/交期分按事件公式重算（无事件基线 95/90），价格分人工保真，综合评级按 `catWeights` 加权。
- **孤儿 parentId 净化器（C24）**：子项 parentId 指向不存在/非分组/跨产品分组时强制清空上移顶层。
- **依赖净化（C33）**：`ensureDeps` 过滤端点为分组的脏依赖（与 `editMilestone` 转换时显式清理构成双防线，覆盖 JSON 导入等异常路径）。
- `snapshotCost` / `etaDate` 等派生字段。

> **红线**：新增派生字段必须接入 recomputeDerived，禁止在各 handler 里手写重算、禁止绕过收口。

### 4.2 数据自检
`dataHealthCheck()`：调 recomputeDerived 全量重算 → 快照对比计数漂移 → toast 报告。手动入口为「🔍 自检」按钮（refreshTool + 项目详情头部，**必须唯一**）；静默模式每 10 分钟跑一次，有漂移才提示。

### 4.3 时间守卫（防陈旧）
- `startDayRollGuard`：60s 比对 `toDateString()`，翻日全量 RENDER（挂机跨天）。
- `visibilitychange` + `focus`：休眠唤醒/切回窗口立即校验（setInterval 被节流的兜底）。
- `syncTime`：时间偏移 >60s 全量 RENDER。

### 4.4 实时联动守卫（C29 定案）

弹窗保存/删除后的刷新统一走：`if(ROUTE==='xxx')局部刷新();else RENDER();`——路由匹配才走局部渲染器，其余路由全局重渲染（RENDER 经 VIEWS 分发到正确视图，含详情页甘特/成本 tab）。历史上 openBOM 等 6 站点曾直调 `renderCost(pid)`，从详情页调用时 `#cost-detail` 容器不存在 → null.innerHTML 被全局兜底吞掉，表现为「加了 BOM 界面不动」。delBOM 原有的 `state._costPid` 死守卫（从未赋值）已清除。

## 5. 备份链路（C14 定稿）

### 5.1 协议
1. app.py 启动时起 HTTP 服务（127.0.0.1 随机端口 + `secrets` token），写入页面同目录 `bkport.js`（file:// 下 URL query 会被 WebView2 剥掉，**勿改回 query 传参**）。
2. **系统托盘（v1.0.52）**：`_start_tray` 用 pystray（Windows 后端 `pystray._win32`，PyInstaller 需 `--hidden-import`，后端经 importlib 动态加载静态分析抓不到）+ Pillow 加载 `assets/app.ico`（build.py `--add-data` 打包；缺失时运行时用 PIL 画品牌蓝兜底图标）。菜单：显示主窗口（default 动作）/ 保存退出。保存退出 = 守护线程执行 closing 落盘片段（flushPersist→saveLogs→flushStore）→ `window.destroy()`（不走 confirm_close）；**3s join 超时视为 evaluate_js 死锁，立即 destroy + os._exit 兜底**（落盘失败有 localStorage 镜像 + 周期备份 + X 关闭 closing 落盘三重兜底）。pystray/Pillow 缺失自动降级无托盘运行。主循环结束后 `icon.stop()` 清理图标。
3. 前端唯一发送入口 `bkSendState(cb)`：`POST /backup` + `X-BK-Token` 头。服务端校验失败返回 403。
4. 备份触发点：
   - 启动 `tryBk`（经 bkSendState）；
   - `startPeriodicBackup` 每 5 分钟巡检：距上次成功备份 ≥24h **且** `LS_LCHG` 晚于上次备份 **且** 不在 CSV/JSON 导入中（`_impPrev` 防护）才发备份。
5. 落盘：`Api.save_backup()` 写 `~/.supplydev/backups/supplydev-backup-YYYYmmdd-HHMMSS.%f.json`（**微秒防同秒覆盖**），滚动保留 7 份，同时更新 `index.json`（字节数 + SHA-256）。
6. 校验：`GET /verify?token=` → `Api.verify_backup()`，对最新备份做哈希/存在性比对；前端启动 15s 后自动校验，四态：`ok / corrupt / missing / no-backup`。7 天无成功备份有提醒。

### 5.2 测试
`_tests/c14_app_test.py` 用临时沙箱目录真实起服务跑 17 项（清单写入/哈希一致/截断/篡改/缺失/滚动修剪/403）。改动备份链路后必须重跑。

## 6. 搜索、逾期与指标口径

### 6.1 全局搜索（12 类）
`globalSearch(v)`：检索 项目/供应商/订单/客诉/物料/里程碑/报价/证书/整改/抽检/工艺/成员，命中上限 20，落点映射见源码 ~行 1550（报价/工艺→成本页，证书→供应商页，整改/抽检→质量页，成员→团队页）。新增可检索实体时需同步：匹配分支、落点映射、空态文案、verify 断言。

### 6.2 逾期语义（C15 定稿）

- **终态守卫**：已完工/已归档项目、已收货订单（step≥4）、已完成里程碑不计逾期；甘特/列表/banner 用 `_pDone`/`_pd2` 分流显示「✓ 已完工」类标签。
- **聚合单一来源**：`collectOverdue()` 产出全部逾期明细（订单/里程碑/打样/整改/证书），仪表盘「逾期处理」面板直接消费；新增逾期展示点禁止绕过它。
- **说明单一来源**：`ovTip(kind,name,due)` + `OV_ACT` 建议映射生成悬浮文案（title 属性内用户输入必须 esc）。

### 6.3 项目逾期口径（v1.0.50 C19 定稿）

- **统一出口**：项目层倒计时/逾期一律 `projDueState(p)` → 终态返回 `{lvl:'terminal'}`、交付里程碑已完成返回 `{lvl:'delivered'}`、其余 `overdueState(diffDays(projDueDate(p)))`；**禁止再直接写 `overdueState(diffDays(p.targetDate||p.sampleDue))`**（verify C19 源码断言拦截）。
- **分阶段用日期**：`projDueDate(p)`——立项中/打样中取 `sampleDue||targetDate`，其余状态取 `targetDate||sampleDue`（缺失自动回退）。
- **交付同步**：`projDelivered(p)` 扫描 state.milestones 中该项目的「交付」基线里程碑是否已完成；消费点=项目汇总 KPI（已逾期/即将到期/本月到期）、`projStatusMatch`（__over/__soon7/__due30）、列表倒计时列、健康度徽章（rank2 绿 ✓ 已交付）、仪表盘本月到期、甘特图 `_pDeliv` 守卫。结转「已完工」仍为人工口径，`editMilestone` 仅 toast 提示不改状态。

### 6.4 OTIF 与三档 AQL（v1.0.51 C20）

- **OTIF（On-Time In-Full）**：`orderOTIFJudge(o)` 判定单笔订单——样本准入=存在分批（`o.batches`）且已足额收货（`orderReceivedQty(o)>=+o.qty`）；判定=每批 `received` 的实收日期 `b.receivedDate` 均不晚于该批承诺日期（P1 批次确认收货时埋点采集，零手工录入）。`otifStats()` 输出 `{rate, ontime, sample}` 全局聚合，消费点=订单页 KPI（≥95 绿 / 85-94 橙 / <85 红）、行内 `OTIF ✓/✕` 标注、供应商列表 per-supplier 汇总。**无分批订单不入样本**（无收货记录，无法判准时，防虚增）。
- **三档 AQL 抽检**：`AQL_TABLE` 支持 `1.0/2.5/4.0` 三档（1.0 档为 ISO 2859-1 Table 2-A 双信源核对值，小批量走箭头级联 n=5/Ac=0）；抽检记录加 `badCr/badMaj/badMin` 三字段（兼容旧数据：旧记录读 `bad`）。判定顺序：致命>0 → 退货；否则主要按 AQL 1.0 查表、次要按 AQL 4.0 查表各自判收/拒，任一拒收 → 整批退货。`inspectionAQL()` 按批量实时预填抽检数并展示方案提示。

## 7. 甘特图与 WBS（C22~C34 演进全记录）

### 7.1 两级 WBS 阶段分组（v1.0.53 C22）

- **实体扩展**：里程碑新增 `kind:'group'`（阶段分组）/`parentId`（归属分组 id，仅一级）/`endDate`（工期条结束日期）。旧数据无新字段=顶层里程碑，零迁移。WBS 编码为**展示层计算**（`msWbsCodes`：顶层 1,2,3…/子项 n.k），不落库。
- **分组不变量（八处泄漏面收口，verify C22r2 断言锁定）**：分组不参与 进度计算（recalcProgress）/里程碑计数（msSummary）/依赖连线（addDep 拦截 + CSV 按名解析排除）/基线快照（snapBaseline）/基线自动依赖链/逾期聚合（collectOverdue）/近期到期节点（keyDateBoard）/全局搜索与详情时间轴与打印（同型三站 `productId===pid&&m.kind!=='group'` ≥3 处断言）。分组保存端强制顶层（弹窗 `parentId:isG?'':gid`、CSV `parentId:msIsG?'':msPid`）；`msChildren` 防御性过滤分组。
- **删除语义**：删分组**不级联删子项**，子项自动上移顶层（`if(x.parentId===id)x.parentId=''`），审计打点注明。
- **甘特渲染**：项目行 `ganttExpand[pid]` 展开 → 按数组序渲染分组行（深框汇总条=子项 min~max + 完成 n/m，`msGroupSpan`）与里程碑行（endDate>date 画实色工期条+尾部名称，否则四态菱形）；marks 按实际行位收集供依赖 SVG 连线。折叠/展开为会话级 UI 状态不落库。

### 7.2 运行日志体系（v1.0.54 C23）

- **内核**：每条日志带自增序号 `q`（LOG_SEQ 从落盘最大值断点续号）；启动生成 `LOG_SESSION`（6 位随机 id + nowDT 启动时间 + getAppVer() 版本快照——从 app.py 窗口标题解析 `v\d+\.\d+\.\d+`，兜底 'dev'）；环形缓冲 `LOG_CAP_MEM=1000 / LOG_CAP_DISK=800`，warn/error 立即落盘、debug/info 批量落盘策略不变。
- **性能观测（APM 慢事务实践）**：RENDER 完成耗时 >300ms → warn；flushPersist 主状态落盘 >500ms → warn。正常路径维持 dbg()（debug 级不落盘不进控制台，LOG_SHOW=info）。
- **一键诊断包**：`exportDiagnostics()` 单 JSON = {app, ver, exportedAt, session, env{ua,platform,lang,screen,tz,storage(标准 key(i) 接口计数 supplydev_ 前缀字节数),idb(DB_READY),bkport(__BKPORT)}, logStats, logs, auditTail(50)}；文件名 `supplydev-diag-<日期>-<会话id>.json`；**不含业务数据与凭据**。
- **打点覆盖**：登录/CSV 导出 → logAudit（审计+运行日志双通道）；备份通道失败分级（HTTP 非 2xx → warn、请求异常 → error、bkport.js 未配置 → debug）；评分重算/路由切换 → debug。全局 window error + unhandledrejection 兜底（C10 已有）持续生效。
- **测试结构性约束**：C23 行为批次置于 pendingAsync 异步块（等 C6 等前置异步流排干），防 Blob 桩串链与 modal-ok 覆盖污染前置断言；Blob 桩隔离返回平面对象。

### 7.3 对抗性审查收敛轮（v1.0.55 C24）

- **订单终态守卫孪生站点修复**：甘特下钻弹窗订单行（ganttDrill）与项目详情「订单」tab 倒计时列此前直接 `overdueState(diffDays(orderDue(o)))`，已收货订单（step>=4）被误标逾期红标；统一加 `_dn=o.step>=4||o.status==='已完成'` 分流显示「✓ 已完成」绿色（与订单列表口径对齐）。verify C24 以「两处计数==2」断言兜底防再次漏网。
- **审查方法沉淀**：孪生站点类缺陷（同一业务口径多处渲染）单点 replace 必漏，修复必须带计数探针断言；「数据不可见」类风险要检查所有「父引用过滤」路径的孤儿态。

### 7.4 项目详情甘特图（v1.0.56 C25）

- **结构**：项目详情新增「甘特」tab（`detailTab==='甘特'`），主体 `projGanttHTML(pid)`——单容器双向滚动（`overflow:auto`）+ `position:sticky` 双吸附（左列 `left:0`、表头 `top:0`），左 WBS 任务树（复用 msWbsCodes/msGroupSpan/msChildren）+ 右时间条形区。
- **时间区**：日宽 30px 固定；月表头分段 + 日表头（周末着色）；周末条纹用 `repeating-linear-gradient` 单层实现（以首周六为相位，防 DOM 膨胀）；今日线绝对定位（`var(--warn)`，pointer-events:none）。范围=里程碑/分组跨度 ∪ ideaDate/targetDate，前后各留 3/7 天，最小 14 天。
- **分组防御**：分组行只渲染汇总条（var(--ink) 实条 + n/m）且**不可点**——msDrill 对无日期分组会出 NaN 文案（ganttDrill 有专门分支、msDrill 没有）。

### 7.5 甘特图对抗性审查修正（v1.0.57 C26）

- **repeating-linear-gradient 周期不变量**：重复周期=最后一个色标位置。旧周末条纹末位色标=`(satOff+2)*DAY_W`，仅周一起步（satOff=5）恰好 7 天周期——周六起步 satOff=0 → 周期 2 天全轴涂色，其余起步逐周漂移；C25 真机截图未暴露纯属起点巧合。修复后两分支（周日起步双段条纹 / 其余单段）末位色标均为 `7*DAY_W`，verify C26 以周六/周日起步双行为断言锁定。
- **NaN 渲染洞三连修复**：msState 空日期→「未排期」（终态「已完成」优先于未排期，对齐 C15 口径）；工期条分支 `m.date&&m.endDate&&m.endDate>m.date` 三连守卫；新增/编辑里程碑弹窗双站点校验「非分组日期必填」（同型站点计数==2 探针）。
- **今日线钳制**：todayX 夹在 [0, timelineW-2]，防项目日期远离今天时绝对定位子元素把横向滚动区拉出空白。
- **审查方法教训**：源码级断言要匹配源文件字面量（`7*DAY_W` 表达式），不能匹配运行时拼接结果；行为级构造日期时注意 projGanttHTML 对 lo 再减 3 天的偏移，目标起步日=lo-3。

### 7.6 甘特任务层与项目总条（v1.0.58 C27）

- **kind='task' 同权设计**：任务实体复用 milestone 存储轨道，`kind:'task'` 与 `kind:''`（里程碑）同权——全站聚合（进度/依赖/时间轴/打印/自检 11 处）均为排除语义 `kind!=='group'`，新类型零迁移零聚合改动。任务必填结束日期（弹窗双站点+CSV 共三处校验），甘特画工期条+「任务」tag。
- **项目总条**：`projGanttHTML` 顶部渲染项目汇总行——跨度取**兜底前的 rawLo/rawHi**（内容跨度=里程碑/任务/分组 ∪ ideaDate/targetDate），标注「总时长 N 天」（含首尾）。关键陷阱：lo/hi 的 todayStr 兜底若发生在采样前，全无日期项目会渲染假「总时长 31 天」——采样必须在兜底前，且单端真值（另一端靠兜底）时不渲染。
- **断言绑定教训**：源码级断言绑定业务文案「里程碑需要日期」，合并重复校验（改为 `(isT?'任务':'里程碑')` 动态文案）即被打爆（cnt=0）——源码级断言必须绑结构特征（`if(!isG&&!fv('f-msdate'))`），禁止绑易改文案/运行时拼接串。
- 计数探针口径：编辑弹窗 option 带 `'+(cond?' selected':'')+'` 拼接，与新增弹窗静态 option 的字符串形态不同——按 option 显示文本（`>任务（工期条）<`）计数更稳。

### 7.7 本机安装版与数据联动（v1.0.59 C28）

- **双产物链路**：build.py 预检（pywebview + ISCC，缺失即中止不消耗版本号，`--no-installer` 逃生）→ 版本号递增 → PyInstaller 绿色版 → Inno Setup `installer.iss` 产出 `SupplyDevLocal-setup-vX.Y.Z.exe`。版本号**单一来源**：version.txt → `/DMyAppVersion` 注入，iss 头部 `#ifndef` 直接 `#error` 防绕过编译。
- **iss 关键决策**：`PrivilegesRequired=lowest`（免 UAC，`{autopf}` 映射 `%LOCALAPPDATA%\Programs`）；`AppId` 固定 GUID（升级识别/卸载登记的稳定锚点，永不可改）；`AppMutex=Local\SupplyDevLocal` 与 app.py 单实例互斥体同名（运行中禁止覆盖安装）；`[Files]` 把版本号绿色 exe 重命名为固定名 `SupplyDevLocal.exe`（快捷方式稳定，版本号在窗口标题）。
- **数据联动原理**：数据目录 `~/.supplydev` 由 app.py 决定、与 exe 存放位置无关——绿色版/安装版天然共用一份数据；单实例互斥防并发写；卸载器只删自身安装文件（刻意不设卸载删除段），`~/.supplydev` 永不触碰。
- **编码陷阱**：iss 含中文注释时必须以 `utf-8-sig`（带 BOM）编译——ISCC 对无 BOM 文件按 ANSI 解析会乱码/报错；build.py 先复制 BOM 副本到 `build/` 再编译（`/DSourceExe` 注入绝对路径、`/O` 覆盖输出目录）。
- **断言口径**：「禁止出现 X」类断言必须绑节头/结构（`[UninstallDelete]`）而非单词——iss 注释里解释性提及同一词会误报（C26 教训的再现）。

### 7.8 界面实时联动守卫与日志增量（v1.0.60 C29）

- **真实缺陷**：openBOM 等 6 站点（openBOM/delBOM/editProcess/openMaterialPrice/openMaterial/openProcess）直调 `renderCost(pid)`——该函数写成本视图专用容器 `#cost-detail`；从项目详情「成本」tab 调用时容器不存在，`$('#cost-detail')` 返回 null → `null.innerHTML` 抛错（被全局 error 兜底吞掉），表现为「加了 BOM 界面不动」。守卫模式定案见 §4.4。
- **日志增量（C23 内核上的覆盖面扩展）**：①资源加载失败捕获——capture 阶段 error 监听器（target 为元素时是资源错误）；②console.error 桥接——包装 console.error 写入 logLog，`_inLogConsole` 标志防递归（logLog 自身控制台输出不回流）；③登出 logAudit。**分工陷阱**：资源 error 事件会同时到达 window 级与 capture 级监听器——window 级必须 `ev.target!==window` 过滤，否则每个资源失败产生两条日志。
- **行为级测试要点**：沙盘 `querySelector` 按 sel 自动造缓存元素——**无法用「容器为 null」断言旧缺陷**（沙盘永不返回 null），只能验证守卫分支的渲染结果差异。

### 7.9 甘特实时联动感知层（v1.0.61 C30）

- **结构审计**：甘特数据链全部变更入口（里程碑弹窗×2 / delMilestone / 依赖 addDepClick+depDrill / 新增+编辑项目 / delProject+projBatchDel / importCSV+doImportJSON+undoImport）收尾渲染全量审计，全部带 RENDER，无滞留站。
- **感知修复①**：`wbsUnfold(gid)`——往折叠分组写入子项后自动展开，三站点（openMilestone/editMilestone/CSV）调用，verify 计数==4（含定义）。
- **感知修复②**：`#pg-scroll` + `onscroll="pgScroll=this.scrollLeft"` 滚动记忆，恢复点挂 `restorePgScroll()`（见 7.15），goProjectDetail 重置——防「改完跳回开头」。**id 曾误挂仪表盘 ganttHTML 同型容器**（gantt2-scroll 是仪表盘、详情甘特是无 class 内联样式容器），headless 端到端 sc=NULL 抓出后改正。
- **测试教训**：C30 行为批次开头必须 `pendingAsync>1` 排干循环——未排干时批次同步体插入 C6 await 窗口，openMilestone 覆写 `#modal-ok` onclick，C6 导出链路点空回调 → `blobs[0]._s` undefined（C23 串扰教训的变体：覆写型串扰）。

### 7.10 甘特自由拖放（v1.0.62 C31）

- **交互模型**：mousedown 起手（pgDrag，双缘手柄 stopPropagation 防冒泡到整条）→ 位移 4px 阈值内=点击下钻（pgDragUp 内 msDrill 分流）→ 越阈值=拖拽（幽灵条直改 style.left + `#pg-drag-tip` 浮动日期提示 + `body.pg-dragging` 全局抓取光标/禁选中）→ mouseup 提交。
- **数据闭环唯一路径 `pgDragCommit(id,mode,days)`**（可测试内核，verify 直接调用）：mode∈move/left/right；move 平移 date+endDate 同步（保持工期不变量）；left/right 单缘改期，越界钳制 `nd=addDays(m.endDate,-1)` / `ne=addDays(m.date,1)`（date<endDate 永不破坏）；0 位移/分组/未知模式返回 false 零改动。链序：logAudit → recalcProgress（C11）→ persist()（C13 自动 recomputeDerived）→ RENDER（时间轴范围随拖出边界自适应扩展）。
- **派生数据禁拖双站点守卫**：pgDrag 与 pgDragCommit 均含 `msIsGroup` return——分组汇总条/项目总条是 recompute 派生值，拖拽改写会被下次重算静默回滚，必须在入口拒绝。
- **日宽单一来源**：`PG_DAY_W=30`，projGanttHTML `DAY_W=PG_DAY_W` 与拖拽位移换算（`days=Math.round(dx/PG_DAY_W)`）同源，防两处日宽漂移导致拖拽落点错位。
- **监听器卫生**：mousemove/mouseup/keydown 以命名函数引用成对 add/remove（verify 断言固化）；tip 元素与 pg-dragging class 在 pgDragUp 无条件清理。
- **测试口径教训（工具闭环实证）**：①拖拽后进度断言不能按「任务数」手算——persist→recomputeDerived 将任务与里程碑节点同权计数（1/3=33% 非 1/2=50%，C27 语义）；②拖拽审计（logAudit）后紧跟 recalcProgress 的「进度联动」审计，「取最后一条」断言错位，改「近 4 条内匹配」。headless 端到端（真实 MouseEvent 派发）实证 before/afterMove/afterResize/ghostMoved/tipCleaned/draggingCleaned/audit=2 全部符合预期。

### 7.11 甘特自由新增三类条目（v1.0.63 C32）

- **入口结构**：甘特 tab 头部三按钮（task/ms/group 各 1）+ 空态引导三按钮（各 1）+ ganttDrill「+ 里程碑」（ms）+ 概览 tab「+ 里程碑」（ms）——`openMilestone(pid,presetT)` 预设类型（pt 三分支 selected），非法值回落 task 向后兼容全部旧单参调用。
- **真产品缺陷（headless 端到端实证抓出）**：`openMilestone` 的「关联项目」下拉原实现**默认选中列表第一项**——从项目详情甘特点「+ 任务」极易把任务存到别的项目（表现为「保存成功但当前项目甘特没变化」）。修复：`popts` 渲染 `selected=(p.id===pid)`，源码断言兜底。排查教训：缺陷曾被两个假象掩盖——①复用旧 Chrome profile 经 IndexedDB 预载历史数据；②种子 state 自带历史审计致审计计数假阳性。**最终以 `state.milestones.filter(productId===pid)` 直查实体归属定位**。
- **测试基建三条（verify 沙盘）**：①elCache 跨批次残留——行为批次内**显式 setV 全字段**防御（例：C30 批次 setV 过 `#f-msgroup='c30g'`，后续批次同 select 未清空 → 保存走「归属阶段无效」静默中止）；②沙盘 select 不反映 selected 属性到 .value，preset 预设断言只能走 `openMilestone._pt`；③改 supplydev.html 后必须**重新生成 _shot 副本**——用旧副本验证新修复 = 假阴性。
- **产品语义再确认**：测试项目设 targetDate → 基线里程碑「交付」自动同步（kind undefined 但聚合过滤 `kind!=='group'` 天然包含）→ 断言按「任务+基线」口径（drag 手柄 3+菱形 1=4；进度 1/2=50%），**禁止把基线同步当 bug 修**。

### 7.12 甘特+详情联动对抗性审查修复（v1.0.64 C33）

- **修复①（C32 回归）**：概览 tab「+ 里程碑」按钮 `openMilestone(pid)` 缺 preset → 回落 task 预选任务，语义错位。修 `openMilestone(pid,'ms')`；ms 预设站点总数 3→4（下钻弹窗/空态/概览/甘特头），计数探针同步更新。
- **修复②（依赖净化）**：`editMilestone` 可把任务转分组，但 `addDep` 只拦新增不拦转换 → 残留端点=分组的脏依赖污染关键路径/连线渲染。双防线：转换时显式清理+审计（`依赖清理：xx 转为阶段分组，移除 N 条`），`ensureDeps` 过滤条件加 `fm.kind!=='group'&&tm.kind!=='group'`（recompute 兜底，覆盖 JSON 导入等异常路径）。
- **修复③（滚动记忆盲区）**：`restorePgScroll()` 抽公用——原 pgScroll 恢复只挂 RENDER 尾部，tab 切换走 `viewProjectDetail()` 直调不经 RENDER，甘特⇄其他 tab 往返滚动位丢失。双站点（RENDER+viewProjectDetail 尾部）都调；`goProjectDetail` 重置语义不变。
- **修复④（拖拽幽灵视觉盲区）**：`pgDrag` 双缘手柄的 `currentTarget` 是 7px 手柄自身（`origLeft=0`），拖拽中手柄飞离条体——C31 e2e 只验了数据未验中程视觉，属工具闭环盲区。修：`bar=(mode==='move')?currentTarget:currentTarget.parentElement`，left 模式幽灵=父条 left+width 同步变化（`Math.max(PG_DAY_W,…)` 钳最小一天宽），right 模式=width 扩展；`pgDragState` 增 `origW`。
- **测试基建新坑**：①注入脚本经 bash heredoc→python 三引号两层转义，`\\'` 被吃成裸 `'` 致注入块**整体解析失败**（无 onerror、无标记、主脚本正常——三假象并存）；**注入生成器必须 Write 工具落盘成 .py 再执行**，且注入 JS 用双 `*=` 条件（`[onclick*="c33xp"][onclick*="ms"]`）替代引号转义；②真实 DOM 弹窗**无 `#modal-cancel`**（仅确认键，verify stub 专有），端到端关弹窗走 `closeModal()`；③异步探针链的最后一段定时器会覆写先落 title 的标记，探针时序要避开。

### 7.13 拖拽体验完善与联动全链路复审（v1.0.65 C34）

- **审查结论（三视角）**：主链路无 P0/P1 新缺陷。全量复核确认闭合：新增/编辑/删除→recalcProgress（按表单/实体 projectId）、delProject 级联（C17+v1.1 deps）、CSV/JSON 导入→persist→recomputeDerived 全量重算、msSyncDates 仅未用户化才跟随、状态直改仅 editMilestone 一站、条/菱形仅挂 mousedown=pgDrag（onclick=msDrill 在名字 span，无双触发）。
- **修复①（提示钳制同口径）**：`pgDragMove` 左/右缘提示原显示未钳制落点（提示 10-20 实落 10-19）。改为与 `pgDragCommit` 同口径：左缘 `_nd>=m.endDate→addDays(m.endDate,-1)`、右缘 `_ne<=m.date→addDays(m.date,1)`，并标注「（钳制）」。
- **修复②（Esc 取消拖拽，C31 P2 闭环）**：`pgDragCancel(ev)`——key==='Escape' 才触发；还原幽灵条 `left=origLeft/width=origW`、摘 mousemove/mouseup/keydown 三监听、清 `pgDragState`、去 `pg-dragging`、隐提示、toast「已取消拖拽」。`pgDrag` 挂载、`pgDragUp` 正常松手同步摘 keydown（双站点 removeEventListener 各 2 处，verify 计数探针）。
- **测试基建三连坑（docStub 能力缺口）**：pgDragCancel 真实调用路径暴露 stub 缺 `removeEventListener`/`body`(classList)/makeEl 缺 `remove()`——行为批次假阳性报错三连，逐一补齐。教训：**沙盘行为断言覆盖到哪个函数，stub 能力就要跟到哪个函数**。
- **验证**：verify 728 PASS、deadbtn 0；headless 端到端：拖拽中 tip/ghost/pg-dragging 就位 → Esc 后 tip 消失/ghost 还原/数据零变化 → 正常提交 +3 天（10-04|10-10→10-07|10-13）。

## 8. 下钻协议与批量操作（v1.0.49 C17）

- **goDrill 协议**：`goDrill(route, preset)` 设置一次性 `_drill`，目标视图开头消费（viewOrder 渲染后回填 `order-filter` value，viewProjects 回填状态筛选 + `_projExtra`），消费后置空——「下钻带入、用户可改」不串扰。
- **计算型筛选**：`projStatusMatch(p, f)` 统一处理普通状态值与 `__active/__due30/__soon7/__over` 计算选项（均含终态守卫）；健康度 `projHealth(p)` 基于 `overdueState` 分级（rank 0 逾期 → 4 终态），排序与徽章共用。
- **批量操作**：`_projSel`（id→1）跨页保留；删除走 `projDelCascade()`（delProject 与批量共用的级联主体，persist/RENDER 由调用方负责）；`exportModule(name, pid, ids)` 第三参支持选中行导出。
- **立项月过滤**：趋势柱 `goDrillIdea(ym)` → `_projExtra={label,ym,test}`，渲染器以 `(!_projExtra||_projExtra.test(p))` 叠加，chip 可清除；test 必须存在（行为级断言固化）。

## 9. 测试体系（发布前全绿才算完成）

| 工具 | 内容 | 命令 |
|---|---|---|
| verify.js | **728 项断言**：Node DOM 桩真实执行全部脚本，含 CRUD 行为级、**全路由 onclick 语法审计**（`new Function` 逐个解析，拦截死按钮类语法错误）、周期备份三态、评分公式、OTIF 真值表、AQL 三档判定、WBS 分组八处泄漏面、订单终态守卫孪生站点计数、甘特条纹周期/NaN 渲染洞、任务层同权与项目总条跨度、安装链路结构断言、实时联动守卫与日志桥接、甘特折叠展开与滚动恢复、拖放内核（pgDragCommit 真值表）与 Esc 取消、三类新增入口计数探针、依赖净化 | `node _tests/verify.js` |
| deadbtn.js | 静态审计 onclick 引用的函数是否定义（**查不出语法错误**，不能替代上者） | `node _tests/deadbtn.js supplydev.html` |
| c14_app_test.py | 备份壳层回归 | `python _tests/c14_app_test.py` |
| headless Chrome | `--headless=new --screenshot/--dump-dom` 真引擎端到端（登录守卫用**副本注入生成器** `_mkshot_cXX.py` 模式，不改主文件；**必须全新 profile**——旧 profile 经 IndexedDB 预载历史数据会污染种子） | 见 checklist |
| exe 冒烟 | 启动后 tasklist 确认进程存活 | — |

> **历史教训**：C11 曾因 onclick 缺右括号产生死按钮且静态审计漏检 → 语法审计因此而生；构造任何行内 onclick 后必须跑 verify。Git Bash 的 grep 在模式含单引号时静默假阴性 → 改用 Grep 工具或 Python 计数。长文本/含转义的注入脚本一律 Write 工具落盘成独立文件，不塞 heredoc。

## 10. 打包与发版

1. **红线自查**：`authRender();` 必须且只能在启动序列出现 1 次（截图验证时的临时绕过串 `authUnlock('ASACE')…` 必须恢复，grep 残留 = 0）。
2. `python build.py`（用 `C:/Program Files/Python312/python.exe`）：version.txt 自动递增 → 手册头部「适用版本/最后更新」自动同步 → PyInstaller 绿色版 → Inno Setup 安装版，双产物落 `dist/`。
3. **warn 红线**：`build/SupplyDevLocal-vX/warn-*.txt` 中 `missing module named 'webview'` 计数必须为 0（其余 pythonnet 等良性告警可忽略）。
4. exe 冒烟 + dist 保留全部历史版本。
5. neat-freak 同步 README / AGENTS.md / OPTIMIZATION-ROADMAP.md / `docs/checklist-vX.Y.Z.md` / 工作日志，全部文件 UTF-8 校验。

## 11. 安全模型（已知边界）

- 登录密码 PBKDF2+盐存储，**仅防误用，不防提权读取**：本地数据（IndexedDB/localStorage）明文，绕过 exe 可直接读。敏感字段级加密在路线图（P2）。
- 备份 token 防的是**其它网页向 127.0.0.1 CSRF 写垃圾**，不是加密。
- JSON 备份可选 AES-GCM 密码，忘密码不可恢复。

## 12. 常见改动指引

| 想做什么 | 改哪里 | 必须同步 |
|---|---|---|
| 新业务实体 | state 声明 + 视图函数 + exportModule cfg | MOD_NAMES、globalSearch、verify 断言、CSV 15→16 模块文档 |
| 新派生字段 | 接入 recomputeDerived | dataHealthCheck 快照对比项、终态守卫、verify 行为断言 |
| 新面板 | viewDashboard | 联动性依赖 §4.1（自动），加 verify 存在性断言 |
| 新导出模块 | exportModule cfg + PID_FILTER_KEYS | MOD_NAMES 中文映射、导入侧 parse 分支 |
| 改备份逻辑 | app.py BackupHandler/Api + bkSendState | c14_app_test.py 重跑、同秒文件名、_impPrev 防护不破坏 |
| 甘特新增入口/视图 | openMilestone(pid,presetT) + projGanttHTML | 入口计数探针（task/ms/group）、分组禁拖守卫、pgDragCommit 链路、AGENTS 甘特红线 |

## 13. 版本历史速览

| 版本 | 批次 | 要点 |
|---|---|---|
| v1.0.38-41 | C6-C9 | 基础功能完善期 |
| v1.0.42 | C10 | 导出过滤/中文名/日志筛选 |
| v1.0.43 | C11 | 联动/倒计时/编辑模式（引入死按钮 P0） |
| v1.0.44 | C12 | 语法审计/数据自检/跨天守卫 |
| v1.0.45 | C13 | **persist 收口统一响应式更新层**、终态守卫、时间守卫三通道 |
| v1.0.46 | C14 | **周期备份/备份校验/审计归档/搜索 12 类** |
| v1.0.47 | C15 | **逾期终态修复/仪表盘逾期处理面板（collectOverdue+ovTip+OV_ACT 统一口径）/帮助中心板块（第 9 导航，Alt+1~9）** |
| v1.0.48 | C16 | **仪表盘/项目汇总审查收敛：逾期口径八处对齐/客诉口径×4/搜索口径与缺列防御/趋势柱归一化/supScore 预计算** |
| v1.0.49 | C17 | **goDrill 下钻闭环 + 项目汇总提效（逾期优先排序/健康度徽章/批量改状态·导出·删除级联）** |
| v1.0.50 | C19 | **项目逾期口径细化：projDueState 单一出口 + projDueDate 分阶段用日期 + projDelivered 交付里程碑同步** |
| v1.0.51 | C20 | **订单 OTIF 达成率 + 抽检三档 AQL 缺陷分级（GB/T 2828.1 查表判定）** |
| v1.0.52 | C21 | 托盘常驻（pystray 右键菜单：显示/保存退出） |
| v1.0.53 | C22 | 甘特两级 WBS 阶段分组（kind:'group' 排除语义，八处泄漏面收口） |
| v1.0.54 | C23 | 运行日志体系（LOG_SEQ 断点续号/诊断包导出/资源与审计覆盖） |
| v1.0.55 | C24 | 终态守卫孪生站点修复×2 + 孤儿 parentId 净化器 |
| v1.0.56 | C25 | **项目详情甘特图 projGanttHTML（sticky 双吸附）** |
| v1.0.57 | C26 | 周末条纹 repeating-gradient 周期修复 + 甘特防御性修正×4 |
| v1.0.58 | C27 | **甘特任务层 kind:'task'（工期条）+ 项目总条「总时长 N 天」** |
| v1.0.59 | C28 | **本机安装版（installer.iss + build.py 双产物，数据 ~/.supplydev 与安装形态无关）** |
| v1.0.60 | C29 | 实时联动守卫六站点（ROUTE 守卫）+ 日志增量（console.error 桥接/资源失败捕获） |
| v1.0.61 | C30 | 甘特实时联动感知层（wbsUnfold 自动展开 + pg-scroll 滚动记忆） |
| v1.0.62 | C31 | **甘特自由拖放：pgDragCommit 数据闭环（平移/双缘缩放/菱形改期，派生条禁拖，天级吸附）+ 项目进度实时联动** |
| v1.0.63 | C32 | **甘特内自由新增三类条目（preset 三入口 + 空态引导）+ 真缺陷修复：关联项目下拉默认选中当前项目** |
| v1.0.64 | C33 | **甘特+详情联动审查修复：概览「+ 里程碑」ms 预设 + 任务转分组依赖净化双防线 + restorePgScroll 双站点 + 拖拽双缘幽灵作用于父条** |
| v1.0.65 | C34 | **拖拽体验完善：Esc 取消拖拽 + 提示钳制同口径 + 联动全链路复审（主链路无 P0/P1，确认 v1.0.55~64 修复全有效）** |
