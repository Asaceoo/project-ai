# SupplyDevLocal v1.0.42 发布清单（C10 联动与导出增强批次）

日期：2026-09-25

## 本批变更

| # | 类别 | 内容 | 验证 |
|---|------|------|------|
| 1 | P0 真 bug | doImportJSON 整体覆盖后清空 importSessions（旧 CSV 撤销快照防脏还原） | verify 行为级断言 PASS |
| 2 | 导出联动 | exportModule(name,pid)：详情页 CSV 按当前项目过滤（PID_FILTER_KEYS 5 模块） | verify 实测 BOM 行数=该项目行数 |
| 3 | 导出联动 | issues 等无 productId 键模块不受 pid 影响（全量导出） | verify 断言 PASS |
| 4 | 导出 UX | toCSV 文件名带模块名 supplydev-<module>-<date>.csv | 源码+行为断言 |
| 5 | 导出 UX | 导出 toast 中文模块名（MOD_NAMES） | 行为断言 |
| 6 | 日志 | 运行日志按模块筛选（logModFilter 与级别正交，打开重置，命中行显示模块） | verify 3 条断言 PASS |
| 7 | 重构 | KM/KM2 三处重复字典 → 全局 MOD_NAMES | verify 静态断言（无 var KM2=） |

## 回归验证

- verify.js：**418 PASS / 0 FAIL**（C10 批次 8 条），连续 5 轮全绿
- deadbtn.js：未定义函数数 0
- 稳定性修复（测试基建）：①Blob 捕获不得调用旧 Blob（C6 异步段包装器链式污染）；②verify 桩补 `print(){}`（C8 打印 60ms timer 缺桩即崩）；③C10 测试禁调 openModal（覆盖 #modal-ok onclick 破坏 C6 异步点击）

## 真机验证

- Chrome 真引擎截图：详情页打样 tab（c10-detail-samples.png）、成本 tab（c10-detail-cost.png）渲染正常
- 截图后 authRender() 已恢复（grep 0 处 authUnlock('ASACE') 绕过）
- exe 冒烟：SupplyDevLocal-v1.0.42.exe 55s 双进程存活（onefile 引导+子进程）
- PyInstaller warn 日志：无 missing webview

## 打包

- 版本：1.0.41 → 1.0.42（build.py 自动 bump）
- 产物：dist/SupplyDevLocal-v1.0.42.exe（14.5 MB），dist/ 历史版本保留

## 待用户真机确认

- [ ] 详情页「CSV」按钮导出内容只含当前项目行（打样/成本/供应商比价三处）
- [ ] 下载目录 CSV 文件名形如 supplydev-bom-2026-09-25.csv
- [ ] 顶栏「日志」→ 模块筛选 chips 点击过滤生效
- [ ] JSON 备份导入后团队页不再显示旧导入撤销记录
