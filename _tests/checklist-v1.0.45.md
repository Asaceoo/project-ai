# SupplyDevLocal v1.0.45 发布清单（C13 统一响应式更新层批次）

发布日期：2026-09-25
产物：`dist/SupplyDevLocal-v1.0.45.exe`（14.5 MB）

## 变更内容

1. **统一响应式更新层**（调研定案：单一数据源+派生即算+集中事务收口）
   - 新增 `recomputeDerived()`：全量重算项目进度/状态/供应商评分/基线/依赖兜底，返回漂移计数 `{progress,status,score}`
   - `persist()`/`flushPersist()` 收口：落盘前自动重算派生数据 → 任何业务变更后渲染必然新鲜
   - `dataHealthCheck()` 改为复用同一内核（逻辑去重）
2. **时间守卫三通道**：60s 定时翻日 + `visibilitychange` + `focus` → `dayRollCheck()`（休眠唤醒/切回窗口兜底）
3. **后台静默自检 `startAutoSelfCheck()`**：每 10 分钟全量重算，检出漂移才提示+刷新；页面隐藏/弹窗编辑中跳过
4. **修复（对抗审查揪出）**：`recalcProgress` 终态守卫——已完工/已归档项目进度不被重算拉回（订单全收货→已完工 后被 2/3 里程碑比例覆盖的必现矛盾）
5. **清理（C12 遗留噪声）**：`dataHealthCheck`/`startDayRollGuard` 重复定义 3 份→1 份；详情页重复「🔍 自检」按钮 3→1
6. **评分语义定案**：质量分/交期分=事件公式自动（无事件基线 95/90，表单只读）、价格分=人工保真、CSV 导入 q/d 列导入即被公式收敛

## 验证证据

| 项 | 结果 |
|---|---|
| verify.js | 全部 PASS（C13 批次 11 条新断言：定义唯一性/persist 收口行为级/幂等/三通道/静默自检/终态保护） |
| deadbtn.js | 未定义函数数 0 |
| Chrome 真机截图 | `_shots/c13-dashboard.png`（仪表盘：KPI/甘特/倒计时全新鲜）、`_shots/c13-detail.png`（详情：里程碑/自检按钮） |
| authRender 恢复 | `authRender();` 行尾形态 1 处、绕过串残留 0 |
| PyInstaller warn | `missing module named 'webview'` = 0；其余为平台条件导入良性告警 |
| exe 冒烟 | 启动运行 1m26s 进程存活稳定，退出干净 |
| 版本号 | build.py 自动 1.0.44 → 1.0.45，文件名带版本号 |

## 语义变化提示（对使用者透明，对开发是红线）

- 任何业务变更保存后，进度/状态/评分自动全量重算——无需（也不应）在 handler 里手工调 recalc*
- 供应商质量分/交期分完全公式化（无事件=95/90 基线）；CSV 导入的自定义 q/d 分会被公式收敛，价格分保留
- 已完工/已归档项目为终态人工口径，任何自动重算不改写
