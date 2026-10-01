# v1.0.41 发布清单（C9 全板块 CRUD + 卡片/列表修复）

## 用户报告 bug 修复
- [x] **P0 项目汇总卡片/列表切换坏了**：根因=「☰ 列表」按钮只调 renderProjectRows() 填 tbody，从不隐藏 #proj-cards / 显示 #proj-table → 修复：统一 setProjView(v) 入口（renderProjCards 负责双向显隐），两个渲染都跑保证筛选同步；按钮加选中态高亮
- [x] **空/缺日期假严重逾期**：parseDate('') 把空日期算成 1899 年 →「严重逾期 46000+ 天」假数据；parseDate/diffDays 空值守卫返回 NaN，overdueState(NaN) 返回灰「未排期」（新 lvl:'none'）
- [x] **删除后状态卡死**：syncProductStatus 无兜底分支，删光订单/打样后项目卡在 生产中/已下单/打样中 → 新增回落分支（仅自动状态回落立项中，已完工/已归档不动）

## CRUD 补齐（详情 6 tab + 项目汇总 + 团队）
- [x] 新函数 delSample（级联 syncProductStatus+recalcSupplierScore+logAudit）、delQuote（recalc+logAudit）、delTeam（在职老板保护）
- [x] 项目详情行内按钮：打样+删 / BOM+删 / 报价+编辑删 / 订单+编辑删 / 客诉+编辑删 / 里程碑时间轴+删
- [x] 项目汇总卡片加 ✎编辑/🗑删（stopPropagation 防误触跳详情）
- [x] 团队卡片加 删；+添加成员原有
- [x] delBOM 刷新兜底：详情页上下文走 RENDER，成本核算页保留 renderCost

## 联动/本地化/导入导出（存量确认，本轮无新增缺口）
- [x] IndexedDB 权威源+localStorage 镜像（store 层双通道）
- [x] CSV 导入导出 15 模块（products/suppliers/orders/.../certs）+ JSON 备份（可选 AES-GCM 密码加密）
- [x] 删除级联：状态联动/供应商评分重算/成本快照/审计打点全走既有入口

## 验证链
- [x] verify.js 410 PASS / 0 FAIL（新增 C9 批次 16 条：显隐行为级/8 组行内接线/delSample 状态联动/delQuote/delTeam 老板保护+普通删/delBOM 上下文）
- [x] deadbtn.js 未定义函数 0
- [x] Chrome 真引擎截图：列表视图正确显示（修复确认）+ 订单 tab 编辑/删就位
- [x] recalcSupplierScore 空 sid 安全（if(!s)return）

## 已知限制
- 删除打样记录保留里程碑基线（历史痕迹不回收）——设计决策
- 团队成员被删后历史审计仍显示其名（日志不删）

## 待真机确认
- [ ] 项目汇总：卡片⇄列表来回切换、卡片上 ✎/🗑
- [ ] 项目详情 6 tab：每行 编辑/删；删除最后一条订单/打样后状态回落立项中
- [ ] 团队：删在职老板被拦截；删专员成功
