# v1.0.27 打包前清单兜底（checklist）

核对时间：2026-09-24

## 红线约束

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 1 | 单文件自包含：无拆 js/css、无外部 CDN | ✅ | 本轮全部为内联 JS/CSS 修改，无新增外部依赖 |
| 2 | localStorage key 前缀 supplydev_ | ✅ | 全量扫描 getItem/setItem 均走常量（supplydev_ 前缀），新增 `_delBaseDeps` 为 state 字段随 persist 落盘，非独立裸 key |
| 3 | 禁止裸 new Date 生成业务/审计/日志时间 | ✅ | 扫描 `new Date(` 均属时间源内部（parseDate/nowDate）或日历网格/时间轴布局计算（甘特/月历/交付日历/近6月柱图月份基准走 `nowDate()` 派生），无业务/审计/日志时间戳违规 |
| 4 | authRender() 已恢复、无绕过登录代码 | ✅ | 末尾 `authRender();` 正常；无 `authUnlock('ASACE')` 残留 |
| 5 | CSV 导入统一走 importCSV(kind) | ✅ | 13/14 模块统一入口未动，deps/catWeights 分支走逐行校验/去重/联动（deps 双键去重统一） |
| 6 | 视图渲染错误边界 RENDER() 保留 | ✅ | 未移除 |

## 本轮功能验证（verify.js 269 项全 PASS）

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 7 | deadbtn.js 死按钮审计 = 0 | ✅ | `node _tests/deadbtn.js supplydev.html` → 未定义函数数: 0 |
| 8 | verify.js 回归 269 项全部通过 | ✅ | `node _tests/verify.js` → 结果：全部通过 |
| 9 | A1 关键路径高亮 | ✅ | 断言 critPath 最长链 mt1→mt2→mt4、连线标记 dA/dC、甘特关键路径节点橙色高亮、图例含「橙=关键路径/红=时序冲突」 |
| 10 | A2 依赖连线式编辑 | ✅ | 断言两段式选中/弹类型框/入库、重复（含同对不同类型）与成环拦截、depDrill 查看/删除 |
| 11 | A2 依赖 CSV 往返 | ✅ | 断言导出含前置产品ID/前置里程碑/依赖类型列；导入合法入库、同对跳过、自环/成环拦截 |
| 12 | A2 级联清理 | ✅ | 断言删除项目/删除里程碑均级联清理关联依赖且不误删其他 |
| 13 | B1 ABCD 四级评级 | ✅ | 断言 supGrade 90→A/80→B/70→C/69→D、新增供应商按综合分自动评级 C |
| 14 | B1 品类分层权重 | ✅ | 断言 supWeights 未配置回落默认 40/30/30、按品类返回配置、supScore 加权、openCatWeights 弹窗保存生效、catWeights CSV 导出含列/导入生效并联动评级 |
| 15 | B1 事件自动扣分 | ✅ | 断言客诉（95-2×待处理+已解决）、逾期订单（90-3×逾期单）扣分与评级联动 |
| 16 | B2 ETA 重算 | ✅ | 断言 etaDate 计划内=交期/滞后外推/过4步=交期、etaState 三级预警（ok/warn≤7/severe>7）、已完工订单 ok |
| 17 | B2 交付日历 | ✅ | 断言 42 格+图例、跨年回退/前进、orderCalDay 弹窗列当日交付、圆点按 ETA 红黄绿着色 |
| 18 | B2 改期留痕 | ✅ | 断言 orderReschedule 合同交期/交付批次留痕+审计、分批改期留痕、历史弹窗按钮 |
| 19 | B2 ETA 严重滞后入风险 | ✅ | 断言 riskItems 含「ETA 严重滞后」条目（step<4） |
| 20 | 对抗审查修复：addDep/CSV 双键去重统一 | ✅ | 断言 addDep 同对不同类型也拦截、CSV 导入同对不同类型 skipped（同一对只允许一条依赖，UI/CSV/基线链口径一致） |
| 21 | 对抗审查修复：基线链删除防复活 | ✅ | 断言删基线 FS 对记 `_delBaseDeps` 黑名单、ensureDeps 后该对不复活 |
| 22 | 对抗审查修复：交付日历 iso 跨年派生 + openCatWeights 全 0 提示 | ✅ | 交付日历非当月格子日期由 `dt` 派生（跨年/跨月年月正确）；openCatWeights 全 0 权重品类 toast 提示「未更新」且审计记录跳过数 |
| 23 | 数据联动与审计闭环 | ✅ | editOrder 合同交期改期留痕、openBatches 批次变更留痕、CSV 导入联动（recalcSupplierScore/syncProductStatus/snapshotCost/msBaselineFor/ensureDeps）未被破坏，269 项回归全绿 |

## 打包产物

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 24 | 版本号自动递增 1.0.26 → 1.0.27 | ✅ | build.py 自动 patch，输出 [版本] 1.0.26 -> 1.0.27 |
| 25 | dist/SupplyDevLocal-v1.0.27.exe 生成、历史 exe 保留 | ✅ | dist/ 保留全部历史版本，v1.0.27 为最新产物 |
| 26 | warn-*.txt 无 `missing module named 'webview'` | ✅ | 精确 grep 无命中；System./Microsoft.Web 等为 pythonnet 良性告警 |
| 27 | 真机冒烟（窗口标题/首屏/依赖编辑/关键路径/供应商 ABCD/交付日历/ETA/关闭） | ✅ | computer_use 多模态子代理 UIA 驱动验证 + 截图存档 _tests/smoke-v1.0.27/；独立复核窗口标题「ACE 开发助手 v1.0.27」、无残留进程 |
