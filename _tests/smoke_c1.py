# -*- coding: utf-8 -*-
"""C1 IndexedDB 迁移真机冒烟驱动（隔离数据目录，不污染 ~/.supplydev）
用法：
  python _tests/smoke_c1.py 1   # 首启：种子→改数据→IDB 权威源留痕→模拟镜像丢失→flush→关闭
  python _tests/smoke_c1.py 2   # 重启：验证 IndexedDB 权威源恢复数据→镜像回写→关闭
每轮结果写 _tests/smoke-c1-step{N}.json"""
import os
import sys
import time
import json
import webview

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '..', 'supplydev.html')
URL = 'file:///' + os.path.abspath(HTML).replace('\\', '/')
DATA_DIR = os.path.join(HERE, 'smoke-c1-data')
STEP = sys.argv[1] if len(sys.argv) > 1 else '1'

RESULT = {}
DONE = False


def ev(js):
    return window.evaluate_js(js)


def wait_ready():
    """页面加载完成 + DB_READY + 数据就绪；任何 evaluate_js 异常都容错续轮（绝不因一次瞬态异常误判失败）"""
    rs = None
    dbready = False
    dataready = False
    for _ in range(600):  # 最长 60s
        try:
            rs = ev('document.readyState')
            if rs == 'complete':
                dbready = ev('!!window.DB_READY') is True
                if dbready:
                    dataready = ev('!!(window.state && window.state.products && window.state.products.length)') is True
                    if dataready:
                        break
        except Exception:
            pass
        time.sleep(0.1)
    RESULT['readyState'] = rs
    RESULT['dbReady'] = dbready
    RESULT['dataReady'] = dataready
    try:
        RESULT['idbExists'] = ev('typeof window.indexedDB')
        RESULT['dbErrMsg'] = ev('(window.__dbErr)||null')
    except Exception as e:
        RESULT['finalExc'] = repr(e)
    return dbready and dataready


def probe_idb_marker():
    """两段式 IDB 权威源探测：异步读结果写入 window.__idbProbe，随后单独取回（解决异步回调无法同步返回问题）"""
    ev('''(function(){
      window.__idbProbe=null;window.__idbLs=null;window.__idbWr=null;
      window.storeGetIDB(window.LS,function(x){window.__idbLs=x?{t:x.t,len:(x.v||'').length,head:(x.v||'').slice(0,80)}:null});
      window.storeGetIDB(window.LS,function(x){window.__idbProbe=(x&&typeof x.v==="string"&&x.v.indexOf("冒烟验证-改名")>=0)?"yes":"no"});
      try{
        var tx=window.DB.transaction(window.LS_STORE,'readwrite');
        tx.objectStore(window.LS_STORE).put({k:'probe-key',v:'probe-val',t:Date.now()},'probe-key');
        tx.oncomplete=function(){window.__idbWr='write-ok'};
        tx.onerror=function(){window.__idbWr='write-err:'+((tx.error&&tx.error.message)||'unknown')};
        window.__idbWr='write-issued';
      }catch(e){window.__idbWr='throw:'+e.message}
    })()''')
    time.sleep(0.8)
    try:
        return ev('JSON.stringify({probe:window.__idbProbe,ls:window.__idbLs,wr:window.__idbWr})')
    except Exception:
        return 'probe-exc'


def wait_marker(seconds=15):
    """等待 storeReload 异步完成：products[0] 出现改名标记"""
    got = False
    for _ in range(seconds * 10):
        try:
            if ev('(function(){try{var p=window.state.products[0];return p&&p.name.indexOf("冒烟验证-改名")>=0}catch(e){return false}})()') is True:
                got = True
                break
        except Exception:
            pass
        time.sleep(0.1)
    return got


def step1():
    if not wait_ready():
        RESULT['init'] = 'FAIL: 页面/DB/数据未就绪'
        return
    RESULT['seedProducts'] = ev('window.state.products.length')
    RESULT['lsHasBefore'] = ev('(function(){try{return localStorage.getItem("supplydev_v2_local")!==null}catch(e){return false}})()')
    # 修改首个产品名 + 落盘（走 store 层双通道）
    RESULT['changed'] = ev('''(function(){
      var p=window.state.products[0];
      if(!p)return 'noproduct';
      p.name='冒烟验证-改名'+p.name;
      window.persist();
      return p.id+'|'+p.name;
    })()''')
    time.sleep(1.2)  # 等 IndexedDB 异步事务提交
    RESULT['memHas'] = ev('(function(){try{return window.storeGet(window.LS).indexOf("冒烟验证-改名")>=0}catch(e){return false}})()')
    RESULT['dbHas'] = probe_idb_marker()
    # 模拟容量满场景：localStorage 镜像丢失（仅 IndexedDB 留存）
    ev('(function(){try{localStorage.removeItem("supplydev_v2_local")}catch(e){}})()')
    RESULT['lsRemoved'] = True
    ev('window.flushStore()')  # 关闭前落盘，确保 IDB 写事务完成
    RESULT['ok'] = RESULT['seedProducts'] > 0 and RESULT['memHas'] is True and '"probe":"yes"' in RESULT['dbHas']


def step2():
    if not wait_ready():
        RESULT['init'] = 'FAIL: 页面/DB/数据未就绪'
        return
    RESULT['migFlag'] = ev('window.storeGet("supplydev_db_v1")')
    RESULT['idbLsNow'] = probe_idb_marker()  # IDB 权威源此刻是否有改名记录
    RESULT['memLsNow'] = ev('(function(){var m=window.DB_MEM[window.LS];return m?{t:m.t,has:(m.v.indexOf("冒烟验证-改名")>=0)}:null})()')
    RESULT['storeLogs'] = ev('(function(){try{var a=window.LOGS||[];return a.filter(function(x){return x.m==="store"}).slice(-3)}catch(e){return []}})()')
    RESULT['markerRestored'] = wait_marker()
    RESULT['product0'] = ev('(function(){try{return window.state.products[0].name}catch(e){return ""}})()')
    RESULT['lsMirror'] = ev('(function(){try{var v=localStorage.getItem("supplydev_v2_local");return v?v.indexOf("冒烟验证-改名")>=0:false}catch(e){return false}})()')
    RESULT['ok'] = RESULT['markerRestored'] is True and RESULT['lsMirror'] is True
    ev('window.flushStore()')


def run(win):
    global DONE, window
    window = win
    try:
        if STEP == '1':
            step1()
        else:
            step2()
    except Exception as e:
        RESULT['error'] = repr(e)
    RESULT['step'] = STEP
    with open(os.path.join(HERE, 'smoke-c1-step%s.json' % STEP), 'w', encoding='utf-8') as f:
        json.dump(RESULT, f, ensure_ascii=False, indent=1)
    print(json.dumps(RESULT, ensure_ascii=False))
    DONE = True
    window.destroy()


def main():
    window = webview.create_window(
        title='ACE 开发助手 v1.0.28 冒烟验证',
        url=URL, width=1280, height=800)
    webview.start(run, window, storage_path=DATA_DIR, private_mode=False)


if __name__ == '__main__':
    main()
