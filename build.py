# -*- coding: utf-8 -*-
"""一键打包：环境预检 -> 自动递增 patch 版本号 -> PyInstaller -> Inno Setup 安装包 -> 输出（保留历史版本）
v1.0.59（C28）：新增本机安装版 dist/SupplyDevLocal-setup-vX.Y.Z.exe，与绿色版共用 ~/.supplydev 数据（联动）。
--no-installer 逃生开关：只出绿色版（ISCC 缺失等环境受限时）。"""
import os, sys, subprocess, shutil, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
VER_FILE = os.path.join(ROOT, 'version.txt')
SKIP_INSTALLER = '--no-installer' in sys.argv

# 环境预检：必须在消耗版本号之前。缺 pywebview 时 PyInstaller 会静默跳过，
# 打出的 exe 启动即崩（No module named 'webview'），所以这里失败直接中止。
try:
    import webview  # noqa: F401
except ImportError:
    print('[错误] 当前 Python 缺少 pywebview 模块，打出的 exe 将无法运行。')
    print('[错误] 请先执行: python -m pip install pywebview ，然后重新打包。本次打包已中止（版本号未变动）。')
    sys.exit(1)
print('[预检] pywebview 可用')

# 安装包工具预检（C28，必须在消耗版本号之前）：Inno Setup 6 ISCC
ISCC = None
if not SKIP_INSTALLER:
    for _c in (r'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
               r'C:\Program Files\Inno Setup 6\ISCC.exe'):
        if os.path.exists(_c):
            ISCC = _c
            break
    if not ISCC:
        print('[错误] 未找到 Inno Setup 6（ISCC.exe），无法产出安装包。')
        print('[错误] 请安装 Inno Setup 6，或用 --no-installer 只出绿色版。本次打包已中止（版本号未变动）。')
        sys.exit(1)
    print('[预检] ISCC 可用：' + ISCC)

# 托盘依赖预检（v1.0.52，软告警不中止）：缺 pystray/Pillow 时 exe 仍可运行，只是无系统托盘
try:
    import pystray  # noqa: F401
    import PIL  # noqa: F401
    print('[预检] pystray/Pillow 可用（系统托盘启用）')
except ImportError as _e:
    print(f'[警告] 缺少 {_e.name}，打包出的 exe 将没有系统托盘（应用本体不受影响）。')
    print(f"[警告] 如需托盘请执行: python -m pip install pystray Pillow")

# 读版本
if os.path.exists(VER_FILE):
    with open(VER_FILE, 'r', encoding='utf-8') as f:
        v = f.read().strip()
else:
    v = '0.0.0'
parts = v.split('.')
major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
patch += 1
new_ver = f'{major}.{minor}.{patch}'
with open(VER_FILE, 'w', encoding='utf-8') as f:
    f.write(new_ver)
print(f'[版本] {v} -> {new_ver}')

# 文档版本号同步：docs 两本手册头部的「适用版本」与「最后更新」随构建自动递增
# （正则按行首引用块匹配，只动头部一处；newline='' 保留原 CRLF/LF 行尾）
import re, datetime
_today = datetime.date.today().strftime('%Y-%m-%d')
for _fn in ('docs/USER-GUIDE.md', 'docs/TECH-MANUAL.md'):
    _fp = os.path.join(ROOT, _fn)
    if not os.path.exists(_fp):
        print(f'[文档] 跳过（不存在）：{_fn}')
        continue
    with open(_fp, 'r', encoding='utf-8', newline='') as f:
        _t = f.read()
    _t2 = re.sub(r'适用版本：v[\d.]+（构建时自动同步）', f'适用版本：v{new_ver}（构建时自动同步）', _t)
    _t2 = re.sub(r'最后更新：\d{4}-\d{2}-\d{2}', f'最后更新：{_today}', _t2)
    if _t2 != _t:
        with open(_fp, 'w', encoding='utf-8', newline='') as f:
            f.write(_t2)
        print(f'[文档] 已同步：{_fn} -> v{new_ver} / {_today}')
    else:
        print(f'[文档] 无需变更：{_fn}')

# 清理构建中间产物；dist/ 里的历史版本 exe 一律保留（不删除旧版本）
p = os.path.join(ROOT, 'build')
if os.path.exists(p):
    shutil.rmtree(p)
for fp in glob.glob(os.path.join(ROOT, 'SupplyDevLocal*.spec')):
    os.remove(fp)
print('[清理] build/ 与旧 spec 已清理；dist/ 历史版本保留')

# 打包（文件名带版本号）
exe_name = f'SupplyDevLocal-v{new_ver}'
cmd = [
    sys.executable, '-m', 'PyInstaller',
    '--onefile', '--windowed', '--noconfirm',
    '--name', exe_name,
    '--icon', os.path.join(ROOT, 'assets', 'app.ico'),
    '--add-data', 'supplydev.html;.',
    '--add-data', 'version.txt;.',
    '--add-data', os.path.join(ROOT, 'assets', 'app.ico') + ';.',  # v1.0.52：托盘运行时图标
    '--hidden-import', 'pystray._win32',  # pystray 后端经 importlib 动态加载，静态分析抓不到
    os.path.join(ROOT, 'app.py'),
]
print('[打包]', ' '.join(cmd))
subprocess.run(cmd, cwd=ROOT, check=True)

exe = os.path.join(ROOT, 'dist', exe_name + '.exe')
size = os.path.getsize(exe) / 1024 / 1024
print(f'[完成] {exe}  ({size:.1f} MB)')

# ---- 安装包（C28）：Inno Setup 产出 dist/SupplyDevLocal-setup-vX.Y.Z.exe ----
# iss 源文件是 UTF-8 无 BOM；ISCC 无 BOM 会按 ANSI 解析中文注释导致乱码/报错，
# 因此复制一份带 BOM 的临时 iss 到 build/ 再编译。版本号/exe 路径均经 /D 注入（单一来源）。
if ISCC:
    iss_src = os.path.join(ROOT, 'installer.iss')
    with open(iss_src, 'r', encoding='utf-8') as f:
        iss_text = f.read()
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    iss_tmp = os.path.join(ROOT, 'build', 'installer.iss')
    with open(iss_tmp, 'w', encoding='utf-8-sig') as f:
        f.write(iss_text)
    cmd_iscc = [
        ISCC,
        '/DMyAppVersion=' + new_ver,
        '/DSourceExe=' + exe,
        '/O' + os.path.join(ROOT, 'dist'),
        iss_tmp,
    ]
    print('[安装包]', ' '.join(cmd_iscc))
    subprocess.run(cmd_iscc, cwd=ROOT, check=True)
    setup_exe = os.path.join(ROOT, 'dist', f'SupplyDevLocal-setup-v{new_ver}.exe')
    size2 = os.path.getsize(setup_exe) / 1024 / 1024
    print(f'[完成] {setup_exe}  ({size2:.1f} MB)')
else:
    print('[跳过] --no-installer：仅产出绿色版')

print(f'[版本] v{new_ver}')
