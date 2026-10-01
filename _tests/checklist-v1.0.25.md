# v1.0.25 打包前清单兜底（checklist）

核对时间：2026-09-24（第二轮对抗审查后更新）

## 红线约束

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 1 | 单文件自包含：无拆 js/css、无外部 CDN | ✅ | 本轮仅加内联 SVG / 内联 JS 代码 |
| 2 | localStorage key 前缀 supplydev_ | ✅ | 全量扫描 LS_TIME/LS_AUTH/LS_CATS/LOG_KEY 均带前缀，无裸 key |
| 3 | 禁止裸 new Date 生成业务/审计/日志时间 | ✅ | 对抗审查修复 3 处：近6月柱图月份基准改 `nowDate()` 派生、日志导出 exportedAt 改 `nowDT()`、JSON 备份 _exportedAt 改 `nowDT()`；扫描后仅 parseDate/nowDate 内部保留裸构造 |
| 4 | authRender() 已恢复、无绕过登录代码 | ✅ | 末尾 `authRender();` 正常；无 `authUnlock('ASACE')` 残留 |
| 5 | CSV 导入统一走 importCSV(kind) | ✅ | 里程碑导入走 importCSV('milestones')，含引用校验/去重/联动 |
| 6 | 视图渲染错误边界 RENDER() 保留 | ✅ | 未移除 |

## 本轮功能验证（verify.js 190 项全 PASS）

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 7 | deadbtn.js 死按钮审计 = 0 | ✅ | `node _tests/deadbtn.js` → 未定义函数数: 0 |
| 8 | verify.js 回归 190 项全部通过 | ✅ | `node _tests/verify.js` → 结果：全部通过 |
| 9 | 仪表盘新卡：项目状态分布/供应商风险TOP/最近动态/毛利健康度 | ✅ | 断言：仪表盘含项目状态分布卡 / 供应商风险TOP卡 / 最近动态卡 / 毛利健康度卡 |
| 10 | 毛利卡联动（亏损项目列出） | ✅ | 断言：毛利健康度联动列出亏损项目（BOM 成本>目标价） |
| 11 | 毛利卡口径（无成本数据不参与均值） | ✅ | items 过滤 `x.c>0`，避免 landedCost=0 误算 100% 毛利 |
| 12 | supScore 综合评分加权 | ✅ | 断言：80×0.4+70×0.3+60×0.3=71 |
| 13 | 项目详情页：标签中文化/各模块新增按钮/里程碑CSV入口 | ✅ | 断言：标签中文化、概览tab编辑+里程碑入口、三 tab 新增按钮、里程碑 CSV 入口 |
| 14 | 逾期告警 banner | ✅ | 断言：项目详情逾期告警banner（独立测试对象） |
| 15 | pid 预选联动（详情页→打样/订单） | ✅ | 断言：openSample/openOrder 预选产品 |
| 16 | importData 迁移列表补 milestones | ✅ | 兜底数组含 milestones；ensureMilestones 双保险 |
| 17 | 负责人字段：新建/编辑弹窗 + 概览展示 + CSV 往返 | ✅ | 对抗审查补建：新建项目负责人入库 / 编辑项目负责人生效 两项断言；CSV products 导出含负责人列、导入读回 owner |
| 18 | 近6月柱图走校准时钟 | ✅ | 对抗审查修复：月份基准 `nowDate()` 派生，TIME_OFFSET 非零不串月 |

## 图标

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 19 | assets/app.ico 生成（256/128/64/48/32/16 多尺寸） | ✅ | `python assets/make_icon.py` → saved |
| 20 | build.py 接入 --icon | ✅ | build.py 打包命令含 `--icon assets/app.ico` |
| 21 | 前端 logo：favicon/登录页/侧边栏 | ✅ | 三处替换为品牌 SVG（蓝渐变+白徽章+对勾） |

## 构建与真机

| # | 项目 | 结果 | 证据 |
|---|------|------|------|
| 22 | build.py 环境预检（pywebview 缺失即中止） | 打包时确认 | 系统 Python 已装 pywebview 6.2.1 |
| 23 | 打包后查 build/*/warn-*.txt 无 `missing module named 'webview'` | 打包后确认 | — |
| 24 | dist/ 历史版本 exe 保留 | ✅ | v1.0.15~v1.0.24 均在 |
| 25 | 真机 exe 冒烟 7 步（窗口标题→首屏→仪表盘→七板块导航→月历联动→关闭） | 真机后确认 | 截图存档 _tests/smoke-v1.0.25/ |

## 备注

- 毛利健康度口径：落地成本=BOM 实算+运费+关税，不含平台佣金/广告/退货费率（卡内已注明）。
- 里程碑 CSV 从项目详情页导出为全量数据，按钮 title 已提示「导出全部里程碑（含其他项目）」。
- 对抗审查第二轮收敛：近6月柱图/导出元数据时间戳裸 `new Date()` 修复（红线#3）；负责人字段补编辑入口与断言（#17）。
