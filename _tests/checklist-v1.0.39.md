# v1.0.39 发布清单（C7 暗色模式）

> 生成时间：2026-09-25 11:55 ｜ 状态：打包前逐项核对

## 功能实现

- [x] `:root` 补 6 个语义变量：`--severe` `--purple` `--purple-soft` `--soft` `--on-accent` `--mask` + `color-scheme:light`
- [x] `html[data-theme="dark"]` 全量覆盖 24 个变量（Arco 暗色板）+ `color-scheme:dark`
- [x] `applyTheme(mode)` 三态（light/dark/auto）+ `LS_THEME` 持久化 + 按钮文案联动
- [x] `cycleTheme()` 循环切换 + toast + logLog 打点
- [x] auto 模式监听 `prefers-color-scheme` 变化实时跟随（无 matchMedia 静默降级）
- [x] 顶栏「主题」按钮（☀ 亮色 / 🌙 暗色 / ◐ 跟随系统）
- [x] 276 处属性上下文硬编码色 → 变量（Python 机械替换，:root 块/emoji 实体/SVG 品牌色/业务状态色排除）
- [x] 9 处三元拼色补丁（交付日历格子/gantt 依赖按钮/甘特悬停/逾期行/批次 chip/overdue fallback/打样状态色板/团队角色色）
- [x] deadbtn.js 排除表加 `var(`（CSS 变量函数误判）

## 验证链

- [x] `node _tests/verify.js`：**383 PASS / 0 FAIL**（含 C7 批次 11 项）
- [x] `node _tests/deadbtn.js supplydev.html`：未定义函数数 0
- [x] Chrome headless 真引擎截图：暗色仪表盘 / 暗色订单页（含交付日历）/ 暗色登录页 / 亮色订单页（无回归）——`_shots/dark-*.png`、`_shots/light-order.png`
- [x] `authRender();` 已恢复（3912 行，无绕过登录残留）
- [x] UTF-8 字节级校验（写后必验，GBK 中招即转回）

## 已知限制（记录不修）

- 主题在脚本执行时应用（body 末尾同步执行），首帧理论上有极短亮色闪烁（FOUC），单文件本地应用无感
- 甘特/折线图 SVG 内业务状态色（红橙蓝紫青）与网格线（浅灰）保留 hex——暗底下中高饱和色可读，浅灰线在深底可见
- 登录页期间主题按钮不可达（遮罩覆盖 topbar），登录后可切换——可接受

## 待用户真机确认

1. 顶栏「主题」按钮三态切换 + 重启后记忆
2. 暗色下全板块走查（重点：甘特图、成本图表、弹窗、全局搜索浮层）
3. 亮色模式与 v1.0.38 观感一致（无回归）
