# v1.0.40 发布清单（C8 打印/导出 PDF 报表 + A5 评估）

## 功能
- [x] 顶栏「🖨 报表」按钮（8 大视图共用 viewHeader）→ 全局汇总报表
- [x] 项目详情「基本信息」卡「🖨 报表」按钮 → 单项目报表
- [x] 全局报表：标题+nowDT 时间戳 / 项目一览 / 供应商评级（supScore+supGrade）/ 风险与提醒（riskItems 复用）
- [x] 单项目报表：基本信息与成本（到岸成本/定价目标/毛利空间）/ 里程碑 / 打样记录 / 订单（含 ETA 与 ORDER_STEPS 阶段）/ 质量问题
- [x] @media print：隐藏 body 全部直接子元素（除 #print-root）、A4 + 12mm 页边距、表格边框、卡片/行 page-break-inside:avoid、暗色主题强制白底兜底
- [x] afterprint 自动清空报表 DOM；打印配色固定黑白灰（不随主题，C7 硬编码断言豁免 @media print 块）
- [x] 打点：logAudit('打印报表（全局汇总/单项目：xxx）')

## 验证链
- [x] verify.js 394 PASS / 0 FAIL（新增 C8 批次 11 条）
- [x] deadbtn.js 未定义函数 0（openPrintReport 已定义）
- [x] Chrome --print-to-pdf 真引擎：4 页 A4；报表标题在首页；导航/登录页/搜索框未混入；三大节齐全；时间戳 2026- 合规
- [x] 屏幕媒体截图：仪表盘正常渲染，print-root 不可见，报表按钮就位
- [x] pypdf 页数判定（对象流压缩正则口径不可用，遵循既有教训）

## 修复记录（工具闭环真实报错）
1. 项目详情按钮单引号未转义（onclick="openPrintReport('project')" 在 JS 单引号串内）→ SyntaxError 当场拦截，改 \' 转义
2. Edit 1 漏写 @page 行（计划有、落笔无）→ C8 静态断言「@media print 规则齐备」抓出补回
3. verify.js C8 块误用不存在的 SRC_HTML 变量 → 崩溃栈定位，改顶层 html
4. 断言笔误 ×3：innerHTML/startWith 用 ===0（实际以 <div 开头应 >0）、logAudit 字段 .what 应为 .a、按钮串需 raw 反斜杠转义

## 已知限制
- 大供应商表（50 行）整卡 page-break-inside:avoid 可能整卡跳页留白——A4 一卡一页起，可接受
- WebView2 的 window.print() 弹系统打印对话框（含「另存为 PDF」）；沙箱不可观测，待真机确认

## 待真机确认
- [ ] 顶栏/项目详情「🖨 报表」→ 弹打印对话框 → 选「另存为 PDF」得到报表
- [ ] 暗色主题下打印仍为白底黑字
- [ ] 取消打印对话框后应用视图正常（afterprint 清理）

## A5 甘特拖拽评估
- 结论：不做。mousedown/move/up 像素交互链在 Node 桩不可真验证，违背「工具闭环」；现有 msDrill→editMilestone 已覆盖时间轴调整
