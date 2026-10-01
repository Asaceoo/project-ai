# v1.0.61 发布清单（C30：甘特实时联动感知层）

## 功能
1. **折叠分组自动展开**：往折叠中的阶段分组新增/编辑（含 CSV 导入）任务或里程碑后，该分组自动展开——修复「加了子项但在甘特里看不到」的联动盲区（wbsUnfold 三站点：openMilestone / editMilestone / importCSV-里程碑分支）。
2. **甘特横向滚动位置保持**：详情甘特容器（#pg-scroll）滚动时记忆位置（pgScroll），RENDER 重建 DOM 后自动恢复——修复「改完一条远端日期跳回开头」；切换项目（goProjectDetail）时重置为 0。

## 审查结论（三视角）
- 结构性审计：甘特数据链全部变更入口（里程碑弹窗×2 / delMilestone / 依赖 addDepClick+depDrill / 新增+编辑项目 / delProject+projBatchDel / importCSV+doImportJSON+undoImport）收尾渲染**全部齐全**，无滞留站。
- 修复 1 感知缺陷：折叠分组藏新条（审查者视角）。
- 修复 1 感知缺陷：RENDER 后滚动归零（AI 使用方视角）。
- 工具闭环真实报错 2 次：①pg-scroll id 初版误挂仪表盘 ganttHTML 同型容器（headless E2E sc=NULL 抓出，改正）；②C30 行为批次未排干前置异步流，openMilestone 覆写 #modal-ok onclick 打爆 C6 导出链路（补 pendingAsync>1 排干循环）。

## 验证链
- verify.js：**681 PASS / 0 FAIL**（新增 C30 批次 10 条：源码级 4 + wbsUnfold 单元 2 + 端到端真实 openMilestone 保存路径 3 + 滚动恢复 1）
- deadbtn：未定义函数数 0；内联脚本 node --check 通过；计数探针（wbsUnfold==4 / pg-scroll==2 / onscroll==1 / goProjectDetail 重置==1）全过
- headless Chromium 端到端实证：`C30RESULT:UNFOLDED,GANTTSHOW,pg=520,sc=520,dt=甘特`（真实弹窗保存路径：折叠组自动展开 + 甘特立即显示新任务 + 滚动恢复 520px）；截图 _shots/c30-live-gantt.png

## 已知限制
- 甘特条上拖拽调日期未实现（ROADMAP 另行排期）
- 仪表盘甘特的横向滚动位置不记忆（仅详情甘特）

## 待真机确认
- [ ] 详情甘特：往折叠分组加任务 → 分组自动展开且新条目可见
- [ ] 横向滚动到远端日期 → 编辑该任务日期保存 → 视口不跳回开头
- [ ] 切换到另一项目 → 甘特从最左开始（滚动记忆正确重置）
