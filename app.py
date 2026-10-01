# -*- coding: utf-8 -*-
"""ACE 开发助手（原 SupplyDev 供应链开发工作台）- 本地单机版
数据与账号全部保存在本机，离线可用，不连接任何服务器。"""
import glob
import hashlib
import json
import os
import sys
import threading
import webview
from datetime import datetime


def resource_path(name):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def read_version():
    try:
        with open(resource_path('version.txt'), 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception:
        return '0.0.0'


def acquire_single_instance():
    """单实例互斥：检测到已有实例（Local\\SupplyDevLocal 互斥体，同登录会话内生效）时提示并退出。
    必须 WinDLL(use_last_error=True) + ctypes.get_last_error()——windll 默认不捕获 last error，
    kernel32.GetLastError() 在真机上不可靠（v1.0.29 真机验证双开未被拦截的根因）。
    检测本身失败不阻塞启动（宁可靠容错不可误拦）。非 Windows 环境跳过。"""
    try:
        import ctypes
        kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel32.CreateMutexW(None, False, 'Local\\SupplyDevLocal')
        if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
            ctypes.windll.user32.MessageBoxW(
                None,
                'ACE 开发助手已在运行中。\n为避免数据互相覆盖，请勿同时打开多个实例。',
                'ACE 开发助手',
                0x10,  # MB_ICONERROR
            )
            return False
        return True
    except Exception:
        return True


def start_backup_server(token):
    """本地 HTTP 备份通道（v1.0.32）：前端 JS 直接 fetch POST /backup 传送 state JSON。
    为何不用 pywebview 桥接（js_api / evaluate_js）——真机排障结论，勿回退：
    pywebview 6.2.1 的 api 注入与 evaluate_js 共用 run_js 链路，而 edgechromium.evaluate_js 的
    semaphore.acquire() 无超时，在本机会随机死锁：一旦注入线程挂起，window.pywebview.api、
    events.loaded、后续所有 evaluate_js 全部静默失效（v1.0.29-31 三版真机实锤）。
    端口与 token 写入页面同目录 bkport.js（相对 script 标签加载）——勿改回 URL query：
    v1.0.32 真机实测 WebView2 加载 file:// 时会剥掉 ?query（History 库实证），前端拿不到端口。
    token 防任意网页向 127.0.0.1 CSRF 写垃圾备份。返回 (server, port)。"""
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class BackupHandler(BaseHTTPRequestHandler):
        def _dbg(self, msg):
            try:
                dbg = os.path.join(os.path.expanduser('~'), '.supplydev', 'backup_debug.log')
                with open(dbg, 'a', encoding='utf-8') as f:
                    f.write('%s %s\n' % (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg))
            except OSError:
                pass

        def do_GET(self):
            if self.path.startswith('/ping'):
                self._dbg('[ping] 页面探针到达（页面 JS 存活且能访问 127.0.0.1）')
                self.send_response(204)
                self.end_headers()
            elif self.path.startswith('/verify'):
                # C14：备份完整性校验接口（token 走 query——GET 无自定义头，服务端仍强校验）
                q = {}
                if '?' in self.path:
                    for kv in self.path.split('?', 1)[1].split('&'):
                        if '=' in kv:
                            k, v = kv.split('=', 1)
                            q[k] = v
                if q.get('token') != token:
                    self.send_response(403)
                    self.end_headers()
                    return
                try:
                    body = json.dumps(Api().verify_backup(), ensure_ascii=False).encode('utf-8')
                except Exception:
                    body = b'{"ok":false,"reason":"error"}'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                try:
                    self.wfile.write(body)
                except OSError:
                    pass
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            if self.path != '/backup' or self.headers.get('X-BK-Token') != token:
                self._dbg('[403] 收到 POST 但路径/令牌不符（fetch 已发出，检查 bkport.js 与页面是否同次启动）')
                self.send_response(403)
                self.end_headers()
                return
            ok = False
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                path = Api().save_backup(body)
                print('[backup] HTTP 通道成功: %s (%d 字符)' % (path, len(body)))
                ok = bool(path)
            except Exception as e:
                print('[backup] HTTP 通道失败: %r' % (e,))
                try:
                    dbg = os.path.join(os.path.expanduser('~'), '.supplydev', 'backup_debug.log')
                    with open(dbg, 'a', encoding='utf-8') as f:
                        f.write('%s HTTP 备份失败: %r\n' % (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), e))
                except OSError:
                    pass
            # C5：返回 JSON 结果体，前端凭 resp.ok 记录最近成功备份时间（7 天未备份提醒依据）
            self.send_response(200 if ok else 500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                self.wfile.write(b'{"ok":true}' if ok else b'{"ok":false}')
            except OSError:
                pass

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-BK-Token')
            self.end_headers()

        def log_message(self, *args):
            pass

    srv = None
    port = None
    for p in range(18650, 18660):
        try:
            srv = HTTPServer(('127.0.0.1', p), BackupHandler)
            port = p
            break
        except OSError:
            continue
    if srv is None:
        return None, None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def backup_dir():
    return os.path.join(os.path.expanduser('~'), '.supplydev', 'backups')


def _index_path(bdir):
    return os.path.join(bdir, 'index.json')


def _index_read(bdir):
    try:
        with open(_index_path(bdir), 'r', encoding='utf-8') as f:
            a = json.load(f)
        return a if isinstance(a, list) else []
    except Exception:
        return []


def _index_write(bdir, idx):
    try:
        with open(_index_path(bdir), 'w', encoding='utf-8') as f:
            json.dump(idx[-20:], f, ensure_ascii=False)
    except OSError:
        pass


def _index_append(bdir, fn, size, sha256):
    idx = [e for e in _index_read(bdir) if e.get('file') != fn]
    idx.append({'file': fn, 'size': size, 'sha256': sha256,
                'ts': datetime.now().strftime('%Y-%m-%d %H:%M:%S')})
    _index_write(bdir, idx)


def _index_prune(bdir):
    """清理清单中指向已不存在备份文件的记录（滚动删除后同步），保证最新一条真实可校验。"""
    idx = [e for e in _index_read(bdir)
           if os.path.exists(os.path.join(bdir, e.get('file', '')))]
    _index_write(bdir, idx)


class Api:
    """pywebview js_api：前端可调用的本地能力"""

    def save_backup(self, json_str):
        """滚动备份业务状态到 ~/.supplydev/backups/，保留最近 7 份。返回备份路径或空串。"""
        try:
            bdir = backup_dir()
            os.makedirs(bdir, exist_ok=True)
            # C14：文件名补微秒——同秒内两次备份（启动备份 + 周期备份）会互相覆盖，丢快照
            fn = 'supplydev-backup-%s.json' % datetime.now().strftime('%Y%m%d-%H%M%S-%f')
            path = os.path.join(bdir, fn)
            data = json_str.encode('utf-8')
            with open(path, 'wb') as f:
                f.write(data)
            # C14：落盘后记录 SHA-256 清单，作为完整性校验依据
            _index_append(bdir, fn, len(data), hashlib.sha256(data).hexdigest())
            files = sorted(glob.glob(os.path.join(bdir, 'supplydev-backup-*.json')))
            for old in files[:-7]:
                try:
                    os.remove(old)
                except OSError:
                    pass
            _index_prune(bdir)
            return path
        except Exception:
            return ''

    def verify_backup(self):
        """C14：校验最近一次自动备份的完整性（存在性 + 字节数 + SHA-256 与清单比对）。
        返回 {ok, reason, file, size, sha256, ts}；任何异常一律 ok=False。"""
        try:
            bdir = backup_dir()
            idx = _index_read(bdir)
            if not idx:
                return {'ok': False, 'reason': 'no-backup'}
            e = idx[-1]
            path = os.path.join(bdir, e.get('file', ''))
            if not os.path.exists(path):
                return {'ok': False, 'reason': 'missing', 'file': e.get('file', '')}
            with open(path, 'rb') as f:
                data = f.read()
            actual = hashlib.sha256(data).hexdigest()
            if len(data) != e.get('size') or actual != e.get('sha256'):
                return {'ok': False, 'reason': 'corrupt', 'file': e.get('file', ''),
                        'expect': e.get('sha256'), 'actual': actual}
            return {'ok': True, 'file': e.get('file', ''), 'size': len(data),
                    'sha256': actual, 'ts': e.get('ts', '')}
        except Exception as ex:
            return {'ok': False, 'reason': 'error:%r' % (ex,)}


def main():
    if not acquire_single_instance():
        sys.exit(0)

    data_dir = os.path.join(os.path.expanduser('~'), '.supplydev')
    os.makedirs(data_dir, exist_ok=True)

    html_path = resource_path('supplydev.html')
    # 备份通道配置写入页面同目录 bkport.js（前端相对 script 标签加载；file:// 的 URL query 会被 WebView2 剥掉，勿改回）
    import secrets
    bk_token = secrets.token_hex(16)
    _, bk_port = start_backup_server(bk_token)
    if bk_port:
        try:
            with open(os.path.join(os.path.dirname(html_path), 'bkport.js'), 'w', encoding='utf-8') as f:
                f.write('window.__BKPORT=%d;window.__BKTOKEN="%s";\n' % (bk_port, bk_token))
        except OSError:
            pass
    url = 'file:///' + html_path.replace('\\', '/')
    ver = read_version()

    window = webview.create_window(
        title='ACE 开发助手 v' + ver + ' · 产品与供应链开发（本地版）',
        url=url,
        width=1440,
        height=900,
        min_size=(1100, 700),
        confirm_close=True,
        js_api=Api(),
    )
    # C4：关闭前强制落盘——closing 事件在 WebView2 关闭链路中先于/独立于前端 beforeunload，
    # 防抖窗口（persist 150ms）内未写盘的变更必须在此冲刷：flushPersist（主状态）→ saveLogs（日志）→ flushStore（等 IndexedDB 事务完成）
    ev = getattr(window, 'events', None)
    if ev is not None and hasattr(ev, 'closing'):
        def _closing_flush():
            for snippet in ('try{flushPersist()}catch(e){}', 'try{saveLogs()}catch(e){}'):
                try:
                    window.evaluate_js(snippet)
                except Exception:
                    pass
            try:
                window.evaluate_js('flushStore()')  # C1：close() 会等待进行中事务完成
            except Exception:
                pass
        try:
            ev.closing += _closing_flush
        except Exception:
            pass
    # private_mode=False 关键：pywebview 默认 private_mode=True，WebView2 会走内存 profile，
    # IndexedDB/localStorage 重启即清空（C1 真机验证暴露的存量 bug）
    webview.start(storage_path=data_dir, private_mode=False, debug=False)


if __name__ == '__main__':
    main()
