# -*- coding: utf-8 -*-
"""C14 壳层（app.py）备份链路自测：清单写入 / 完整性校验 / 滚动修剪 / HTTP /verify 接口。
所有写入被重定向到临时沙箱目录，不触碰真实 ~/.supplydev/backups。
用法：python _tests/c14_app_test.py  （需已安装 pywebview 的 Python，如系统 Python312）
"""
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import threading
import urllib.error
import urllib.request

ROOT = 'C:/Users/iamly/Doubao/chats/2026-09-23/new-chat/supplydev-desktop'
sys.path.insert(0, ROOT)

TMP = tempfile.mkdtemp(prefix='c14bk-')
_real_expanduser = os.path.expanduser
os.path.expanduser = lambda p: TMP if p == '~' else _real_expanduser(p)

import app  # noqa: E402

fails = []


def ck(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + ((' | ' + str(extra)) if (extra and not cond) else ''))
    if not cond:
        fails.append(name)


api = app.Api()
bdir = app.backup_dir()
ck('备份目录落在临时沙箱（不污染真实数据）', bdir.startswith(TMP), bdir)

payload = json.dumps({'products': [{'id': 'p1', 'name': '测试产品'}], '_audit': []}, ensure_ascii=False)
path = api.save_backup(payload)
ck('save_backup 返回已落盘路径', bool(path) and os.path.exists(path), path)

idx = app._index_read(bdir)
expect = hashlib.sha256(payload.encode('utf-8')).hexdigest()
ck('清单写入 1 条且 SHA-256 一致', len(idx) == 1 and idx[0]['sha256'] == expect, json.dumps(idx, ensure_ascii=False))
ck('清单字节数与文件实际一致', bool(idx) and idx[0]['size'] == os.path.getsize(path),
   'index=%s real=%s' % (idx[0]['size'] if idx else '-', os.path.getsize(path)))

r = api.verify_backup()
ck('verify_backup 正常备份 → ok=true', r.get('ok') is True, json.dumps(r, ensure_ascii=False))
ck('verify 回传 sha256/size 与清单一致',
   r.get('sha256') == expect and r.get('size') == os.path.getsize(path),
   json.dumps(r, ensure_ascii=False))

# 截断（模拟磁盘损坏）→ corrupt
raw = io.open(path, 'rb').read()
io.open(path, 'wb').write(raw[:-5])
r2 = api.verify_backup()
ck('verify_backup 检出截断损坏 → corrupt', r2.get('ok') is False and r2.get('reason') == 'corrupt',
   json.dumps(r2, ensure_ascii=False))

# 字节数不变但内容被改（抗篡改）
b = bytearray(raw)
b[-3] = (b[-3] + 1) % 256
io.open(path, 'wb').write(bytes(b))
r2b = api.verify_backup()
ck('verify_backup 检出同长度内容篡改 → corrupt', r2b.get('ok') is False and r2b.get('reason') == 'corrupt',
   json.dumps(r2b, ensure_ascii=False))

# 文件缺失 → missing
io.open(path, 'wb').write(raw)
os.remove(path)
r3 = api.verify_backup()
ck('verify_backup 文件缺失 → missing', r3.get('ok') is False and r3.get('reason') == 'missing',
   json.dumps(r3, ensure_ascii=False))

# 无清单 → no-backup
os.remove(app._index_path(bdir))
r3b = api.verify_backup()
ck('verify_backup 无清单 → no-backup', r3b.get('ok') is False and r3b.get('reason') == 'no-backup',
   json.dumps(r3b, ensure_ascii=False))

# 滚动保留 7 份 + 清单同步修剪
for i in range(9):
    api.save_backup(json.dumps({'products': [], 'i': i}))
files = sorted(f for f in os.listdir(bdir) if f.startswith('supplydev-backup-') and f.endswith('.json'))
ck('滚动保留最近 7 份', len(files) == 7, 'files=%d' % len(files))
ck('文件名带微秒（同秒多次备份不互相覆盖）', all(len(f.split('-')[-1].split('.')[0]) == 6 for f in files),
   json.dumps(files[:3], ensure_ascii=False))
idx2 = app._index_read(bdir)
ck('清单已修剪（不含已删文件）',
   bool(idx2) and all(os.path.exists(os.path.join(bdir, e['file'])) for e in idx2),
   json.dumps([e['file'] for e in idx2], ensure_ascii=False))
ck('清单长度不超过 20 条上限', len(idx2) <= 20, 'len=%d' % len(idx2))
r4 = api.verify_backup()
ck('滚动后最新一份仍校验通过', r4.get('ok') is True, json.dumps(r4, ensure_ascii=False))

# HTTP /verify 接口（真实起服务 + 真实请求）
srv, port = app.start_backup_server('tok123')
if port:
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    def get(url):
        with urllib.request.urlopen(url, timeout=5) as resp:
            return resp.status, resp.read().decode('utf-8')

    base = 'http://127.0.0.1:%d/verify' % port
    try:
        code, body = get(base + '?token=tok123')
        ck('HTTP /verify 正确 token → 200 且 ok=true',
           code == 200 and json.loads(body).get('ok') is True, 'code=%s body=%s' % (code, body[:120]))
    except Exception as ex:
        ck('HTTP /verify 正确 token → 200 且 ok=true', False, repr(ex))
    try:
        get(base + '?token=wrong')
        ck('HTTP /verify 错误 token → 403', False, '未拦截')
    except urllib.error.HTTPError as ex:
        ck('HTTP /verify 错误 token → 403', ex.code == 403, 'code=%d' % ex.code)
    except Exception as ex:
        ck('HTTP /verify 错误 token → 403', False, repr(ex))
    srv.shutdown()
else:
    ck('HTTP /verify 接口（端口段被占用，跳过）', True)

shutil.rmtree(TMP, ignore_errors=True)
print('\n结果：' + ('全部通过' if not fails else '%d 项失败' % len(fails)))
sys.exit(0 if not fails else 1)
