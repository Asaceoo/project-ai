# v1.0.26 打包前清单兜底（checklist）

核对时间：2026-09-24

## 红线约束

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 1 | 单文件自包含：无拆 js/css、无外部 CDN | ✅ | 本轮全部为内联 JS/CSS 修改，无新增外部依赖 |
| 2 | localStorage key 前缀 supplydev_ | ✅ | 全量扫描 getItem/setItem 均走常量 LS_TIME/LOG_KEY/LS/LS_AUTH/LS_CATS（supplydev_ 前缀），无裸 key |
| 3 | 禁止裸 new Date 生成业务/审计/日志时间 | ✅ | 扫描 9 处 `new Date(` 均属时间源内部（parseDate/nowDate）或日历网格布局计算（甘特/月历/近6月柱图月份基准走 `nowDate()` 派生），无业务/审计/日志时间戳违规 |
| 4 | authRender() 已恢复、无绕过登录代码 | ✅ | 末尾 `authRender();` 正常；无 `authUnlock('ASACE')` 残留 |
| 5 | CSV 导入统一走 importCSV(kind) | ✅ | 12 模块统一入口未动，含逐行校验/去重/联动 |
| 6 | 视图渲染错误边界 RENDER() 保留 | ✅ | 未移除 |

## 本轮功能验证（verify.js 211 项全 PASS）

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 7 | deadbtn.js 死按钮审计 = 0 | ✅ | `node _tests/deadbtn.js supplydev.html` → 未定义函数数: 0 |
| 8 | verify.js 回归 211 项全部通过 | ✅ | `node _tests/verify.js` → 结果：全部通过 |
| 9 | 全板块实时刷新按钮（8 视图统一接入） | ✅ | 仪表盘/项目汇总/产品与打样/成本核算/供应商/订单管理/质量管理/团队成员 8 处 `viewHeader()` 统一头部；断言 refreshTool 含「⟳ 刷新」 |
| 10 | 最后刷新时间 + 数据保存时间戳 | ✅ | `lastRefreshAt`（refreshView 记录）+ `lastSaveAt`（persist 记录），断言两者长度 ≥5 |
| 11 | 折叠三卡语义修正：展开显示全部条目 | ✅ | dashFold=true 收起显示「已收起」占位、false 展开无占位无截断；断言双向验证 |
| 12 | 全局搜索浮层（跨模块实时候选） | ✅ | 命中项目/订单断言、无匹配空态断言、空输入隐藏断言、点击直达项目详情断言 |
| 13 | KPI 悬停口径说明 | ✅ | 断言 KPI 卡 title 含口径文案（在研项目数定义） |
| 14 | 日志系统成熟方案：全局错误捕获 | ✅ | `window.addEventListener('error')` + `unhandledrejection` 均 logLog('error','global') |
| 15 | 日志面板：级别筛选/关键字搜索/错误高亮/命中计数 | ✅ | 断言日志面板渲染含锚点词与「命中」计数、关键字过滤「命中 1 条」 |
| 16 | logAudit 全覆盖（14 处业务变更打点） | ✅ | 断言新增打样/新增报价/新增抽检/订单分批/手动成本快照均产生审计记录 |
| 17 | 供应商删除引用保护 | ✅ | 断言被订单/客诉/整改/报价引用的供应商删除被拦截；无引用供应商删除成功+打点 |
| 18 | 客诉流转打点 | ✅ | 断言客诉流转（待处理→调查中）产生审计记录 |
| 19 | 对抗审查修复：logAudit 运算符优先级 | ✅ | `fv('f-cat')||'其他'` 加括号，品类拼接正确 |
| 20 | 对抗审查修复：成本模拟器无效变量清理 | ✅ | renderSim 移除未使用 pr、显式声明 nv |
| 21 | 数据联动与审计闭环（编辑→联动→logAudit） | ✅ | recalcSupplierScore/syncProductStatus/snapshotCost/confirmDate 既有联动未被破坏，211 项回归全绿 |

## 打包产物

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 22 | 版本号自动递增 1.0.25 → 1.0.26 | ✅ | build.py 自动 patch，输出 [版本] 1.0.25 -> 1.0.26 |
| 23 | dist/SupplyDevLocal-v1.0.26.exe 生成、历史 exe 保留 | ✅ | dist/ 含 v1.0.15 ~ v1.0.26 全部产物，v1.0.26 15.4MB |
| 24 | warn-*.txt 无 `missing module named 'webview'` | ✅ | 精确 grep 无命中；System./Microsoft.Web 等 8 处为 pythonnet 良性告警 |
| 25 | 真机冒烟 12/12 PASS（八板块导航+刷新按钮/折叠语义/刷新时间戳/月历联动/日志面板/关闭） | ✅ | computer_use 多模态子代理 UIA 驱动验证；首屏截图 _tests/smoke-v1.0.26/01-dashboard-top.png；独立复核：启动 exe 窗口标题「ACE 开发助手 v1.0.26」、首屏仪表盘渲染正常（搜索框/KPI/甘特/待办）、仪表盘截图 02-launch.png、应用正常关闭无残留进程 |
