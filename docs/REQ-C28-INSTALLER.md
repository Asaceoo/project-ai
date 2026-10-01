# REQ-C28：本机安装版 + 数据联动

- 提出轮次：v1.0.58 之后（C28）
- 用户原话：「增加本机安装版，数据放进本机，数据要联动」

## 1. 背景与现状

- 当前交付形态：PyInstaller onefile 绿色版 exe（`dist/SupplyDevLocal-vX.Y.Z.exe`），数据全部在 `~/.supplydev`（WebView2 profile = IndexedDB/localStorage、`backups/`、`backup_debug.log`、运行日志），与 exe 存放位置无关。
- 单实例互斥：`Local\SupplyDevLocal`（进程名无关，同登录会话内生效）——任何两份拷贝不能同时运行，这是数据一致性的保护机制而非缺陷。

## 2. 需求

### R1 本机安装版（setup 安装包）
- 产出 `dist/SupplyDevLocal-setup-vX.Y.Z.exe`（Inno Setup 6，本机已装于 `C:/Program Files (x86)/Inno Setup 6/ISCC.exe`）。
- 版本号**单一来源**：build.py 递增 version.txt 后经 `/DMyAppVersion` 注入 iss；iss 侧 `#ifndef` 直接 `#error` 防绕过编译。
- 免管理员权限：`PrivilegesRequired=lowest` → 默认装 `%LOCALAPPDATA%\Programs\SupplyDevLocal`，无 UAC 弹窗。
- 运行中禁止覆盖安装：`AppMutex=Local\SupplyDevLocal`。
- 快捷方式：开始菜单 + 桌面（任务勾选，checkedonce）。
- AppId 固定 GUID（改动即断开升级/卸载识别链）。

### R2 数据放进本机
- 安装器**不写入** `~/.supplydev` 以外的任何数据位置；程序本身零改动（app.py 数据目录逻辑不动）。
- 卸载**不删除** `~/.supplydev`（用户数据安全），禁止 `[UninstallDelete]`。

### R3 数据联动
- 安装版与绿色版共用 `~/.supplydev` 同一份数据（天然成立，需真机验证：安装版启动后备份探针写入同一 `backup_debug.log`、备份落盘同一 `backups/`）。
- 单实例互斥保证「联动」不退化为「并发写冲突」。

## 3. 非目标（明确不做）

- 不做自动更新通道（升级 = 重装 setup 或替换 exe）。
- 不做代码签名（SmartScreen 首次运行会有提示，记入已知限制）。
- 不做多用户/多实例数据隔离。

## 4. 验收标准

1. `python build.py` 一次产出两个产物：绿色版 exe + setup 安装包，文件名均带版本号。
2. ISCC 缺失时预检中止（版本号不白消耗）；`--no-installer` 逃生开关可跳过安装包只出绿色版。
3. 静默安装 `/VERYSILENT` 成功；卸载后程序目录移除、`~/.supplydev` 数据完好。
4. 安装版启动 → 备份探针写入 `~/.supplydev/backup_debug.log`（数据联动实证）。
5. verify.js C28 批次全 PASS（iss 结构断言 + build.py 注入链断言）。
