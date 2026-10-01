# AGENTS.md

## 项目结构

- `supplydev.html` — 单文件前端，所有视图/数据/CSS 都在这里。**改功能只改这一个文件。**
- `app.py` — pywebview 壳，读 `version.txt` 设窗口标题，`storage_path=~/.supplydev`。**必须 `private_mode=False`**（pywebview 默认 True 会走 WebView2 内存 profile，IndexedDB/localStorage 跨重启清空——v1.0.28 真机揪出的存量 bug，勿回退）。
- `build.py` — 一键打包：**先预检 pywebview（缺失即中止，不消耗版本号）** → 自动 patch 版本号 → 清空 `build/` → PyInstaller → `dist/SupplyDevLocal-vX.Y.Z.exe`（文件名带版本号）。**dist/ 历史版本 exe 一律保留，不删除**；打包后查 `build/*/warn-*.txt`，`System.*`/`Microsoft.Web` 为 pythonnet 良性告警，但不得出现 `missing module named 'webview'`。
- `_tests/verify.js` — Node 回归验证：用 DOM 桩真实执行全部脚本。**改完前端必须跑 `node _tests/verify.js`，全部 PASS 才能打包。**
- `_tests/deadbtn.js` — 静态死按钮审计：抽取全部 inline 事件处理器，校验引用的全局函数已定义（方法调用如 `event.stopPropagation()` 自动跳过）。**打包前跑 `node _tests/deadbtn.js supplydev.html`，未定义函数数必须为 0。**
- `_tests/enc_webcrypto.js` — 备份加密真加密原语验证（Node 内置 webcrypto=OpenSSL 真实现，与 verify.js 的加密桩互补）：信封/往返/错密码拒绝/篡改拒绝/2000 项目耗时。改动加密链路后必须跑。
- `_tests/checklist-vX.Y.Z.md` — 每版发布清单（模板：功能/验证链/已知限制/待真机确认四段），打包前照此格式出清单。
- `version.txt` — 当前版本号，build.py 每次自增第三位。
- `assets/` — 应用图标资源：`make_icon.py` 生成 `app.ico`（多尺寸 16-256，品牌蓝渐变白徽章对勾）；build.py 通过 `--icon` 接入；前端 favicon/登录页/侧边栏 logo 为内联 SVG（同设计）。图标改动只改 `make_icon.py` 后重跑。
- `dist/` — 产物，不要手改。

## 构建命令

```
python build.py
```

不要直接跑 `pyinstaller` 命令——build.py 会自动加版本号和清理旧构建。

**打包解释器**：必须用含 pywebview 的 Python（本机为 `C:/Program Files/Python312/python.exe`）；WorkBuddy 沙箱 PATH 上的默认 python（workbuddy 托管版）无 pywebview，直接 `python build.py` 会被预检中止。显式指定：`"C:/Program Files/Python312/python.exe" build.py`。

**app.py 桥接红线（v1.0.29-36 真机排障结论，勿回退）**：本机 pywebview 6.2.1 的 `evaluate_js`/js_api 注入共用 run_js 链路且 `semaphore.acquire()` 无超时，会随机死锁——一旦注入线程挂起，`window.pywebview.api`、`events.loaded`、后续所有 evaluate_js 全部静默失效。因此：
- 自动备份走 **bkport.js + 本地 HTTP 通道**（`start_backup_server`，前端 `fetch POST /backup`），勿改回 js_api/evaluate_js；
- 端口/token 经**页面同目录 bkport.js**（相对 script 标签）传递，勿改回 URL query——WebView2 加载 file:// 时会剥掉 `?query`（History 库实证）；
- 备份失败各级观测写入 `~/.supplydev/backup_debug.log`（ping 探针/403/异常），排障先看此日志。
- **完整性校验接口（v1.0.46 C14）**：GET `/verify?token=` → `Api.verify_backup()` 比对最新备份的**字节数 + SHA-256** 与 `backups/index.json` 清单；备份文件名带微秒（同秒两次备份不互相覆盖），**滚动删除后必须 `_index_prune` 修剪清单**，否则校验会指向已删文件。

## 红线

- 单文件自包含：不要拆出 .js / .css，不要引外部 CDN（exe 离线运行）。
- 原生 JS：不用 React/Vue/构建工具。
- 数据存储（v1.2 C1 起）：主状态 `LS` 与运行日志 `LOG_KEY` 走 store 层双通道（IndexedDB 权威源 `supplydev_db` + localStorage 镜像，容量满自动跳过镜像）；启动无 `supplydev_db_v1` 标记时原子迁移旧数据（落盘成功才删旧，失败保留原数据回落 localStorage）；`LS_AUTH`/`LS_TIME`/`LS_CATS` 等高频同步小 key 保持纯 localStorage。所有 key 前缀 `supplydev_`（IndexedDB 库名 `supplydev_db` 同源）。**禁止绕过 store 层直接读写 LS/LOG_KEY**（如 `localStorage.getItem(LS)`），读走 `storeGet`、写走 `storeSet`、删走 `storeDel`。**`kv` 仓库无 keyPath（out-of-line keys）：`put(value, key)` 必须带 key 参数**（真实 WebView2 缺 key 抛错且被静默吞掉，v1.0.28 真机揪出；verify.js 桩强制缺 key 即失败）。
- 截图自检：临时把文件末尾 `authRender();` 改成 `authUnlock('ASACE');go('路由');`，截完改回。
- 打包前必须确认 `authRender();` 已恢复（不能把绕过登录的代码带进 exe）。
- 新增关键功能路径必须打点：业务变更走 `logAudit()`（自动同步进运行日志），技术细节走 `dbg()/logLog()`；视图渲染错误边界在 `RENDER()`，不许移除。
- 时间戳统一走 `nowDate()`/`nowDT()`（TIME_OFFSET 联网校准偏移），**禁止裸 `new Date()` 生成业务/审计/日志时间**（偏移非零时会与业务日期不一致）。
- CSV 导入一律走 `importCSV(kind)` 统一入口：逐行校验必填/类型/引用完整性 → 错误清单（弹窗前 10 条+运行日志全量）→ ID/业务唯一键去重 → 导入联动（syncProductStatus / recalcSupplierScore / snapshotCost / confirmDate），禁止另起导入路径。
- CSV 导出（v1.0.42 C10）：一律走 `exportModule(name,pid)`（`toCSV(rows,headers,fname)` 文件名带模块名），按项目过滤仅限 `PID_FILTER_KEYS` 列出的含 productId 模块，详情页按钮以 `data-pid` 声明（委托在 document click）；模块中文名统一读全局 `MOD_NAMES`，禁止再局部定义 KM/KM2 字典。**doImportJSON 整体覆盖 state 后必须 `importSessions=[]`**（旧 CSV 导入快照失效，撤销会还原脏数据，有回归断言）。verify.js 桩必须含 `print(){}`（C8 打印 60ms timer 在事件循环触发，缺桩即崩）。
- **备份加密（v1.0.38）**：`BK_ENC_ITER` 变更前必须兼容旧信封（历史加密备份按信封内 iter/salt 解密），否则全部解不开；`encBackupText/decBackupText/looksEncryptedBackup` 是加密唯一路径，禁止在导出/导入外另写加解密；导出/导入弹窗必须保留「忘密码不可恢复」提示文案。
- **时钟同步（v1.0.38）**：syncTime 成功分支统一走 `timeDriftRecord(off,src)`（持久化 LS_TIME + hist 上限 30 + 偏移>5s 告警），禁止改回裸 `localStorage.setItem(LS_TIME,...)` 直写；`readTimeInfo` 对旧格式（无 hist）与坏 JSON 兼容，勿删。
- **快捷键（v1.0.38）**：全局键盘走唯一入口 `globalHotkeys`（document keydown 挂载点勿拆分），新增快捷键在该函数内扩展；`Ctrl+S` 必须走 `flushPersist()+saveLogs()`（防抖窗口内的变更立即落盘）。
- **CRUD/状态机红线（v1.0.41 C9）**：删除一律走 `delXxx(id)` 统一模式（confirm → filter → 级联重算 → logAudit → persist → RENDER），**禁止绕过级联直接 filter**；`syncProductStatus` 含删除兜底分支（订单/打样清空且状态∈[生产中,已下单,打样中] → 回落立项中，已完工/已归档不动）；`delTeam` 在职老板保护（至少一名）；卡片视图切换只走 `setProjView(v)`（显隐职责在 renderProjCards，新增双视图必须接入该函数）；`parseDate/diffDays/overdueState` 对空日期返回 NaN/「未排期」(lvl:'none')，**日期缺失不得算成逾期**。
- **进度联动红线（v1.0.43 C11）**：项目进度是**派生数据**——里程碑增（openMilestone）/删（delMilestone）/改（editMilestone）三个保存点必须调用 `recalcProgress(pid)`，禁止在别处绕过它手写 progress 计算；编辑项目弹窗的进度字段是手工覆盖入口（下次里程碑变更仍会被重算）。报价采纳/拒绝（quoteStatus）与改价（editQuote）必须重算 `recalcSupplierScore`，改价另须 `snapshotCost`。新增逾期标记一律复用 `overdueState`（打样行/报价有效期已接入），**禁止另起倒计时文案**（红线同 v1.0.26）。
- **数据自检与按钮语法红线（v1.0.44 C12）**：①新派生字段（XxxScore/状态回落/进度类）落地时必须同步接入 `dataHealthCheck()`（全量重算+漂移计数），终态字段（已完工/已归档）**禁止被自检改写**；②在 JS 字符串模板里手写 inline onclick 时，闭合形态必须是 `fn(\''+id+'\')"`（`\')` + `"`），**构造按钮后必须跑 verify.js 的「全路由行内处理器语法审计」**（渲染全部视图/tab 后逐个 onclick 做 new Function 解析）——静态 deadbtn 只查函数定义、查不出语法错误，不得替代；③长时间驻留的陈旧数据（倒计时/看板类）一律走跨天守卫 `startDayRollGuard`（60s 翻日重算），禁止另起 setInterval 各自刷新。
- **统一响应式更新层红线（v1.0.45 C13）**：①**业务变更必经 `persist()`**——persist/flushPersist 收口时自动调 `recomputeDerived()`（全量重算项目进度/状态/供应商评分/基线/依赖兜底）再落盘，**新派生字段必须接入 `recomputeDerived()`**（返回漂移计数 {progress,status,score}，dataHealthCheck 与 10 分钟静默自检 startAutoSelfCheck 复用同一内核），禁止在 handler 里另写「只算单个实体」的旁路重算后绕过 persist；②**评分语义定案**：质量分/交期分=事件公式自动维护（`recalcSupplierScore`，无事件基线 95/90，编辑表单只读展示）、价格分=人工保真、综合分/评级随重算联动——CSV 导入的 q/d 列仅作迁移通道，导入即被公式收敛（verify 断言已按此语义更新，勿改回）；③**终态人工口径**：已完工/已归档项目的状态与进度，`recomputeDerived`/`recalcProgress`/`syncProductStatus` 一律不改写（防订单全收货→已完工后被里程碑比例拉回）；④时间守卫三通道（60s 定时 + visibilitychange + focus → `dayRollCheck`）勿拆分，新增时间敏感 UI 挂在 RENDER 派生层而非新起定时器。
- **打印报表红线（v1.0.40 C8）**：打印一律走 `openPrintReport(scope)` 统一入口（global=汇总 / project=单项目，复用 `#print-root` + `@media print`），禁止另起打印路径；报表内容**固定黑白灰配色，禁用 var(--xxx)**（打印不随主题，verify C7 断言已豁免 @media print 块）；时间戳走 `nowDT()`；`window.print()` 用 setTimeout(60) 包裹等 DOM 渲染；afterprint 清空报表 DOM。改报表结构必须同步跑 `node _tests/verify.js`（C8 批次 11 条断言）。
- **主题/色彩红线（v1.0.39 C7）**：全站色彩走 `:root` 语义变量（24 个），**新增任何颜色必须用 `var(--xxx)`，禁止新增属性上下文硬编码 hex**（verify.js C7 有静态断言拦截）。⚠ 命名陷阱：`--warn` 是**红色**（错误/逾期）、`--amber` 才是橙色（临期）、`--severe` 深红（严重逾期）；soft 后缀=浅底色。暗色只改 `html[data-theme="dark"]` 变量块，勿在 JS 里判主题写死颜色；业务状态色对象（甘特 c:/bg: 值）可保留 hex（中高饱和两态可读）。`LS_THEME` 为高频小 key，对齐 LS_AUTH 豁免口径纯 localStorage。同一文件修改**禁止 Edit 工具与 Python 直写混用**（快照互覆盖，v1.0.39 实测翻车一次）。
- **项目逾期口径红线（v1.0.50 C19）**：①项目层倒计时/逾期判定**一律走 `projDueState(p)` 统一出口**（内部：终态→terminal / `projDelivered(p)`→delivered / 其余 `overdueState(diffDays(projDueDate(p)))`），**禁止再直接写 `overdueState(diffDays(p.targetDate||p.sampleDue))`**；②用日期一律走 `projDueDate(p)`（立项中/打样中=打样截止优先，已下单后=目标交期优先，缺失回退），**禁止绕过阶段口径直取 targetDate**；③「交付」基线里程碑已完成 ⇒ 项目为已交付（绿色 ✓ 已交付，不计逾期、不入 __over/__due30），结转「已完工」仍为人工口径**禁止自动改状态**；④新增项目逾期展示点必须同步 verify.js C19 覆盖断言。
- **下钻与批量操作红线（v1.0.49 C17）**：①跨视图下钻走 `goDrill(route,preset)` 一次性协议（`_drill` 由目标视图消费后置空），订单页渲染后须显式回填 `order-filter` 的 value、项目页同理——**禁止新开跨页过滤通道**；②项目页新增筛选口径一律进 `projStatusMatch()`（计算型选项 `__active/__due30/__soon7/__over` 均含终态守卫），健康度一律走 `projHealth()`（内部基于 `overdueState`，禁止另起健康度判定）；③项目列表/卡片排序统一走 `_projSort` + 渲染器内置比较器（默认 health rank 升序=逾期优先），新增排序列必须同步 `_SORT_HEADS` 与表头 `th-proj-*` id；④批量删除必须走 `projDelCascade()`（与 `delProject` 共用级联主体），存在关联订单自动跳过，confirm+logAudit 双保险，**禁止批量场景绕过级联直接 filter**；⑤JS 单引号串内 onclick 内层单引号必须转义（`projSortBy(\'name\')` 形态）——C17 实测裸引号即 SyntaxError 全脚本加载失败；⑥`_projExtra` 附加过滤对象**必须带 test 方法**（趋势柱下钻缺 test 即渲染 TypeError，verify 行为级已固化防线）。
- **逾期展示红线（v1.0.47 C15）**：①**终态守卫**——已完工/已归档项目、已收货订单（step>=4）、已完成里程碑**一律不计逾期**：甘特图/项目列表/详情 banner 用 `_pDone`/`_pd2`/终态判断分流（终态显示「✓ 已完工」类标签），聚合口径统一走 `collectOverdue()`（内含 `_done` 过滤），**禁止新写逾期判定绕过终态过滤**；②逾期提示说明单一来源——悬浮说明用 `ovTip(kind,name,due)` + `OV_ACT` 建议映射（title 属性内用户输入必须 esc），**禁止散写逾期文案**；新增逾期展示点必须同步 verify.js C15 覆盖断言；**同一业务口径（如「客诉待处理」「已逾期」）在多板块出现时必须单一数据源/同一过滤条件**（KPI、待办、看板、聚合面板、详情、打印报表、卡片/列表搜索八处对齐，参考 C16 批次），过滤函数须对缺列数据（`(p.cat||'')`）防御；③新增导航板块必须三处同步：NAV 数组 + VIEWS 映射 + verify.js C12 审计路由表（并核对 Alt+1~9 快捷键上界）。
- **备份策略红线（v1.0.38 + v1.0.46 C14）**：①备份发送唯一入口 `bkSendState(cb)`（启动备份 `tryBk` 与周期备份共用），**禁止另起 fetch**；②`bkMarkSuccess()` 仅在 HTTP 200 后落 `LS_LBAK`（高频小 key，对齐 LS_AUTH/LS_TIME/LS_CATS 豁免，纯 localStorage 合规）；③变更戳 `LS_LCHG` 由 `flushPersist()` 落盘后写；周期备份 `startPeriodicBackup()` 每 5 分钟巡检，**仅在「距上次备份满 24h 且备份后确有变更」时落盘**，`_impPrev` 导入中不备份中间态；④7 天未备份提醒在登录页期间顺延 60s 重查，勿改成无条件弹。

## 路由

内存变量路由（非 hash 路由）：`go(r)` 设置 `ROUTE` 并触发 `RENDER()` → `VIEWS[ROUTE]()`（见 supplydev.html 末尾）。

- 路由 id：`dashboard` / `projects` / `product` / `cost` / `supplier` / `order` / `quality` / `team` / `project`。
- `project` 路由对应**项目详情**视图 `viewProjectDetail()`（无独立 projectDetail 路由 id）；从项目列表点行经 `goProjectDetail(id)` 进入，导航高亮回落到 `projects`。
- 视图函数名：`viewDashboard()` / `viewProjects()` / `viewProduct()` / `viewCost()` / `viewSupplier()` / `viewOrder()` / `viewQuality()` / `viewTeam()` / `viewProjectDetail()`。

## 视图结构（对齐云端版）

- **全板块刷新工具条（v1.0.26）**：8 大视图（dashboard/projects/product/cost/supplier/order/quality/team）头部统一走 `viewHeader(title,sub)`（内含 `refreshTool()`：最后刷新时间戳 `lastRefreshAt` + 数据保存时间戳 `lastSaveAt` + 「⟳ 刷新」按钮），刷新统一走 `refreshView()`（记录时间戳→toast→RENDER()），禁止各视图另起刷新实现
- **全局搜索（v1.0.26）**：顶栏 `global-search` 输入框 + `gs-panel` 浮层，`globalSearch(v)` 跨 **12 类实体**实时候选（项目/供应商/订单/客诉/物料/里程碑/报价/证书/整改/抽检/工艺/成员，上限 20 条；新增实体须同步补 `goSearchHit` 落点映射与空态文案），无匹配显示空态，点击 `goSearchHit(type,id)` 直达（项目→详情、里程碑→所属项目详情、其余→模块首页），Enter 跳第一条，Esc/失焦 `closeGS()` 关闭
- **日志系统（v1.0.26）**：`window.addEventListener('error'/'unhandledrejection')` 全局捕获记 logLog('error','global')；日志面板 `openLogViewer()` 含级别筛选 + 关键字搜索（`logSearch` → `renderLogList()` 实时过滤 + 命中计数 + 关键字高亮）+ 错误行红底高亮 + 导出 JSON + 清空；落盘上限 500 条；业务变更一律 `logAudit()` 打点（新增/编辑/删除/导入/状态流转全覆盖，删除需先校验引用完整性）
- 仪表盘：3×2 KPI（6张）+ 左2/3甘特图右1/3待办 + **关键日期看板（月历网格 + 右侧日期详情）** + 风险提醒/近期到期节点 + **数据速览（项目状态分布/供应商风险TOP/近6月新增项目/毛利健康度/最近动态）**。甘特图筛选状态在 `ganttFilter`（scope/cat/range），容器 `.gantt2-scroll` 必须 `overflow-y:auto`（垂直滚动铺满，`max-height` 内联控制），时间源统一走 `nowDate()`（TIME_OFFSET 联网同步偏移）；**甘特图节点点击下钻：项目行 `ganttDrill(pid)`（项目进度/里程碑/订单详情弹窗）、里程碑菱形 `msDrill(mid)`（里程碑详情）**；顶栏时钟 `clockText()` 带同步状态（⟳ 同步中 / ✓ 已同步 / ⚠ 未联网），`syncTime()` 多源采样→中位数偏移→离群自检→持久化（LS_TIME）→30 分钟周期重试
- 仪表盘数据速览（v1.0.25）：项目状态分布卡（平均进度 + 各状态堆叠条 + 各状态项目明细 chips 点击 `goProjectDetail(id)` 直达详情）；供应商风险 TOP（`supScore(s)=质量40%+交期30%+价格30%`，取 <80 分前 4 名，停用供应商排除）；近6月新增项目柱图（**月份基准必须走 `nowDate()` 派生，禁止裸 `new Date()`**）；毛利健康度卡（平均定价毛利 + 亏损/微利 TOP，落地成本=landedCost=BOM实算+运费+关税，**过滤 targetPrice>0 且 cost>0 且状态非已归档/已完工**，防无成本项目误算 100%）；最近动态卡（`state._audit` 尾部 6 条倒序）
- 项目详情页 `viewProjectDetail()`（v1.0.25）：中文标签页（概览/打样/成本/供应商/订单/质量，状态在 `detailTab`）；各模块内「+ 新增」按钮传 `pid` 预选产品（`openSample(pid)`/`openOrder(pid)`/`openIssue(pid)`/`openQuote(pid)`/`openBOM(pid)`/`openMilestone(pid)`）；概览基本信息含编辑入口 `openEditProduct(pid)`（**必须含负责人 owner 字段输入与保存**）；里程碑块含 CSV 导出/导入按钮；逾期告警 banner（里程碑 `status!=='已完成'` 或订单 `step<4` 且 `diffDays(orderDue(o))<0`，展示最严重一条含天数）
- **任务依赖（v1.1）**：独立数据 `state.deps[]` {id, from, to, type:'FS'|'SS'|'FF'|'SF'}（from/to 引用里程碑 id，DEP_TYPES 常量映射中文）。旧数据 load 时 `ensureDeps()` 自动迁移（基线链：同产品基线里程碑按日期排序相邻 FS，`addDep` 同名去重）+ 清理悬空引用；种子全新数据额外 `seedCrossDeps()` 生成跨项目演示链。关键路径 `critPath()` 用 DFS 求 DAG 最长链（**节点权重必须取 `daysBetween(byId(...).date, byId(...).date)`，禁止传里程碑 id 给 daysBetween**，否则全 NaN 退化为单节点），防环返回空；`depReachable(from,to)` 栈式 DFS 判成环（自环=true）。两段式编辑 `addDepClick`（第一击选前置蓝描边，第二击弹类型框；重复/自环/成环拦截）、连线点击 `depDrill` 查看/删除；SVG 连线层灰/橙（关键路径）/红（时序冲突=后继早于前置）三色 + 箭头 marker，**rowY 必须随项目行 `rowY+=ROW_H` 递增**（否则连线叠首行）；甘特图例含「橙=关键路径/红=时序冲突」；关键路径逾期节点入风险提醒（`depDownstream(mid)` 下游影响面计数）；**删除里程碑 `delMilestone` / 删除项目 `delProject` 必须级联清理关联依赖**（先取 delMs 再 filter，顺序错误会误删全部）；JSON 备份导入补 `ensureDeps()`；deps 为 CSV 第 13 模块（按 前置产品ID+前置里程碑 / 后继产品ID+后继里程碑 定位，自环/成环/重复导入拦截）
- **供应商 ABCD 四级（v1.1）**：评级 `supGrade(sc)` A≥90/B≥80/C≥70/D<70；综合分 `supScore(s)` 按品类分层权重加权（`supWeights` 读 `state.catWeights`，未配置回落默认 质量40%/交期30%/价格30%）；事件自动扣分收敛进 `recalcSupplierScore`（客诉待处理/调查中→质量分 -2/件、已解决/关闭 +1；逾期未收批次订单→交期分 -3/单），**评级随评分自动联动**（新供应商/编辑三维分/权重变更/CSV 导入权重 均重算）；供应商视图 6 KPI（总数/A/B/C/D/停用）+「品类权重」弹窗（`openCatWeights`，保存后全量重算评级+logAudit）；catWeights 为 CSV 第 14 模块
- **订单交付日历 + ETA（v1.1）**：ETA 重算 `etaDate(o)`（step≥4 或已发货/已完成直接返 orderDue；否则按 计划进度 6×(1−d/ORDER_CYCLE) vs 实际 step 差值外推，`ORDER_CYCLE=35`）；`etaState(o)` 三级预警（不晚于计划绿 / 晚≤7天橙 / 晚>7天红），订单表格交期/ETA 双列 + KPI「ETA滞后」（lvl!=='ok' 且 step<4）+ 仪表盘风险「ETA 严重滞后」（severe 且 step<4）；交付日历 `orderCalHTML()` 42 格月历（圆点按 ETA 红黄绿着色、点击 `orderCalDay` 看当日明细、`orderCalNav`/`orderCalGoToday` 导航，`orderCalYm` null=跟随今天）；改期留痕 `orderReschedule(o,what,from,to)`（写 o.history {t,u,what,from,to} + logAudit），**合同交期变更（editOrder）与交付批次变更（openBatches 批次内容变化）必须留痕**，`openOrderHistory` 查看
- 仪表盘面板折叠：待办提醒/风险提醒/近期到期节点三卡折叠状态在 `dashFold`（{todo,risk,node}，模块级 var 跨 RENDER 保持）；头部「收起/展开」开关走 **`dashFoldToggle(k)` 局部刷新**（只换 `#dash-panel-<k>` 内容与 `#dash-fold-<k>` 按钮文案，卡内容暂存在 `window._dashPanels`，缺失时回退全量 RENDER；禁止改回 `dashFold.x=!dashFold.x;RENDER()` 全量重建），收起时内容区显示「已收起」占位提示、**展开时显示全部条目（v1.0.26 删除截断与虚假提示，禁止恢复 6/8 条截断）**
- **持久化性能（C4）**：`persist()` 为 **150ms 防抖合并写**（同时段多次变更只做一次 stringify+storeSet 双通道写），**关键路径必须用 `flushPersist()` 立即落盘**：beforeunload、CSV/JSON 导入完成、storeReload 镜像回写；禁止把这三处改回防抖版 persist。纯 UI 筛选类高频交互（甘特 scope/cat/range 下拉）走 `scheduleRender()` 合帧（rAF 优先/16ms 兜底），业务动作路径仍直接 RENDER 保证同步语义；全局搜索输入走 `gsInput()` 120ms 防抖，`gsKey` 回车先 `gsFlushSearch()` 冲刷
- **供应商评分细化（v1.0.37）**：`supPunctuality(sid)` 只统计 `batches` 中 `received && receivedDate` 的批次（准时率=按期占比，σ=延迟天数标准差），**无实收日期的旧数据不计入，禁止用承诺日期虚构实收**；`recalcSupplierScore` 交期分公式 `90-overdue*3-σ*2-(1-准时率)*15`（有实收批次数据时），无数据回落 `90-overdue*3`，**禁止改回单一逾期口径**；`supResp(sid)` 平均报价响应天数（quotes 的 reqDate→quoteDate）；批次确认收货（toggleBatch）必须采集 `receivedDate`、取消收货必须清除；供应商 `tier`（战略/优先/常规）默认**常规**，旧数据无 tier 编辑时不得误选优先
- **资质证书（v1.0.37）**：`state.certs[]` {id, supplierId, type, expire, note}，类型常量 CERT_TYPES；到期走 `overdueState` 三级预警（供应商 KPI「证书预警」+ 仪表盘 riskItems）；CSV 第 15 模块（按 供应商ID+类型 去重，引用完整性走 needS）；**删除供应商必须级联清理其证书**（delSupplier 内 filter，勿移除）；normalizeState 与 JSON 导入迁移清单必须含 'certs'
- 近期到期节点：`upcomingNodes(days=30)` 默认未来 30 天（历史为 14 天），仪表盘头部文案「未来30天」，禁止回退旧口径
- 逾期语义：全站日期倒计时统一走 `overdueState(d)` 三级预警（剩 >3 天灰 #86909C / 剩 ≤3 天橙 #FF7D00 / 逾期 ≤7 天红 #F53F3F / 逾期 >7 天深红 #C41D1D），标签一律「剩 N 天 / 今天到期 / 逾期 N 天 / 严重逾期 N 天」，**禁止各视图另起倒计时文案**（remainBadge/甘特剩余天数/订单交期列/详情弹窗共用）
- 关键日期看板：数据源统一走 `dateEvents(ds)`（**项目节点来自里程碑实体 state.milestones（可增删改、实时反映到看板）**，另聚合打样/订单批次交期/整改/客诉，含 done 完成语义）；月历 `keyDateBoard()` 42 格渲染 + `dayDetailHTML(ds)` 详情面板；交互 `selKeyDate/ds keyDateNav/goKeyToday` 改 `keySel/keyCal` 后 `renderKeyBoard()`；详情条目跳转：项目节点 `goProjectDetail(id)` 直达，其余跳模块首页
- 项目汇总：品类chips+6 KPI+卡片/列表双视图（projView；卡片 renderProjCards，列表 renderProjectRows，筛选共享 window._projCat；**卡片与列表均展示里程碑进度 `msSummary(p)`：完成数/总数 + 下一里程碑**）
- 里程碑实体：独立数据 `state.milestones` {id, productId, name, date, status:'未开始'|'进行中'|'已完成', desc, color}。新建/导入产品走 `msBaselineFor(p)` 增量生成基线（打样截止/样品确认/下单/交付，同名不重复追加），旧数据在 load 时 `ensureMilestones()` 自动迁移；CRUD 走 `openMilestone`/`editMilestone`/`delMilestone`（业务变更 logAudit 打点）；编辑产品日期/状态联动 `msSyncDates`/`msRefillBaseline`（未自定义的基线里程碑日期跟随产品字段、状态自动推进，自定义里程碑不被覆盖）；删除产品时级联清理关联里程碑；CSV 导入导出为第 12 个模块（productId 引用完整性校验，产品不存在不入库）
- 种子数据：`seedProducts()` 确定性生成 50 个项目（SEED_CATS 15 品类 + SEED_NAMES 名称池，覆盖全生命周期状态），`seedLinkExtra()` 自动关联 BOM/打样/报价/订单/里程碑；品类下拉 `catOptions(sel)` 动态取 SEED_CATS ∪ 现有项目/供应商品类 ∪ 自定义品类（`customCatList()` 读 `LS_CATS='supplydev_custom_cats'`，必须带 supplydev_ 前缀），新建/编辑不得丢品类
- 品类自定义：产品新建/编辑弹窗内「+ 自定义品类」按钮（`toggleNewCat()` 显示/隐藏输入行，`confirmCustomCat(selId)` 校验非空与去重→写入 LS_CATS→追加到当前下拉并选中→**logAudit 打点**）
- 产品与打样：2 tab（产品列表卡片网格 / 5列打样看板）
- 成本核算：7 tab（物料库/工艺库/BOM算价/供应商比价/成本版本/MRP需求/成本模拟器）。BOM 项可设类型=半成品（childProductId 引用其他产品 BOM），成本/MRP 递归展开；防环用栈式标记（进标记/出清除），不许用全局一次性 visited（会漏算同一半成品多次出现）。
- 供应商：6 KPI + 评分进度条表格（>20 条分页）
- 订单：4 KPI + 7步生产进度条表格（状态筛选+分页；交期口径统一走 orderDue()：有批次取最近未收批次）
- 质量：3 tab（客诉/8D整改/到货抽检）
- 团队成员：卡片网格（角色Badge，可增改，数据在 state.team）+ 操作审计日志（logAudit 打点；`_audit` 上限 300 条，溢出转 `_auditArc` 归档上限 2000 条，翻页入口「查看归档」/「导出全量」）
- 全板块编辑纪律：每个业务实体都有编辑入口；编辑引起跨模块影响时必须联动（评分重算 recalcSupplierScore / 项目状态 syncProductStatus / 成本快照 snapshotCost / confirmDate），并 logAudit 记录

## 视觉规范

主色 #165DFF；完成 #00B42A；逾期 #F53F3F；严重逾期 #C41D1D；即将到期 #FF7D00；背景 #F7F8FA。
