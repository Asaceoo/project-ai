# -*- coding: utf-8 -*-
"""C33 端到端副本生成器：Write 工具落盘，避免 bash heredoc 转义吃反斜杠（C33 实测注入块语法错误翻车）"""
import io

html = io.open('supplydev.html', encoding='utf-8').read()
assert html.count('authRender();') == 1
html = html.replace('authRender();', "authUnlock('ASACE');window.__c33e2e&&window.__c33e2e();", 1)

inj = u'''<script>
window.onerror = function (m, s, l, c) { document.title = 'C33ERR:' + m + '@' + l + ':' + c; return false; };
window.__c33e2e = function () {
  setTimeout(function () {
    try {
      var T = todayStr();
      state.products.push({ id: 'c33xp', name: 'C33E2E项目', cat: '门', platform: '', status: '生产中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', progress: 0, targetDate: addDays(T, 40) });
      state.milestones.push({ id: 'c33x1', productId: 'c33xp', name: 'C33E2E任务', parentId: '', date: addDays(T, 2), endDate: addDays(T, 6), status: '未开始', desc: '', color: '#165DFF', kind: 'task' });
      goProjectDetail('c33xp');
      setTimeout(function () {
        try {
          var R = {};
          /* F1：概览 tab 点「+ 里程碑」（c33xp+ms 双 *= 条件，零引号转义）→ 弹窗类型应预选里程碑 */
          var btnMs = document.querySelector('#view button[onclick*="c33xp"][onclick*="ms"]');
          if (!btnMs) {
            var _cands = [];
            document.querySelectorAll('button').forEach(function (b) { var o = b.getAttribute('onclick') || ''; if (o.indexOf('c33xp') >= 0) _cands.push(o.slice(0, 60)); });
            document.title = 'C33MARK:FAIL-nobtn cands=' + JSON.stringify(_cands) + ' viewExists=' + !!document.getElementById('view');
            return;
          }
          btnMs.click();
          R.f1PresetMs = document.getElementById('f-mstype').value;
          closeModal(); /* 真实弹窗无 cancel 键（verify stub 专有），走 closeModal */
          /* F3：甘特 tab 滚动 400px → 切打样 → 切回甘特 → 滚动位应恢复 */
          detailTab = '甘特'; RENDER();
          var pg = document.getElementById('pg-scroll');
          pg.scrollLeft = 400; pgScroll = 400;
          detailTab = '打样'; viewProjectDetail();
          detailTab = '甘特'; viewProjectDetail();
          R.f3ScrollRestored = document.getElementById('pg-scroll').scrollLeft === 400;
          /* F6：左手柄真实拖拽 +90px（3 天）——中程父条视觉应变化，数据 date+3 */
          var hnd = document.querySelector('div[onmousedown*="pgDrag"][title*="调整开始日期"]');
          var bar = hnd.parentElement;
          var r = hnd.getBoundingClientRect();
          var x0 = r.left + 3, y0 = r.top + 7;
          var d0 = state.milestones.find(function (m) { return m.id === 'c33x1'; });
          R.before = d0.date + '|' + d0.endDate;
          hnd.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x0, clientY: y0 }));
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x0 + 90, clientY: y0 }));
          R.f6GhostLeftChanged = parseFloat(bar.style.left) > 0;
          R.f6GhostWidthShrunk = parseFloat(bar.style.width) < 150;
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x0 + 90, clientY: y0 }));
          var d1 = state.milestones.find(function (m) { return m.id === 'c33x1'; });
          R.f6DataCommitted = d1.date + '|' + d1.endDate;
          document.title = 'C33MARK:' + JSON.stringify(R);
        } catch (e) { document.title = 'C33MARK:FAIL-STEP ' + e.message; }
      }, 400);
    } catch (e) { document.title = 'C33MARK:FAIL-SEED ' + e.message; }
  }, 300);
};
</script>'''

i = html.find('<script>')
html = html[:i] + inj + html[i:]
io.open('_tests/_shot_c33.html', 'w', encoding='utf-8').write(html)
print('shot regenerated, inj before external script tag at', i)
