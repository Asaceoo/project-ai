# 发布清单 v1.0.59（C28：本机安装版 + 数据联动）

## 一、本版功能
1. **本机安装版**：`dist/SupplyDevLocal-setup-v1.0.59.exe`（Inno Setup 6）——免管理员权限（装 `%LOCALAPPDATA%\Programs\SupplyDevLocal`）、开始菜单+桌面快捷方式、卸载器自带。
2. **数据放进本机**：安装器零数据写入；程序数据目录不变（`~/.supplydev`：IndexedDB 主状态 + backups/ + 日志）。
3. **数据联动**：安装版与绿色版共用 `~/.supplydev` 同一份数据（换形态不换数据，重装不丢）；单实例互斥保证不并发写。
4. build.py 双产物：绿色版 exe + setup 安装包，版本号单一来源注入；`--no-installer` 逃生开关。

## 二、验证链（全绿才打包）
- verify.js：**660 PASS / 0 FAIL**（C28 批次 13 条：iss 结构 ×7 + build.py 注入链 ×4 + 数据联动基础 ×2）
- deadbtn：未定义函数 0
- build.py：py_compile 通过
- 三视角对抗性审查：2 轮收敛——修正 ①C28 断言绑文案误报（iss 注释含「UninstallDelete」字面量）×2 处，改绑结构；②无新增代码缺陷（互斥/升级识别/卸载安全/BOM/静默安装路径推演通过）

## 三、已知限制
- 安装包未签名：首次运行 SmartScreen 可能提示「更多信息→仍要运行」。
- 安装版与绿色版**不能同时运行**（单实例互斥，弹窗提示）——这是数据一致性保护。
- 无自动更新通道：升级 = 跑新版 setup 覆盖安装（AppId 不变，原地升级）。

## 四、待真机确认
1. setup 静默/向导安装 → 桌面/开始菜单快捷方式 → 启动后数据与绿色版一致（同一份项目/里程碑/任务）。
2. 安装版运行中备份探针写入 `~/.supplydev/backup_debug.log`（联动实证）。
3. 控制面板「应用」出现卸载条目；卸载后 `~/.supplydev` 数据完好。
