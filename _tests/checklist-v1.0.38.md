# v1.0.38 清单兜底（C6 批次：备份加密 + 7天提醒 + 全局快捷键 + 时钟漂移）

## 红线（6 项）

- [x] 单文件自包含：加密/快捷键/漂移统计全部内联 supplydev.html，无外部 CDN、无新 .js/.css
- [x] key 前缀：新增 `LS_LBAK='supplydev_last_backup'` 带 `supplydev_` 前缀；高频同步小 key 对齐 LS_AUTH/LS_TIME/LS_CATS 豁免口径（纯 localStorage），主状态/日志仍走 store 层（未新增绕过）
- [x] 时间源：bkReminderDue 参数化 now，无新增裸 `new Date()` 业务时间；LS_LBAK 存 Date.now() 原始毫秒（非业务日期）
- [x] `authRender();` 已恢复：文件尾部仍为 `authRender();`（打包前已确认）
- [x] CSV 导入统一入口 importCSV 未动
- [x] 错误边界 RENDER 未动；新增异步链路（encBackupText/openEncImport/modal onOk）全部 try/catch 兜底 toast

## 功能（14 项）

- [x] exportData 弹窗：密码可选，留空明文、填密码 AES-GCM 信封（verify C6 端到端）
- [x] 信封格式 _app=supplydev-enc/_enc=1/iter/salt/iv/data（真 WebCrypto 验证）
- [x] 忘密码不可恢复提示（导出/导入弹窗均展示）
- [x] importData 自动识别加密信封 → openEncImport 密码弹窗 → 解密失败 toast 不落库
- [x] 错误密码/篡改密文被 GCM 认证标签拒绝（enc_webcrypto.js 真原语验证）
- [x] 2000 项目规模加密往返 <5s（实测远低于阈值）
- [x] 自动备份成功（HTTP 200+{"ok":true}）→ bkMarkSuccess 落 LS_LBAK；app.py do_POST 返回 JSON 结果体
- [x] 7 天未备份启动提醒（登录页顺延 60s 重查；无 __BKPORT 不检查；warn 日志 + toast）
- [x] Ctrl+K 聚焦并全选全局搜索；Ctrl+S flushPersist+saveLogs+toast；Esc 关搜索浮层与弹窗
- [x] Alt+1~8 切换 NAV 八大板块；Alt+9 越界无动作
- [x] 搜索框 title 快捷键提示
- [x] timeDriftRecord：LS_TIME 增 hist（上限 30，旧格式兼容），|偏移|>5s 记 WARN
- [x] syncTime 成功分支统一走 timeDriftRecord（旧 localStorage.setItem 直写移除）
- [x] readTimeInfo 坏 JSON 容错返回空对象

## 回归（3 项）

- [x] node _tests/verify.js → 372 PASS / 0 FAIL（C6 新增 30 项）
- [x] node _tests/deadbtn.js supplydev.html → 未定义函数数 0
- [x] node _tests/enc_webcrypto.js → 9 PASS（真实 WebCrypto 原语）

## 打包（4 项）

- [x] C:/Program Files/Python312/python.exe build.py（沙箱 python 无 pywebview，勿用）
- [x] build/*/warn-*.txt 无 `missing module named 'webview'`（System.*/Microsoft.Web 为良性）
- [x] dist/SupplyDevLocal-v1.0.38.exe 产物带版本号；dist 历史版本保留
- [x] 真机冒烟：exe 启动进程存活、窗口标题含版本号、自动备份落盘
