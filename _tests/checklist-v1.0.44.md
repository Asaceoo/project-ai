# v1.0.44 发布清单（C12 数据自检与实时性批次）

## 版本
- version.txt: 1.0.43 → 1.0.44（build.py 自动递增）
- 产物：dist/SupplyDevLocal-v1.0.44.exe

## 变更内容

### P0 修复：3 处编辑按钮缺右括号（C11 回归缺陷，死按钮）
- `editBOM` ×2（详情成本 tab / 成本页 BOM 拆解）：`onclick="editBOM('id'"` → `onclick="editBOM('id')"`，点击原报 JS 语法错误
- `editMaterial` ×1（物料库行）：同形态修复
- 由新增的「全路由行内处理器语法审计」捕获（先跑出真实 FAIL 再修）

### 新增：数据自检 🔍（各板块「检查更新」入口）
- `dataHealthCheck()`：全量重算派生字段（项目进度←里程碑、项目状态←订单/打样、供应商评分/评级←客诉/逾期事件）+ 快照对比计数漂移 + `ensureMilestones/ensureDeps` 结构兜底 → 修复后全量重渲染
- 漂移报告：toast + 审计打点「数据自检：重算进度 N / 状态 M / 评分 K 处」+ 运行日志（有漂移记 warn）
- 终态保护：已完工/已归档项目状态不被自检改写（人工口径优先）
- 挂载：refreshTool（8 大视图头部）+ 项目详情基本信息头部

### 新增：跨天守卫（实时性兜底）
- `startDayRollGuard()`：每 60s 比对 `nowDate().toDateString()`，翻日即全量 RENDER（修复长时间挂机后「剩 N 天/逾期 N 天」陈旧）
- 启动序列挂载（syncTime 之后）

### 修复：recalcProgress 审计日志前后值
- 原「100% → 100%」假信息（before 值先被覆盖），改先快照后写

## 验证
- verify.js：**435 PASS / 0 FAIL**（C12 批次 12 条：运行时语法审计 + 自检三类漂移修复行为级 + 终态保护 + 跨天守卫 + 按钮挂载 + 源码级按钮形态），连续 5 轮全绿
- deadbtn.js：未定义函数 0
- Chrome 真引擎截图：仪表盘（自检按钮+六面板实时数据）/ 详情成本 tab（编辑删按钮）/ 打样 tab
- authRender 打包红线：恢复确认（绕过残留 0）
- exe 冒烟：55s 进程存活
