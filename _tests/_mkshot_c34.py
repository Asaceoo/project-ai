# -*- coding: utf-8 -*-
"""C34 端到端注入副本生成器：Esc 取消拖拽 + 提示钳制 + 正常拖拽提交正控制。
教训（C33）：注入 JS 内避免引号转义——onclick 匹配用双 *= 条件。"""
import io, sys

SRC = 'supplydev.html'
DST = '_tests/_shot_c34.html'

html = io.open(SRC, encoding='utf-8').read()
assert html.count('authRender();') == 1, 'authRender site unexpected'
html = html.replace('authRender();', "authUnlock('ASACE');window.__c34e2e&&window.__c34e2e();", 1)

inj = u'''<script>
window.__c34e2e = function () {
  document.title = 'C34MARK:ENTER';
  setTimeout(function () {
    try {
      var T = todayStr();
      state.products.push({ id: 'c34xp', name: 'C34E2E项目', cat: '门', platform: '', status: '生产中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', progress: 0, targetDate: addDays(T, 40) });
      state.milestones.push({ id: 'c34x1', productId: 'c34xp', name: 'C34E2E任务', parentId: '', date: addDays(T, 2), endDate: addDays(T, 8), status: '未开始', desc: '', color: '#165DFF', kind: 'task' });
      goProjectDetail('c34xp');
      setTimeout(function () {
        try {
          var R = {};
          detailTab = '甘特'; RENDER();
          var bar = document.querySelector('div[onmousedown*="pgDrag"][title*="拖拽平移"]');
          if (!bar) { document.title = 'C34MARK:FAIL-nobar'; return; }
          var r = bar.getBoundingClientRect();
          var x0 = r.left + 15, y0 = r.top + 7;
          var d0 = state.milestones.find(function (m) { return m.id === 'c34x1'; });
          R.before = d0.date + '|' + d0.endDate;
          R.origLeft = bar.style.left;
          /* 场景1：拖到远处再 Esc 取消 */
          bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x0, clientY: y0 }));
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x0 + 150, clientY: y0 }));
          R.midDragging = document.body.classList.contains('pg-dragging');
          var tip = document.getElementById('pg-drag-tip');
          R.midTip = tip ? tip.textContent : '';
          R.midGhostMoved = bar.style.left !== R.origLeft;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          R.afterEscTipGone = !document.getElementById('pg-drag-tip');
          R.afterEscDraggingGone = !document.body.classList.contains('pg-dragging');
          R.afterEscGhostRestored = bar.style.left === R.origLeft;
          var d1 = state.milestones.find(function (m) { return m.id === 'c34x1'; });
          R.afterEscData = d1.date + '|' + d1.endDate;
          /* 场景2：正常拖拽提交（正控制） */
          bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x0, clientY: y0 }));
          document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x0 + 90, clientY: y0 }));
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x0 + 90, clientY: y0 }));
          var d2 = state.milestones.find(function (m) { return m.id === 'c34x1'; });
          R.afterCommitData = d2.date + '|' + d2.endDate;
          document.title = 'C34MARK:' + JSON.stringify(R);
        } catch (e) { document.title = 'C34MARK:FAIL-STEP ' + e.message; }
      }, 400);
    } catch (e) { document.title = 'C34MARK:FAIL-SEED ' + e.message; }
  }, 300);
};
</script>'''

i = html.find('<script>')
html = html[:i] + inj + html[i:]
io.open(DST, 'w', encoding='utf-8').write(html)
print('shot written:', DST)
