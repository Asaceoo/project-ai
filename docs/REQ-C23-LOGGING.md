# REQ-C23：全功能日志体系成熟化（v1.0.54）

## 背景与目标

系统已有日志基础（C10）：分级 logLog（debug/info/warn/error）+ 环形缓冲 600/500 + warn 级立即落盘 + 全局 error/unhandledrejection 捕获 + 查看器（级别/模块筛选、关键字、导出 JSON）+ logAudit 审计联动 + RENDER 错误边界。

本轮目标：**对标成熟实践（结构化日志 + Sentry release/会话关联 + APM 慢事务告警），把日志体系从「有」升级为「可定位」**，并补全残余打点盲区。

## 设计（对标来源）

| 成熟实践 | 出处 | 本轮落地 |
|---|---|---|
| 结构化字段：序号（seq）稳定排序与引用 | Logstash/结构化日志规范 | 每条日志加自增 `q`（跨重启从落盘最大值续） |
| Release + Session 关联 | Sentry（release / event_id） | 启动生成会话 `LOG_SESSION{id,start,ver}`；诊断包头携带；`getAppVer()` 从窗口标题解析版本 |
| 环形缓冲 + 分级落盘策略 | 前端日志通用实践 | 内存上限 600→1000、落盘 500→800；warn/error 立即落盘（保持） |
| 环境元数据（env） | Sentry / bugreport 惯例 | UA/平台/语言/屏幕/时区/存储占用，随诊断包导出 |
| 慢事务告警 | APM（阈值告警） | RENDER >300ms → warn；主状态落盘 >500ms → warn |
| 一键诊断导出 | Chrome devtools bugreport / 客服工单惯例 | `exportDiagnostics()`：日志 + 审计尾 50 条 + 环境 + 级别统计，单 JSON |
| 打点覆盖全部功能路径 | — | 补 6 处：登录、CSV 导出、备份通道失败分级、评分重算（debug）、路由切换（debug）、备份通道未配置（debug） |

## 需求明细

1. **内核**：`LOG_SEQ`（自增、断点续号）、`LOG_SESSION`（6 位随机 id + 启动时间 + 版本）、`getAppVer()`（document.title 解析 `v\d+\.\d+\.\d+`，兜底 'dev'）、容量常量 `LOG_CAP_MEM/LOG_CAP_DISK`。
2. **查看器**：标题显示级别计数（ERROR n / WARN n…）；级别按钮带计数徽章；行首显示 `#序号`；新增「诊断包」按钮。
3. **诊断包**：`{app, ver, exportedAt, session, env{ua,platform,lang,screen,tz,storage}, logStats, logs, auditTail}`，文件名 `supplydev-diag-<日期>-<会话id>.json`。
4. **性能观测**：仅 warn 超阈值场景，正常路径维持 debug（防日志噪声）。
5. **打点**：登录走 logAudit（审计+日志双通道）；CSV 导出走 logAudit；备份通道异常走 error/warn；debug 级高频路径（评分/导航）不进落盘噪声。

## 红线与边界

- 不改 `bkSendState` 唯一入口语义（只加观测，不改 cb 协议）。
- 不动 app.py（evaluate_js 死锁红线；备份服务端已有 backup_debug.log）。
- `_impPrev` 抑制语义保持（影子预跑零副作用）。
- 日志查看器/诊断导出不记录任何敏感凭据（state 密码类字段不入诊断包——诊断包只含日志/审计/环境）。

## 验收

- verify.js C23 批次：源码断言（内核字段/阈值/打点）+ 行为级（seq 递增、诊断包结构、getAppVer 解析）全绿。
- deadbtn 0；打包 v1.0.54 自动递增；exe 冒烟 45s；真机确认查看器计数徽章与诊断包导出。
