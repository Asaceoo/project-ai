# 发布清单 v1.0.51（C20：订单 OTIF 达成率 + 抽检 AQL 三档缺陷分级）

## 背景
- 用户选定两批（调研 4 缺口中）：订单 OTIF 达成率、抽检 AQL 三档缺陷分级。
- OTIF 数据链路已齐（P1 埋点 toggleBatch 已采集 receivedDate），纯计算零录入。
- AQL 1.0 主表经两处信源交叉核对（ISO 2859-1 Table 2-A：lot500→n50/Ac1、lot1000→n80/Ac2、小批量 A/B 码箭头级联 n=5/Ac=0）。

## 改动
- AQL_TABLE 新增 '1.0' 档；aqlPlan 不变。
- openInspection 重构：三档不良输入（f-badc/f-badm/f-badn），inspectionPlanNow() 统一取方案（同批量同 n，Cr Ac=0 / Maj AQL1.0 / Min AQL4.0），判定自动（致命出现即退货），记录加 badCr/badMaj/badMin（向后兼容旧数据）。
- OTIF：orderOTIFJudge（null=不入样本/true/false）+ otifStats(sid)；订单管理 KPI「OTIF 达成率」（≥95 绿/85-94 橙/<85 红）；已足额收货订单行内 OTIF ✓/✕ 标注；供应商列表交期分下 per-supplier OTIF 汇总。
- verify.js 新增 C20 批次 18 条（源码 7 + 行为 11）。

## 验证结果
- [x] node _tests/verify.js：576 PASS / 0 FAIL
- [x] node _tests/deadbtn.js：未定义函数数 0
- [x] build.py 自动递增 1.0.50 → 1.0.51，产物 dist/SupplyDevLocal-v1.0.51.exe（14.6 MB）
- [ ] exe 冒烟：待用户关旧开新（v1.0.49 实例运行中，单实例互斥拦截）

## 口径边界（文档已注明）
- OTIF 样本=分批且足额收货订单；历史批次缺 receivedDate 按承诺日期回退（视为准时，乐观口径）；无分批订单无收货记录不入样本。
- AQL 三档固定组合 Cr0/Maj1.0/Min4.0（行业通用），后续可按品类配置化（未纳入本批）。
