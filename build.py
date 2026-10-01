# -*- coding: utf-8 -*-
"""一键打包：环境预检 -> 自动递增 patch 版本号 -> PyInstaller -> 输出 exe（保留历史版本）"""
import os, sys, subprocess, shutil, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
VER_FILE = os.path.join(ROOT, 'version.txt')

# 环境预检：必须在消耗版本号之前。缺 pywebview 时 PyInstaller 会静默跳过，
# 打出的 exe 启动即崩（No module named 'webview'），所以这里失败直接中止。
try:
    import webview  # noqa: F401
except ImportError:
    print('[错误] 当前 Python 缺少 pywebview 模块，打出的 exe 将无法运行。')
    print('[错误] 请先执行: python -m pip install pywebview ，然后重新打包。本次打包已中止（版本号未变动）。')
    sys.exit(1)
print('[预检] pywebview 可用')

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
    os.path.join(ROOT, 'app.py'),
]
print('[打包]', ' '.join(cmd))
subprocess.run(cmd, cwd=ROOT, check=True)

exe = os.path.join(ROOT, 'dist', exe_name + '.exe')
size = os.path.getsize(exe) / 1024 / 1024
print(f'[完成] {exe}  ({size:.1f} MB)')
print(f'[版本] v{new_ver}')
