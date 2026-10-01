# v1.0.28 打包前清单兜底（checklist）

核对时间：2026-09-25

## 红线约束

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 1 | 单文件自包含：无拆 js/css、无外部 CDN | ✅ | 本轮 C1/A3/B3/B4/C2 全部为内联 JS 修改，无新增外部依赖 |
| 2 | 存储红线（C1 起）：LS/LOG_KEY 走 store 层双通道，禁止绕过；小 key 纯 localStorage，key 前缀 supplydev_ | ✅ | 全量扫描 `localStorage.getItem/setItem` 无 `(LS`/`(LOG_KEY` 直读残留（仅 LS_TIME/LS_AUTH/LS_CATS 小 key 直读，符合设计）；IndexedDB 库名 `supplydev_db`、迁移标记 `supplydev_db_v1` 同源前缀 |
| 3 | 禁止裸 new Date 生成业务/审计/日志时间 | ✅ | 扫描 `new Date(` 均属时间源内部（parseDate/nowDate）或布局计算；store 层 `Date.now()` 仅用于存储时间戳比对（非业务/审计时间），符合 C1 设计 |
| 4 | authRender() 已恢复、无绕过登录代码 | ✅ | 末尾 `authRender();` 正常；无 `authUnlock('ASACE')` 残留 |
| 5 | CSV 导入统一走 importCSV(kind) | ✅ | 统一入口重构为分块读取→影子预跑→预览确认→执行+快照，逐行校验/去重/联动未破坏 |
| 6 | 视图渲染错误边界 RENDER() 保留 | ✅ | 未移除 |

## 本轮功能验证（verify.js 311 项全 PASS）

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 7 | deadbtn.js 死按钮审计 = 0 | ✅ | `node _tests/deadbtn.js supplydev.html` → 未定义函数数: 0 |
| 8 | verify.js 回归 311 项全部通过 | ✅ | `node _tests/verify.js` → 结果：全部通过 |
| 9 | A3 基线快照对比 | ✅ | snapBaseline(pid,reason) 自动/手动快照、baselineDrift 偏差分级（>3 天黄/>7 天红）、项目详情展示 |
| 10 | B3 成本核算 v2 | ✅ | diffVersionBOM 物料级差异（新增/删除/涨价/降价着色）、成本版本含 BOM 明细、mrpOnhand 在手/在途扣减净需求 |
| 11 | B4 质量管理 v2 | ✅ | 8D 整改 48h SLA 预警（d8Sla）、同供应商 30 天客诉 ≥3 自动 CAR（carCard）、客诉表单关联订单批次+时间戳（issueLinkOrder）、CSV issues 含批次/时间列 |
| 12 | C1 IndexedDB 迁移（桩验证） | ✅ | 迁移搬移+写标记+删旧 key、已迁移跳过不重复、失败保留原数据不写标记不写数据、storeSet/storeGet 双通道、storeDel 两通道清理、IndexedDB 较新重载 state+镜像回写、persist/saveLogs 落镜像、flushStore 幂等（17 项断言） |
| 13 | C2 导入增强 | ✅ | 分块读取流式解码（UTF-8 跨块不损坏）、影子预跑预览（行数/新增/跳过/错误）、确认后执行、会话快照 undoImport 回滚、团队页导入记录区、预览零副作用/取消不落库 |
| 14 | 对抗审查收敛 | ✅ | ①C1 桩 `_failPut/_failTx` 挂错对象修复；②logLog info 不立即落盘口径（saveLogs 断言改 warn）；③确认无绕过 store 层残留；④C2 预览跳过数字标红修复 |
| 15 | 数据联动与审计闭环 | ✅ | persist/saveLogs/load/LOGS 初始化统一走 store 层；normalizeState 抽取 load/storeReload 共用；CSV 导入联动未破坏，311 项回归全绿 |

## 真机验证

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 16 | IndexedDB 迁移真实环境：重启数据不丢 | ✅ | `smoke_c1.py` 两轮全绿：首启 50 种子→改名落盘→IDB 权威源留痕（probe=yes、ls 记录含改名头）→删 localStorage 镜像→flush→关闭；重启后 storeLogs 显示「数据较本地新，已重载」+「迁移完成（1 key）」，products[0] 恢复改名名、localStorage 镜像回写（结果存 _tests/smoke-c1-step1.json / step2.json） |
| 17 | **真机揪出的存量 bug：pywebview 默认 private_mode=True → WebView2 内存 profile，IndexedDB/localStorage 重启即清空** | ✅ 已修复 | 证据：隔离数据目录磁盘为空（profile 未落盘）+ 重启 IDB 无记录；修复 `app.py` `webview.start(storage_path=data_dir, private_mode=False)`；修复后磁盘出现 EBWebView/Default 等 profile 文件，两轮冒烟通过。**此前各版冒烟未测「重启数据保留」，该 bug 长期潜伏** |
| 18 | **真机揪出的 C1 bug：kv 仓库无 keyPath（out-of-line keys），storeSet/storeMigrate 的 put 缺第二参 key，真实 WebView2 抛错静默吞掉，IDB 写入从未落地** | ✅ 已修复 | 证据：冒烟直接写回环报 `put ... key parameter was not provided`；修复 supplydev.html 三处 put 补 key 参数（storeSet/storeMigrate×2）；verify.js 桩建模 out-of-line 契约（缺 key 即失败）+ 新增断言 312 项全绿 |
| 19 | 窗口标题/首屏/导航冒烟 | ⏳ 待执行 | 打包后截图存档 _tests/smoke-v1.0.28/ |

## 打包产物（执行后回填）

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 20 | 版本号自动递增 1.0.27 → 1.0.28 | ✅ | build.py 输出 `[版本] 1.0.27 -> 1.0.28`，version.txt=1.0.28 |
| 21 | dist/SupplyDevLocal-v1.0.28.exe 生成、历史 exe 保留 | ✅ | dist/ 保留 v1.0.15~v1.0.28 全部 14 个历史版本，v1.0.28 最新（14.7 MB） |
| 22 | warn-*.txt 无 `missing module named 'webview'` | ✅ | 精确 grep 无命中；System./Microsoft.Web 等 8 条为 pythonnet 良性告警 |
