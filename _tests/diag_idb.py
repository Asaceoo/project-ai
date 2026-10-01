# -*- coding: utf-8 -*-
"""诊断：WebView2(file://) 下 window.indexedDB 可用性与 open 失败原因"""
import os
import time
import json
import webview

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '..', 'supplydev.html')
URL = 'file:///' + os.path.abspath(HTML).replace('\\', '/')
DATA = os.path.join(HERE, 'smoke-c1-data')

R = {}


def run(window):
    try:
        R['idbExists'] = window.evaluate_js('typeof window.indexedDB')
        R['readyState'] = window.evaluate_js('document.readyState')
        # 尝试打开并捕获错误
        js = """
        (function(){
          try{
            var rq = indexedDB.open('diag', 1);
            rq.onupgradeneeded = function(){ try{rq.result.createObjectStore('kv')}catch(e){} };
            rq.onsuccess = function(){ window.__diagOk = true; };
            rq.onerror = function(){ window.__diagErr = (rq.error && rq.error.message) || 'onerror-no-msg'; };
            rq.onblocked = function(){ window.__diagErr = 'blocked'; };
            return 'opened';
          }catch(e){ return 'throw:' + e.message; }
        })()
        """
        R['openCall'] = window.evaluate_js(js)
        time.sleep(2)
        R['diagOk'] = window.evaluate_js('window.__diagOk || false')
        R['diagErr'] = window.evaluate_js('window.__diagErr || null')
        R['dbReady'] = window.evaluate_js('!!window.DB_READY')
        R['dbErr'] = window.evaluate_js('(window.__dbErr)||null')
    except Exception as e:
        R['error'] = repr(e)
    with open(os.path.join(HERE, 'diag-idb.json'), 'w', encoding='utf-8') as f:
        json.dump(R, f, ensure_ascii=False, indent=1)
    print(json.dumps(R, ensure_ascii=False))
    window.destroy()


def main():
    window = webview.create_window('diag', url=URL, width=900, height=600)
    webview.start(run, window, storage_path=DATA)


if __name__ == '__main__':
    main()
