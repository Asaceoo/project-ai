# C31 发布清单 · v1.0.62 — 甘特自由拖放 + 数据实时更新

## 一、功能变更

| # | 功能 | 说明 |
|---|------|------|
| 1 | 工期条整体拖拽平移 | 项目详情甘特的任务条（kind='task'）可按住横向拖动，date/endDate 同步平移保持工期；落点日期浮动提示跟随鼠标 |
| 2 | 工期条双缘缩放 | 左缘手柄（ew-resize）拖拽改开始日期、右缘改结束日期；越界自动钳制（左缘不越右缘 / 右缘不压左缘，钳到相邻日） |
| 3 | 里程碑菱形拖拽改期 | 菱形节点横向拖动改 date |
| 4 | 拖拽数据闭环 | 落盘唯一路径 `pgDragCommit`：日期回写 → logAudit → recalcProgress（C11）→ persist()（C13 自动 recomputeDerived）→ RENDER 实时刷新（时间轴范围随拖出边界自适应扩展） |
| 5 | 派生条禁拖 | 阶段分组汇总条 / 项目总条为 recompute 派生数据，双站点守卫（pgDrag + pgDragCommit）禁止改写 |
| 6 | 点击/拖拽分流 | 位移阈值 4px：未越阈值=点击下钻 msDrill，越阈值=拖拽；条上原 onclick 下钻移除，防双重触发 |

## 二、验证链（全部真实执行）

| 验证 | 结果 |
|------|------|
| node --check 脚本语法 | PASS（1 块 357428 字符） |
| node _tests/verify.js | **698 PASS / 0 FAIL**（含 C31 新批次 13 断言：9 源码级 + 行为级平移/钳制/菱形/分组拒绝/0 位移拒绝/进度联动 33%/审计留痕） |
| node _tests/deadbtn.js supplydev.html | 未定义函数数 0 |
| headless Chromium 端到端 | C31MARK 实证：拖拽平移 +3 天（04|08→07|11）、右缘缩放 +2 天（endDate→13，date 不动）、ghostMoved=true、tipCleaned=true、draggingCleaned=true、审计 2 条 |
| 证据截图 | _shots/c31-gantt-drag.png |
| 打包前 authRender(); 恢复确认 | 唯一出现于 L4811，绕过注入只存在于 _tests/_shot_c31.html 副本 |

## 三、对抗性审查结论（三视角）

- **工具实现者**：监听器 mousemove/mouseup 以命名函数成对增删（断言固化）；拖拽会话中外部 RENDER 重建 DOM 时 st.el 失联，但 mouseup 落盘按 id 查最新数据，提交仍正确。已知 P2×2（接受）：①Esc 中断不取消拖拽（desktop 形态影响极小）；②双缘手柄 7px 偏小（对齐主流甘特形态）。
- **审查者**：红线合规核对——C11 保存点 recalcProgress ✓、C13 persist 收口 ✓、C15 终态守卫不受影响（recalcProgress 内置终态保护）✓、时间戳走 nowDT/logAudit ✓、无 schema 变更（CSV 导入导出不受影响）✓。
- **AI 使用方**：工具闭环抓到 2 个测试预期错误并修正——①进度重算预期 50% 实为 33%（persist→recomputeDerived 将里程碑节点与任务同权计数，C27 语义正确）；②拖拽审计后紧跟进度联动审计，取「最后一条」错位改「近 4 条内匹配」。即：审查发现的是测试口径错，产品行为正确。

## 四、已知限制

- 拖拽仅在项目详情「甘特」tab 生效；仪表盘甘特保持只读视图。
- 拖拽按天吸附（DAY_W=30px/天，PG_DAY_W 单一来源）。
- 拖出时间轴边界时，松手后时间轴范围自动扩展（渲染层自适应），拖拽过程中超出部分仅裁切显示。

## 五、待真机确认（升级 v1.0.62 后）

1. 项目详情 → 甘特 tab：拖动任务条整体平移，松手后日期/工期/项目进度实时更新。
2. 拖任务条左右双缘缩放，越界不破坏 date<endDate。
3. 拖里程碑菱形改期；拖阶段分组汇总条无反应（派生数据禁拖）。
4. 点击（不拖动）条/菱形仍弹出详情下钻。
5. 升级方式：关闭运行实例后双击 setup 覆盖安装（数据在 ~/.supplydev 不受影响）。
