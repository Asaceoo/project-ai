; ============================================================
; SupplyDevLocal 本机安装包（v1.0.59 起，REQ-C28）
; 版本号单一来源：build.py 递增 version.txt 后经 /DMyAppVersion 注入，
; 禁止在本文件写死版本，也禁止绕过 build.py 直接编译本文件。
; 数据红线：用户数据全部在 ~/.supplydev（IndexedDB/备份/日志），
; 本安装器不写入该目录，卸载也不删除该目录（数据联动 + 数据安全）。
; ============================================================
#ifndef MyAppVersion
  #error "必须由 build.py 通过 /DMyAppVersion 注入版本号（ISCC /DMyAppVersion=x.y.z）"
#endif
#ifndef SourceExe
  #error "必须由 build.py 通过 /DSourceExe 注入绿色版 exe 绝对路径"
#endif

#define MyAppName "ACE 开发助手"
#define MyAppExe "SupplyDevLocal"

[Setup]
; AppId 稳定 GUID：改动会断开升级识别与卸载登记，永远不要改
AppId={{7C3E1A52-9B44-4F6E-8A21-D5E3B0C9F6A4}
AppName={#MyAppName}（SupplyDevLocal）
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
UninstallDisplayName={#MyAppName}（SupplyDevLocal）
; 免管理员权限：映射到 %LOCALAPPDATA%\Programs\SupplyDevLocal，无 UAC 弹窗
PrivilegesRequired=lowest
DefaultDirName={autopf}\{#MyAppExe}
; 运行中禁止覆盖安装（与 app.py 单实例互斥体同名）
AppMutex=Local\SupplyDevLocal
OutputDir=dist
OutputBaseFilename=SupplyDevLocal-setup-v{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
DisableProgramGroupPage=yes
DisableDirPage=no

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务："; Flags: checkedonce

[Files]
; 绿色版 exe 原样安装（重命名为无版本号固定名，快捷方式稳定；窗口标题内含版本号）
Source: "{#SourceExe}"; DestName: "{#MyAppExe}.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}.exe"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent
; 不设卸载删除/卸载运行段：卸载只删本安装器安装的文件，绝不触碰 ~/.supplydev 用户数据
