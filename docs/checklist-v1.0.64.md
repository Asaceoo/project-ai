# checklist v1.0.64（C33：甘特+项目详情联动对抗性审查修复）

## 需求
再次审查甘特图，审查项目详细的数据联动；三视角对抗性审查多轮收敛；工具闭环真实报错修正；清单兜底；常规验证覆盖全部功能；真机验证；打包自动递增版本号；neat-freak-person 同步。

## 修复项（4）
- [x] F1 概览 tab「+ 里程碑」`openMilestone(pid)` 缺 preset → 预选成任务（C32 回归）→ `openMilestone(pid,'ms')`
- [x] F2 任务转阶段分组残留脏依赖 → editMilestone `_kindChgG` 显式清理+审计；ensureDeps 加 `kind!=='group'` 端点过滤（recompute 兜底）
- [x] F3 tab 往返丢甘特滚动位 → `restorePgScroll()` 抽公用，RENDER + viewProjectDetail 双站点调用
- [x] F6 拖双缘手柄幽灵飞离条体（手柄 currentTarget origLeft=0）→ 幽灵作用于父条（left+width 实时变化，Math.max(PG_DAY_W) 钳制）

## 审查视角结论
- 工具实现者：拖拽内核 pgDragCommit 不变量完好；F6 为 C31 视觉盲区（e2e 只验数据未验中程视觉）
- 审查者：终态守卫/C22 分组排除语义/基线同步（targetDate→交付里程碑）均按既有红线合规；F2 为数据卫生缺口
- AI 使用方：verify 断言 3 处口径漂移按产品真实语义修正（C30 restore 抽函数 / C32 ms 计数 3→4 / 转分组依赖断言绑不变量）；工具闭环另抓注入块解析失败（heredoc 转义吃反斜杠）与真实 DOM 无 #modal-cancel 两个测试基建坑

## 验证链
- [x] node --check 语法 PASS
- [x] verify.js **720 PASS / 0 FAIL**（C33 批次 10 断言：4 源码 + 6 行为）
- [x] deadbtn 0
- [x] headless Chromium 端到端（真实点击+MouseEvent）：f1PresetMs=ms、f3ScrollRestored=true（400px 恢复）、f6GhostLeftChanged/WidthShrunk=true、f6DataCommitted 2026-10-04|08→2026-10-07|08（date+3，endDate 不动）
- [x] 截图 _shots/c33-gantt-linkage.png

## 打包
- [x] build.py 自动递增版本号 → v1.0.64
- [x] dist/SupplyDevLocal-v1.0.64.exe（31.8MB）+ SupplyDevLocal-setup-v1.0.64.exe（33.5MB）
- [x] warn 无 missing webview

## 文档同步
- [x] USER-GUIDE §5.19 / TECH-MANUAL §6.15 + 版本历史行 / AGENTS.md C33 红线⑥条（C32 计数口径同步更新）/ 工作日志
- [x] 待真机确认：①概览 tab 点「+ 里程碑」预选里程碑；②甘特⇄其他 tab 往返滚动位保持；③拖左手柄时条体跟手；④任务转分组后仪表盘依赖连线不再含该节点
