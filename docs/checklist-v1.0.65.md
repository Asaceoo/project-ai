# C34 清单：甘特+详情联动再审查（v1.0.65）

## 一、三视角对抗性审查结论

**主链路无 P0/P1 新缺陷**——全量扫描确认以下链路闭合：

| 链路 | 验证结论 |
|---|---|
| 新增（openMilestone） | recalcProgress(fv('f-msp')) 按表单项目重算；归属阶段 productId 双重校验 |
| 编辑（editMilestone） | recalcProgress(m.productId)；转分组显式清依赖（C33）；分组下有子项禁转 |
| 删除（delMilestone） | 级联清 deps；分组子项上移顶层；recalcProgress |
| 删除项目（delProject/projDelCascade） | 级联清打样/报价/BOM/里程碑/依赖（C17+v1.1），有订单先拦截 |
| 拖拽（pgDragCommit） | 唯一落盘路径：logAudit→recalcProgress→persist；分组禁拖；边缘钳制 |
| CSV/JSON 导入 | 统一 persist→recomputeDerived 全量重算（进度/状态/评分 + 孤儿净化 + ensureDeps） |
| 基线同步（msSyncDates） | 仅当里程碑日期未被用户改过才跟随字段；拖拽即视为用户口径 |
| 状态直改站点 | 仅 editMilestone 一站（L2388），无旁路 |
| 条/菱形点击 vs 拖拽 | 仅挂 mousedown=pgDrag，onclick=msDrill 只在名字 span——无双触发 |

## 二、P3 升级修复（本轮交付）

1. **F1 提示钳制同口径**：pgDragMove 左缘/右缘提示原显示未钳制的落点日期（提示 10-20 实落 10-19）；改为与 pgDragCommit 同口径钳制并标注「（钳制）」
2. **F2 Esc 取消拖拽**（C31 已知 P2 闭环）：pgDragCancel——还原幽灵条 left/width、摘 mousemove/mouseup/keydown 三监听、清 pgDragState、去 pg-dragging、隐提示、toast 提示；pgDragUp 正常松手同步摘 Esc 监听

## 三、验证链

| 项 | 结果 |
|---|---|
| node --check | SYNTAX-OK |
| verify.js | **728 PASS / 0 FAIL**（C34 批次 8 断言：4 源码 + 4 行为） |
| deadbtn | 0 |
| headless 端到端 | before 10-04\|10-10 → 拖拽中 tip「→10-09~10-15」+ghost moved+pg-dragging → **Esc**：tip 消失/样式还原/数据零变化 → 正常提交 +3 天 10-07\|10-13 ✓ |
| 产物 | v1.0.65.exe + setup-v1.0.65.exe，warn 无 missing webview |

## 四、测试基建修复（沙盘三连）

- docStub 补 `removeEventListener` / `body`（classList）/ makeEl 补 `remove()`——pgDragCancel 真实调用路径所需，缺一即行为批次假阳性报错

## 五、真机确认项

1. 拖拽中按 Esc → 条弹回原位、无 toast 数据变更、可重新拖
2. 左缘拖过头 → 提示日期带「（钳制）」且与松手结果一致
3. GitHub：v1.0.52~65 全量推送
