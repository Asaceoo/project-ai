# v1.0.24 发布前清单兜底校验

> 日期：2026-09-24 · 校验方式：grep 静态扫描 + node 工具闭环 + 真机验证

## 打包红线

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | `authRender();` 已恢复（文件末行） | ✅ | supplydev.html:2605 |
| 2 | 无登录绕过残留（`authUnlock('ASACE')` 等截图自检代码） | ✅ | authUnlock 仅存在于登录流程定义/登录成功/自动登录恢复 |
| 3 | 无 webview 缺失警告 | ✅ | build/SupplyDevLocal-v1.0.24/warn-*.txt 无 missing module named 'webview' |
| 4 | 单文件自包含（无外部 CDN / 无拆 .js/.css） | ✅ | 本次改动仅改 supplydev.html 单文件 |
| 5 | 原生 JS 无框架 | ✅ | 未引入依赖 |

## 工程红线

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 6 | localStorage key 前缀 `supplydev_` | ✅ | LS=supplydev_v2_local / LS_TIME / LOG_KEY / LS_AUTH / LS_CATS=supplydev_custom_cats（本次新增已带前缀） |
| 7 | 时间戳统一 nowDate()/nowDT()，禁止裸 new Date() 生成业务/审计/日志时间 | ✅ | 本次改动未新增裸 new Date；现存 3 处为导出元数据/月份窗口计算（历史已审） |
| 8 | 业务变更走 logAudit 打点 | ✅ | 新增品类已补 logAudit('添加自定义品类：'+name) |
| 9 | CSV 导入统一走 importCSV(kind) 单入口 | ✅ | 未新增另起导入路径；12 模块往返由 verify.js 覆盖 |
| 10 | 逾期语义全站统一 overdueState，禁止另起倒计时文案 | ✅ | 折叠面板/30 天节点沿用原「剩N天」格式 |
| 11 | 视图渲染错误边界 RENDER() 未移除 | ✅ | RENDER() 结构未改动 |

## 功能与交互

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 12 | 甘特图垂直滚动铺满（overflow-y:auto + max-height:580px） | ✅ | verify.js「甘特容器垂直滚动铺满」PASS |
| 13 | 待办提醒/风险提醒/近期到期节点可展开收起 | ✅ | verify.js「仪表盘三面板可折叠」「折叠后显示已收起提示」「展开后恢复收起按钮」PASS |
| 14 | 近期到期节点改为未来 30 天 | ✅ | verify.js「近期到期节点=未来30天」「upcomingNodes 默认30天」PASS |
| 15 | 品类自定义：用户新增、持久化、去重、弹窗入口 | ✅ | verify.js「customCatList/合并/持久化/去重/弹窗入口」PASS |
| 16 | 无死按钮 | ✅ | deadbtn.js 未定义函数数 0（工具修正 event.stopPropagation 方法误报） |
| 17 | go() 路由引用有效（无死链） | ✅ | go('order'/'project'/'supplier') + 变量 nav 均在 VIEWS 映射内 |
| 18 | 数据本地化 + 导入导出 + 跨模块联动 | ✅ | verify.js CSV 12 模块往返、syncProductStatus/recalcSupplierScore/snapshotCost/confirmDate 联动断言全部 PASS |

## 回归与真机

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 19 | verify.js 全量回归 | ✅ 175 项 PASS | node _tests/verify.js 结果：全部通过 |
| 20 | 真机验证 | ✅ 10/10 PASS | _tests/smoke-v1.0.24/ 截图存档：窗口标题/仪表盘(甘特滚动铺满)/三卡折叠/未来30天/自定义品类/导航/退出全部通过 |

> 真机冒烟 10 项全部 PASS：应用启动与窗口标题、首屏、仪表盘渲染（甘特图垂直滚动铺满）、待办提醒/风险提醒/近期到期节点三卡折叠、未来30天字样、自定义品类、导航渲染、关闭退出。风险提醒与近期到期节点位于关键日期看板下方（首次冒烟未滚动误判，已定向复核确认）。
