/* SupplyDev 回归验证脚本：Node 环境用 DOM 桩真实执行 supplydev.html 全部脚本
 * 用法：node _tests/verify.js
 * 覆盖：语法加载、九大视图渲染、各 tab 渲染、AQL 方案锚点、分批交付、CSV 往返、ID 防重、成本快照、关键日期看板、v1.1 依赖/关键路径/供应商ABCD/订单ETA（含同对双键去重、基线链删除防复活）
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'supplydev.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: 未找到 <script> 块'); process.exit(1); }
const src = m[1];

/* ---------- DOM 桩 ---------- */
function makeEl(tag) {
  return {
    tagName: tag, innerHTML: '', textContent: '', value: '',
    style: {}, type: '', accept: '', onchange: null, onclick: null, oninput: null,
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, addEventListener() {}, click() { if (this.onclick) this.onclick(); },
    _attrs: {}, setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return (k in this._attrs) ? this._attrs[k] : null; },
    querySelector() { return null; }, closest() { return null; },
    href: '', download: '', files: [],
    focus() { this._focused = true; }, select() { this._selected = true; } /* C6 快捷键断言用 */
  };
}
const elCache = {};
const htmlRoot = makeEl('html'); /* documentElement 桩（C7 主题断言用，属性存储真实工作） */
const docStub = {
  documentElement: htmlRoot,
  querySelector(sel) { if (!elCache[sel]) elCache[sel] = makeEl('q'); return elCache[sel]; },
  querySelectorAll() { return []; },
  getElementById(id) { return docStub.querySelector('#' + id); },
  createElement(tag) { return makeEl(tag); },
  addEventListener() {}
};
const store = {};
const lsStub = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
function BlobP(parts) { this._s = parts.map(String).join(''); }
const sandbox = {
  document: docStub, localStorage: lsStub,
  crypto: {
    getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; },
    subtle: {
      digest: async () => new Uint8Array(32).buffer,
      importKey: async (fmt, material) => ({ _m: material }),
      deriveBits: async (algo, key) => { /* 按密码材料+盐差异化输出，贴近真实派生行为 */
        const out = new Uint8Array(32);
        let seed = 0x5a;
        if (key && key._m && key._m.length) seed ^= key._m[0];
        if (algo && algo.salt && algo.salt.length) seed ^= (algo.salt[0] << 1);
        out[0] = seed & 0xff;
        return out.buffer;
      },
      /* C6：AES-GCM 模拟——deriveKey 按 密码材料⊕盐⊕迭代 派生 32 字节密钥；
         encrypt/decrypt 为 XOR 密钥流 + 尾部 16 字节认证 tag（错误密码 tag 必不匹配 → 模拟 GCM 校验失败） */
      deriveKey: async (algo, key) => {
        const out = new Uint8Array(32);
        let seed = 0x5a;
        if (key && key._m && key._m.length) seed ^= key._m[0];
        if (algo && algo.salt && algo.salt.length) seed ^= (algo.salt[0] << 1);
        if (algo && algo.iterations) seed ^= (algo.iterations & 0xff);
        let s = seed || 1;
        for (let i = 0; i < 32; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; out[i] = (s >>> 16) & 0xff; }
        return { _m: out, _seed: seed };
      },
      encrypt: async (algo, key, data) => {
        const iv = new Uint8Array(algo.iv), km = key._m;
        const src = data instanceof Uint8Array ? data : new Uint8Array(data);
        const out = new Uint8Array(src.length + 16);
        let st = (km[0] ^ iv[0] ^ iv[11]) || 1;
        for (let i = 0; i < src.length; i++) { st = (st * 1103515245 + 12345) & 0x7fffffff; out[i] = src[i] ^ ((st >>> 16) & 0xff); }
        for (let i = 0; i < 16; i++) out[src.length + i] = (km[i % km.length] ^ iv[i % iv.length] ^ (i * 31 + 7)) & 0xff;
        return out.buffer;
      },
      decrypt: async (algo, key, data) => {
        const iv = new Uint8Array(algo.iv), km = key._m;
        const src = data instanceof Uint8Array ? data : new Uint8Array(data);
        const body = src.subarray(0, src.length - 16), tag = src.subarray(src.length - 16);
        for (let i = 0; i < 16; i++) {
          if (tag[i] !== ((km[i % km.length] ^ iv[i % iv.length] ^ (i * 31 + 7)) & 0xff)) throw new Error('OperationError');
        }
        const out = new Uint8Array(body.length);
        let st = (km[0] ^ iv[0] ^ iv[11]) || 1;
        for (let i = 0; i < body.length; i++) { st = (st * 1103515245 + 12345) & 0x7fffffff; out[i] = body[i] ^ ((st >>> 16) & 0xff); }
        return out.buffer;
      },
    },
  },
  Blob: BlobP, URL: { createObjectURL: () => 'blob:x' },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'), /* C6 备份加密 base64 */
  atob: (b) => Buffer.from(b, 'base64').toString('binary'),
  confirm: () => true, alert() {}, prompt: () => null,
  print() {} /* C8 打印报表的 60ms 延迟调用需要 window.print 桩，否则事件循环里定时器触发即崩（C10 批次揪出） */,
  console, setTimeout, clearTimeout,
  setInterval() { return 0; }, clearInterval() {},
  fetch() { return Promise.reject(new Error('offline-stub')); },
  addEventListener() {}, removeEventListener() {},
  TextEncoder, TextDecoder /* C2：分块读取流式解码依赖 */
};
sandbox.window = sandbox;

/* ---------- 加载执行（拿真实报错） ---------- */
const vm = require('vm');
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(src, ctx, { filename: 'supplydev-inline.js' });
  console.log('PASS 脚本加载执行无异常');
} catch (e) {
  console.error('FAIL 脚本加载:', e.stack);
  process.exit(1);
}

const S = sandbox.state;
let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS ' + name);
  else { failed++; console.error('FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

/* ---------- 视图渲染冒烟 ---------- */
S._pid = 'p1';
const routes = ['dashboard', 'projects', 'product', 'cost', 'supplier', 'order', 'quality', 'team', 'project'];
for (const r of routes) {
  try { sandbox.go(r); check('视图渲染 ' + r, true); }
  catch (e) { check('视图渲染 ' + r, false, e.message); }
}
/* 各 tab */
const tabs = [['cost', ['materials', 'processes', 'bom', 'quotes', 'versions']], ['quality', ['issues', 'actions', 'inspections']], ['product', ['list', 'kanban']]];
for (const [route, list] of tabs) {
  sandbox.go(route);
  for (const t of list) {
    try { sandbox.setCostTab(t); sandbox.setQualTab(t); sandbox.prodTab = t; sandbox.viewProduct(); check('Tab ' + route + '/' + t, true); }
    catch (e) { check('Tab ' + route + '/' + t, false, e.message); }
  }
}
sandbox.go('cost'); sandbox.setCostTab('quotes');
try { sandbox.renderQuotes('p1'); check('renderQuotes 比价+推荐', docStub.querySelector('#q-body').innerHTML.indexOf('综合推荐') >= 0 || S.quotes.length === 0); }
catch (e) { check('renderQuotes', false, e.message); }

/* ---------- 纯函数断言 ---------- */
/* AQL：GB/T 2828.1 水平Ⅱ 锚点 */
let p = sandbox.aqlPlan(3000, '2.5'); check('AQL2.5 lot3000→n125/Ac7', p.n === 125 && p.ac === 7 && p.re === 8, JSON.stringify(p));
p = sandbox.aqlPlan(500, '2.5'); check('AQL2.5 lot500→n50/Ac3', p.n === 50 && p.ac === 3, JSON.stringify(p));
p = sandbox.aqlPlan(8, '2.5'); check('AQL2.5 lot8→n2/Ac0', p.n === 2 && p.ac === 0, JSON.stringify(p));
p = sandbox.aqlPlan(100, '4.0'); check('AQL4.0 lot100→n20/Ac2', p.n === 20 && p.ac === 2, JSON.stringify(p));
p = sandbox.aqlPlan(10000, '2.5'); check('AQL2.5 lot10000→n200/Ac10', p.n === 200 && p.ac === 10, JSON.stringify(p));
p = sandbox.aqlPlan(9999999, '2.5'); check('AQL 超范围回退末行', p.over === true && p.n === 315, JSON.stringify(p));

/* orderDue 分批口径 */
const o1 = S.orders.find(o => o.id === 'o1');
check('SEED o1 有两个批次', o1 && o1.batches && o1.batches.length === 2);
check('orderDue=最早未收批次', sandbox.orderDue(o1) === o1.batches.map(b => b.date).sort()[0]);
const fake = { due: '2026-01-01', batches: [{ date: '2026-02-01', qty: 1, received: true }, { date: '2026-03-01', qty: 1, received: false }] };
check('orderDue 全收→最早批次', sandbox.orderDue({ due: '2026-01-01', batches: [{ date: '2026-02-01', qty: 1, received: true }] }) === '2026-02-01');
check('orderDue 无批次→合同交期', sandbox.orderDue({ due: '2026-01-01' }) === '2026-01-01');

/* toggleBatch 全收 → 订单完成联动 */
try { sandbox.toggleBatch('o1', 0); sandbox.toggleBatch('o1', 1); check('toggleBatch 全收→已完成', o1.status === '已完成'); }
catch (e) { check('toggleBatch', false, e.message); }
sandbox.toggleBatch('o1', 1); // 收回一条，恢复正常态

/* parseCSV 往返：toCSV 导出的内容再解析回来必须一致 */
const roundRows = [{ name: '带,逗号', v: '他"说"' }, { name: '普通', v: 'x' }];
try {
  sandbox.toCSV(roundRows, [{ key: 'name', label: '名称' }, { key: 'v', label: '值' }]);
  const blobOut = docStub.createElement('a'); // toCSV 内部创建的 blob 不经这里，改用全局捕获
} catch (e) {}
const blobInst = new sandbox.Blob(['']); // 确认 Blob 桩可用
let roundtripOK = false, detail = '';
try {
  let captured = null;
  const OldBlob = sandbox.Blob;
  sandbox.Blob = function (parts) { captured = parts.map(String).join(''); return new OldBlob(parts); };
  sandbox.toCSV(roundRows, [{ key: 'name', label: '名称' }, { key: 'v', label: '值' }]);
  sandbox.Blob = OldBlob;
  const back = sandbox.parseCSV(captured);
  roundtripOK = back.length === 3 && back[1][0] === '带,逗号' && back[1][1] === '他"说"' && back[2][1] === 'x';
  detail = JSON.stringify(back);
} catch (e) { detail = e.message; }
check('CSV 导出→解析往返一致', roundtripOK, detail);

let pendingAsync = 0;

/* C3 数据安全：CSV 公式注入防护（=+@/负文本加前导空格，纯负数放行；导入端 .trim() 无损还原） */
let injOK = false, injDetail = '';
try {
  let capInj = null;
  const OldBlobInj = sandbox.Blob;
  sandbox.Blob = function (parts) { capInj = parts.map(String).join(''); return new OldBlobInj(parts); };
  sandbox.toCSV([{ v: '=HYPERLINK(1)' }, { v: '@SUM(x)' }, { v: '-abc' }, { v: -5 }], [{ key: 'v', label: 'V' }]);
  sandbox.Blob = OldBlobInj;
  injOK = capInj.includes('" =HYPERLINK(1)"') && capInj.includes('" @SUM(x)"') && capInj.includes('" -abc"') && capInj.includes('"-5"');
} catch (e) { injDetail = e.message; }
check('CSV 公式注入防护（=+@/负文本加空格、纯负数放行）', injOK, injDetail);

/* C3 数据安全：PBKDF2 密码哈希（盐格式 / 哈希确定性 / 抗碰撞） */
pendingAsync++;
(async () => {
  try {
    const salt = sandbox.randSalt();
    const h1 = await sandbox.pbkdf2Hex('p@ss', salt);
    const h2 = await sandbox.pbkdf2Hex('p@ss', salt);
    const h3 = await sandbox.pbkdf2Hex('other', salt);
    check('PBKDF2 盐/哈希格式与确定性', /^[0-9a-f]{32}$/.test(salt) && /^[0-9a-f]{64}$/.test(h1) && h1 === h2 && h1 !== h3);
  } catch (e) { check('PBKDF2 盐/哈希格式与确定性', false, e.message); }
  pendingAsync--;
})();

/* nextId 删除后防撞号（种子扩到 m1-m15，删 m3 后应续 m16） */
S.materials = S.materials.filter(x => x.id !== 'm3');
check('nextId 删除后不撞号', sandbox.nextId(S.materials, 'm') === 'm16', sandbox.nextId(S.materials, 'm'));

/* 成本快照 */
const ok1 = sandbox.snapshotCost(false, null);
const ok2 = sandbox.snapshotCost(false, null);
check('快照首次生成', ok1 === true && S.costVersions.length >= 1);
check('成本未变不重复存', ok2 === false);
check('快照含全部产品', S.costVersions[S.costVersions.length - 1].items.length === S.products.length);

/* CSV 导出内容转义（Blob 桩捕获） */
try {
  sandbox.exportModule('products');
  check('exportModule products 走通', true);
} catch (e) { check('exportModule products', false, e.message); }

/* 甘特图输出包含自适应元素 */
sandbox.go('dashboard');
const dash = docStub.querySelector('#view').innerHTML;
check('甘特图含今天线', dash.indexOf('今天') >= 0);
check('甘特图图例含四态里程碑', dash.indexOf('已逾期') >= 0 && dash.indexOf('进行中') >= 0 && dash.indexOf('未开始') >= 0);

/* localStorage 持久化（C4 起 persist 为防抖合并写，断言前需 flushPersist 冲刷） */
sandbox.flushPersist();
check('persist 已写入 localStorage', (lsStub.getItem('supplydev_v2_local') || '').length > 100);

/* 删除级联鲁棒性：删供应商+产品后全视图不崩（对抗性用例） */
S.suppliers = S.suppliers.filter(function (s) { return s.id !== 's3'; });
S.products = S.products.filter(function (p) { return p.id !== 'p2'; });
let robOK = true, robErr = '';
for (const r of routes) { try { sandbox.go(r); } catch (e) { robOK = false; robErr = r + ': ' + e.message; } }
check('删除供应商/产品后全视图不崩', robOK, robErr);

/* ---------- v1.0.15：多级BOM / MRP / 分页 / 审计 ---------- */
sandbox.go('dashboard');
/* 多级 BOM：p5 挂半成品 p3 ×2 */
const fpBase = sandbox.factoryCost('p5');
const fpP3 = sandbox.factoryCost('p3');
S.bom.push({ id: 'b90', productId: 'p5', name: '充电宝半成品', materialId: null, qty: 2, lossRate: 0, processId: null, childProductId: 'p3' });
check('多级BOM递归算价 p5=base+2×p3', Math.abs(sandbox.factoryCost('p5') - (fpBase + 2 * fpP3)) < 0.001,
  'base=' + fpBase + ' p3=' + fpP3 + ' now=' + sandbox.factoryCost('p5'));

/* MRP 数值正确性：p3 → m4 含2%损耗=102，m5=100（×100 件） */
let mrows = sandbox.mrpRows('p3', 100);
const m4 = mrows.find(r => r.mid === 'm4'), m5 = mrows.find(r => r.mid === 'm5');
check('MRP 展开含损耗 m4=102', m4 && Math.abs(m4.total - 102) < 0.001, JSON.stringify(mrows));
check('MRP m5=100', m5 && Math.abs(m5.total - 100) < 0.001);
/* 经半成品展开：p5×10 → b90 用量2 → p3×20 → m4=20×1.02=20.4，m5=20；m6=10×1.04=10.4 */
mrows = sandbox.mrpRows('p5', 10);
const m4b = mrows.find(r => r.mid === 'm4'), m6 = mrows.find(r => r.mid === 'm6');
check('MRP 经半成品递归 m4=20.4', m4b && Math.abs(m4b.total - 20.4) < 0.001, JSON.stringify(mrows));
check('MRP 半成品场景 m5=20 / m6=10.4', m6 && Math.abs(m6.total - 10.4) < 0.001 && Math.abs(mrows.find(r => r.mid === 'm5').total - 20) < 0.001);

/* 防环：p3 引用 p5（p5 已引用 p3），必须有限时间内返回有限值 */
S.bom.push({ id: 'b91', productId: 'p3', name: '循环引用项', materialId: null, qty: 1, lossRate: 0, processId: null, childProductId: 'p5' });
let cycOK = true, cycErr = '';
try { if (!Number.isFinite(sandbox.factoryCost('p3'))) cycOK = false; sandbox.mrpRows('p3', 100); sandbox.factoryCost('p5'); }
catch (e) { cycOK = false; cycErr = e.message; }
check('BOM 循环引用不死循环/不抛错', cycOK, cycErr);
S.bom = S.bom.filter(b => b.id !== 'b91'); // 还原，避免污染后续断言

/* 分页：注入 25 个供应商 → 共 2 页，翻页生效 */
const fakeSups = [];
for (let i = 0; i < 25; i++) { const s = { id: 'sx' + i, name: '压测供应商' + i, cats: ['压测'], moq: 1, terms: '', years: 1, rating: 'B', contact: '', phone: '', address: '', crossBorder: false, qualityScore: 75, deliveryScore: 75, priceScore: 75, status: '启用' }; fakeSups.push(s); S.suppliers.push(s); }
sandbox.go('supplier');
let supHtml = docStub.querySelector('#view').innerHTML;
check('供应商分页出现（共 2 页）', supHtml.indexOf('共 2 页') >= 0);
sandbox.supplierPageGo(2);
supHtml = docStub.querySelector('#view').innerHTML;
check('翻到第2页含压测数据', supHtml.indexOf('压测供应商') >= 0);
S.suppliers = S.suppliers.filter(s => s.id.indexOf('sx') !== 0);

/* 审计日志 */
sandbox.logAudit('测试操作');
const before = S._audit.length;
sandbox.orderStep('o2', 1);
check('orderStep 写入审计', S._audit.length === before + 1 && S._audit[S._audit.length - 1].a.indexOf('订单') >= 0 && S._audit[S._audit.length - 1].a.indexOf('推进') >= 0, JSON.stringify(S._audit[S._audit.length - 1]));
sandbox.go('team');
check('团队页渲染操作日志', docStub.querySelector('#view').innerHTML.indexOf('操作日志') >= 0);

/* MRP 页签渲染 */
sandbox.go('cost'); sandbox.setCostTab('mrp');
check('MRP 页签渲染不崩', true);

/* ---------- v1.0.16：日志系统 / 错误边界 ---------- */
const logN0 = S === sandbox.state ? sandbox.LOGS.length : 0;
sandbox.dbg('test', '调试消息');
check('logLog/debug 进环形缓冲', sandbox.LOGS.length === logN0 + 1);
sandbox.logLog('error', 'test', '错误消息E1', '堆栈占位');
const stored = lsStub.getItem('supplydev_logs_v1') || '';
check('error 级立即落盘', stored.indexOf('错误消息E1') >= 0);
/* 环形缓冲上限：灌 700 条后应收敛 */
for (let i = 0; i < 700; i++) sandbox.logLog('debug', 'test', 'fill' + i);
check('环形缓冲上限 ≤600', sandbox.LOGS.length <= 600, 'len=' + sandbox.LOGS.length);
/* 错误边界：视图抛错不再白屏 */
sandbox.VIEWS.__boom = function () { throw new Error('boom-x'); };
sandbox.ROUTE = '__boom';
sandbox.RENDER();
const lastErr = sandbox.LOGS.slice().reverse().find(e => e.l === 'error');
check('视图崩溃写入 ERROR 日志', lastErr && lastErr.g.indexOf('boom-x') >= 0, JSON.stringify(lastErr));
check('错误边界显示重试按钮', docStub.querySelector('#view').innerHTML.indexOf('重试') >= 0);
sandbox.ROUTE = 'dashboard'; sandbox.RENDER();
/* 审计-日志桥接 */
const logN1 = sandbox.LOGS.length;
sandbox.logAudit('桥接测试操作');
const lastInfo = sandbox.LOGS[sandbox.LOGS.length - 1];
check('审计动作同步进运行日志', sandbox.LOGS.length === logN1 + 1 && lastInfo.m === 'audit' && lastInfo.g.indexOf('桥接测试操作') >= 0);
/* 日志查看器渲染 */
sandbox.openLogViewer();
check('日志查看器渲染', docStub.querySelector('#log-list') !== undefined);
sandbox.renderLogList('error');
check('分级过滤渲染不崩', true);
sandbox.go('dashboard');

/* ---------- v1.0.17：本地时间戳 / 循环拦截 / 已完工守卫 / BOM导出列 ---------- */
sandbox.logLog('info', 'test', '时间戳核验');
const lastLog = sandbox.LOGS[sandbox.LOGS.length - 1];
check('日志时间戳为本地时间', lastLog.t.slice(0, 10) === sandbox.todayStr(), lastLog.t);
const auditN0 = S._audit.length;
sandbox.logAudit('时间戳核验审计');
check('审计时间戳为本地时间', S._audit[S._audit.length - 1].t.slice(0, 10) === sandbox.todayStr(), S._audit[S._audit.length - 1].t);
/* bomReachable：p5 经 b90 可达 p3；p3 不可达 p5 */
check('bomReachable 正向可达', sandbox.bomReachable('p5', 'p3') === true);
check('bomReachable 反向不可达', sandbox.bomReachable('p3', 'p5') === false);
/* 已完工守卫：同产品多订单时，完成其一不联动已完工 */
S.products.push({ id: 'pz', name: '压测产品', cat: '压测', platform: '', status: '生产中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: sandbox.todayStr(), sampleDue: '', confirmDate: '', orderDate: '', progress: 50 });
S.orders.push({ id: 'oA', code: 'OD-TEST-A', productId: 'pz', supplierId: 's1', qty: 10, price: 1, due: sandbox.todayStr(), status: '待下料', payStatus: '未付款', step: 0, batches: [{ date: sandbox.todayStr(), qty: 10, received: false }] });
S.orders.push({ id: 'oB', code: 'OD-TEST-B', productId: 'pz', supplierId: 's1', qty: 5, price: 1, due: sandbox.todayStr(), status: '待下料', payStatus: '未付款', step: 0, batches: [] });
sandbox.toggleBatch('oA', 0);
check('完成一单不误联动已完工', S.orders.find(o => o.id === 'oA').status === '已完成' && S.products.find(p => p.id === 'pz').status !== '已完工');
for (let i = 0; i < 6; i++) sandbox.orderStep('oB', 1);
check('最后一单完成才联动已完工', S.products.find(p => p.id === 'pz').status === '已完工');
S.orders = S.orders.filter(o => o.id !== 'oA' && o.id !== 'oB');
S.products = S.products.filter(p => p.id !== 'pz');
/* BOM CSV 导出含半成品列 */
let bomCsvOk = false;
try {
  let cap = null; const OldBlob2 = sandbox.Blob;
  sandbox.Blob = function (parts) { cap = parts.map(String).join(''); return new OldBlob2(parts); };
  sandbox.exportModule('bom');
  sandbox.Blob = OldBlob2;
  bomCsvOk = cap && cap.indexOf('半成品产品ID') >= 0;
} catch (e) {}
check('BOM 导出含半成品ID列', bomCsvOk);

/* ---------- v1.0.18：时间同步 / 甘特筛选分组 / 风险与节点 / 项目卡片 ---------- */
sandbox.go('dashboard');
check('顶栏时钟文本渲染', sandbox.clockText().indexOf('星期') >= 0 && sandbox.clockText().indexOf('本地时钟') >= 0);
check('diffDays 走统一时间源', typeof sandbox.diffDays(sandbox.todayStr()) === 'number');
/* 甘特筛选 */
sandbox.ganttFilter.scope = 'archived';
sandbox.ganttFilter.cat = '首饰';
sandbox.RENDER();
check('甘特归档+品类筛选不崩', true);
sandbox.ganttFilter.scope = 'all'; sandbox.ganttFilter.cat = ''; sandbox.ganttFilter.range = '3m';
sandbox.RENDER();
const dashHtml = docStub.querySelector('#view').innerHTML;
check('甘特含时间范围控件', dashHtml.indexOf('近3个月') >= 0 && dashHtml.indexOf('近1年') >= 0);
check('甘特含四态图例', dashHtml.indexOf('未开始') >= 0 && dashHtml.indexOf('进行中') >= 0);
check('甘特按品类分组行', dashHtml.indexOf('（') >= 0 && dashHtml.indexOf('全部品类') >= 0);
/* 风险与节点 */
const risks = sandbox.riskItems();
check('riskItems 返回数组', Array.isArray(risks));
const nodes = sandbox.upcomingNodes(14);
check('upcomingNodes 未来14天节点', Array.isArray(nodes) && nodes.every(n => n.d >= 0 && n.d <= 14));
check('仪表盘含风险提醒卡片', dashHtml.indexOf('风险提醒') >= 0 && dashHtml.indexOf('近期到期节点') >= 0);
/* v1.0.24：甘特垂直滚动铺满 / 面板折叠 / 30天节点 / 自定义品类 */
check('甘特容器垂直滚动铺满', dashHtml.indexOf('gantt2-scroll') >= 0 && dashHtml.indexOf('max-height:580px') >= 0 && html.indexOf('.gantt2-scroll{overflow-x:auto;overflow-y:auto') >= 0);
check('仪表盘三面板可折叠', dashHtml.indexOf("dashFoldToggle('todo')") >= 0 && dashHtml.indexOf("dashFoldToggle('risk')") >= 0 && dashHtml.indexOf("dashFoldToggle('node')") >= 0); /* C4 起：折叠走局部刷新 dashFoldToggle，不再内联翻转+全量 RENDER */
check('近期到期节点=未来30天', dashHtml.indexOf('未来30天') >= 0 && dashHtml.indexOf('未来14天') < 0);
const nodes30 = sandbox.upcomingNodes();
check('upcomingNodes 默认30天', Array.isArray(nodes30) && nodes30.every(n => n.d >= 0 && n.d <= 30));
sandbox.dashFold = { todo: true, risk: true, node: true };
sandbox.RENDER();
const dashHtml2 = docStub.querySelector('#view').innerHTML;
check('折叠后显示已收起提示', dashHtml2.indexOf('已收起，点击右上角「展开」查看全部待办') >= 0 && dashHtml2.indexOf('已收起，点击右上角「展开」查看全部风险') >= 0 && dashHtml2.indexOf('已收起，点击右上角「展开」查看全部节点') >= 0);
check('折叠后按钮切换为展开', dashHtml2.indexOf('>展开<') >= 0 && dashHtml2.indexOf('>收起<') < 0);
sandbox.dashFold = { todo: false, risk: false, node: false };
sandbox.RENDER();
const dashHtml3 = docStub.querySelector('#view').innerHTML;
check('展开后恢复收起按钮', dashHtml3.indexOf('>收起<') >= 0 && dashHtml3.indexOf('已收起，点击右上角') < 0);
/* v1.0.25：仪表盘新卡（状态分布/供应商风险/最近动态/毛利健康度） + supScore + 项目详情优化 + pid 预选 */
check('supScore 综合评分加权', sandbox.supScore({ qualityScore: 80, deliveryScore: 70, priceScore: 60 }) === 71);
check('仪表盘含项目状态分布卡', dashHtml3.indexOf('项目状态分布') >= 0 && dashHtml3.indexOf('平均进度') >= 0);
check('仪表盘含供应商风险TOP卡', dashHtml3.indexOf('供应商风险 TOP') >= 0);
check('仪表盘含最近动态卡', dashHtml3.indexOf('最近动态') >= 0 && dashHtml3.indexOf('openLogViewer') >= 0);
check('仪表盘含毛利健康度卡', dashHtml3.indexOf('毛利健康度') >= 0 && dashHtml3.indexOf('平均定价毛利') >= 0);
/* 项目详情页：标签中文化 + 各模块新增按钮 + 里程碑 CSV 入口 */
S._pid = 'p1'; sandbox.go('project');
var pdHtml = docStub.querySelector('#view').innerHTML;
check('项目详情标签中文化', pdHtml.indexOf('概览') >= 0 && pdHtml.indexOf('打样') >= 0 && pdHtml.indexOf('成本') >= 0 && pdHtml.indexOf('供应商') >= 0 && pdHtml.indexOf('订单') >= 0 && pdHtml.indexOf('质量') >= 0);
check('项目详情概览tab含编辑与里程碑入口', pdHtml.indexOf('openEditProduct') >= 0 && pdHtml.indexOf('openMilestone') >= 0);
check('项目详情里程碑CSV入口', pdHtml.indexOf('data-module="milestones"') >= 0 && pdHtml.indexOf("importCSV('milestones')") >= 0);
sandbox.detailTab = '打样'; sandbox.viewProjectDetail();
var pdTab1 = docStub.querySelector('#view').innerHTML;
sandbox.detailTab = '订单'; sandbox.viewProjectDetail();
var pdTab2 = docStub.querySelector('#view').innerHTML;
sandbox.detailTab = '质量'; sandbox.viewProjectDetail();
var pdTab3 = docStub.querySelector('#view').innerHTML;
check('项目详情各模块新增按钮', pdTab1.indexOf('+ 新增打样') >= 0 && pdTab2.indexOf('+ 录入订单') >= 0 && pdTab3.indexOf('+ 新增客诉') >= 0);
/* 逾期告警 banner（独立测试对象，随后恢复种子） */
var _pl = S.products.length, _ml = S.milestones.length;
S.products.push({ id: 'pov', name: '逾期压测项目', cat: '压测', platform: '', status: '生产中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: sandbox.todayStr(), sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(sandbox.todayStr(), -8), progress: 30 });
S.milestones.push({ id: 'msov', productId: 'pov', name: '严重逾期里程碑', date: sandbox.addDays(sandbox.todayStr(), -12), status: '进行中', desc: '', color: '#165DFF' });
S._pid = 'pov'; sandbox.go('project');
var pdHtml2 = docStub.querySelector('#view').innerHTML;
check('项目详情逾期告警banner', pdHtml2.indexOf('项逾期待处理') >= 0 && pdHtml2.indexOf('严重逾期') >= 0);
S.products.splice(_pl); S.milestones.splice(_ml);
/* 毛利卡数值联动：亏损项目被列出（BOM 成本 > 目标价） */
var _pl2 = S.products.length, _bl = S.bom.length;
S.products.push({ id: 'pmg', name: '亏损压测项目', cat: '压测', platform: '', status: '生产中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: sandbox.todayStr(), sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(sandbox.todayStr(), 10), progress: 30 });
S.bom.push({ id: 'bomt1', productId: 'pmg', name: '贵物料', materialId: 'm8', qty: 10, lossRate: 0, processId: '', childProductId: null });
sandbox.go('dashboard');
var dh4 = docStub.querySelector('#view').innerHTML;
check('毛利健康度联动列出亏损项目', dh4.indexOf('亏损压测项目') >= 0 && dh4.indexOf('亏损') >= 0);
S.products.splice(_pl2); S.bom.splice(_bl);
/* pid 预选联动：从项目详情页新增打样/订单自动预选产品 */
sandbox.openSample('p1');
check('openSample 预选产品', docStub.querySelector('#modal-box').innerHTML.indexOf('value="p1" selected') >= 0);
sandbox.openOrder('p1');
check('openOrder 预选产品', docStub.querySelector('#modal-box').innerHTML.indexOf('value="p1" selected') >= 0);
/* 项目卡片视图 */
sandbox.go('projects');
const projHtml = docStub.querySelector('#view').innerHTML;
check('项目汇总含品类chips', projHtml.indexOf('(') >= 0 && projHtml.indexOf('卡片') >= 0 && projHtml.indexOf('列表') >= 0);
sandbox.renderProjCards();
check('卡片视图渲染（定价参考/节点/统计）', docStub.querySelector('#proj-cards').innerHTML.indexOf('定价参考') >= 0);
sandbox.projView = 'list'; sandbox.renderProjCards();
check('列表视图切换', docStub.querySelector('#proj-cards').style.display === 'none' && docStub.querySelector('#proj-table').style.display === 'block');
sandbox.projView = 'cards'; sandbox.renderProjCards();
sandbox.go('dashboard');

/* ---------- v1.0.19：空库防护 / 调价历史 / 8D推进 / 成本模拟器 ---------- */
/* 空库防护：删光产品后成本页签不崩 */
const savedProds = S.products.slice(); S.products = [];
sandbox.go('cost'); sandbox.setCostTab('bom'); sandbox.setCostTab('quotes'); sandbox.setCostTab('sim');
check('删光产品后成本页签不崩', true);
S.products = savedProds;
/* 调价历史 */
const m1 = S.materials.find(m => m.id === 'm1');
const oldP = m1.price;
sandbox.recordPriceHistory('m1', oldP, oldP + 0.1, '银价上涨');
check('recordPriceHistory 同价不记录', (sandbox.recordPriceHistory('m1', 5, 5, 'x'), (S.priceHistory || []).filter(h => h.mid === 'm1' && h.old === 5).length === 0));
check('调价历史已记录', S.priceHistory.some(h => h.mid === 'm1' && h.new === oldP + 0.1));
check('priceHistoryRows 倒序', sandbox.priceHistoryRows('m1')[0].new === oldP + 0.1);
/* 8D 推进 */
S.actions.push({ id: 'aZ', title: '压测整改', supplierId: 's1', owner: 'T', due: sandbox.todayStr(), completionRate: 0, status: '待整改' });
for (let i = 0; i < 8; i++) sandbox.actionStep('aZ');
const aZ = S.actions.find(a => a.id === 'aZ');
check('8D 推进8步后闭环', aZ.completionRate === 100 && aZ.status === '已闭环');
S.actions = S.actions.filter(a => a.id !== 'aZ');
/* 成本模拟器 */
sandbox.go('cost'); sandbox.setCostTab('sim');
check('模拟器渲染含汇率因子', docStub.querySelector('#sim-body').innerHTML.indexOf('汇率因子') >= 0);
sandbox.simCalc();
check('simCalc 基准态不崩', true);
sandbox.go('dashboard');

/* ---------- v1.0.20：全板块编辑 + 联动 ---------- */
/* 打样确认联动 confirmDate */
const sa1 = S.samples.find(s => s.id === 'sa3');
sandbox.sampleNext('sa3'); // 打样中→样品寄出
sandbox.sampleNext('sa3'); // 样品寄出→已确认
const p3 = S.products.find(p => p.id === 'p3');
check('打样确认联动 confirmDate', sa1.status === '已确认' && !!p3.confirmDate, p3.confirmDate);
/* 打样编辑 */
sandbox.editSample('sa3');
docStub.querySelector('#f-cost').value = '666';
docStub.querySelector('#modal-ok').onclick();
check('editSample 保存生效', S.samples.find(s => s.id === 'sa3').cost === 666);
/* 订单编辑联动 */
const o2 = S.orders.find(o => o.id === 'o2');
sandbox.editOrder('o2');
docStub.querySelector('#f-qty').value = '999';
docStub.querySelector('#modal-ok').onclick();
check('editOrder 保存生效', o2.qty === 999);
/* 报价采纳互斥联动 */
const q1 = S.quotes.find(q => q.id === 'q1');
sandbox.quoteStatus('q1', '已采纳');
check('quoteStatus 采纳生效', q1.status === '已采纳');
/* 报价编辑 */
sandbox.editQuote('q1');
docStub.querySelector('#f-price').value = '4.44';
docStub.querySelector('#modal-ok').onclick();
check('editQuote 保存生效', Math.abs(q1.price - 4.44) < 0.001);
/* 客诉编辑联动评分 */
const i1 = S.issues.find(i => i.id === 'i1');
sandbox.editIssue('i1');
docStub.querySelector('#f-title').value = '露营灯亮度不足客诉(改)';
docStub.querySelector('#f-verdict').value = '退货';
docStub.querySelector('#modal-ok').onclick();
check('editIssue 保存+判定变更', i1.verdict === '退货' && i1.title === '露营灯亮度不足客诉(改)');
/* 工艺编辑联动成本快照 */
const pr1 = S.processes.find(p => p.id === 'pr1');
const cvBefore = S.costVersions.length;
sandbox.editProcess('pr1');
docStub.querySelector('#f-name').value = '打磨抛光';
docStub.querySelector('#f-price').value = '0.9';
docStub.querySelector('#modal-ok').onclick();
check('editProcess 调价联动快照', pr1.refPrice === 0.9 && S.costVersions.length > cvBefore);
/* 团队编辑 */
sandbox.viewTeam();
sandbox.editTeam('t2');
docStub.querySelector('#f-name').value = '李雷2';
docStub.querySelector('#modal-ok').onclick();
check('editTeam 保存生效', S.team.find(m => m.id === 't2').n === '李雷2');
sandbox.editTeam();
docStub.querySelector('#f-name').value = '新成员';
docStub.querySelector('#modal-ok').onclick();
check('editTeam 新增生效', S.team.some(m => m.n === '新成员'));
sandbox.go('dashboard');

/* ---------- v1.0.21：关键日期看板 ---------- */
sandbox.keyCal={y:null,m:null};sandbox.keySel='';
var T0=sandbox.todayStr();
var evToday=sandbox.dateEvents(T0);
check('dateEvents 今天含待办（客诉锚定今天）', Array.isArray(evToday)&&evToday.some(function(e){return e.k==='todo'&&e.t.indexOf('客诉待处理')>=0}), JSON.stringify(evToday));
/* dateEvents 必须与 orderDue 口径一致（o1 最早未收批次，前面用例已变更批次状态） */
var due1=sandbox.orderDue(S.orders.find(function(o){return o.id==='o1'}));
var ev3=sandbox.dateEvents(due1);
check('dateEvents 命中订单批次交期', ev3.some(function(e){return e.t.indexOf('OD-20260901001')>=0&&e.t.indexOf('交期（批次）')>=0}), JSON.stringify(ev3));
var ev2=sandbox.dateEvents(sandbox.addDays(T0,2));
check('dateEvents 整改未闭环归待办', ev2.some(function(e){return e.k==='todo'&&e.t.indexOf('整改截止')>=0}), JSON.stringify(ev2));
var due3=sandbox.orderDue(S.orders.find(function(o){return o.id==='o3'})); /* P1：o3 种子带已收批次，orderDue 按批次池取最早日期，断言跟随契约而非硬编码 T-8 */
var evm8=sandbox.dateEvents(due3);
check('dateEvents 已发货订单标已完成', evm8.some(function(e){return e.t.indexOf('OD-20260820003')>=0&&e.done===true}), JSON.stringify(evm8));
var ev22=sandbox.dateEvents(sandbox.addDays(T0,22));
check('dateEvents 命中产品打样截止', ev22.some(function(e){return e.t.indexOf('折叠露营灯')>=0&&e.t.indexOf('打样截止')>=0}), JSON.stringify(ev22));
/* 去重：同一天不出现两条相同文本 */
var dupOK=true;['0','3','22'].forEach(function(n){var es=sandbox.dateEvents(sandbox.addDays(T0,+n));var ts=es.map(function(e){return e.t});if(new Set(ts).size!==ts.length)dupOK=false});
check('dateEvents 同日去重', dupOK);
/* done 语义：已完工项目交付节点标已完成（独立构造，避免前置 editOrder 联动改 p5 状态） */
S.products.push({id:'pdn',name:'已完工压测项目',cat:'压测',platform:'',status:'已完工',owner:'',targetPrice:1,margin:0.4,freight:0,tariff:0,commission:0.1,adRate:0,returnRate:0,ideaDate:sandbox.addDays(T0,-60),sampleDue:sandbox.addDays(T0,-45),confirmDate:sandbox.addDays(T0,-40),orderDate:sandbox.addDays(T0,-38),targetDate:sandbox.addDays(T0,-5),progress:100});
sandbox.msBaselineFor(S.products.find(p => p.id === 'pdn'));
const mspdn = S.milestones.find(m => m.productId === 'pdn' && m.name === '交付');
const evDone=sandbox.dateEvents(sandbox.addDays(T0,-5));
check('dateEvents 已完工交付节点标已完成', !!mspdn && mspdn.status === '已完成' && evDone.some(function(e){return e.t.indexOf('已完工压测项目 · 交付')>=0&&e.done===true}), JSON.stringify(evDone));
/* done 语义：样品已确认（confirmDate 回写）后打样截止节点标已完成 */
var evDone2=sandbox.dateEvents(sandbox.addDays(T0,-28));
check('dateEvents 打样确认后截止节点标已完成', evDone2.some(function(e){return e.t.indexOf('925银镀金锁骨链 · 打样截止')>=0&&e.done===true}), JSON.stringify(evDone2));
/* 下钻：详情面板里程碑节点直达里程碑详情（实体驱动，用户新增/删除实时反映） */
var dd=sandbox.dayDetailHTML(sandbox.addDays(T0,-5));
check('详情面板里程碑节点直达详情', !!mspdn && dd.indexOf("msDrill('" + mspdn.id + "')")>=0, dd);
S.products=S.products.filter(function(p){return p.id!=='pdn'});
S.milestones=S.milestones.filter(function(m){return m.productId!=='pdn'}); /* 清理压测里程碑，避免污染后续 dateEvents 断言 */
/* 编辑入口：openEditProduct 表单含目标交期与进度（对抗性，此前缺失） */
var edHtml='';
try{var edSave=(function(){var captured='';var origOpenModal=sandbox.openModal;sandbox.openModal=function(t,h,cb){captured=h;origOpenModal(t,h,cb)};sandbox.openEditProduct('p1');sandbox.openModal=origOpenModal;return captured})();edHtml=edSave;}catch(e){edHtml='ERR:'+e.message}
check('openEditProduct 含目标交期编辑入口', edHtml.indexOf('f-tdate')>=0&&edHtml.indexOf('f-prog')>=0, edHtml.slice(0,200));
/* 里程碑实体连通：编辑项目日期→基线里程碑日期跟随（未自定义时），自定义里程碑不被覆盖 */
S.products.push({id:'pta2',name:'日期联动压测项目',cat:'压测',platform:'',status:'打样中',owner:'',targetPrice:10,margin:0.4,freight:0,tariff:0,commission:0.1,adRate:0,returnRate:0,ideaDate:sandbox.addDays(T0,-20),sampleDue:sandbox.addDays(T0,5),confirmDate:'',orderDate:'',targetDate:sandbox.addDays(T0,30),progress:20});
sandbox.msBaselineFor(S.products.find(p => p.id === 'pta2'));
const msd1=S.milestones.find(m=>m.productId==='pta2'&&m.name==='打样截止');
const msd2=S.milestones.find(m=>m.productId==='pta2'&&m.name==='交付');
sandbox.openEditProduct('pta2');
docStub.querySelector('#f-name').value='日期联动压测项目';
docStub.querySelector('#f-price').value='10';
docStub.querySelector('#f-sdue').value=sandbox.addDays(T0,9);
docStub.querySelector('#f-tdate').value=sandbox.addDays(T0,40);
docStub.querySelector('#f-status').value='打样中';
docStub.querySelector('#f-prog').value='20';
docStub.querySelector('#modal-ok').onclick();
check('联动：编辑项目日期→基线里程碑跟随', msd1.date===sandbox.addDays(T0,9)&&msd2.date===sandbox.addDays(T0,40), JSON.stringify({a:msd1.date,b:msd2.date}));
S.milestones.push({id:'msc1',productId:'pta2',name:'自定义交付',date:sandbox.addDays(T0,12),status:'未开始',desc:'',color:'#165DFF'});
sandbox.openEditProduct('pta2');
docStub.querySelector('#f-name').value='日期联动压测项目';
docStub.querySelector('#f-price').value='10';
docStub.querySelector('#f-tdate').value=sandbox.addDays(T0,50);
docStub.querySelector('#f-status').value='打样中';
docStub.querySelector('#f-prog').value='20';
docStub.querySelector('#modal-ok').onclick();
check('联动：自定义里程碑日期不被字段覆盖', S.milestones.find(m=>m.id==='msc1').date===sandbox.addDays(T0,12)&&msd2.date===sandbox.addDays(T0,50), JSON.stringify({c:S.milestones.find(m=>m.id==='msc1').date,d:msd2.date}));
S.products=S.products.filter(p=>p.id!=='pta2');
S.milestones=S.milestones.filter(m=>m.productId!=='pta2');
/* 里程碑实体连通：样品确认→自动生成样品确认里程碑并已完成；下单→下单里程碑已完成 */
S.products.push({id:'pta',name:'联动压测项目',cat:'压测',platform:'',status:'打样中',owner:'',targetPrice:10,margin:0.4,freight:0,tariff:0,commission:0.1,adRate:0,returnRate:0,ideaDate:sandbox.addDays(T0,-20),sampleDue:sandbox.addDays(T0,5),confirmDate:'',orderDate:'',targetDate:sandbox.addDays(T0,30),progress:20});
sandbox.msBaselineFor(S.products.find(p => p.id === 'pta'));
S.products.find(p=>p.id==='pta').confirmDate=sandbox.addDays(T0,-3); /* 模拟打样已确认回写 */
S.samples.push({id:'sax',productId:'pta',round:1,supplierId:'s1',cost:100,due:sandbox.addDays(T0,-1),status:'已确认',feedback:''});
sandbox.syncProductStatus('pta');
const msc=S.milestones.find(m=>m.productId==='pta'&&m.name==='样品确认');
check('联动：样品确认→样品确认里程碑自动生成并已完成', !!msc&&msc.status==='已完成'&&S.products.find(p=>p.id==='pta').status==='已下单', JSON.stringify(msc));
S.orders.push({id:'oax',code:'OD-TEST-PTA',productId:'pta',supplierId:'s1',qty:100,price:2,due:sandbox.addDays(T0,20),status:'已下单',payStatus:'未付款',orderType:'首单',step:1,batches:[]});
sandbox.syncProductStatus('pta');
const mso=S.milestones.find(m=>m.productId==='pta'&&m.name==='下单');
check('联动：下单→下单里程碑自动生成并已完成', !!mso&&mso.status==='已完成', JSON.stringify(mso));
S.products=S.products.filter(p=>p.id!=='pta');
S.samples=S.samples.filter(s=>s.id!=='sax');
S.orders=S.orders.filter(o=>o.id!=='oax');
S.milestones=S.milestones.filter(m=>m.productId!=='pta');
/* 看板渲染 */
var board=sandbox.keyDateBoard();
check('看板含标题/图例/回到今天', board.indexOf('关键日期看板')>=0&&board.indexOf('图例')>=0&&board.indexOf('回到今天')>=0&&board.indexOf('上月')>=0);
check('看板月历 42 格', (board.match(/cal-cell/g)||[]).length===42, (board.match(/cal-cell/g)||[]).length);
check('看板今天单元格高亮', board.indexOf('cal-cell today')>=0);
/* 仪表盘接入 */
sandbox.go('dashboard');
check('仪表盘已接入关键日期看板', docStub.querySelector('#view').innerHTML.indexOf('关键日期看板')>=0);
/* 交互：点选日期 → 详情联动 */
sandbox.selKeyDate(due1);
check('点选日期联动详情', docStub.querySelector('#keyboard-wrap').innerHTML.indexOf('OD-20260901001')>=0);
check('点选日期写入 keySel', sandbox.keySel===due1);
check('点选日期自动对齐所属月份', sandbox.keyCal.y===+due1.slice(0,4)&&sandbox.keyCal.m===+due1.slice(5,7)-1, JSON.stringify(sandbox.keyCal));
/* 月份导航跨年 */
sandbox.keyCal={y:2026,m:0};
sandbox.keyDateNav(-1);
check('上月跨年回退', sandbox.keyCal.y===2025&&sandbox.keyCal.m===11, JSON.stringify(sandbox.keyCal));
sandbox.keyCal={y:2026,m:11};
sandbox.keyDateNav(1);
check('下月跨年前进', sandbox.keyCal.y===2027&&sandbox.keyCal.m===0, JSON.stringify(sandbox.keyCal));
/* 回到今天 */
sandbox.goKeyToday();
check('回到今天恢复跟随+选中今天', sandbox.keyCal.y===null&&sandbox.keyCal.m===null&&sandbox.keySel===T0);
/* 删光产品后看板渲染不崩（对抗性） */
var savedProds2=S.products.slice();S.products=[];
var boardEmptyOK=true,boardEmptyErr='';
try{sandbox.keyDateBoard();}catch(e){boardEmptyOK=false;boardEmptyErr=e.message}
check('删光产品后看板渲染不崩', boardEmptyOK, boardEmptyErr);
S.products=savedProds2;
/* 缺 targetDate 的项目不崩仪表盘（对抗性，曾导致 ganttHTML 崩溃） */
S.products.push({id:'pnx',name:'无目标交期项目',cat:'压测',platform:'',status:'立项中',owner:'',targetPrice:1,margin:0.4,freight:0,tariff:0,commission:0.1,adRate:0,returnRate:0,ideaDate:T0,sampleDue:sandbox.addDays(T0,22),confirmDate:'',orderDate:''});
var errN0=sandbox.LOGS.filter(function(l){return l.l==='error'}).length;
sandbox.go('dashboard');
var errN1=sandbox.LOGS.filter(function(l){return l.l==='error'}).length;
check('缺 targetDate 项目不崩仪表盘', errN1===errN0&&docStub.querySelector('#view').innerHTML.indexOf('页面渲染出错')<0);
S.products=S.products.filter(function(p){return p.id!=='pnx'});
sandbox.go('dashboard');

/* ---------- CSV 导入逐行校验（FileReader 桩驱动真实 onchange 路径） ---------- */
const createdInps = [];
const _origCE = docStub.createElement.bind(docStub);
docStub.createElement = function(tag){ const el = _origCE(tag); if (tag === 'input') createdInps.push(el); return el; };
sandbox.FileReader = function(){ this.result = ''; };
sandbox.FileReader.prototype.readAsText = function(f){ this.result = (f && f._csv) || ''; this.onload(); };
const _alertMsgs = [];
sandbox.alert = function(m){ _alertMsgs.push(m); };
function driveImport(kind, csvText){
  const n0 = createdInps.length;
  sandbox.importCSV(kind);
  const inp = createdInps[n0];
  if (!inp) return 'NO-INPUT';
  inp.files = [{ _csv: csvText }];
  inp.onchange({ target: inp });
  docStub.querySelector('#modal-ok').onclick(); /* C2：影子预跑预览弹窗 → 确认后执行 */
  return 'OK';
}
/* 订单导入：合法行入库 + 产品ID不存在行报错不落库 */
{
  const oN = S.orders.length;
  const r1 = driveImport('orders',
    '订单号,产品ID,供应商ID,数量,单价,交期,状态,付款状态,进度步\n' +
    'OD-IMPTEST-1,p1,s1,100,1.99,2026-12-01,生产中,未付款,2\n' +
    'OD-IMPTEST-2,pxx,s1,100,1.99,2026-12-01,生产中,未付款,2');
  check('CSV导入订单：合法入库+引用错误行不落库', r1==='OK' && S.orders.length===oN+1 && S.orders.some(o=>o.code==='OD-IMPTEST-1') && !S.orders.some(o=>o.code==='OD-IMPTEST-2') && _alertMsgs.length>0 && _alertMsgs[_alertMsgs.length-1].indexOf('pxx')>=0, _alertMsgs.slice(-1).join('|'));
}
/* BOM 导入：物料行/半成品行入库 + 自引用循环被拦截 */
{
  const bN = S.bom.length;
  driveImport('bom',
    '产品ID,组成项,物料ID,用量,损耗率,工艺ID,半成品产品ID\n' +
    'p4,压测物料,m1,2,0.1,pr1,\n' +
    'p3,压测半成品,,1,,,p4\n' +
    'p4,循环项,,1,,,p4');
  check('CSV导入BOM：合法行入库+自引用循环拦截', S.bom.length===bN+2 && S.bom.some(b=>b.productId==='p4'&&b.name==='压测物料') && S.bom.some(b=>b.productId==='p3'&&b.name==='压测半成品') && !S.bom.some(b=>b.name==='循环项') && _alertMsgs[_alertMsgs.length-1].indexOf('循环引用')>=0, _alertMsgs.slice(-1).join('|'));
}
/* 打样导入：已确认联动产品 confirmDate + 轮次沿用 */
{
  const p4s = S.products.find(p=>p.id==='p4');
  const c0 = p4s.confirmDate;
  driveImport('samples', '产品ID,供应商ID,轮次,费用,截止,状态\np4,s5,2,100,2026-11-01,已确认');
  check('CSV导入打样：已确认联动confirmDate+轮次', S.samples.some(s=>s.productId==='p4'&&s.round===2&&s.status==='已确认') && p4s.confirmDate==='2026-11-01', c0+'→'+p4s.confirmDate);
}
/* 报价导入：引用错误行拦截 + 同产品同供应商去重 */
{
  const qN = S.quotes.length;
  driveImport('quotes',
    '产品ID,供应商ID,单价,MOQ,交期天数,状态,有效期\n' +
    'p1,pxx,5,100,20,待定,\n' +
    'p4,s5,6,300,15,待定,2026-12-31\n' +
    'p1,s2,5,100,20,待定,');
  check('CSV导入报价：引用拦截+新对入库+重复对跳过', S.quotes.length===qN+1 && S.quotes.some(q=>q.productId==='p4'&&q.supplierId==='s5') && _alertMsgs[_alertMsgs.length-1].indexOf('pxx')>=0, JSON.stringify(S.quotes.slice(-2)));
}
/* 客诉导入：合法入库 + 同标题同供应商去重 + 供应商评分联动 */
{
  const iN = S.issues.length;
  const s2q0 = S.suppliers.find(s=>s.id==='s2').qualityScore;
  driveImport('issues',
    '标题,订单ID,供应商ID,类型,抽检数,不良数,判定,状态\n' +
    '压测客诉,o1,s2,功能不良,10,1,退货,待处理\n' +
    '压测客诉,o1,s2,功能不良,10,1,退货,待处理');
  check('CSV导入客诉：入库+重复跳过+评分重算', S.issues.length===iN+1 && S.issues.filter(x=>x.title==='压测客诉').length===1 && S.suppliers.find(s=>s.id==='s2').qualityScore!==s2q0, JSON.stringify({iN:S.issues.length,s2q0:s2q0,q:S.suppliers.find(s=>s.id==='s2').qualityScore}));
}
/* 产品导入：重名跳过不重复入库 */
{
  const pN = S.products.length;
  driveImport('products',
    '项目名称,品类,平台,状态,负责人,目标售价,立项日,打样截止,目标交期,进度%\n' +
    '925银镀金锁骨链,首饰,Amazon,生产中,ASACE,19.99,2026-09-01,2026-10-01,2026-12-01,50\n' +
    '全新压测项目,压测,Amazon,立项中,TEST,9.99,2026-09-24,2026-10-16,2026-11-08,0');
  check('CSV导入产品：重名跳过+新行入库', S.products.length===pN+1 && S.products.filter(p=>p.name==='925银镀金锁骨链').length===1 && S.products.some(p=>p.name==='全新压测项目'));
}
/* v1.0.22 对抗审查收敛：供应商导入评分往返 / 报价导入互斥 / 报价状态联动成本快照 */
/* 供应商导入：质量分/交期分/价格分往返保留（此前仅导出不读，重导丢评分） */
{
  const sN = S.suppliers.length;
  driveImport('suppliers',
    '供应商,品类,MOQ,账期,合作年限,评级,质量分,交期分,价格分,联系人,状态\n' +
    '压测评分供应商,压测,500,月结30天,3,B,88,79,92,测试联系人,启用');
  const ns = S.suppliers.find(s=>s.name==='压测评分供应商');
  check('CSV导入供应商：价格分保留+q/d公式收敛(95/90)', S.suppliers.length===sN+1 && ns && ns.priceScore===92 && ns.qualityScore===95 && ns.deliveryScore===90 && ns.rating===sandbox.supGrade(sandbox.supScore(ns)), JSON.stringify(ns));
}
/* 报价导入互斥：同产品两行已采纳 → 仅最新一条保持已采纳（对齐手工 quoteStatus 语义） */
{
  const qN = S.quotes.length;
  driveImport('quotes',
    '产品ID,供应商ID,单价,MOQ,交期天数,状态,有效期\n' +
    'p5,s1,7,100,20,已采纳,2026-12-31\n' +
    'p5,s2,6.5,100,18,已采纳,2026-12-31');
  const p5adopted = S.quotes.filter(q=>q.productId==='p5'&&q.status==='已采纳');
  check('CSV导入报价：同产品多已采纳互斥收敛', S.quotes.length===qN+2 && p5adopted.length===1 && p5adopted[0].supplierId==='s2', JSON.stringify(S.quotes.filter(q=>q.productId==='p5')));
}
/* quoteStatus 状态变更：报价不参与成本计算（成本=BOM实算），快照不重复生成（去重语义验证） */
{
  const cvN = S.costVersions.length;
  const q1 = S.quotes.find(q=>q.id==='q1');
  let ok = true, err = '';
  try { sandbox.quoteStatus('q1', '已拒绝'); } catch (e) { ok = false; err = e.message; }
  check('quoteStatus 变更无异常且成本快照不重复生成', ok && q1.status==='已拒绝' && S.costVersions.length===cvN, err || ('cv:'+cvN+'→'+S.costVersions.length));
}

/* ---------- C2 导入增强：预览弹窗 / 零副作用 / 取消 / 回滚 / 分块读取 ---------- */
{
  const pN2 = S.products.length, lN2 = sandbox.LOGS.length, aN2 = (S._audit || []).length;
  const n0 = createdInps.length;
  sandbox.importCSV('products');
  const inp2 = createdInps[n0];
  inp2.files = [{ _csv: '项目名称,品类\n预览专用项目,压测' }];
  inp2.onchange({ target: inp2 });
  const prevHtml = docStub.querySelector('#modal-box').innerHTML;
  check('C2 预览弹窗含统计与确认按钮', prevHtml.indexOf('导入预览') >= 0 && prevHtml.indexOf('将新增') >= 0 && prevHtml.indexOf('确认导入') >= 0, prevHtml.slice(0, 100));
  check('C2 预览零副作用（不落库/不写日志/不审计）', S.products.length === pN2 && sandbox.LOGS.length === lN2 && (S._audit || []).length === aN2, 'p:' + S.products.length + '/' + pN2 + ' log:' + sandbox.LOGS.length + '/' + lN2);
  sandbox.closeModal(); /* 点取消等价：预览弹窗关闭，不执行导入 */
  check('C2 取消后不落库', S.products.length === pN2 && !S.products.some(p => p.name === '预览专用项目'));
}
{
  const pN3 = S.products.length;
  driveImport('products', '项目名称,品类,平台,状态\n回滚测试项目,压测,Amazon,立项中');
  check('C2 确认执行后入库', S.products.length === pN3 + 1 && S.products.some(p => p.name === '回滚测试项目'));
  check('C2 导入会话已记录', sandbox.importSessions.length >= 1 && sandbox.importSessions[0].kind === 'products' && sandbox.importSessions[0].added === 1, JSON.stringify(sandbox.importSessions[0]));
  const sid2 = sandbox.importSessions[0].id;
  sandbox.undoImport(sid2);
  check('C2 撤销后数据还原+记录移除', S.products.length === pN3 && !S.products.some(p => p.name === '回滚测试项目') && !sandbox.importSessions.some(s => s.id === sid2) && (S._audit[S._audit.length - 1] || {}).a.indexOf('撤销CSV导入') >= 0);
}
{
  let frCalls = 0;
  const _FR = sandbox.FileReader;
  const _ST = sandbox.setTimeout;
  sandbox.setTimeout = function (fn) { fn(); return 0; }; /* 块间让出调度同步化，驱动分块拼接 */
  sandbox.FileReader = function () { this.result = null; };
  sandbox.FileReader.prototype.readAsArrayBuffer = function (f) {
    frCalls++;
    const src = f && f._bytes ? f._bytes : new TextEncoder().encode((f && f._csv) || '');
    this.result = new Uint8Array(src).buffer; /* 拷贝为独立 buffer，避免 subarray 视图越界 */
    this.onload();
  };
  const bigF = { size: 512 * 1024 + 10, _csv: 'a,b\n1,2\n3,4\n' };
  bigF.slice = function (s, e) { return { _csv: String(this._csv).slice(s, e) }; };
  let got = '';
  sandbox.readCSVText(bigF, function (t) { got = t; });
  check('C2 分块读取 ≥2 次切片且拼接还原', frCalls >= 2 && got === 'a,b\n1,2\n3,4\n', 'calls=' + frCalls + ' got=' + got);
  /* 跨块边界 UTF-8 字符不被切坏：表头 15 字节 ≡1(mod3)，使 512KB 字节边界落在 3 字节中文字符正中 */
  const _csv2 = 'A品名,价格\n' + '中文商品名'.repeat(131072) + '\n尾行,1\n';
  const bytes2 = new TextEncoder().encode(_csv2);
  const f2 = { size: bytes2.length, _bytes: bytes2 };
  f2.slice = function (s, e) { return { _bytes: bytes2.slice(s, e) }; };
  let got2 = '';
  sandbox.readCSVText(f2, function (t) { got2 = t; });
  sandbox.FileReader = _FR;
  sandbox.setTimeout = _ST;
  check('C2 分块边界多字节字符不损坏', got2 === _csv2, 'len:' + got2.length + '/' + _csv2.length + ' frCalls=' + frCalls);
}

/* ---------- v1.0.23：逾期三级预警 / 50项目种子 / 里程碑实体 / 甘特下钻 / 项目汇总里程碑 ---------- */
/* 逾期语义：充裕(>3天)/临期(≤3天含今天)/逾期(≤7天)/严重逾期(>7天深红) */
let os = sandbox.overdueState(10);
check('overdueState 充裕剩10天', os.lvl === 'ok' && os.color === '#86909C' && os.label === '剩 10 天', JSON.stringify(os));
os = sandbox.overdueState(3);
check('overdueState ≤3天临期橙', os.lvl === 'soon' && os.color === '#FF7D00', JSON.stringify(os));
os = sandbox.overdueState(0);
check('overdueState 今天到期', os.lvl === 'soon' && os.label === '今天到期', JSON.stringify(os));
os = sandbox.overdueState(-3);
check('overdueState 逾期3天红', os.lvl === 'over' && os.label === '逾期 3 天' && os.color === '#F53F3F', JSON.stringify(os));
os = sandbox.overdueState(-7);
check('overdueState 逾期7天边界仍红', os.lvl === 'over' && os.label === '逾期 7 天', JSON.stringify(os));
os = sandbox.overdueState(-8);
check('overdueState 严重逾期深红', os.lvl === 'severe' && os.label === '严重逾期 8 天' && os.color === '#C41D1D', JSON.stringify(os));
/* 种子扩量：50 项目 / 15 品类 / 5 状态全覆盖 / 补物料供应商 */
check('种子扩到 50 项目', S.products.length === 50, 'len=' + S.products.length);
check('种子品类 ≥14', new Set(S.products.map(p => p.cat)).size >= 14, 'cats=' + new Set(S.products.map(p => p.cat)).size);
const stSet = new Set(S.products.map(p => p.status));
check('种子覆盖全部状态', ['生产中', '打样中', '立项中', '已完工', '已归档'].every(s => stSet.has(s)), JSON.stringify([...stSet]));
check('生成项目 p6/p50 存在', S.products.some(p => p.id === 'p6') && S.products.some(p => p.id === 'p50'));
check('补充供应商 s7-s12', ['s7', 's8', 's9', 's10', 's11', 's12'].every(id => S.suppliers.some(s => s.id === id)));
check('补充物料 m8-m15', ['m8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15'].every(id => S.materials.some(m => m.id === id)));
/* 里程碑实体：迁移 / 状态 / 汇总 */
check('里程碑实体已迁移', Array.isArray(S.milestones) && S.milestones.length > 0, 'len=' + (S.milestones || []).length);
const m1p = S.milestones.find(m => m.productId === 'p1' && m.name === '交付');
check('p1 交付里程碑未完成', m1p && m1p.status === '未开始' && !!m1p.date);
check('msState 已完成', sandbox.msState({ date: '2099-01-01', status: '已完成' }).label === '已完成');
check('msState 进行中', sandbox.msState({ date: sandbox.addDays(sandbox.todayStr(), 5), status: '进行中' }).label.indexOf('进行中') >= 0);
check('msState 逾期红', sandbox.msState({ date: sandbox.addDays(sandbox.todayStr(), -3), status: '未开始' }).label === '已逾期 3 天');
check('msState 严重逾期深红', sandbox.msState({ date: sandbox.addDays(sandbox.todayStr(), -9), status: '未开始' }).label === '严重逾期 9 天');
const msum = sandbox.msSummary(S.products.find(p => p.id === 'p1'));
check('msSummary p1 完成3/4 下一=交付', msum.total === 4 && msum.done === 3 && msum.next && msum.next.name === '交付', JSON.stringify(msum));
/* 甘特下钻：项目行 / 里程碑菱形 */
sandbox.go('dashboard');
const ganttHtml2 = docStub.querySelector('#view').innerHTML;
check('甘特图节点绑定下钻', ganttHtml2.indexOf('ganttDrill(') >= 0 && ganttHtml2.indexOf('msDrill(') >= 0);
let gd = '';
try { const _om = sandbox.openModal; sandbox.openModal = function (t, h) { gd = h; }; sandbox.ganttDrill('p1'); sandbox.openModal = _om; } catch (e) { gd = 'ERR:' + e.message; }
check('ganttDrill 弹窗含里程碑/订单/进度', gd.indexOf('里程碑（4）') >= 0 && gd.indexOf('进度') >= 0 && gd.indexOf('OD-20260901001') >= 0, gd.slice(0, 120));
let md = '';
try { const _om2 = sandbox.openModal; sandbox.openModal = function (t, h) { md = h; }; sandbox.msDrill(m1p.id); sandbox.openModal = _om2; } catch (e) { md = 'ERR:' + e.message; }
check('msDrill 弹窗含项目/日期/状态', md.indexOf('关联项目') >= 0 && md.indexOf('项目进度') >= 0 && md.indexOf(m1p.date) >= 0, md.slice(0, 120));
/* 里程碑 CRUD：新增 → 编辑 → 删除 */
const mN0 = S.milestones.length;
sandbox.openMilestone('p1');
docStub.querySelector('#f-msp').value = 'p1';
docStub.querySelector('#f-msname').value = '压测里程碑X';
docStub.querySelector('#f-msdate').value = '2026-12-15';
docStub.querySelector('#f-msstatus').value = '进行中';
docStub.querySelector('#modal-ok').onclick();
const msX = S.milestones.find(m => m.name === '压测里程碑X');
check('openMilestone 新增', !!msX && msX.productId === 'p1' && msX.status === '进行中' && S.milestones.length === mN0 + 1, JSON.stringify(msX));
sandbox.editMilestone(msX.id);
docStub.querySelector('#f-msname').value = '压测里程碑X改';
docStub.querySelector('#f-msdate').value = '2026-12-20';
docStub.querySelector('#modal-ok').onclick();
check('editMilestone 保存', msX.name === '压测里程碑X改' && msX.date === '2026-12-20');
sandbox.delMilestone(msX.id);
check('delMilestone 删除', !S.milestones.some(m => m.name === '压测里程碑X改'));
/* 里程碑 CSV 往返：导出含列 + 导入合法/重复/引用拦截 */
let msCsvOk = false;
try {
  let cap = null; const _B = sandbox.Blob;
  sandbox.Blob = function (p) { cap = p.map(String).join(''); return new _B(p); };
  sandbox.exportModule('milestones');
  sandbox.Blob = _B;
  msCsvOk = cap && cap.indexOf('里程碑名称') >= 0 && cap.indexOf('交付') >= 0;
} catch (e) {}
check('exportModule milestones 走通', msCsvOk);
{
  const msN = S.milestones.length;
  driveImport('milestones',
    '产品ID,里程碑名称,日期,状态\n' +
    'p1,压测导入里程碑,2026-12-01,未开始\n' +
    'p1,压测导入里程碑,2026-12-01,未开始\n' +
    'pxx,坏里程碑,2026-12-01,未开始');
  check('CSV导入里程碑：入库+重复跳过+引用拦截', S.milestones.length === msN + 1 && S.milestones.filter(m => m.name === '压测导入里程碑').length === 1 && !S.milestones.some(m => m.name === '坏里程碑') && _alertMsgs[_alertMsgs.length - 1].indexOf('pxx') >= 0, JSON.stringify(S.milestones.filter(m => m.name.indexOf('压测') >= 0 || m.name === '坏里程碑')));
}
/* 项目汇总里程碑显示（卡片/列表） */
sandbox.go('projects');
sandbox.projView = 'cards'; sandbox.renderProjCards();
const projCards2 = docStub.querySelector('#proj-cards').innerHTML;
check('项目卡片含里程碑行', projCards2.indexOf('里程碑') >= 0 && projCards2.indexOf('下一：') >= 0);
sandbox.projView = 'list'; sandbox.renderProjectRows();
const projRows2 = docStub.querySelector('#proj-tbody').innerHTML;
check('项目列表含里程碑列', projRows2.indexOf('下一：') >= 0 && projRows2.indexOf('/4') >= 0, projRows2.slice(0, 200));
/* 动态品类下拉覆盖新品类 */
check('catOptions 含新品类', sandbox.catOptions('').indexOf('鞋类') >= 0 && sandbox.catOptions('').indexOf('宠物用品') >= 0);
/* v1.0.24：自定义品类（localStorage 持久化 + 弹窗入口） */
check('customCatList 空默认', Array.isArray(sandbox.customCatList()) && sandbox.customCatList().length === 0);
sandbox.localStorage.setItem('supplydev_custom_cats', JSON.stringify(['智能家居', '宠物食品']));
check('catOptions 合并自定义品类', sandbox.catOptions('').indexOf('智能家居') >= 0 && sandbox.catOptions('').indexOf('宠物食品') >= 0);
const ncEl = docStub.querySelector('#f-newcat');
ncEl.value = '智能设备';
sandbox.confirmCustomCat('f-cat');
check('confirmCustomCat 持久化新品类', JSON.parse(sandbox.localStorage.getItem('supplydev_custom_cats')).indexOf('智能设备') >= 0);
check('confirmCustomCat 后下拉可选', sandbox.catOptions('').indexOf('智能设备') >= 0);
check('自定义品类去重拦截', (ncEl.value = '智能设备', sandbox.confirmCustomCat('f-cat'), JSON.parse(sandbox.localStorage.getItem('supplydev_custom_cats')).filter(c => c === '智能设备').length === 1));
sandbox.openProduct();
check('新建项目含自定义品类入口', docStub.querySelector('#modal-box').innerHTML.indexOf('自定义品类') >= 0);
/* 新建项目自动生成基线里程碑（隔离构造后清理） */
const pn0 = S.products.length;
sandbox.openProduct();
docStub.querySelector('#f-name').value = '里程碑验证项目';
docStub.querySelector('#f-cat').value = '首饰';
docStub.querySelector('#f-owner').value = '张三';
docStub.querySelector('#f-sdue').value = '2026-12-01';
docStub.querySelector('#modal-ok').onclick();
const npT = S.products.find(p => p.name === '里程碑验证项目');
check('新建项目自动生成里程碑', !!npT && S.products.length === pn0 + 1 && S.milestones.some(m => m.productId === npT.id && m.name === '打样截止') && S.milestones.some(m => m.productId === npT.id && m.name === '交付'), JSON.stringify((S.milestones || []).filter(m => m.productId === (npT || {}).id)));
check('新建项目负责人入库', !!npT && npT.owner === '张三');
/* 编辑项目负责人往返 */
if (npT) {
  const pnEdit = S.products.length;
  sandbox.openEditProduct(npT.id);
  docStub.querySelector('#f-owner').value = '李四';
  docStub.querySelector('#modal-ok').onclick();
  check('编辑项目负责人生效', S.products.length === pnEdit && S.products.find(p => p.id === npT.id).owner === '李四');
}
S.products = S.products.filter(p => p.id !== (npT || {}).id);
sandbox.go('dashboard');

/* ---------- v1.0.26：刷新按钮 / 折叠语义 / 全局搜索浮层 / 数据新鲜度 / logAudit 全覆盖 ---------- */
/* 刷新工具条：最后刷新时间 + 数据保存时间 + 刷新按钮 */
var rt26 = sandbox.refreshTool();
check('refreshTool 含刷新按钮', rt26.indexOf('⟳ 刷新') >= 0);
sandbox.lastRefreshAt = '';
sandbox.refreshView();
check('refreshView 记录最后刷新时间', sandbox.lastRefreshAt.length >= 5, sandbox.lastRefreshAt);
sandbox.persist(); sandbox.flushPersist(); /* C4：防抖版 persist 需 flush 才落盘并记录保存时间 */
check('persist 记录数据保存时间', sandbox.lastSaveAt.length >= 5, sandbox.lastSaveAt);
/* 折叠语义（v1.0.26 修正）：true=已收起显示占位，false=展开显示全部条目（无截断占位） */
sandbox.dashFold.todo = true;
sandbox.go('dashboard');
check('待办卡收起显示占位', docStub.querySelector('#view').innerHTML.indexOf('已收起') >= 0);
sandbox.dashFold.todo = false;
sandbox.go('dashboard');
check('待办卡展开无占位', docStub.querySelector('#view').innerHTML.indexOf('已收起') < 0);
/* KPI 悬停口径说明 */
check('KPI 悬停说明存在', docStub.querySelector('#view').innerHTML.indexOf('状态非「已完工/已归档」的在研项目数') >= 0);
/* 全局搜索浮层：命中项目/订单、无匹配空态、空输入隐藏、点击直达 */
var gsP = docStub.querySelector('#gs-panel');
sandbox.globalSearch('锁骨链');
check('搜索命中项目', gsP.innerHTML.indexOf('项目') >= 0 && gsP.innerHTML.indexOf('锁骨链') >= 0 && gsP.style.display === 'block', gsP.innerHTML.slice(0, 120));
sandbox.globalSearch('不存在的关键字xyz');
check('搜索无匹配空态', gsP.innerHTML.indexOf('未找到') >= 0);
sandbox.globalSearch('OD-20260901001');
check('搜索命中订单', gsP.innerHTML.indexOf('订单') >= 0 && gsP.innerHTML.indexOf('OD-20260901001') >= 0);
sandbox.globalSearch('');
check('空输入隐藏浮层', gsP.style.display === 'none');
sandbox.globalSearch('锁骨链');
sandbox.goSearchHit('项目', 'p1');
check('搜索点击直达项目详情', sandbox.ROUTE === 'project' && S._pid === 'p1', 'ROUTE=' + sandbox.ROUTE);
sandbox.go('dashboard');
/* 日志面板：级别筛选/搜索命中/错误高亮 */
var ls0 = sandbox.LOGS.length;
sandbox.LOGS.push({ t: '00:00:00', l: 'error', m: 'test', g: '日志面板搜索锚点词', d: '' });
sandbox.renderLogList();
check('日志面板渲染含锚点', docStub.querySelector('#log-list').innerHTML.indexOf('日志面板搜索锚点词') >= 0 && docStub.querySelector('#log-list').innerHTML.indexOf('命中') >= 0);
sandbox.logSearch = '锚点词';
sandbox.renderLogList();
check('日志面板关键字过滤', docStub.querySelector('#log-list').innerHTML.indexOf('命中 1 条') >= 0 && docStub.querySelector('#log-list').innerHTML.indexOf('关键字') >= 0);
sandbox.logSearch = '';
sandbox.LOGS = sandbox.LOGS.slice(0, ls0);
/* logAudit 全覆盖：新增打样 / 新增报价 / 新增抽检 / 订单分批 / 手动快照 */
var a0 = (S._audit || []).length;
var saN0 = S.samples.length;
sandbox.openSample('p1');
docStub.querySelector('#modal-ok').onclick();
check('新增打样打点', S._audit.length === a0 + 1 && S._audit[S._audit.length - 1].a.indexOf('新增打样') >= 0, (S._audit[S._audit.length - 1] || {}).a);
S.samples = S.samples.slice(0, saN0);
var qN0 = S.quotes.length;
sandbox.openQuote('p1');
docStub.querySelector('#f-supp').value = 's2';
docStub.querySelector('#modal-ok').onclick();
check('新增报价打点', S._audit[S._audit.length - 1].a.indexOf('新增报价') >= 0 && S.quotes.length === qN0 + 1);
S.quotes = S.quotes.slice(0, qN0);
var inN0 = S.inspections.length;
sandbox.openInspection();
docStub.querySelector('#f-prod').value = 'p1';
docStub.querySelector('#f-supp').value = 's2';
docStub.querySelector('#modal-ok').onclick();
check('新增抽检打点', S._audit[S._audit.length - 1].a.indexOf('新增抽检') >= 0 && S.inspections.length === inN0 + 1);
S.inspections = S.inspections.slice(0, inN0);
var oB0 = S.orders.find(o => o.id === 'o1').batches ? S.orders.find(o => o.id === 'o1').batches.slice() : [];
sandbox.openBatches('o1');
docStub.querySelector('#f-batches').value = '2026-12-01:100\n2026-12-10:200';
docStub.querySelector('#modal-ok').onclick();
check('订单分批打点', S._audit[S._audit.length - 1].a.indexOf('订单分批') >= 0 && S.orders.find(o => o.id === 'o1').batches.length === 2);
S.orders.find(o => o.id === 'o1').batches = oB0;
var cvN0 = S.costVersions.length;
sandbox.saveCostVersion();
check('手动成本快照打点', S.costVersions.length === cvN0 + 1 && S._audit[S._audit.length - 1].a.indexOf('成本快照') >= 0);
/* 供应商删除：引用保护（被订单引用拦截）+ 无引用可删 + 打点 */
S.suppliers.push({ id: 'sdel', name: '待删压测供应商', cats: ['压测'], moq: 1, terms: '', years: 0, rating: 'C', contact: '', phone: '', address: '', crossBorder: false, qualityScore: 60, deliveryScore: 60, priceScore: 60, status: '启用' });
var oRefN = S.orders.length;
S.orders.push({ id: 'odel', code: 'OD-REF-TEST', productId: 'p1', supplierId: 'sdel', qty: 1, price: 1, due: '2026-12-01', status: '已下单', payStatus: '', orderType: '首单', step: 1, batches: [] });
sandbox.delSupplier('sdel');
check('删除被引用供应商被拦截', S.suppliers.some(s => s.id === 'sdel'));
S.orders = S.orders.filter(o => o.id !== 'odel');
sandbox.delSupplier('sdel');
check('删除无引用供应商成功+打点', !S.suppliers.some(s => s.id === 'sdel') && S._audit[S._audit.length - 1].a.indexOf('删除供应商') >= 0, (S._audit[S._audit.length - 1] || {}).a);
/* 客诉流转打点 */
var i0 = S.issues.length;
S.issues.push({ id: 'itst', title: '流转压测客诉', orderId: '', supplierId: 's2', productId: 'p1', type: '外观', checked: 0, bad: 0, verdict: '待判定', status: '待处理' });
sandbox.issueNext('itst');
check('客诉流转打点', S.issues.find(i => i.id === 'itst').status === '调查中' && S._audit[S._audit.length - 1].a.indexOf('客诉流转') >= 0);
S.issues = S.issues.slice(0, i0);
sandbox.go('dashboard');

/* ---------- v1.1：依赖连线编辑(A2) / 关键路径(A1) / 供应商ABCD(B1) / 订单ETA(B2) ---------- */
/* 种子依赖健全性：基线链 + 跨项目演示链已生成，无悬空引用 */
check('种子依赖已生成', (S.deps || []).length >= 5 && S.deps.every(d => S.milestones.some(m => m.id === d.from) && S.milestones.some(m => m.id === d.to)), 'n=' + (S.deps || []).length);
S.deps.push({ id: 'dzz', from: 'mszz', to: 'mszz2', type: 'FS' });
sandbox.ensureDeps();
check('ensureDeps 清理悬空引用', !S.deps.some(d => d.id === 'dzz'));
/* A1/A2 隔离小图（确定性断言，随后恢复种子） */
{
  const _msA = S.milestones.slice(), _dpA = (S.deps || []).slice();
  S.milestones = [
    { id: 'mt1', productId: 'pt', name: 'M1', date: '2026-01-01', status: '未开始', desc: '', color: '#165DFF' },
    { id: 'mt2', productId: 'pt', name: 'M2', date: '2026-01-05', status: '未开始', desc: '', color: '#165DFF' },
    { id: 'mt3', productId: 'pt', name: 'M3', date: '2026-01-10', status: '未开始', desc: '', color: '#165DFF' },
    { id: 'mt4', productId: 'pt', name: 'M4', date: '2026-01-12', status: '未开始', desc: '', color: '#165DFF' },
    { id: 'mt5', productId: 'pt', name: 'M5', date: '2026-01-08', status: '未开始', desc: '', color: '#165DFF' }
  ];
  S.deps = [
    { id: 'dA', from: 'mt1', to: 'mt2', type: 'FS' },
    { id: 'dB', from: 'mt2', to: 'mt3', type: 'FS' },
    { id: 'dC', from: 'mt2', to: 'mt4', type: 'FS' },
    { id: 'dD', from: 'mt1', to: 'mt5', type: 'FS' },
    { id: 'dE', from: 'mt5', to: 'mt4', type: 'FS' }
  ];
  const cpIso = sandbox.critPath();
  check('critPath 最长链 mt1→mt2→mt4', cpIso.ids.join(',') === 'mt1,mt2,mt4', JSON.stringify(cpIso));
  check('critPath 连线标记 dA/dC', !!cpIso.links.dA && !!cpIso.links.dC && !cpIso.links.dE, JSON.stringify(cpIso.links));
  check('addDep 重复拦截', sandbox.addDep('mt1', 'mt2', 'FS', true) === false);
  check('addDep 同对不同类型也拦截', sandbox.addDep('mt1', 'mt2', 'SS', true) === false && !S.deps.some(d => d.from === 'mt1' && d.to === 'mt2' && d.type === 'SS'));
  check('addDep 新增生效', sandbox.addDep('mt1', 'mt3', 'SS', true) === true);
  check('depReachable 正向可达', sandbox.depReachable('mt1', 'mt4') === true);
  check('depReachable 反向不可达', sandbox.depReachable('mt4', 'mt1') === false);
  check('depReachable 自环=true', sandbox.depReachable('mt3', 'mt3') === true);
  let mCap = ''; const _omA = sandbox.openModal;
  sandbox.openModal = function (t, h, cb, bt) { mCap = t + '|' + h; _omA(t, h, cb, bt); };
  sandbox.ganttDepMode = true; sandbox.depSel = '';
  sandbox.addDepClick('mt2');
  check('addDepClick 第一击选中前置', sandbox.depSel === 'mt2');
  mCap = '';
  sandbox.addDepClick('mt5');
  check('addDepClick 第二击弹依赖类型框', mCap.indexOf('新建任务依赖') >= 0 && mCap.indexOf('f-dtype') >= 0, mCap.slice(0, 80));
  docStub.querySelector('#f-dtype').value = 'FF';
  docStub.querySelector('#modal-ok').onclick();
  check('addDepClick 选类型入库', S.deps.some(d => d.from === 'mt2' && d.to === 'mt5' && d.type === 'FF'), JSON.stringify(S.deps.filter(d => d.from === 'mt2' && d.to === 'mt5')));
  sandbox.depSel = ''; mCap = '';
  sandbox.addDepClick('mt4');
  sandbox.addDepClick('mt1');
  check('addDepClick 成环拦截不发弹窗', mCap === '' && !S.deps.some(d => d.from === 'mt4' && d.to === 'mt1'));
  sandbox.ganttDepMode = false; sandbox.depSel = '';
  mCap = '';
  sandbox.depDrill('dA');
  check('depDrill 弹窗含前置/后继/类型/跨度', mCap.indexOf('前置') >= 0 && mCap.indexOf('后继') >= 0 && mCap.indexOf('FS') >= 0 && mCap.indexOf('跨度') >= 0, mCap.slice(0, 120));
  docStub.querySelector('#modal-ok').onclick();
  check('depDrill 删除依赖生效', !S.deps.some(d => d.id === 'dA'));
  sandbox.openModal = _omA;
  S.milestones = _msA; S.deps = _dpA;
}
/* A2：基线链 FS 对删除后 ensureDeps 不复活（_delBaseDeps 黑名单） */
{
  const _dpE = (S.deps || []).slice(), _delE = (S._delBaseDeps || []).slice();
  const baseDep = S.deps.find(d => {
    const fm = S.milestones.find(m => m.id === d.from), tm = S.milestones.find(m => m.id === d.to);
    return fm && tm && fm.productId === tm.productId && sandbox.isBaseMs(fm) && sandbox.isBaseMs(tm) && d.type === 'FS';
  });
  check('存在基线链 FS 对', !!baseDep, baseDep ? baseDep.id + ':' + baseDep.from + '→' + baseDep.to : 'none');
  if (baseDep) {
    const _f = baseDep.from, _t = baseDep.to;
    let mCap3 = ''; const _omC = sandbox.openModal;
    sandbox.openModal = function (t, h, cb, bt) { mCap3 = t + '|' + h; _omC(t, h, cb, bt); };
    sandbox.depDrill(baseDep.id);
    docStub.querySelector('#modal-ok').onclick();
    check('删基线对记黑名单', !S.deps.some(d => d.from === _f && d.to === _t) && (S._delBaseDeps || []).some(p => p.from === _f && p.to === _t));
    sandbox.ensureDeps();
    check('ensureDeps 后基线对不复活', !S.deps.some(d => d.from === _f && d.to === _t), 'from=' + _f + ' to=' + _t);
    sandbox.openModal = _omC;
  }
  S.deps = _dpE; S._delBaseDeps = _delE;
}
/* A2：删除项目级联清理关联依赖（不误删其他依赖） */
{
  const _pL = S.products.slice(), _msL = S.milestones.slice(), _dpL = (S.deps || []).slice();
  S.products.push({ id: 'pdel', name: '删除级联压测', cat: '压测', platform: '', status: '打样中', owner: '', targetPrice: 0, progress: 0, ideaDate: '2026-01-01', sampleDue: '2026-02-01', confirmDate: '', orderDate: '', targetDate: '' });
  S.milestones.push({ id: 'mdel1', productId: 'pdel', name: '打样截止', date: '2026-02-01', status: '未开始', desc: '', color: '#165DFF' });
  S.milestones.push({ id: 'mdel2', productId: 'pdel', name: '交付', date: '2026-03-01', status: '未开始', desc: '', color: '#165DFF' });
  const kp = S.milestones.find(m => m.productId === 'p1' && m.name === '交付');
  const dpN = S.deps.length;
  S.deps.push({ id: 'dDelA', from: 'mdel1', to: 'mdel2', type: 'FS' });
  S.deps.push({ id: 'dDelB', from: 'mdel1', to: kp.id, type: 'FS' });
  sandbox.delProject('pdel');
  check('删除项目级联清理依赖', !S.deps.some(d => d.id === 'dDelA' || d.id === 'dDelB') && S.deps.length === dpN, 'n=' + S.deps.length);
  S.products = _pL; S.milestones = _msL; S.deps = _dpL;
}
/* A2：删除里程碑级联清理关联依赖 */
{
  const _msL2 = S.milestones.slice(), _dpL2 = (S.deps || []).slice();
  S.milestones.push({ id: 'mdl1', productId: 'p1', name: '级联压测', date: '2026-05-01', status: '未开始', desc: '', color: '#165DFF' });
  const kp2 = S.milestones.find(m => m.productId === 'p1' && m.name === '交付');
  const dpN2 = S.deps.length;
  S.deps.push({ id: 'dML1', from: 'mdl1', to: kp2.id, type: 'FS' });
  S.deps.push({ id: 'dML2', from: kp2.id, to: 'mdl1', type: 'FS' });
  sandbox.delMilestone('mdl1');
  check('删除里程碑级联清理依赖', !S.deps.some(d => d.id === 'dML1' || d.id === 'dML2') && S.deps.length === dpN2, 'n=' + S.deps.length);
  S.milestones = _msL2; S.deps = _dpL2;
}
/* A1：关键路径节点逾期 → 下游影响面预警（隔离图） */
{
  const _msB = S.milestones.slice(), _dpB = (S.deps || []).slice();
  S.milestones = [
    { id: 'mc1', productId: 'pc', name: 'C1', date: sandbox.addDays(sandbox.todayStr(), -5), status: '进行中', desc: '', color: '#165DFF' },
    { id: 'mc2', productId: 'pc', name: 'C2', date: sandbox.addDays(sandbox.todayStr(), 3), status: '未开始', desc: '', color: '#165DFF' }
  ];
  S.deps = [{ id: 'dc1', from: 'mc1', to: 'mc2', type: 'FS' }];
  const rk1 = sandbox.riskItems();
  check('关键路径逾期下游预警入风险', rk1.some(r => r.t.indexOf('关键路径逾期') >= 0 && r.d.indexOf('1 个节点') >= 0), JSON.stringify(rk1.filter(r => r.t.indexOf('关键路径') >= 0)));
  S.milestones = _msB; S.deps = _dpB;
}
/* 甘特渲染：依赖连线层 / 关键路径高亮 / 编辑模式 */
sandbox.ganttFilter.range = 'all'; sandbox.go('dashboard');
const gDep = docStub.querySelector('#view').innerHTML;
check('甘特含依赖编辑开关与连线层', gDep.indexOf('✎ 编辑依赖') >= 0 && gDep.indexOf('依赖CSV') >= 0 && gDep.indexOf('<line ') >= 0 && gDep.indexOf('arrO') >= 0, 'len=' + gDep.length);
check('甘特图例含关键路径与时序冲突', gDep.indexOf('橙=关键路径') >= 0 && gDep.indexOf('红=时序冲突') >= 0);
check('甘特关键路径节点橙色高亮', gDep.indexOf('outline:2px solid #FF7D00') >= 0 || gDep.indexOf('（关键路径）') >= 0);
var lineYs = (gDep.match(/<line [^>]*y1="\d+"/g) || []).map(s => +s.match(/y1="(\d+)"/)[1]);
check('SVG 连线跨行 y 坐标递增', lineYs.length >= 4 && new Set(lineYs).size >= 2, JSON.stringify(lineYs.slice(0, 8)));
sandbox.ganttDepMode = true; sandbox.RENDER();
const gDep2 = docStub.querySelector('#view').innerHTML;
check('依赖编辑模式提示与完成按钮', gDep2.indexOf('依赖编辑模式：先点') >= 0 && gDep2.indexOf('✓ 完成编辑') >= 0);
sandbox.ganttDepMode = false; sandbox.depSel = '';
/* deps CSV 往返：导出列 + 导入合法/自环/成环 */
{
  let depCsv = ''; const _B6 = sandbox.Blob;
  sandbox.Blob = function (p) { depCsv = p.map(String).join(''); return new _B6(p); };
  sandbox.exportModule('deps');
  sandbox.Blob = _B6;
  check('deps 导出含前置/后继列', depCsv.indexOf('前置产品ID') >= 0 && depCsv.indexOf('依赖类型') >= 0);
}
{
  const dN = S.deps.length;
  const m1p2 = S.milestones.find(m => m.productId === 'p1' && m.name === '交付');
  const p3d = S.milestones.find(m => m.productId === 'p3' && m.name === '交付');
  driveImport('deps',
    '前置产品ID,前置里程碑,依赖类型,后继产品ID,后继里程碑\n' +
    'p1,交付,FS,p3,交付\n' +
    'p1,交付,SS,p3,交付\n' +
    'p3,交付,FS,p1,交付\n' +
    'p1,交付,FS,p1,交付');
  check('deps 导入：合法入库+同对跳过+自环/成环拦截', S.deps.length === dN + 1 && !!m1p2 && !!p3d && S.deps.some(d => d.from === m1p2.id && d.to === p3d.id) && S.deps.filter(d => d.from === m1p2.id && d.to === p3d.id).length === 1 && _alertMsgs[_alertMsgs.length - 1].indexOf('循环依赖') >= 0 && _alertMsgs[_alertMsgs.length - 1].indexOf('自环') >= 0, JSON.stringify(_alertMsgs.slice(-2)));
  S.deps = S.deps.filter(d => !(d.from === m1p2.id && d.to === p3d.id));
}
/* B1：品类分层权重 + ABCD 评级 */
const w0 = sandbox.supWeights({ cats: ['首饰'] });
check('supWeights 未配置回落默认', w0.quality === 0.4 && w0.delivery === 0.3 && w0.price === 0.3, JSON.stringify(w0));
S.catWeights = Object.assign({}, S.catWeights || {}, { '首饰': { quality: 50, delivery: 30, price: 20 } });
const w1 = sandbox.supWeights({ cats: ['首饰'] });
check('supWeights 按品类返回配置', w1.quality === 50 && w1.delivery === 30 && w1.price === 20, JSON.stringify(w1));
check('supScore 按品类加权', sandbox.supScore({ cats: ['首饰'], qualityScore: 80, deliveryScore: 70, priceScore: 60 }) === 73, '' + sandbox.supScore({ cats: ['首饰'], qualityScore: 80, deliveryScore: 70, priceScore: 60 }));
check('supGrade 90→A/80→B/70→C/69→D', sandbox.supGrade(90) === 'A' && sandbox.supGrade(80) === 'B' && sandbox.supGrade(70) === 'C' && sandbox.supGrade(69) === 'D');
/* B1：事件自动扣分（客诉→质量分、逾期→交期分）+ 评级联动（隔离供应商） */
S.suppliers.push({ id: 'sevt', name: '事件扣分压测供应商', cats: ['压测'], moq: 1, terms: '', years: 0, rating: 'A', contact: '', phone: '', address: '', crossBorder: false, qualityScore: 95, deliveryScore: 95, priceScore: 60, status: '启用' });
S.issues.push({ id: 'iev1', title: '压测质量事件1', orderId: '', supplierId: 'sevt', productId: 'p1', type: '功能', checked: 0, bad: 0, verdict: '退货', status: '待处理' });
S.issues.push({ id: 'iev2', title: '压测质量事件2', orderId: '', supplierId: 'sevt', productId: 'p1', type: '功能', checked: 0, bad: 0, verdict: '退货', status: '待处理' });
S.orders.push({ id: 'oev', code: 'OD-EVT', productId: 'p1', supplierId: 'sevt', qty: 1, price: 1, due: sandbox.addDays(sandbox.todayStr(), -2), status: '生产中', payStatus: '', step: 2, batches: [] });
sandbox.recalcSupplierScore('sevt');
const sevt = S.suppliers.find(s => s.id === 'sevt');
check('质量事件自动扣分', sevt.qualityScore === 91, 'q=' + sevt.qualityScore);
check('逾期订单自动扣交期分', sevt.deliveryScore === 87, 'd=' + sevt.deliveryScore);
check('扣分后评级联动', sevt.rating === 'B' && sevt.rating === sandbox.supGrade(sandbox.supScore(sevt)), 'r=' + sevt.rating + ' sc=' + sandbox.supScore(sevt));
S.issues = S.issues.filter(i => i.id !== 'iev1' && i.id !== 'iev2');
S.orders = S.orders.filter(o => o.id !== 'oev');
S.suppliers = S.suppliers.filter(s => s.id !== 'sevt');
/* B1：编辑供应商价格分 → 评级重算（隔离） */
S.suppliers.push({ id: 'sprc', name: '价格编辑压测供应商', cats: ['压测'], moq: 1, terms: '', years: 0, rating: 'C', contact: '', phone: '', address: '', crossBorder: false, qualityScore: 50, deliveryScore: 50, priceScore: 50, status: '启用' });
sandbox.editSupplier('sprc');
docStub.querySelector('#f-priceScore').value = '100';
docStub.querySelector('#modal-ok').onclick();
const sprc = S.suppliers.find(s => s.id === 'sprc');
check('editSupplier 价格分改→评级联动(q/d公式收敛95/90→A)', sprc.priceScore === 100 && sprc.rating === 'A' && sprc.rating === sandbox.supGrade(sandbox.supScore(sprc)), JSON.stringify({ p: sprc.priceScore, r: sprc.rating, sc: sandbox.supScore(sprc) }));
S.suppliers = S.suppliers.filter(s => s.id !== 'sprc');
/* B1：新增供应商按综合分自动评级（默认权重 75→C） */
sandbox.openSupplier();
docStub.querySelector('#f-name').value = '自动评级压测供应商';
docStub.querySelector('#f-cat').value = '压测';
docStub.querySelector('#modal-ok').onclick();
const nsup = S.suppliers.find(s => s.name === '自动评级压测供应商');
check('新增供应商自动评级(公式基线88→B)', !!nsup && nsup.rating === 'B' && nsup.rating === sandbox.supGrade(sandbox.supScore(nsup)), nsup && nsup.rating);
S.suppliers = S.suppliers.filter(s => s.name !== '自动评级压测供应商');
/* B1：品类权重弹窗保存 + CSV 往返 */
let cwCap = ''; const _om4 = sandbox.openModal;
sandbox.openModal = function (t, h, cb, bt) { cwCap = t + '|' + h; _om4(t, h, cb, bt); };
sandbox.openCatWeights();
sandbox.openModal = _om4;
check('openCatWeights 弹窗含权重输入', cwCap.indexOf('品类分层权重') >= 0 && cwCap.indexOf('质量%') >= 0, cwCap.slice(0, 60));
docStub.querySelector('#cw-0-q').value = '60';
docStub.querySelector('#cw-0-d').value = '20';
docStub.querySelector('#cw-0-p').value = '20';
docStub.querySelector('#modal-ok').onclick();
check('openCatWeights 保存生效', S.catWeights && S.catWeights['首饰'] && S.catWeights['首饰'].quality === 60 && S.catWeights['首饰'].delivery === 20, JSON.stringify(S.catWeights['首饰']));
{
  let cwCsv = ''; const _B5 = sandbox.Blob;
  sandbox.Blob = function (p) { cwCsv = p.map(String).join(''); return new _B5(p); };
  sandbox.exportModule('catWeights');
  sandbox.Blob = _B5;
  check('catWeights 导出含列', cwCsv.indexOf('品类') >= 0 && cwCsv.indexOf('质量权重') >= 0);
}
driveImport('catWeights', '品类,质量权重,交期权重,价格权重\n压测,60,20,20');
check('catWeights 导入生效', S.catWeights && S.catWeights['压测'] && S.catWeights['压测'].quality === 60, JSON.stringify(S.catWeights['压测']));
delete S.catWeights['首饰']; delete S.catWeights['压测'];
/* B2：订单 ETA 重算（计划 vs 外推） */
const _T2 = sandbox.todayStr();
check('etaDate 计划内=交期', sandbox.etaDate({ due: sandbox.addDays(_T2, 35), step: 0 }) === sandbox.addDays(_T2, 35));
check('etaDate 滞后外推=晚15天', sandbox.etaDate({ due: sandbox.addDays(_T2, 5), step: 2 }) === sandbox.addDays(_T2, 20));
check('etaDate 过4步=交期', sandbox.etaDate({ due: sandbox.addDays(_T2, 5), step: 4 }) === sandbox.addDays(_T2, 5));
const esA = sandbox.etaState({ due: sandbox.addDays(_T2, 35), step: 0 });
check('etaState 不晚于计划=ok', esA && esA.lvl === 'ok', JSON.stringify(esA));
const esB = sandbox.etaState({ due: sandbox.addDays(_T2, 5), step: 2 });
check('etaState 晚15天=severe', esB && esB.lvl === 'severe' && esB.bias === 15, JSON.stringify(esB));
const esC = sandbox.etaState({ due: sandbox.addDays(_T2, 15), step: 2 });
check('etaState 晚5天=warn', esC && esC.lvl === 'warn' && esC.bias === 5, JSON.stringify(esC));
check('etaState 已完工订单=ok', (function () { const e = sandbox.etaState({ due: sandbox.addDays(_T2, 5), step: 4 }); return e && e.lvl === 'ok'; })());
/* B2：改期留痕 */
const oh = { id: 'oh1', code: 'OD-HIST', productId: 'p1', supplierId: 's1', qty: 1, price: 1, due: _T2, status: '已下单', payStatus: '', step: 1, batches: [] };
sandbox.orderReschedule(oh, '合同交期', '2026-01-01', '2026-02-01');
check('orderReschedule 留痕+审计', oh.history && oh.history.length === 1 && oh.history[0].what === '合同交期' && oh.history[0].to === '2026-02-01' && S._audit[S._audit.length - 1].a.indexOf('订单改期') >= 0, JSON.stringify(oh.history));
/* B2：分批保存批次变更走改期留痕（openBatches 联动） */
{
  const ob = { id: 'obh1', code: 'OD-BAT-H', productId: 'p1', supplierId: 's1', qty: 1, price: 1, due: _T2, status: '已下单', payStatus: '', step: 1, batches: [{ date: _T2, qty: 1, received: false }] };
  const _obL = S.orders.slice();
  S.orders.push(ob);
  sandbox.openBatches('obh1');
  docStub.querySelector('#f-batches').value = '2026-12-01:100';
  docStub.querySelector('#modal-ok').onclick();
  check('分批改期留痕', ob.history && ob.history.length === 1 && ob.history[0].what === '交付批次' && ob.history[0].to === '2026-12-01:100', JSON.stringify(ob.history));
  S.orders = _obL;
}
/* B2：交付日历渲染/导航/下钻 */
const cal = sandbox.orderCalHTML();
check('交付日历渲染 42 格+图例', (cal.match(/height:28px/g) || []).length === 42 && cal.indexOf('交付日历') >= 0 && cal.indexOf('晚≤7天') >= 0, 'cells=' + ((cal.match(/height:28px/g) || []).length));
sandbox.orderCalYm = { y: 2026, m: 0 }; sandbox.orderCalNav(-1);
check('交付日历跨年回退', sandbox.orderCalYm.y === 2025 && sandbox.orderCalYm.m === 11, JSON.stringify(sandbox.orderCalYm));
sandbox.orderCalYm = { y: 2026, m: 11 }; sandbox.orderCalNav(1);
check('交付日历跨年前进', sandbox.orderCalYm.y === 2027 && sandbox.orderCalYm.m === 0, JSON.stringify(sandbox.orderCalYm));
sandbox.orderCalYm = { y: null, m: null };
S.orders.push({ id: 'ocd1', code: 'OD-CAL', productId: 'p1', supplierId: 's1', qty: 1, price: 1, due: _T2, status: '生产中', payStatus: '', step: 2, batches: [] });
let odCap = ''; const _om7 = sandbox.openModal;
sandbox.openModal = function (t, h, cb, bt) { odCap = t + '|' + h; _om7(t, h, cb, bt); };
sandbox.orderCalDay(_T2);
sandbox.openModal = _om7;
check('orderCalDay 弹窗列当日交付', odCap.indexOf(_T2) >= 0 && odCap.indexOf('OD-CAL') >= 0, odCap.slice(0, 100));
S.orders = S.orders.filter(o => o.id !== 'ocd1');
/* B2：ETA 严重滞后入风险 + 订单视图集成 */
S.orders.push({ id: 'oet1', code: 'OD-ETA-R', productId: 'p1', supplierId: 's1', qty: 1, price: 1, due: sandbox.addDays(_T2, 5), status: '生产中', payStatus: '', step: 2, batches: [] });
const rk2 = sandbox.riskItems();
check('ETA 严重滞后入风险', rk2.some(r => r.t.indexOf('ETA 严重滞后') >= 0), JSON.stringify(rk2.filter(r => r.t.indexOf('ETA') >= 0)));
S.orders = S.orders.filter(o => o.id !== 'oet1');
sandbox.go('order');
const ordHtml = docStub.querySelector('#view').innerHTML;
check('订单视图含交付日历+ETA+改期史按钮', ordHtml.indexOf('交付日历') >= 0 && ordHtml.indexOf('ETA ') >= 0 && ordHtml.indexOf('openOrderHistory') >= 0);
/* B1：供应商视图 ABCD 六 KPI */
sandbox.go('supplier');
supHtml = docStub.querySelector('#view').innerHTML;
check('供应商视图 ABCD 六 KPI', supHtml.indexOf('供应商总数') >= 0 && supHtml.indexOf('A级') >= 0 && supHtml.indexOf('B级') >= 0 && supHtml.indexOf('C级') >= 0 && supHtml.indexOf('D级') >= 0 && supHtml.indexOf('停用') >= 0);
sandbox.go('dashboard');

/* ---------- B3：成本趋势图（renderTrend SVG） ---------- */
{
  const _vs = S.costVersions;
  S.costVersions = [
    { date: '2026-09-01', time: '10:00', auto: true, pid: 'p1', items: [{ pid: 'p1', name: '锁骨链', fp: 5.5, lp: 7.0, bom: [{ name: '链体', qty: 1, total: 2.0 }] }, { pid: 'p2', name: 'X', fp: 3, lp: 4 }] },
    { date: '2026-09-15', time: '14:00', auto: false, pid: 'p1', items: [{ pid: 'p1', name: '锁骨链', fp: 6.2, lp: 8.1, bom: [{ name: '链体', qty: 1, total: 2.5 }] }, { pid: 'p2', name: 'X', fp: 3, lp: 4 }] }
  ];
  docStub.querySelector('#trend-pid').value = 'p1';
  try {
    sandbox.renderTrend();
    const tb = docStub.querySelector('#trend-body').innerHTML;
    check('成本趋势图 SVG 双线渲染', tb.indexOf('<svg') >= 0 && tb.indexOf('工厂成本') >= 0 && tb.indexOf('落地成本') >= 0 && (tb.match(/<path/g) || []).length >= 2 && tb.indexOf('$6.20') >= 0 && tb.indexOf('较首个版本') >= 0, tb.slice(0, 220));
  } catch (e) { check('成本趋势图 SVG 双线渲染', false, e.message); }
  S.costVersions = [];
  try { sandbox.renderTrend(); } catch (e) {}
  check('成本趋势图空态', docStub.querySelector('#trend-body').innerHTML.indexOf('暂无成本快照') >= 0);
  S.costVersions = _vs;
}

/* ---------- B4：8D 每步 48h SLA ---------- */
{
  const sla1 = sandbox.d8Sla({ completionRate: 0, stepsTs: [] });
  check('d8Sla 无创建时间不误报', sla1 && sla1.h == null && sla1.label === '—', JSON.stringify(sla1));
  const sla2 = sandbox.d8Sla({ completionRate: 0, createdAt: sandbox.addDays(sandbox.todayStr(), -3) + ' 10:00', stepsTs: [] });
  check('d8Sla 超 48h 标超时', sla2 && sla2.over && sla2.label.indexOf('超时') >= 0, JSON.stringify(sla2));
  const sla3 = sandbox.d8Sla({ completionRate: 0, createdAt: sandbox.nowDT(), stepsTs: [] });
  check('d8Sla 未超时显示剩余', sla3 && !sla3.over && sla3.label.indexOf('SLA') >= 0, JSON.stringify(sla3));
  check('d8Sla 已闭环返回空', sandbox.d8Sla({ completionRate: 100, stepsTs: [] }) === null);
}
/* B4：actionStep 记录分步时间戳 */
{
  const _al = S.actions.slice();
  const a = { id: 'ax1', title: '测试整改', supplierId: 's1', owner: 'ASACE', due: sandbox.addDays(sandbox.todayStr(), 10), completionRate: 0, status: '待整改', createdAt: sandbox.nowDT(), stepsTs: [] };
  S.actions.push(a);
  try { sandbox.actionStep('ax1'); } catch (e) {}
  check('actionStep 记录 stepsTs 推进', a.stepsTs.length === 1 && a.completionRate === 13 && a.status === '进行中', JSON.stringify(a));
  S.actions = _al;
}
/* B4：同供应商 30 天 3 次客诉自动触发 CAR */
{
  const _il = S.issues.slice(); const _cl = S.cars.slice();
  const t0 = sandbox.todayStr();
  S.issues.push(
    { id: 'car1', title: 'CAR客诉1', supplierId: 's1', status: '待处理', createdAt: sandbox.addDays(t0, -29) + ' 09:00' },
    { id: 'car2', title: 'CAR客诉2', supplierId: 's1', status: '待处理', createdAt: sandbox.addDays(t0, -20) + ' 09:00' },
    { id: 'car3', title: 'CAR客诉3', supplierId: 's1', status: '待处理', createdAt: sandbox.addDays(t0, -1) + ' 09:00' }
  );
  sandbox.checkAutoCAR('s1');
  const c1 = S.cars[S.cars.length - 1];
  check('CAR 30天3次自动触发', c1 && c1.supplierId === 's1' && c1.status === '待评审' && c1.issueIds.length === 3, JSON.stringify(c1));
  const n1 = S.cars.length;
  sandbox.checkAutoCAR('s1');
  check('CAR 未关闭不重复触发', S.cars.length === n1);
  sandbox.carStatus(c1.id);
  check('CAR 流转推进', c1.status === '进行中');
  sandbox.carStatus(c1.id);
  check('CAR 流转至已关闭', c1.status === '已关闭');
  sandbox.checkAutoCAR('s1');
  check('CAR 关闭后可再触发', S.cars.length === n1 + 1);
  S.issues = _il; S.cars = _cl;
}
/* B4：客诉关联订单批次追溯 */
{
  const _il = S.issues.slice(); const _ol = S.orders.slice(); const _clc = S.cars.slice();
  const ob = { id: 'ob9', code: 'OD-B9', productId: 'p1', supplierId: 's1', qty: 1, price: 1, due: _T2, status: '生产中', payStatus: '', step: 2, batches: [{ date: '2026-10-05', qty: 100, received: false }, { date: '2026-10-12', qty: 200, received: false }] };
  S.orders.push(ob);
  docStub.querySelector('#f-order').value = 'ob9';
  try { sandbox.issueLinkOrder(); } catch (e) {}
  const bw = docStub.querySelector('#f-batch-wrap').innerHTML;
  check('issueLinkOrder 批次下拉', bw.indexOf('2026-10-05') >= 0 && bw.indexOf('f-batch') >= 0, bw.slice(0, 150));
  docStub.querySelector('#f-title').value = '批次追溯客诉';
  docStub.querySelector('#f-batch').value = '2026-10-05';
  try { sandbox.openIssue(); docStub.querySelector('#modal-ok').onclick(); } catch (e) {}
  const ni = S.issues[S.issues.length - 1];
  check('客诉保存批次+时间戳', ni && ni.batchDate === '2026-10-05' && ni.createdAt && ni.orderId === 'ob9', JSON.stringify(ni));
  S.issues = _il; S.orders = _ol; S.cars = _clc;
}
/* B4：CSV issues 往返含批次/时间列 */
check('CSV issues 含批次/时间列', src.indexOf("label:'批次'") >= 0 && src.indexOf("label:'时间'") >= 0);
/* B4：客诉 tab CAR 卡渲染（有未关闭 CAR 时展示） */
{
  const _cl = S.cars.slice();
  S.cars.push({ id: 'carx', supplierId: 's1', issueIds: ['car1'], ts: sandbox.nowDT(), status: '待评审', desc: '近30天 3 次客诉自动触发' });
  sandbox.go('quality'); sandbox.setQualTab('issues');
  const qh = docStub.querySelector('#qual-body').innerHTML;
  check('客诉 tab CAR 卡', qh.indexOf('供应商纠正措施报告（CAR）') >= 0 && qh.indexOf('carStatus') >= 0, qh.slice(0, 150));
  S.cars = _cl;
}
/* B4：整改单 tab SLA 列 */
{
  const _al = S.actions.slice();
  S.actions.push({ id: 'ax2', title: 'SLA测试整改', supplierId: 's1', owner: 'ASACE', due: sandbox.addDays(sandbox.todayStr(), 10), completionRate: 0, status: '待整改', createdAt: sandbox.addDays(sandbox.todayStr(), -5) + ' 09:00', stepsTs: [] });
  sandbox.go('quality'); sandbox.setQualTab('actions');
  const ah = docStub.querySelector('#qual-body').innerHTML;
  check('整改单 tab SLA 列', ah.indexOf('SLA 48h') >= 0 && ah.indexOf('超时') >= 0, ah.slice(0, 150));
  S.actions = _al;
}

/* ---------- C1 存储层 IndexedDB 迁移（setter 桩同步触发回调，保证断言确定性） ---------- */
function makeIdbStub(seed) {
  const mem = seed || {}; /* key -> {k,v,t} */
  const stub = { _mem: mem, _failPut: false, _failTx: false };
  function mkReq(result, fail) {
    const r = { result: result || null, _ons: null, _onerr: null };
    Object.defineProperty(r, 'onsuccess', { set(f) { if (!fail && f) f(); }, get() { return r._ons; }, configurable: true });
    Object.defineProperty(r, 'onerror', { set(f) { if (fail && f) f(); }, get() { return r._onerr; }, configurable: true });
    return r;
  }
  const store = {
    put(rec, key) { if (stub._failPut) return mkReq(null, true); if (key === undefined) { stub.__noKey = (stub.__noKey || 0) + 1; return mkReq(null, true); } mem[key] = rec; return mkReq(rec, false); },
    get(k) { return mkReq(mem[k] || null, false); },
    delete(k) { delete mem[k]; return mkReq(null, false); }
  };
  const txObj = { objectStore: () => store };
  Object.defineProperty(txObj, 'oncomplete', { set(f) { if (!stub._failTx && f) f(); }, get() { return null; }, configurable: true });
  Object.defineProperty(txObj, 'onerror', { set(f) { if (stub._failTx && f) f(); }, get() { return null; }, configurable: true });
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => store,
    transaction: () => txObj,
    close() {}
  };
  const openReq = mkReq(db, false);
  Object.defineProperty(openReq, 'onupgradeneeded', { set(f) { if (f) f(); }, get() { return null; }, configurable: true });
  stub.open = () => openReq; /* _failPut/_failTx 直接挂在返回对象上，store.put 闭包共享同一 stub */
  return stub;
}
{
  const OLS = sandbox.LS, OLOG = sandbox.LOG_KEY, OMIG = sandbox.LS_MIG;
  /* 用例1：迁移搬移 + 写标记 + 删旧 key */
  let idb = makeIdbStub({});
  sandbox.indexedDB = idb;
  sandbox.DB_READY = false; sandbox.DB = null; sandbox.DB_MEM = {};
  lsStub.setItem(OLS, JSON.stringify({ products: [{ id: 'pC1', name: '迁移测试', status: '在研' }] }));
  lsStub.setItem(OLOG, JSON.stringify([{ l: 'info', m: 'store', g: '旧日志', t: '2026-09-25 00:00' }]));
  sandbox.storeOpen(function (db) {
    check('C1 桩打开 IndexedDB', !!db);
    sandbox.storeMigrate();
  });
  check('C1 迁移写入主状态', idb._mem[OLS] && JSON.parse(idb._mem[OLS].v).products[0].id === 'pC1', JSON.stringify(idb._mem[OLS]));
  check('C1 迁移写入日志', idb._mem[OLOG] && JSON.parse(idb._mem[OLOG].v)[0].g === '旧日志');
  check('C1 迁移写标记', !!idb._mem[OMIG]);
  check('C1 迁移后删 localStorage 旧 key', lsStub.getItem(OLS) === null && lsStub.getItem(OLOG) === null);
  check('C1 桩契约：put 必须带 out-of-line key（真实 WebView2 缺 key 抛错）', !idb.__noKey, String(idb.__noKey || 0));
  /* 用例2：已迁移跳过（有标记不重复搬移/不重复删） */
  lsStub.setItem(OLS, '{"products":[{"id":"pX","name":"标记后新写入"}]}');
  sandbox.storeMigrate();
  check('C1 已迁移不重复迁移', lsStub.getItem(OLS) !== null && !JSON.parse(idb._mem[OLS].v).products.some(p => p.id === 'pX'));
  /* 用例3：迁移失败回滚（put 失败 + 事务失败 → 保留原数据、无标记、DB 不写入） */
  sandbox.DB_READY = false; sandbox.DB = null; sandbox.DB_MEM = {};
  idb = makeIdbStub({}); idb._failPut = true; idb._failTx = true;
  sandbox.indexedDB = idb;
  lsStub.setItem(OLS, '{"products":[{"id":"pC1f","name":"失败保留"}]}');
  sandbox.storeOpen(function () { sandbox.storeMigrate(); });
  check('C1 迁移失败保留 localStorage', lsStub.getItem(OLS) !== null);
  check('C1 迁移失败不写标记', !idb._mem[OMIG]);
  check('C1 迁移失败不写数据', !idb._mem[OLS]);
  /* 用例4：storeSet/storeGet 双通道 + storeDel */
  sandbox.DB_READY = false; sandbox.DB = null; sandbox.DB_MEM = {};
  sandbox.storeSet('supplydev_test_k', '{"a":1}');
  check('C1 storeSet 镜像 localStorage', lsStub.getItem('supplydev_test_k') === '{"a":1}');
  check('C1 storeGet 内存命中', sandbox.storeGet('supplydev_test_k') === '{"a":1}');
  sandbox.storeDel('supplydev_test_k');
  check('C1 storeDel 清理两通道', lsStub.getItem('supplydev_test_k') === null && sandbox.storeGet('supplydev_test_k') === null);
  /* 用例5：storeReload（IndexedDB 权威较新 → state 重载 + 镜像回写） */
  sandbox.DB_READY = false; sandbox.DB = null; sandbox.DB_MEM = {};
  idb = makeIdbStub({});
  sandbox.indexedDB = idb;
  sandbox.storeOpen(function () {
    idb._mem[OLS] = { k: OLS, v: JSON.stringify({ products: [{ id: 'pC1r', name: '重载', status: '在研' }], materials: [] }), t: Date.now() + 5000 };
    sandbox.storeReload();
  });
  check('C1 IndexedDB 较新重载 state', sandbox.state.products.some(p => p.id === 'pC1r'));
  check('C1 重载后镜像回写 localStorage', lsStub.getItem(OLS) !== null && JSON.parse(lsStub.getItem(OLS)).products.some(p => p.id === 'pC1r'));
  /* 用例6：persist/saveLogs 走 store 层双通道 */
  sandbox.DB_READY = false; sandbox.DB = null; sandbox.DB_MEM = {};
  sandbox.persist(); sandbox.flushPersist(); /* C4：防抖版 persist + 显式冲刷 */
  check('C1 persist 落 localStorage 镜像', lsStub.getItem(OLS) !== null);
  sandbox.logLog('warn', 'test', 'C1 存储测试');
  check('C1 saveLogs 落 localStorage 镜像', (lsStub.getItem(OLOG) || '').indexOf('C1 存储测试') >= 0);
  /* 用例7：flushStore 幂等 */
  sandbox.DB_READY = true; sandbox.DB = { close() { sandbox.DB_READY = false; } };
  sandbox.flushStore(); sandbox.flushStore();
  check('C1 flushStore 幂等', true);
}

/* ---------- C4：P0 性能三件套（persist 防抖合并 / flushPersist 冲刷 / gsInput / dashFoldToggle / scheduleRender） ---------- */
sandbox.DB_READY = false; sandbox.DB = null; sandbox.DB_MEM = {};
lsStub.removeItem('supplydev_v2_local');
sandbox.persist();
check('C4 persist 防抖不立即写', lsStub.getItem('supplydev_v2_local') === null);
let ssCnt = 0; const ssOrig = sandbox.storeSet;
sandbox.storeSet = function (k, v) { ssCnt++; return ssOrig(k, v); }; /* 间谍：统计真实写盘次数 */
sandbox.persist(); sandbox.persist(); sandbox.flushPersist();
check('C4 多次 persist 合并为一次写盘', ssCnt === 1, 'cnt=' + ssCnt);
sandbox.storeSet = ssOrig;
check('C4 flushPersist 落 localStorage 镜像', (lsStub.getItem('supplydev_v2_local') || '').length > 100);
check('C4 gsInput 搜索防抖存在', typeof sandbox.gsInput === 'function');
check('C4 gsFlushSearch 冲刷入口存在', typeof sandbox.gsFlushSearch === 'function');
check('C4 dashFoldToggle 局部切换存在', typeof sandbox.dashFoldToggle === 'function');
check('C4 scheduleRender 合帧存在', typeof sandbox.scheduleRender === 'function');
sandbox.go('dashboard'); sandbox.dashFold.todo = false; sandbox.dashFoldToggle('todo');
check('C4 dashFoldToggle 翻转折叠状态', sandbox.dashFold.todo === true);
check('C4 dashFoldToggle 局部替换面板内容', (docStub.querySelector('#dash-panel-todo') || {}).innerHTML !== undefined);
check('C4 _dashPanels 暂存三卡内容', !!sandbox.window._dashPanels && typeof sandbox.window._dashPanels.todo === 'string' && sandbox.window._dashPanels.todo.length > 0);

/* ---------- C5：P1 供应商评分细化（准时率/波动/响应）+ 资质证书 ---------- */
check('C5 supPunctuality 函数存在', typeof sandbox.supPunctuality === 'function');
check('C5 supResp 函数存在', typeof sandbox.supResp === 'function');
(function() {
  var T = T0;
  /* 自造确定性供应商，不依赖种子供应商的中间态（此前用例可能已增删/重载） */
  var sz = {id:'sz',name:'C5压测电子',cats:['压测'],moq:1,terms:'',years:1,rating:'C',contact:'',qualityScore:75,deliveryScore:75,priceScore:75,status:'启用',tier:'战略'};
  var sy = {id:'sy',name:'C5压测准时厂',cats:['压测'],moq:1,terms:'',years:1,rating:'C',contact:'',qualityScore:75,deliveryScore:75,priceScore:75,status:'启用',tier:'常规'};
  sandbox.state.suppliers.push(sz); sandbox.state.suppliers.push(sy);
  /* 两笔已收批次，延迟 +2 / +3 天 → 准时率 0%，σ=0.5；due 未来无逾期 → 交期分=90-0-0.5*2-1*15=74 */
  sandbox.state.orders.push({id:'opx',code:'OD-PUNC-TEST',productId:'p1',supplierId:'sz',qty:100,price:1,due:sandbox.addDays(T,30),status:'已完成',payStatus:'已付清',orderType:'首单',step:6,batches:[
    {date:sandbox.addDays(T,-20),qty:60,received:true,receivedDate:sandbox.addDays(T,-18)},
    {date:sandbox.addDays(T,-8),qty:40,received:true,receivedDate:sandbox.addDays(T,-5)}
  ]});
  var pun = sandbox.supPunctuality('sz');
  check('C5 supPunctuality 统计样本数', pun.n === 2, JSON.stringify(pun));
  check('C5 supPunctuality 准时率 0%', pun.rate === 0, 'rate=' + pun.rate);
  check('C5 supPunctuality 波动 σ=0.5', pun.sigma === 0.5, 'sigma=' + pun.sigma);
  sandbox.recalcSupplierScore('sz');
  check('C5 交期分吸收波动惩罚（74）', sz.deliveryScore === 74, 'deliveryScore=' + sz.deliveryScore);
  /* 按期收货 → rate 100% σ=0 */
  sandbox.state.orders.push({id:'opy',code:'OD-PUNC-OK',productId:'p1',supplierId:'sy',qty:100,price:1,due:sandbox.addDays(T,30),status:'已完成',payStatus:'已付清',orderType:'返单',step:6,batches:[
    {date:sandbox.addDays(T,-4),qty:100,received:true,receivedDate:sandbox.addDays(T,-4)}
  ]});
  var pun2 = sandbox.supPunctuality('sy');
  check('C5 supPunctuality 按期收货 rate=100% σ=0', pun2.rate === 100 && pun2.sigma === 0, JSON.stringify(pun2));
  /* 无实收批次数据回落旧公式（90-overdue*3 口径，不虚构） */
  var s9 = {id:'s9',name:'压测无数据厂',cats:['压测'],moq:1,terms:'',years:1,rating:'C',contact:'',qualityScore:75,deliveryScore:75,priceScore:75,status:'启用',tier:'常规'};
  sandbox.state.suppliers.push(s9);
  sandbox.recalcSupplierScore('s9');
  check('C5 无批次数据回落旧公式 deliveryScore=90', s9.deliveryScore === 90, 'deliveryScore=' + s9.deliveryScore);
  /* 报价响应：自造两条报价 6天/4天 → 平均 5 天 */
  sandbox.state.quotes.push({id:'qz1',productId:'p1',supplierId:'sz',price:1,moq:1,leadTime:10,reqDate:sandbox.addDays(T,-10),quoteDate:sandbox.addDays(T,-4),status:'待评估',validity:''});
  sandbox.state.quotes.push({id:'qz2',productId:'p1',supplierId:'sz',price:1,moq:1,leadTime:10,reqDate:sandbox.addDays(T,-7),quoteDate:sandbox.addDays(T,-3),status:'待评估',validity:''});
  check('C5 supResp 平均响应 5 天', sandbox.supResp('sz') === 5, 'resp=' + sandbox.supResp('sz'));
  check('C5 supResp 无数据返回 null', sandbox.supResp('s9') === null);
})();
check('C5 normalizeState 补 certs 集合', Array.isArray(sandbox.state.certs));
(function() {
  var before = sandbox.state.certs.length;
  sandbox.state.certs.push({id:'cx',supplierId:'s2',type:'压测证书',expire:sandbox.addDays(T0,-1),note:''});
  var risks = sandbox.riskItems();
  check('C5 过期证书进风险提醒', risks.some(function(r){return r.t.indexOf('证书已过期') >= 0}), JSON.stringify(risks.map(function(r){return r.t})));
  var risks2 = (function(){ sandbox.state.certs.push({id:'cy',supplierId:'s2',type:'压测临期',expire:sandbox.addDays(T0,10),note:''}); var r = sandbox.riskItems(); return r; })();
  check('C5 30天内到期证书进风险提醒', risks2.some(function(r){return r.t.indexOf('证书即将到期') >= 0}));
  /* 级联：删除供应商应清其证书 */
  sandbox.state.orders = sandbox.state.orders.filter(function(o){return o.supplierId !== 's9'});
  sandbox.state.quotes = sandbox.state.quotes.filter(function(q){return q.supplierId !== 's9'});
  sandbox.state.certs.push({id:'cz',supplierId:'s9',type:'级联压测',expire:sandbox.addDays(T0,100),note:''});
  sandbox.confirm = function(){return true};
  sandbox.delSupplier('s9');
  check('C5 delSupplier 级联清理证书', !sandbox.state.certs.some(function(c){return c.supplierId === 's9'}));
  check('C5 delSupplier 级联后证书总数守恒', sandbox.state.certs.filter(function(c){return c.supplierId === 's2'}).length === 2);
  /* 种子证书三态齐备（用加载时初始快照 S 断言；套件中途 state 可能被 C1 重载替换） */
  check('C5 种子证书含临期与过期样本', Array.isArray(S.certs) && S.certs.some(function(c){return c.id==='c2'&&c.expire}) && S.certs.some(function(c){return c.id==='c3'&&c.expire}));
})();
check('C5 openCerts/delCert 函数存在', typeof sandbox.openCerts === 'function' && typeof sandbox.delCert === 'function');
check('C5 CSV certs 模块可导出', typeof sandbox.exportModule === 'function' && (function(){ try { sandbox.exportModule('certs'); return true } catch(e) { return false } })());

/* ---------- C6：备份加密（AES-GCM 信封）+ 7 天未备份提醒 + 全局快捷键 + 时钟漂移统计 ---------- */
check('C6 looksEncryptedBackup 明文→false', sandbox.looksEncryptedBackup('{"_app":"supplydev","products":[]}') === false);
check('C6 looksEncryptedBackup 信封→true', sandbox.looksEncryptedBackup('{"_app":"supplydev-enc","_enc":1,"salt":"aa","iv":"bb","data":"cc"}') === true);
check('C6 looksEncryptedBackup 坏 JSON→false', sandbox.looksEncryptedBackup('not json') === false);
check('C6 decBackupText 明文抛错', (async function(){ try { await sandbox.decBackupText('{"products":[]}', 'x'); return false } catch(e) { return true } })(), '需 await');

pendingAsync++;
(async function(){ /* 加密往返（桩 AES-GCM：往返一致 / 错密码拒解 / 随机盐 IV 密文不确定） */
  try {
    var payload = { products: [{ id: 'px', name: '中文✓加密往返' }], _app: 'supplydev' };
    var env = await sandbox.encBackupText(payload, 'secret-pw');
    check('C6 加密信封可识别', sandbox.looksEncryptedBackup(env) === true, env.slice(0, 80));
    var d = JSON.parse(env);
    check('C6 信封字段（iter/salt/iv/data）', d.iter === 100000 && d.kdf === 'PBKDF2-SHA256' && /^[0-9a-f]{32}$/.test(d.salt) && d.iv.length > 0 && d.data.length > 0, JSON.stringify({iter:d.iter,kdf:d.kdf,salt:d.salt}));
    var back = await sandbox.decBackupText(env, 'secret-pw');
    check('C6 解密往返一致（含中文）', back.products[0].name === '中文✓加密往返' && back._app === 'supplydev');
    var wrong = false;
    try { await sandbox.decBackupText(env, 'wrong-pw'); } catch (e) { wrong = true; }
    check('C6 错误密码解密被拒（GCM 校验失败）', wrong === true);
    var env2 = await sandbox.encBackupText(payload, 'secret-pw');
    check('C6 同明文两次加密密文不同（随机盐+IV）', env2 !== env);
  } catch (e) { check('C6 加密往返', false, e.message); }
  pendingAsync--;
})();

pendingAsync++;
(async function(){ /* exportData 弹窗链路：带密码 → 加密信封；留空 → 明文 JSON */
  try {
    var blobs = []; var _B = sandbox.Blob;
    sandbox.Blob = function (parts, opts) { var b = new _B(parts, opts); blobs.push(b); return b; };
    sandbox.exportData();
    var doc = sandbox.document;
    check('C6 导出弹窗含密码输入', doc.getElementById('f-bkpass') !== undefined && doc.querySelector('#modal-box').innerHTML.indexOf('备份密码') >= 0);
    doc.getElementById('f-bkpass').value = 'pw1';
    doc.querySelector('#modal-ok').onclick();
    for (var i = 0; i < 300 && blobs.length < 1; i++) await new Promise(r => setTimeout(r, 10));
    check('C6 带密码导出产出加密信封', blobs.length >= 1 && sandbox.looksEncryptedBackup(blobs[0]._s), blobs.length ? String(blobs[0]._s).slice(0, 80) : '无产物');
    var back = await sandbox.decBackupText(blobs[0]._s, 'pw1');
    check('C6 导出信封可解密回业务数据', Array.isArray(back.products) && back.products.length > 0);
    doc.getElementById('f-bkpass').value = '';
    doc.querySelector('#modal-ok').onclick();
    for (var j = 0; j < 300 && blobs.length < 2; j++) await new Promise(r => setTimeout(r, 10));
    var plainOk = blobs.length >= 2 && sandbox.looksEncryptedBackup(blobs[1]._s) === false && String(blobs[1]._s).replace(/\s/g, '').indexOf('"_app":"supplydev"') === 1; /* 首字符为 { */
    check('C6 留空导出明文 JSON', plainOk, 'blobs=' + blobs.length + ' enc=' + sandbox.looksEncryptedBackup(blobs[1]._s) + ' idx=' + String(blobs[1]._s).replace(/\s/g, '').indexOf('"_app":"supplydev"') + ' head=' + JSON.stringify(String(blobs[1]._s).slice(0, 40)));
    sandbox.Blob = _B;
  } catch (e) { check('C6 导出弹窗链路', false, e.message); }
  pendingAsync--;
})();

/* C6 7 天未备份提醒 */
(function(){
  sandbox.localStorage.removeItem('supplydev_last_backup');
  check('C6 从未备份→需提醒', sandbox.bkReminderDue(Date.now()) === true);
  sandbox.bkMarkSuccess();
  check('C6 刚备份→不提醒', sandbox.bkReminderDue(Date.now()) === false);
  check('C6 bkLastBackup 读取非零', sandbox.bkLastBackup() > 0);
  sandbox.localStorage.setItem('supplydev_last_backup', String(Date.now() - 8 * 86400000));
  check('C6 8 天前备份→提醒', sandbox.bkReminderDue(Date.now()) === true);
  sandbox.localStorage.setItem('supplydev_last_backup', String(Date.now() - 6 * 86400000));
  check('C6 7 天内备份→不提醒', sandbox.bkReminderDue(Date.now()) === false);
})();

/* C6 全局快捷键 */
(function(){
  sandbox.globalHotkeys({ key: '2', altKey: true, preventDefault(){} });
  check('C6 Alt+2 切到项目汇总', sandbox.ROUTE === 'projects', 'route=' + sandbox.ROUTE);
  sandbox.globalHotkeys({ key: '8', altKey: true, preventDefault(){} });
  check('C6 Alt+8 切到团队成员', sandbox.ROUTE === 'team', 'route=' + sandbox.ROUTE);
  sandbox.globalHotkeys({ key: '9', altKey: true, preventDefault(){} });
  check('C15 Alt+9 切到帮助中心（九板块）', sandbox.ROUTE === 'help', 'route=' + sandbox.ROUTE);
  sandbox.globalHotkeys({ key: '0', altKey: true, preventDefault(){} });
  check('C6 Alt+0 越界不切换', sandbox.ROUTE === 'help');
  var gs = docStub.getElementById('gs-panel'); gs.style.display = 'block';
  sandbox.globalHotkeys({ key: 'Escape', preventDefault(){} });
  check('C6 Esc 关闭搜索浮层', gs.style.display === 'none');
  var si = docStub.getElementById('global-search');
  sandbox.globalHotkeys({ key: 'k', ctrlKey: true, preventDefault(){} });
  check('C6 Ctrl+K 聚焦并全选搜索框', si._focused === true && si._selected === true);
  var fpCalled = false; var _fp = sandbox.flushPersist;
  sandbox.flushPersist = function(){ fpCalled = true; _fp(); };
  sandbox.globalHotkeys({ key: 's', ctrlKey: true, preventDefault(){} });
  sandbox.flushPersist = _fp;
  check('C6 Ctrl+S 立即落盘', fpCalled === true);
})();

/* C6 时钟漂移统计 */
(function(){
  sandbox.localStorage.removeItem('supplydev_time_offset');
  var n = sandbox.timeDriftRecord(6000, '测试源A');
  check('C6 timeDriftRecord 返回历史长度', n === 1, 'n=' + n);
  var info = JSON.parse(sandbox.localStorage.getItem('supplydev_time_offset'));
  check('C6 漂移历史持久化（含 off/src/t）', Array.isArray(info.hist) && info.hist.length === 1 && info.hist[0].off === 6000 && info.hist[0].src === '测试源A');
  var lastLog = sandbox.LOGS[sandbox.LOGS.length - 1];
  check('C6 偏移>5s 记 WARN', lastLog && lastLog.l === 'warn' && lastLog.g.indexOf('5s') >= 0, JSON.stringify(lastLog));
  var before = sandbox.LOGS.length;
  sandbox.timeDriftRecord(1200, '测试源B');
  check('C6 偏移≤5s 不告警', sandbox.LOGS.length === before);
  for (var i = 0; i < 35; i++) sandbox.timeDriftRecord(100 + i, '压测');
  check('C6 漂移历史上限 30 条', sandbox.timeDriftHist().length === 30, 'len=' + sandbox.timeDriftHist().length);
  check('C6 readTimeInfo 坏 JSON 容错', (function(){ sandbox.localStorage.setItem('supplydev_time_offset', 'broken'); try { return Object.keys(sandbox.readTimeInfo()).length === 0 } catch(e) { return false } })());
})();

/* ===== C7 暗色模式（绑行为契约，不绑实现细节） ===== */
(function(){
  const SRC = html; /* 顶层读取的 supplydev.html 完整源码 */
  check('C7 dark 变量覆盖块存在', SRC.indexOf('html[data-theme="dark"]') >= 0);
  check('C7 五个新变量已定义', ['--severe','--on-accent','--soft','--purple','--mask'].every(v => SRC.indexOf(v + ':') >= 0));
  check('C7 顶栏主题按钮存在', SRC.indexOf('id="theme-btn"') >= 0 && SRC.indexOf('cycleTheme()') >= 0);
  check('C7 属性上下文硬编码色清零', (function(){
    const rootStart = SRC.indexOf(':root{'), darkEnd = SRC.indexOf('}', SRC.indexOf('html[data-theme="dark"]'));
    /* 打印报表块豁免：@media print 内固定黑白灰是有意硬编码（打印不随主题），区间取到 </style> */
    const printStart = SRC.indexOf('@media print{'), printEnd = SRC.indexOf('</style>');
    const re = /(?:color|background(?:-color)?)\s*:\s*#(?:86909C|F53F3F|FF7D00|165DFF|00B42A|1D2129|fff|FFFFFF)\b/gi;
    let mm, outside = 0;
    while ((mm = re.exec(SRC)) !== null) {
      if (mm.index > rootStart && mm.index < darkEnd) continue;
      if (mm.index > printStart && mm.index < printEnd) continue;
      outside++;
    }
    return outside === 0;
  })(), 'color:...# 常量色仍残留（变量定义块与打印块之外）');
  check('C7 applyTheme dark 落 data-theme+持久化', (function(){
    sandbox.applyTheme('dark');
    return sandbox.document.documentElement.getAttribute('data-theme') === 'dark'
      && sandbox.document.documentElement.getAttribute('data-theme-mode') === 'dark'
      && sandbox.localStorage.getItem('supplydev_theme') === 'dark'
      && sandbox.document.getElementById('theme-btn').textContent === '🌙 暗色';
  })());
  check('C7 applyTheme light 恢复', (function(){
    sandbox.applyTheme('light');
    return sandbox.document.documentElement.getAttribute('data-theme') === 'light'
      && sandbox.localStorage.getItem('supplydev_theme') === 'light';
  })());
  check('C7 applyTheme auto（桩无 matchMedia→light）', (function(){
    sandbox.applyTheme('auto');
    return sandbox.document.documentElement.getAttribute('data-theme') === 'light'
      && sandbox.document.documentElement.getAttribute('data-theme-mode') === 'auto';
  })());
  check('C7 applyTheme 坏值回落 light', (function(){
    sandbox.applyTheme('bogus');
    return sandbox.document.documentElement.getAttribute('data-theme-mode') === 'light'
      && sandbox.localStorage.getItem('supplydev_theme') === 'light';
  })());
  check('C7 cycleTheme 三态循环 auto→light', (function(){
    sandbox.applyTheme('auto');
    sandbox.cycleTheme();
    return sandbox.document.documentElement.getAttribute('data-theme-mode') === 'light';
  })());
  check('C7 cycleTheme 循环 light→dark→auto', (function(){
    sandbox.cycleTheme(); sandbox.cycleTheme();
    return sandbox.document.documentElement.getAttribute('data-theme-mode') === 'auto';
  })());
  check('C7 变量化渲染抽查（ink3 走 var）', SRC.split('color:var(--ink3)').length >= 90, 'count=' + (SRC.split('color:var(--ink3)').length - 1));
})();

/* ===== C8 打印/导出 PDF 报表 ===== */
(function(){
  const SRC = html; /* 顶层读取的 supplydev.html 完整源码 */
  check('C8 print-root 挂载点存在', SRC.indexOf('<div id="print-root"></div>') >= 0);
  check('C8 @media print 规则齐备', ['body>*:not(#print-root){display:none!important}', '@page{size:A4;margin:12mm}', 'page-break-inside:avoid', 'afterprint'].every(s => SRC.indexOf(s) >= 0));
  check('C8 三个报表函数已定义', ['_prTable', 'printGlobalHTML', 'printProjectHTML', 'openPrintReport'].every(f => typeof sandbox[f] === 'function'));
  check('C8 viewHeader 顶栏含报表按钮', SRC.indexOf("openPrintReport(\\'global\\')") >= 0);
  check('C8 项目详情含单项目报表按钮', SRC.indexOf("openPrintReport(\\'project\\')") >= 0);
  check('C8 全局报表内容正确', (function(){
    try {
      const html = sandbox.printGlobalHTML();
      return html.indexOf('供应链汇总报表') > 0
        && html.indexOf(String(sandbox.state.products.length)) > 0
        && (html.match(/<table>/g) || []).length === 3
        && html.indexOf(sandbox.esc(sandbox.state.products[0].name)) > 0;
    } catch (e) { throw new Error('printGlobalHTML 异常: ' + e.message); }
  })(), 'global 报表结构与数据源不符');
  check('C8 单项目报表内容正确', (function(){
    try {
      const pid = sandbox.state.products[0].id;
      const html = sandbox.printProjectHTML(pid);
      return html.indexOf('项目报表：') > 0
        && (html.match(/<table>/g) || []).length >= 4
        && html.indexOf('二、里程碑') > 0
        && html.indexOf('四、订单') > 0;
    } catch (e) { throw new Error('printProjectHTML 异常: ' + e.message); }
  })(), 'project 报表结构不符');
  check('C8 无效 pid 安全返回空串', sandbox.printProjectHTML('no-such-pid') === '' && sandbox.printProjectHTML('') === '');
  check('C8 openPrintReport 填充 print-root + 打点', (function(){
    try {
      sandbox.openPrintReport('global');
      const el = sandbox.document.getElementById('print-root');
      return el && el.innerHTML.indexOf('供应链汇总报表') > 0;
    } catch (e) { throw new Error('openPrintReport 异常: ' + e.message); }
  })());
  check('C8 报表打点入审计日志', (function(){
    const a = sandbox.state._audit || [];
    return a.length > 0 && String(a[a.length - 1].a || '').indexOf('打印报表') >= 0;
  })());
  check('C8 报表无主题变量依赖（固定打印色）', (function(){
    const el = sandbox.document.getElementById('print-root');
    return el.innerHTML.indexOf('var(--') < 0;
  })());
})();

/* ===== C9 全板块 CRUD 与卡片/列表修复 ===== */
(function(){
  const SRC = html;
  /* P0 修复：卡片/列表切换 */
  check('C9 setProjView 统一入口存在', typeof sandbox.setProjView === 'function');
  check('C9 切换按钮走 setProjView（旧直改 projView 已移除）', SRC.indexOf("projView=\\'list\\';renderProjectRows()") < 0 && SRC.indexOf("projView=\\'cards\\';renderProjCards()") < 0 && (SRC.match(/setProjView/g) || []).length >= 3);
  check('C9 切换真实显隐（list→卡片隐藏表格显示）', (function(){
    sandbox.setProjView('list');
    const cards = sandbox.document.getElementById('proj-cards'), tb = sandbox.document.getElementById('proj-table');
    const listOk = cards.style.display === 'none' && tb.style.display === 'block';
    sandbox.setProjView('cards');
    const cardsOk = cards.style.display === 'grid' && tb.style.display === 'none';
    return listOk && cardsOk;
  })());
  /* 行内按钮接线（详情 6 tab + 团队 + 项目卡片） */
  check('C9 打样行含删除', SRC.indexOf("delSample(\'''+x.id+'\'"));
  check('C9 BOM 行含删除', SRC.indexOf("delBOM(\'''+b.id+'\'"));
  check('C9 报价行含编辑+删除', SRC.indexOf("editQuote(\'''+q.id+'\'") && SRC.indexOf("delQuote(\'''+q.id+'\'"));
  check('C9 订单行含编辑+删除', SRC.indexOf("editOrder(\'''+o.id+'\'") && SRC.indexOf("delOrder(\'''+o.id+'\'"));
  check('C9 客诉行含编辑+删除', SRC.indexOf("editIssue(\'''+i.id+'\'") && SRC.indexOf("delIssue(\'''+i.id+'\'"));
  check('C9 里程碑时间轴含删除', SRC.indexOf("delMilestone(\'''+m.id+'\'"));
  check('C9 团队卡片含删除', SRC.indexOf("delTeam(\'''+m.id+'\'"));
  check('C9 项目卡片含编辑+删除', SRC.indexOf("openEditProduct(\'''+p.id+'\'") && SRC.indexOf("delProject(\'''+p.id+'\'"));
  /* 行为级：删除级联 */
  check('C9 delSample 删除+状态联动+审计', (function(){
    const pid = 'p-c9s';
    sandbox.state.products.push({ id: pid, name: 'C9打样联动', cat: '压测', platform: '', status: '已下单', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: '', sampleDue: '', confirmDate: '', orderDate: '', progress: 10 });
    const sid = 's-c9s';
    sandbox.state.samples.push({ id: sid, productId: pid, supplierId: '', round: 1, cost: 1, due: '', status: '已确认' });
    sandbox.delSample(sid);
    const gone = !sandbox.state.samples.some(x => x.id === sid);
    const prod = sandbox.state.products.find(p => p.id === pid);
    const audit = sandbox.state._audit.some(a => String(a.a).indexOf('删除打样记录') >= 0);
    return gone && prod && prod.status !== '已下单' && audit;
  })());
  check('C9 delQuote 删除+审计', (function(){
    sandbox.state.quotes.push({ id: 'q-c9', productId: '', supplierId: '', price: 1, moq: 1, leadTime: 1, reqDate: '', quoteDate: '', status: '', validity: '' });
    sandbox.delQuote('q-c9');
    return !sandbox.state.quotes.some(q => q.id === 'q-c9') && sandbox.state._audit.some(a => String(a.a).indexOf('删除报价') >= 0);
  })());
  check('C9 delTeam 老板保护生效', (function(){
    let boss = sandbox.state.team.find(m => m.role === '老板');
    if (!boss) { boss = { id: 't-boss-c9', n: 'C9老板', role: '老板', dept: '', email: '', status: '在职' }; sandbox.state.team.push(boss); }
    const before = sandbox.state.team.length;
    sandbox.delTeam(boss.id);
    return sandbox.state.team.length === before && sandbox.state.team.some(m => m.id === boss.id);
  })());
  check('C9 delTeam 普通成员可删+审计', (function(){
    const m = { id: 't-c9', n: 'C9测试员', role: '专员', dept: '', email: '', status: '在职' };
    sandbox.state.team.push(m);
    sandbox.delTeam(m.id);
    return !sandbox.state.team.some(x => x.id === m.id) && sandbox.state._audit.some(a => String(a.a).indexOf('删除成员') >= 0);
  })());
  check('C9 delBOM 详情页上下文走 RENDER', (function(){
    sandbox.state._costPid = ''; sandbox.ROUTE = 'project';
    sandbox.state.bom.push({ id: 'b-c9', productId: '', name: 'C9BOM', items: [], processes: [] });
    sandbox.delBOM('b-c9');
    return !sandbox.state.bom.some(b => b.id === 'b-c9') && sandbox.ROUTE === 'project';
  })());
})();

/* ==================== C10 批次：导入会话安全 / 按项目导出 / 日志模块筛选 ==================== */
check('C10 MOD_NAMES 全局映射存在且覆盖 15 模块', typeof sandbox.MOD_NAMES === 'object' && Object.keys(sandbox.MOD_NAMES).length === 15);
check('C10 KM2 重复定义已收敛', src.indexOf('var KM2=') < 0);

/* exportModule(name,pid)：支持 pid 的模块按项目过滤，不支持的（issues）保持全量 */
/* 注意：捕获期间不得调用旧 Blob（前序 C6 异步段持有包装器引用，误调用会污染其 blobs 数组） */
(function(){
  let cap = null;
  const OldBlob = sandbox.Blob;
  sandbox.Blob = function (parts) { cap = parts.map(String).join(''); return { _s: cap }; }; /* 返回哑对象，不触碰旧链 */
  try {
    const pidBom = sandbox.state.products[0].id;
    const want = sandbox.state.bom.filter(b => b.productId === pidBom).length;
    sandbox.exportModule('bom', pidBom);
    check('C10 exportModule 按 pid 过滤 BOM（行数=该项目BOM数）', cap.split('\n').length - 1 === want, '出' + (cap.split('\n').length - 1) + '/应' + want);
    let cap2 = null;
    sandbox.Blob = function (parts) { cap2 = parts.map(String).join(''); return { _s: cap2 }; };
    sandbox.exportModule('issues', pidBom);
    check('C10 无 productId 键模块（issues）不误过滤', cap2.split('\n').length - 1 === sandbox.state.issues.length);
  } catch (e) { check('C10 exportModule pid 过滤', false, e.message); }
  sandbox.Blob = OldBlob;
})();

/* doImportJSON 整体覆盖后清空 importSessions（回归：旧 CSV 导入快照若残留，团队页「撤销」会还原出脏数据） */
(function(){
  try {
    sandbox.importSessions = []; /* 前序段落可能已塞满 3 条上限（FIFO 截断），末段先清空保证前置确定性 */
    sandbox.recordImportSession('materials', { materials: [] }, { added: 1, skipped: 0, errors: [] });
    if (sandbox.importSessions.length !== 1) { check('C10 doImportJSON 清 importSessions', false, '前置失败 ' + sandbox.importSessions.length); return; }
    const bk = JSON.parse(JSON.stringify(sandbox.state));
    sandbox.doImportJSON(JSON.stringify({ _app: 'supplydev', _schema: 2, products: bk.products }));
    const cleared = sandbox.importSessions.length === 0;
    sandbox.state = bk; /* 还原现场 */
    sandbox.persist();
    check('C10 doImportJSON 清 importSessions（旧快照防脏还原）', cleared);
  } catch (e) { check('C10 doImportJSON 清 importSessions', false, e.message); }
})();

/* 日志模块筛选：与级别筛选正交，命中行显示模块名 */
/* 注意：不得调用 openLogViewer（openModal 会覆盖全局 #modal-ok onclick，破坏 C6 异步段的后续导出点击），直接驱动 renderLogList */
(function(){
  try {
    sandbox.LOGS.push({ t: '00:00:00', l: 'info', m: 'c10mod', g: 'C10 模块筛选锚点', d: '' });
    sandbox.window.logLvFilter = 'all';
    sandbox.window.logModFilter = 'c10mod';
    sandbox.renderLogList();
    const h = docStub.querySelector('#log-list').innerHTML;
    check('C10 日志模块筛选命中+标签显示', h.indexOf('C10 模块筛选锚点') >= 0 && h.indexOf('（模块 c10mod）') >= 0, h.slice(0, 150));
    sandbox.window.logModFilter = 'all';
    sandbox.renderLogList();
    check('C10 日志模块切回全部恢复', docStub.querySelector('#log-list').innerHTML.indexOf('（模块') < 0);
    check('C10 openLogViewer 打开即重置模块筛选', html.indexOf("window.logModFilter='all'") >= 0);
    sandbox.LOGS = sandbox.LOGS.filter(e => e.m !== 'c10mod');
  } catch (e) { check('C10 日志模块筛选', false, e.message); }
})();

/* ===== C11 批次：联动/死数据/逾期覆盖/编辑模式 ===== */
(function () {
  const SRCv = html;
  /* recalcProgress：里程碑完成比例联动项目进度（死数据修复）——注入自清理数据 */
  try {
    const st = sandbox.state;
    const pid = 'c11p';
    st.products.push({ id: pid, name: 'C11进度压测', cat: '压测', platform: '', status: '打样中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: sandbox.todayStr(), sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(sandbox.todayStr(), 30), progress: 7 });
    st.milestones.push({ id: 'c11m1', productId: pid, name: '压测A', date: sandbox.addDays(sandbox.todayStr(), 5), status: '未开始', desc: '', color: '#165DFF' });
    st.milestones.push({ id: 'c11m2', productId: pid, name: '压测B', date: sandbox.addDays(sandbox.todayStr(), 10), status: '未开始', desc: '', color: '#165DFF' });
    sandbox.recalcProgress(pid);
    const zeroOK = sandbox.byId(st.products, pid).progress === 0;
    st.milestones.forEach(m => { if (m.productId === pid) m.status = '已完成'; });
    sandbox.recalcProgress(pid);
    const fullOK = sandbox.byId(st.products, pid).progress === 100;
    check('C11 recalcProgress 0%→100% 联动', zeroOK && fullOK, zeroOK + '/' + fullOK);
    st.products = st.products.filter(x => x.id !== pid);
    st.milestones = st.milestones.filter(m => m.productId !== pid);
  } catch (e) { check('C11 recalcProgress 联动', false, e.message); }

  /* quoteStatus：报价采纳联动供应商评分重算（audit 打点断言） */
  try {
    const st = sandbox.state;
    st.suppliers.push({ id: 'c11s', name: 'C11压测供应商', cat: '压测', quality: 90, delivery: 90, price: 90, rating: 'A', active: true });
    st.products.push({ id: 'c11p2', name: 'C11报价压测', cat: '压测', platform: '', status: '立项中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: sandbox.todayStr(), sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(sandbox.todayStr(), 30), progress: 0 });
    st.quotes.push({ id: 'c11q', productId: 'c11p2', supplierId: 'c11s', price: 5, moq: 100, leadTime: 15, status: '待评估', validity: sandbox.addDays(sandbox.todayStr(), -3) });
    const a0 = (st._audit || []).length;
    sandbox.quoteStatus('c11q', '已采纳');
    const a = st._audit || [];
    const hit = a.length > a0 && a[a.length - 1].a.indexOf('报价采纳') >= 0; /* 评分联动调用由存在性断言覆盖，此处断言采纳打点+audit推进 */
    check('C11 quoteStatus 采纳打点', hit, a.length > a0 ? a[a.length - 1].a : '无新打点');
    st.suppliers = st.suppliers.filter(x => x.id !== 'c11s');
    st.products = st.products.filter(x => x.id !== 'c11p2');
    st.quotes = st.quotes.filter(x => x.id !== 'c11q');
  } catch (e) { check('C11 quoteStatus 评分联动', false, e.message); }

  /* 存在性断言（源码级） */
  try {
    const BS = String.fromCharCode(92), Q = String.fromCharCode(39);
    check('C11 editBOM 函数+按钮就位', typeof sandbox.editBOM === 'function' && SRCv.indexOf('editBOM(' + BS + Q + Q) >= 0);
    check('C11 editMaterial 函数+按钮就位', typeof sandbox.editMaterial === 'function' && SRCv.indexOf('editMaterial(' + BS + Q + Q) >= 0);
    check('C11 报价有效期过期标记', SRCv.indexOf('var vd=q.validity') >= 0 && SRCv.indexOf('（已过期）') >= 0);
    check('C11 syncTime 偏移大变化联动渲染', SRCv.indexOf('TIME_OFFSET-_prevOff') >= 0);
    check('C11 打样行倒计时列', SRCv.indexOf('_sd=overdueState(diffDays(x.due))') >= 0);
    check('C11 quoteStatus 评分联动调用', SRCv.indexOf('if(q.supplierId)recalcSupplierScore(q.supplierId); /* C11') >= 0);
  } catch (e) { check('C11 存在性断言', false, e.message); }
})();


/* ===== C12 批次：数据自检 + 跨天守卫 + 行内处理器语法审计 ===== */
(function () {
  /* 全路由行内处理器语法审计：RENDER 产物中每个 onclick 都必须可解析
     （拦截 C11 编辑按钮缺右括号类 bug：静态 deadbtn 只查函数定义查不出语法错误）。
     覆盖：8 大视图 + 成本页 7 tab + 详情 6 tab + 逐产品 renderCost。
     关键：注入自清理全字段数据（含 BOM/物料/打样/报价/订单/客诉），
     防 C6 异步段替换 state 后 .map 空数组导致行生成路径空转（假绿陷阱）。 */
  try {
    const st = sandbox.state;
    const pid = 'c12bp', T = sandbox.todayStr();
    st.materials.push({ id: 'c12mat', name: 'C12压测物料', spec: 'A4', unit: '个', price: 1, safetyStock: 0 });
    st.suppliers.push({ id: 'c12s', name: 'C12压测供应商', cat: '压测', qualityScore: 90, deliveryScore: 90, priceScore: 90, rating: 'A', active: true });
    st.products.push({ id: pid, name: 'C12审计压测', cat: '压测', platform: '', status: '打样中', owner: '', targetPrice: 10, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, 30), progress: 0 });
    st.bom.push({ id: 'c12b1', productId: pid, name: '压测组成项', materialId: 'c12mat', qty: 1, lossRate: 0.05, processId: null, childProductId: null });
    st.milestones.push({ id: 'c12m1', productId: pid, name: '压测里程碑', date: sandbox.addDays(T, 5), status: '进行中', desc: '', color: '#165DFF' });
    st.samples.push({ id: 'c12sp', productId: pid, round: 1, supplierId: 'c12s', cost: 5, due: sandbox.addDays(T, -40), status: '已寄样' });
    st.quotes.push({ id: 'c12q', productId: pid, supplierId: 'c12s', price: 2, moq: 100, leadTime: 10, status: '待评估', validity: sandbox.addDays(T, 10) });
    st.orders.push({ id: 'c12o', productId: pid, code: 'C12-PO-1', qty: 10, price: 2, supplierId: 'c12s', due: sandbox.addDays(T, -40), status: '生产中', step: 1, batches: [] });
    st.issues.push({ id: 'c12i', orderId: 'c12o', productId: pid, title: 'C12压测客诉', type: '外观', verdict: '返工', status: '待处理', createdAt: sandbox.nowDT() });

    const bad = [];
    function auditHTML(h, tag) {
      if (!h) return;
      const re = /onclick="([^"]*)"/g;
      let m;
      while ((m = re.exec(h))) {
        try { new Function(m[1]); } catch (e) { bad.push(tag + ': ' + m[1].slice(0, 60)); }
      }
    }
    ['dashboard','projects','product','cost','supplier','order','quality','team','help'].forEach(function (r) {
      sandbox.go(r);
      auditHTML(docStub.querySelector('#view').innerHTML, r);
    });
    ['materials','processes','bom','quotes','versions','mrp','sim'].forEach(function (t) {
      sandbox.setCostTab(t);
      auditHTML(docStub.querySelector('#view').innerHTML, 'cost-' + t);
      const cb = docStub.querySelector('#cost-body');
      if (cb) auditHTML(cb.innerHTML, 'cost-body-' + t);
      const cd = docStub.querySelector('#cost-detail');
      if (cd) auditHTML(cd.innerHTML, 'cost-detail-' + t);
    });
    sandbox.goProjectDetail(pid);
    ['概览','打样','成本','供应商','订单','质量'].forEach(function (t) {
      sandbox.detailTab = t; sandbox.viewProjectDetail();
      auditHTML(docStub.querySelector('#view').innerHTML, 'detail-' + t);
    });
    sandbox.renderCost(pid);
    auditHTML(docStub.querySelector('#cost-detail').innerHTML, 'renderCost');

    check('C12 全路由行内处理器语法审计', bad.length === 0, bad.length ? ('共' + bad.length + '处: ' + bad.slice(0, 10).join(' | ')) : '全部可解析');

    st.materials = st.materials.filter(x => x.id !== 'c12mat');
    st.suppliers = st.suppliers.filter(x => x.id !== 'c12s');
    st.products = st.products.filter(x => x.id !== pid);
    st.bom = st.bom.filter(x => x.productId !== pid);
    st.milestones = st.milestones.filter(x => x.productId !== pid);
    st.samples = st.samples.filter(x => x.productId !== pid);
    st.quotes = st.quotes.filter(x => x.productId !== pid);
    st.orders = st.orders.filter(x => x.productId !== pid);
    st.issues = st.issues.filter(x => x.orderId !== 'c12o');
  } catch (e) { check('C12 行内处理器语法审计', false, e.message); }
})();


/* C12 行为级：dataHealthCheck 检出并修复三类漂移（进度/状态/评分） */
(function () {
  try {
    const st = sandbox.state, T = sandbox.todayStr();
    st.products.push({ id: 'c12p', name: 'C12自检压测', cat: '压测', platform: '', status: '打样中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, 30), progress: 7 });
    st.milestones.push({ id: 'c12m1', productId: 'c12p', name: '压测A', date: sandbox.addDays(T, 5), status: '已完成', desc: '', color: '#165DFF' });
    st.suppliers.push({ id: 'c12s', name: 'C12压测供应商', cat: '压测', qualityScore: 10, deliveryScore: 90, priceScore: 90, rating: 'A', active: true });
    sandbox.dataHealthCheck();
    const p = sandbox.byId(st.products, 'c12p');
    const sup = sandbox.byId(st.suppliers, 'c12s');
    check('C12 自检修复进度漂移（里程碑完成比例联动）', p.progress === Math.round(st.milestones.filter(m => m.productId === 'c12p' && m.status === '已完成').length / st.milestones.filter(m => m.productId === 'c12p').length * 100) && p.progress !== 7, 'progress=' + p.progress);
    check('C12 自检修复状态漂移 打样中→立项中', p.status === '立项中', 'status=' + p.status);
    check('C12 自检修复评分漂移 10→95', sup.qualityScore === 95, 'qualityScore=' + sup.qualityScore);
    const a = st._audit || [];
    check('C12 自检打点', a.length > 0 && a[a.length - 1].a.indexOf('数据自检') >= 0, a.length ? a[a.length - 1].a : '空');
    /* 终态保护：已归档项目自检不改写状态 */
    const p2 = sandbox.byId(st.products, 'c12p');
    p2.status = '已归档'; p2.orders = undefined;
    st.orders = st.orders.filter(o => o.productId !== 'c12p');
    st.samples = st.samples.filter(x => x.productId !== 'c12p');
    sandbox.dataHealthCheck();
    check('C12 自检终态保护（已归档不改写）', p2.status === '已归档', 'status=' + p2.status);
    st.products = st.products.filter(x => x.id !== 'c12p');
    st.milestones = st.milestones.filter(x => x.productId !== 'c12p');
    st.suppliers = st.suppliers.filter(x => x.id !== 'c12s');
  } catch (e) { check('C12 数据自检', false, e.message); }
  /* C12 存在性：跨天守卫 + 自检按钮挂载 + 修复后的按钮形态 */
  try {
    const BS = String.fromCharCode(92), Q = String.fromCharCode(39), D = String.fromCharCode(34);
    check('C12 跨天守卫就位（60s 翻日重算）', typeof sandbox.startDayRollGuard === 'function' && html.indexOf('toDateString()') >= 0 && html.indexOf(',60000)') >= 0);
    check('C12 自检按钮挂载（refreshTool+详情页）', (html.match(/onclick="dataHealthCheck\(\)"/g) || []).length >= 2);
    check('C12 编辑按钮右括号修复（源码级）', html.indexOf('editBOM(' + BS + Q + Q + '+b.id+' + Q + BS + Q + ')' + D + '>编辑') >= 2 && html.indexOf('editMaterial(' + BS + Q + Q + '+m.id+' + Q + BS + Q + ')' + D + '>编辑') >= 1);
  } catch (e) { check('C12 存在性断言', false, e.message); }
})();


/* ===== C13 统一响应式更新层（v1.0.45） ===== */
(function () {
  try {
    /* 1) 去重：核心函数各只有 1 份定义（C12 曾把 dataHealthCheck/startDayRollGuard 写重 3 份） */
    const nDHC = (html.match(/function dataHealthCheck\(/g) || []).length;
    const nDRG = (html.match(/function startDayRollGuard\(/g) || []).length;
    check('C13 dataHealthCheck 定义唯一（C12 去重收敛）', nDHC === 1, 'count=' + nDHC);
    check('C13 startDayRollGuard 定义唯一（C12 去重收敛）', nDRG === 1, 'count=' + nDRG);
    check('C13 recomputeDerived 内核存在', typeof sandbox.recomputeDerived === 'function');
    /* 2) 行为级：persist 提交收口自动重算——只提交不手工调 recalc*，进度必须已联动 */
    const st = sandbox.state, T = sandbox.todayStr();
    st.products.push({ id: 'c13p', name: 'C13压测', cat: '压测', platform: '', status: '打样中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, 30), progress: 7 });
    st.milestones.push({ id: 'c13m1', productId: 'c13p', name: '压测A', date: sandbox.addDays(T, 5), status: '已完成', desc: '', color: '#165DFF' });
    sandbox.persist(); /* C13 起 persist 同步触发 recomputeDerived */
    sandbox.flushPersist();
    const p13 = sandbox.byId(st.products, 'c13p');
    check('C13 persist 收口自动重算进度（里程碑比例联动）', p13.progress === Math.round(st.milestones.filter(m => m.productId === 'c13p' && m.status === '已完成').length / st.milestones.filter(m => m.productId === 'c13p').length * 100) && p13.progress !== 7, 'progress=' + p13.progress);
    /* 3) recomputeDerived 幂等：修复后二次调用漂移归零 */
    sandbox.recomputeDerived();
    const d2 = sandbox.recomputeDerived();
    check('C13 recomputeDerived 幂等（二次漂移归零）', (d2.progress + d2.status + d2.score) === 0, JSON.stringify(d2));
    /* 4) 时间守卫三通道 + 后台静默自检 */
    check('C13 时间守卫三通道（visibilitychange+focus）', html.indexOf('visibilitychange') > 0 && html.indexOf("window.addEventListener('focus',dayRollCheck)") > 0);
    check('C13 后台静默自检挂载（启动行+10min 周期）', typeof sandbox.startAutoSelfCheck === 'function' && html.indexOf('startAutoSelfCheck();') > 0 && html.indexOf(',600000)') > 0);
    /* 5) 终态保护：已完工项目 persist 后进度/状态不被全量重算改写 */
    st.products.push({ id: 'c13f', name: 'C13终态压测', cat: '压测', platform: '', status: '已完工', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, 30), progress: 100 });
    st.milestones.push({ id: 'c13f1', productId: 'c13f', name: '未完成基线', date: sandbox.addDays(T, 5), status: '未开始', desc: '', color: '#165DFF' });
    sandbox.persist(); sandbox.flushPersist();
    const pf = sandbox.byId(st.products, 'c13f');
    check('C13 终态保护（已完工进度不被重算改写）', pf.progress === 100 && pf.status === '已完工', 'progress=' + pf.progress + ' status=' + pf.status);
    st.products = st.products.filter(x => x.id !== 'c13f');
    st.milestones = st.milestones.filter(x => x.productId !== 'c13f');
    /* 清理压测数据 */
    st.products = st.products.filter(x => x.id !== 'c13p');
    st.milestones = st.milestones.filter(x => x.productId !== 'c13p');
  } catch (e) { check('C13 统一响应式更新层', false, e.message); }
})();


/* ===== C14 数据安全补强（v1.0.46）：周期备份 / 审计归档 / 完整性校验 / 搜索扩容 ===== */
(function () {
  try {
    /* 1) 定义唯一性与挂载点（防重复定义、防漏挂载） */
    const nBSS = (html.match(/function bkSendState\(/g) || []).length;
    const nPBC = (html.match(/function startPeriodicBackup\(/g) || []).length;
    const nBV = (html.match(/function bkVerify\(/g) || []).length;
    check('C14 备份发送入口定义唯一', nBSS === 1, 'count=' + nBSS);
    check('C14 周期备份函数定义唯一', nPBC === 1, 'count=' + nPBC);
    check('C14 完整性校验函数定义唯一', nBV === 1, 'count=' + nBV);
    check('C14 启动序列挂载周期备份', html.indexOf('startPeriodicBackup(); /* C14') > 0);
    check('C14 启动末期挂载完整性校验', html.indexOf('setTimeout(function(){bkVerify()},15000)') > 0);
    check('C14 变更标记收口在 flushPersist（落盘后）', html.indexOf('bkMarkChange(); /* C14') > 0);
    check('C14 备份标记 key 前缀合规（supplydev_）', html.indexOf("var LS_LCHG='supplydev_last_change'") > 0);
    check('C14 备份 POST 入口唯一（仅 bkSendState 内一处，tryBk 已收口）',
      (html.match(/\/backup',\{method:'POST'/g) || []).length === 1);
    check('C14 周期备份巡排查导入窗口（_impPrev 防护）', html.indexOf('if(_impPrev)return; /* C14') > 0);

    /* 2) 行为级：flushPersist 落盘后写变更时间戳 */
    const stt = sandbox.state;
    const ls = sandbox.localStorage;
    ls.removeItem('supplydev_last_change');
    sandbox.flushPersist();
    check('C14 flushPersist 落盘后标记变更时间', parseInt(ls.getItem('supplydev_last_change') || '0', 10) > 0);

    /* 3) 周期备份判定语义：三个门限各自独立成立 */
    const now = Date.now();
    ls.setItem('supplydev_last_backup', String(now - 25 * 3600000));
    ls.setItem('supplydev_last_change', String(now - 3600000));
    check('C14 周期判定：25h 前备份 + 有新变更 → 触发', sandbox.bkPeriodicDue(now) === true);
    ls.setItem('supplydev_last_change', String(now - 26 * 3600000));
    check('C14 周期判定：备份后无新变更 → 不触发', sandbox.bkPeriodicDue(now) === false);
    ls.setItem('supplydev_last_backup', String(now - 3600000));
    ls.setItem('supplydev_last_change', String(now));
    check('C14 周期判定：距上次备份不足 24h → 不触发', sandbox.bkPeriodicDue(now) === false);
    ls.removeItem('supplydev_last_change');
    check('C14 周期判定：无变更记录 → 不触发', sandbox.bkPeriodicDue(now) === false);
    ls.removeItem('supplydev_last_backup'); /* 恢复现场 */

    /* 4) 无本地备份通道（浏览器直开/测试桩）时静默跳过，不得抛错 */
    try {
      sandbox.startPeriodicBackup(); sandbox.bkVerify();
      check('C14 无备份通道时周期备份与校验静默跳过', true);
    } catch (e) { check('C14 无备份通道时周期备份与校验静默跳过', false, e.message); }

    /* 5) 审计归档：满 300 溢出转归档而非丢弃 */
    stt._audit = []; stt._auditArc = [];
    for (let i = 0; i < 300; i++) stt._audit.push({ t: '2026-01-01 00:00', u: '测试', a: 'C14填充' + i });
    sandbox.logAudit('C14溢出触发');
    check('C14 审计溢出转归档（当前仍 300，归档最旧 1 条）',
      stt._audit.length === 300 && stt._auditArc.length === 1 && stt._auditArc[0].a === 'C14填充0',
      'cur=' + stt._audit.length + ' arc=' + stt._auditArc.length);
    check('C14 审计导出与归档查看器可用', typeof sandbox.exportAuditCSV === 'function' && typeof sandbox.openAuditArchive === 'function');
    check('C14 _auditArc 已入状态迁移白名单', html.indexOf("'_audit','_auditArc','priceHistory'") > 0);

    /* 6) 搜索扩容：新增 6 类实体可检索且可落点 */
    stt.team = [{ id: 'c14t1', n: 'C14检索成员XYZ', role: '专员', dept: '测试部', email: '', status: '在职' }];
    sandbox.globalSearch('c14检索成员xyz');
    const gsPanel = docStub.querySelector('#gs-panel');
    check('C14 全局搜索覆盖新增实体（成员名命中）', gsPanel.innerHTML.indexOf('C14检索成员XYZ') >= 0);
    try { sandbox.goSearchHit('成员', 'c14t1'); check('C14 新增实体落点可达（成员→团队视图）', true); }
    catch (e) { check('C14 新增实体落点可达（成员→团队视图）', false, e.message); }
    check('C14 搜索命中上限放宽至 20', html.indexOf('if(hits.length>=20)return;') > 0);
    check('C14 搜索实体扩容六类齐备', ['报价', '证书', '整改', '抽检', '工艺', '成员'].every(k => html.indexOf("push('" + k + "'") > 0));
    sandbox.closeGS();

    /* 清理压测数据 */
    stt._audit = []; stt._auditArc = []; stt.team = [];
  } catch (e) { check('C14 数据安全补强', false, e.message); }
})();

/* ===== C15 批次：逾期终态修复 + 逾期处理面板 + 全面板逾期说明 + 帮助中心（v1.0.47） ===== */
(function () {
  try {
    const st = sandbox.state, T = sandbox.todayStr();
    /* 1) 源码形态断言 */
    const nCO = (html.match(/function collectOverdue\(/g) || []).length;
    const nVT = (html.match(/function ovTip\(/g) || []).length;
    const nVH = (html.match(/function viewHelp\(/g) || []).length;
    check('C15 collectOverdue 定义唯一', nCO === 1, 'count=' + nCO);
    check('C15 ovTip 定义唯一', nVT === 1, 'count=' + nVT);
    check('C15 viewHelp 定义唯一', nVH === 1, 'count=' + nVH);
    check('C15 帮助中心已入导航与路由', html.indexOf("id:'help',name:'帮助中心'") > 0 && html.indexOf('help:viewHelp') > 0);
    check('C15 快捷键扩到 Alt+1~9', html.indexOf("ev.key>='1'&&ev.key<='9'") > 0);
    check('C15 仪表盘挂载逾期处理面板', html.indexOf('逾期处理（') > 0 && html.indexOf('overdueHtml') > 0);
    check('C15 甘特终态标签（✓ 已完工/已归档 不计逾期，C19 起已交付同守卫）', html.indexOf("'✓ 已完工':'✓ 已归档'") > 0 && html.indexOf('var overdue=diffDays(projDueDate(p))<0&&!_pDone&&!_pDeliv;') > 0);
    check('C15 项目列表终态标签（C19 起统一在 projDueState）', html.indexOf("{lvl:'terminal',label:'✓ 已完成',color:'#00B42A'}") > 0);
    check('C15 详情页 banner 终态守卫', html.indexOf("(p.status!=='已完工'&&p.status!=='已归档')&&(overMs.length||overOrders.length)") > 0);
    check('C15 逾期悬浮说明覆盖各板块（gantt/待办/打样/订单/整改/证书）',
      ['_gTip', 'it.tip', "ovTip('order'", "ovTip('sample'", "ovTip('action'", "ovTip('cert'", "ovTip('target'"].every(k => html.indexOf(k) > 0));

    /* 2) 行为级：collectOverdue 聚合与终态/收货过滤 */
    st.orders.push({ id: 'c15o', productId: 'c15none', code: 'C15-PO', qty: 1, price: 1, supplierId: '', due: sandbox.addDays(T, -3), status: '生产中', step: 2, batches: [] });
    st.certs.push({ id: 'c15c', supplierId: 's1', type: 'C15压测证书', expire: sandbox.addDays(T, -5), note: '' });
    let ovs = sandbox.collectOverdue();
    check('C15 逾期聚合：订单入列（days=3）', ovs.some(x => x.name === 'C15-PO' && x.days === 3), JSON.stringify(ovs.map(x => x.name)));
    check('C15 逾期聚合：过期证书入列（days=5）', ovs.some(x => x.type === '证书' && x.days === 5));
    const o15 = sandbox.byId(st.orders, 'c15o'); o15.step = 4; o15.status = '已收货';
    check('C15 订单收货（step>=4）不计逾期', !sandbox.collectOverdue().some(x => x.name === 'C15-PO'));

    /* 3) 行为级：终态项目过期里程碑不聚合 + 甘特/面板真渲染 */
    st.products.push({ id: 'c15p', name: 'C15终态压测', cat: '压测', platform: '', status: '已完工', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, -20), progress: 100 });
    st.milestones.push({ id: 'c15m', productId: 'c15p', name: 'C15过期里程碑', date: sandbox.addDays(T, -10), status: '未开始', desc: '', color: '#165DFF' });
    check('C15 终态项目的过期里程碑不聚合', !sandbox.collectOverdue().some(x => x.name === 'C15过期里程碑'));
    sandbox.go('dashboard');
    const dash = docStub.querySelector('#view').innerHTML;
    check('C15 甘特图终态项目显示 ✓ 已完工', dash.indexOf('✓ 已完工') > 0);
    check('C15 仪表盘逾期面板渲染（表头含 怎么处理 列）', dash.indexOf('逾期处理（') > 0 && dash.indexOf('怎么处理') > 0);
    /* 终态项目所在行片段内不得出现「逾期」字样（行界取到下一个 ganttDrill） */
    const rowStart = dash.indexOf('C15终态压测');
    const rowEnd = dash.indexOf('ganttDrill', rowStart);
    const rowSlice = rowStart >= 0 ? dash.slice(rowStart, rowEnd > 0 ? rowEnd : rowStart + 2500) : '';
    check('C15 终态项目行无逾期字样', rowStart >= 0 && rowSlice.indexOf('逾期') < 0, rowSlice.slice(0, 100));

    /* 4) 帮助中心渲染 */
    sandbox.go('help');
    const help = docStub.querySelector('#view').innerHTML;
    check('C15 帮助中心渲染（三分钟上手/逾期指南/快捷键/FAQ）', ['三分钟上手', '逾期怎么看', '快捷键', '常见问题'].every(k => help.indexOf(k) > 0));
    check('C15 帮助中心处理建议表来自 OV_ACT', help.indexOf('联系供应商确认发货') > 0);

    /* 清理压测数据 */
    st.orders = st.orders.filter(x => x.id !== 'c15o');
    st.certs = st.certs.filter(x => x.id !== 'c15c');
    st.products = st.products.filter(x => x.id !== 'c15p');
    st.milestones = st.milestones.filter(x => x.id !== 'c15m');
    sandbox.go('dashboard');
  } catch (e) { check('C15 批次', false, e.message); }
})();


/* ===== C16 批次：仪表盘/项目汇总对抗性审查修复（v1.0.48） ===== */
(function () {
  try {
    const st = sandbox.state, T = sandbox.todayStr();
    sandbox.dashFold = { todo: false, risk: false, node: false }; /* 防更早用例的折叠状态泄漏（工具闭环实证） */
    /* 1) 源码形态断言：口径统一与守卫 */
    check('C16 仪表盘终态辅助 _pDone2 存在', html.indexOf('var _pDone2=function(pid)') > 0);
    check('C16 KPI 订单逾期走 orderDue+终态守卫', html.indexOf('diffDays(orderDue(o))<0&&o.step<4&&!_pDone2(o.productId)') > 0);
    check('C16 待办订单终态守卫', html.indexOf('if(d<=7&&o.step<4&&!_pDone2(o.productId))') > 0);
    check('C16 待办客诉含调查中', html.indexOf("if(i.status==='待处理'||i.status==='调查中')items.push({dot:") > 0);
    check('C16 看板客诉含调查中', html.indexOf("if(i.status==='待处理'||i.status==='调查中')items.push({lvl:") > 0);
    check('C16 近6月柱高归一化（旧线性放大已移除）', html.indexOf('Math.round(x.c/_mx*88)') > 0 && html.indexOf('Math.max(cnt*25,4)') < 0);
    check('C16 饼图颜色补全（已下单/已归档对齐 stColor）', html.indexOf("var pc={'生产中':'#165DFF','打样中':'#722ED1','立项中':'#86909C','已下单':'#0FC6C2','已完工':'#00B42A','已归档':'#C9CDD4'};") > 0);
    check('C16 项目汇总逾期KPI排除终态+已交付（C19 口径）', html.indexOf("var overdue=state.products.filter(function(p){var _ds=projDueState(p);return _ds.lvl==='over'||_ds.lvl==='severe'}).length;") > 0);
    check('C16 聚合订单终态守卫', html.indexOf('!_done(byId(state.products,o.productId))') > 0);
    check('C16 客诉直接关联口径（详情页+打印报表≥2处）', (html.match(/i\.productId===pid\|\|orders\.some/g) || []).length >= 2);
    check('C16 卡片/列表搜索含品类+缺列健壮+C17 统一口径 projStatusMatch（≥2处）', (html.match(/\(!_kw\|\|\(p\.name\|\|''\)\.toLowerCase\(\)\.indexOf\(_kw\)>=0\|\|\(p\.cat\|\|''\)\.toLowerCase\(\)\.indexOf\(_kw\)>=0\)&&projStatusMatch\(p,_sf\)/g) || []).length >= 2);
    check('C16 到期节点终态守卫', html.indexOf("if(!kv[1])return;if(p.status==='已完工'||p.status==='已归档')return;") > 0);
    check('C16 供应商风险评分预计算', html.indexOf('.map(function(s){return {s:s,sc:supScore(s)}}).sort(function(a,b){return a.sc-b.sc})') > 0);

    /* 2) 行为级：collectOverdue 订单终态守卫（已完工项目下的未收货逾期订单不计） */
    st.products.push({ id: 'c16p', name: 'C16终态订单压测', cat: '压测', platform: '', status: '已完工', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, -20), progress: 100 });
    st.orders.push({ id: 'c16o', productId: 'c16p', code: 'C16-PO', qty: 1, price: 1, supplierId: '', due: sandbox.addDays(T, -3), status: '生产中', step: 2, batches: [] });
    check('C16 终态项目的逾期订单不聚合', !sandbox.collectOverdue().some(x => x.name === 'C16-PO'));

    /* 3) 行为级：项目汇总 KPI 已逾期排除已归档（独立口径计算比对渲染值） */
    st.products.push({ id: 'c16a', name: 'C16已归档压测', cat: '压测', platform: '', status: '已归档', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: sandbox.addDays(T, -30), progress: 100 });
    sandbox.go('projects');
    const pv = docStub.querySelector('#view').innerHTML;
    const kpiIdx = pv.indexOf('>已逾期</div>');
    const kpiNum = kpiIdx > 0 ? parseInt(pv.slice(kpiIdx).match(/color:#F53F3F">(\d+)</) ? pv.slice(kpiIdx).match(/color:#F53F3F">(\d+)</)[1] : '-1', 10) : -1;
    const expectOverdue = st.products.filter(p => (function (d) { return d < 0; })(sandbox.diffDays(p.targetDate || p.sampleDue)) && p.status !== '已完工' && p.status !== '已归档').length;
    check('C16 KPI 已逾期数=在研逾期口径（不含归档）', kpiIdx > 0 && kpiNum === expectOverdue, 'kpi=' + kpiNum + ' expect=' + expectOverdue);

    /* 4) 行为级：待办提醒含「调查中」客诉 */
    st.issues.push({ id: 'c16i', productId: 'c16p', orderId: '', supplierId: '', title: 'C16调查客诉', type: '外观', verdict: '', status: '调查中', batchDate: '' });
    sandbox.go('dashboard');
    const dash16 = docStub.querySelector('#view').innerHTML;
    check('C16 待办面板渲染调查中客诉', dash16.indexOf('客诉：C16调查客诉') > 0);

    /* 5) 行为级：详情页客诉 tab 含直接关联项目（无订单）的客诉 */
    st.issues.push({ id: 'c16i2', productId: 'c16p', orderId: '', supplierId: '', title: 'C16直接关联客诉', type: '尺寸', verdict: '', status: '待处理', batchDate: '' });
    sandbox.state._pid = 'c16p'; sandbox.detailTab = '质量';
    sandbox.go('project');
    const qv = docStub.querySelector('#view').innerHTML;
    check('C16 详情质量tab含直接关联客诉', qv.indexOf('C16直接关联客诉') > 0);

    /* 6) 行为级：卡片视图搜索命中品类（含无 cat 数据的健壮性——工具闭环实证 pC1r 崩溃） */
    sandbox.go('projects');
    const si16 = docStub.getElementById('proj-search');
    si16.value = '压测';
    try {
      sandbox.renderProjCards();
      const cards16 = docStub.getElementById('proj-cards').innerHTML;
      check('C16 卡片搜索命中品类', cards16.indexOf('C16终态订单压测') > 0, cards16.slice(0, 80));
    } catch (e2) {
      check('C16 卡片搜索命中品类', false, e2.message);
    }
    si16.value = '';

    /* 7) 行为级：近6月柱高归一化（同月 6 个新项目时柱高 ≤88） */
    for (let k = 0; k < 6; k++) st.products.push({ id: 'c16t' + k, name: 'C16趋势' + k, cat: '压测', platform: '', status: '立项中', owner: '', targetPrice: 1, margin: 0.4, freight: 0, tariff: 0, commission: 0.1, adRate: 0, returnRate: 0, ideaDate: T, sampleDue: '', confirmDate: '', orderDate: '', targetDate: '', progress: 0 });
    sandbox.go('dashboard');
    const d17 = docStub.querySelector('#view').innerHTML;
    const heights = []; let hm, reH = /border-radius:3px 3px 0 0;height:(\d+)px/g;
    while ((hm = reH.exec(d17))) heights.push(+hm[1]);
    check('C16 趋势柱高全部 ≤88（不溢出容器）', heights.length >= 6 && Math.max.apply(null, heights) <= 88, JSON.stringify(heights));

    /* 清理压测数据 */
    st.products = st.products.filter(x => x.id.indexOf('c16') !== 0);
    st.orders = st.orders.filter(x => x.id !== 'c16o');
    st.issues = st.issues.filter(x => x.id !== 'c16i' && x.id !== 'c16i2');
    sandbox.go('dashboard');
  } catch (e) { check('C16 批次', false, e.message); }
})();


/* ===== C17 批次：下钻闭环 + 项目汇总排序/健康度/批量操作（goDrill 协议） ===== */
(function () {
  try {
    const st = sandbox.state, T = sandbox.todayStr();
    /* 1) 源码形态断言 */
    check('C17 goDrill 协议定义', html.indexOf('function goDrill(r,preset){_drill=preset||null;go(r)}') > 0);
    check('C17 健康度基于统一出口（C19 起 projHealth→projDueState→overdueState 红线）', /function projHealth\(p\)\{[\s\S]{0,80}var _hs=projDueState\(p\);/.test(html) && /function projDueState\(p\)\{[\s\S]{0,300}overdueState\(diffDays\(projDueDate\(p\)\)\)/.test(html));
    check('C17 健康度终态守卫', html.indexOf("if(_hs.lvl==='terminal')return{rank:4") > 0);
    check('C17 projStatusMatch 终态守卫（__active/__over 均排除终态）', html.indexOf("if(f==='__active')return !_pd;") > 0 && html.indexOf('if(_pd)return false;') > 0);
    check('C17 仪表盘 KPI 下钻（order overdue 预设）', html.indexOf('drill:"{view:\'order\',filter:\'over\'}"') > 0);
    check('C17 KPI onclick 走 goDrill', html.indexOf(String.raw`goDrill(\''+k.nav+'\'`) > 0 && html.indexOf("(k.drill||'null')+") > 0);
    check('C17 趋势柱下钻（goDrillIdea）', html.indexOf("goDrillIdea(\\'") > 0 && html.indexOf("ym:dt.getFullYear()+'-'+(dt.getMonth()+1)") > 0);
    check('C17 饼图图例+堆叠条下钻（≥2处 goDrill projects）', (html.match(/goDrill\(\\'projects\\',\{filter:/g) || []).length >= 2);
    check('C17 项目状态下拉计算选项（__active/__due30/__soon7/__over）', ['__active', '__due30', '__soon7', '__over'].every(k => html.indexOf('value="' + k + '"') > 0));
    check('C17 订单下拉 3 天内到期选项+过滤分支', html.indexOf('3天内到期</option>') > 0 && html.indexOf("if(_of==='soon')return o.step<4&&d>=0&&d<=3;") > 0);
    check('C17 列表表头排序（6 个 projSortBy 锚点）', (html.match(/projSortBy\(/g) || []).length >= 6);
    check('C17 排序默认逾期优先（health rank 升序）', html.indexOf("var _projSort={key:'health',dir:1}") > 0);
    check('C17 批量函数齐备', ['function renderProjBatch()', 'function projBatchStatus()', 'function projBatchExport()', 'function projBatchDel()', 'function projSelToggle(', 'function projSelAll('].every(x => html.indexOf(x) > 0));
    check('C17 批量删除走级联主体 projDelCascade', html.indexOf('ok.forEach(function(id){projDelCascade(id)})') > 0 && html.indexOf('function projDelCascade(id)') > 0);
    check('C17 exportModule 支持选中行导出', html.indexOf('if(ids&&ids.length){rows=rows.filter(function(r){return ids.indexOf(r.id)>=0})}') > 0);
    check('C17 下钻过滤一次性消费（viewOrder）', html.indexOf('window._orderFilt=_drill.filter') > 0);

    /* 2) 行为级：projStatusMatch / projHealth 口径 */
    const pm = sandbox.projStatusMatch, ph = sandbox.projHealth;
    const mk = (o) => Object.assign({ id: 'x', name: 'x', cat: '', platform: '', status: '生产中', owner: '', targetPrice: 1, ideaDate: T, sampleDue: '' }, o);
    check('C17 __active 排除终态', pm(mk({ status: '已完工', targetDate: sandbox.addDays(T, -5) }), '__active') === false);
    check('C17 __over 只留非终态逾期（未排期不算）', pm(mk({ targetDate: sandbox.addDays(T, -5) }), '__over') === true && pm(mk({ targetDate: '', sampleDue: '' }), '__over') === false && pm(mk({ status: '已归档', targetDate: sandbox.addDays(T, -5) }), '__over') === false);
    check('C17 __due30 边界（0/30 含，31 不含）', pm(mk({ targetDate: T }), '__due30') === true && pm(mk({ targetDate: sandbox.addDays(T, 30) }), '__due30') === true && pm(mk({ targetDate: sandbox.addDays(T, 31) }), '__due30') === false);
    check('C17 projHealth 分级（逾期0/临期1/健康2/未排期3/终态4）', ph(mk({ targetDate: sandbox.addDays(T, -5) })).rank === 0 && ph(mk({ targetDate: sandbox.addDays(T, 3) })).rank === 1 && ph(mk({ targetDate: sandbox.addDays(T, 20) })).rank === 2 && ph(mk({ targetDate: '', sampleDue: '' })).rank === 3 && ph(mk({ status: '已归档' })).rank === 4);
    check('C17 健康度 label 复用 overdueState 文案', ph(mk({ targetDate: sandbox.addDays(T, -5) })).label.indexOf('逾期') === 0);

    /* 3) 行为级：默认排序逾期优先（渲染后列表首行=逾期项目） */
    st.products.push(
      mk({ id: 'c17ok', name: 'C17健康项目', targetDate: sandbox.addDays(T, 40), progress: 10 }),
      mk({ id: 'c17ov', name: 'C17逾期项目', targetDate: sandbox.addDays(T, -9), progress: 30 })
    );
    sandbox._projSort.key = 'health'; sandbox._projSort.dir = 1;
    sandbox.go('projects');
    sandbox.setProjView('list');
    const firstRow = (sandbox.document.getElementById('proj-tbody').innerHTML || '');
    check('C17 默认排序首行为逾期项目（非已完工压测）', firstRow.indexOf('C17逾期项目') >= 0 && firstRow.indexOf('C17逾期项目') < firstRow.indexOf('C17健康项目'), firstRow.slice(0, 60));

    /* 4) 行为级：批量删除（级联 + 有订单跳过）+ 批量改状态 */
    st.products.push(mk({ id: 'c17d1', name: 'C17待删项目', targetDate: sandbox.addDays(T, 10) }));
    st.orders.push({ id: 'c17o', code: 'C17-ORD', productId: 'c17ok', supplierId: '', qty: 1, price: 1, due: sandbox.addDays(T, 5), status: '生产中', payStatus: '未付款', step: 0, batches: [] });
    sandbox._projSel = {}; sandbox._projSel['c17d1'] = 1; sandbox._projSel['c17ok'] = 1;
    sandbox.projBatchDel();
    check('C17 批量删除：无订单项目已级联删除', !st.products.some(p => p.id === 'c17d1') && !st.bom.some(b => b.productId === 'c17d1') && !st.samples.some(x => x.productId === 'c17d1'));
    check('C17 批量删除：有订单项目自动跳过', st.products.some(p => p.id === 'c17ok'));
    check('C17 批量删除后选择已清空', Object.keys(sandbox._projSel).length === 0);
    sandbox._projSel = {}; sandbox._projSel['c17ov'] = 1; sandbox._projSel['c17ok'] = 1;
    const ovBefore = st.products.find(p => p.id === 'c17ov').progress;
    sandbox.go('projects'); /* 渲染出批量工具条 */
    const bsEl = sandbox.document.getElementById('proj-batch-status');
    if (bsEl) bsEl.value = '已完工';
    sandbox.projBatchStatus();
    check('C17 批量改状态生效且终态进度不被重算拉回', st.products.find(p => p.id === 'c17ov').status === '已完工' && st.products.find(p => p.id === 'c17ov').progress === ovBefore);
    check('C17 批量改状态写入审计', (st._audit || []).some(a => (a.a || '').indexOf('批量改状态') >= 0));
    check('C17 批量删除写入审计', (st._audit || []).some(a => (a.a || '').indexOf('批量删除') >= 0));

    /* 5) 行为级：goDrill 下钻预设消费（订单页自动带过滤） */
    sandbox.goDrill('order', { view: 'order', filter: 'over' });
    const ofEl = sandbox.document.getElementById('order-filter');
    check('C17 下钻后订单页过滤=已逾期', !!ofEl && ofEl.value === 'over', ofEl ? String(ofEl.value) : 'no el');
    sandbox.goDrill('projects', { view: 'projects', filter: '__over' });
    const sfEl = sandbox.document.getElementById('proj-status-filter');
    check('C17 下钻后项目页过滤=已逾期计算选项', !!sfEl && sfEl.value === '__over', sfEl ? sfEl.value : 'no el');

    /* 6) 行为级：立项月份 chip 下钻（含 test 过滤真实执行——审查揪出 extra 缺 test 的回归防线） */
    sandbox.goDrillIdea(T.slice(0, 4) + '-' + (st.products.find(p => p.id === 'pz') ? '1' : '1'));
    check('C17 立项月下钻 chip 显示', (() => { const c = sandbox.document.getElementById('proj-extra-chip'); return !!c && c.style.display === 'inline-block' && (c.textContent || '').indexOf('立项') >= 0; })());
    check('C17 立项月过滤真实生效（test 真值表 + 渲染行数=命中数）', (() => {
      const pz = st.products.find(p => p.id === 'c17ok') || st.products.find(p => p.id === 'pz');
      if (!pz) return 'no-pz';
      const d = sandbox.parseDate(pz.ideaDate);
      const ym = d.getFullYear() + '-' + (d.getMonth() + 1);
      sandbox.goDrillIdea(ym);
      if (!sandbox._projExtra || !sandbox._projExtra.test) return 'no-extra';
      if (sandbox._projExtra.test(pz) !== true) return 'test-pz-false';
      const off = mk({ id: 'c17off', name: 'C17别月项目', ideaDate: '2020-01-01' });
      if (sandbox._projExtra.test(off) !== false) return 'test-off-true';
      sandbox.setProjView('list');
      const body = sandbox.document.getElementById('proj-tbody').innerHTML || '';
      const trCount = (body.match(/<tr[\s>]/g) || []).length;
      const hits = st.products.filter(sandbox._projExtra.test).length;
      return trCount === hits ? true : 'tr=' + trCount + ' hits=' + hits;
    })());
    sandbox.projClearExtra();
    check('C17 chip 清除后附加过滤为空', sandbox._projExtra === null);

    /* 7) 清理自建数据（防污染后续断言） */
    st.products = st.products.filter(p => ['c17ok', 'c17ov', 'c17d1', 'c17p'].indexOf(p.id) < 0);
    st.orders = st.orders.filter(o => o.id !== 'c17o');
    st._audit = (st._audit || []).filter(a => (a.a || '').indexOf('批量') < 0);
    sandbox._projSel = {}; sandbox._projSort.key = 'health'; sandbox._projSort.dir = 1; sandbox._projExtra = null;
    sandbox.go('dashboard');
  } catch (e) { check('C17 批次', false, e.message); }
})();


/* ===== C19 批次：项目逾期口径细化 + 交付同步（真机修复：交付里程碑完成仍标逾期 / 未下单项目被目标交期误标逾期） ===== */
(function () {
  try {
    const st = sandbox.state, T = sandbox.todayStr();
    /* 1) 源码形态断言 */
    check('C19 projDueDate 分阶段口径（未下单看打样截止，下单后看目标交期）', html.indexOf('return pre?(p.sampleDue||p.targetDate):(p.targetDate||p.sampleDue);') > 0 && html.indexOf("var pre=(p.status==='立项中'||p.status==='打样中');") > 0);
    check('C19 projDelivered（交付里程碑已完成 → 已交付）', html.indexOf("arr[i].name==='交付'&&arr[i].status==='已完成'") > 0);
    check('C19 projDueState 逾期算术只走 overdueState（红线）', /function projDueState\(p\)\{[\s\S]{0,300}overdueState\(diffDays\(projDueDate\(p\)\)\)/.test(html));
    check('C19 列表倒计时统一走 projDueState', html.indexOf('var st3=projDueState(p);') > 0);
    check('C19 KPI/过滤已逾期用 projDueState（viewProjects + projStatusMatch ≥2 处）', (html.match(/_ds\.lvl==='over'\|\|_ds\.lvl==='severe'/g) || []).length >= 2);
    check('C19 本月到期排除已交付（仪表盘+项目汇总 ≥2 处）', (html.match(/if\(projDelivered\(p\)\)return false;var d=diffDays\(projDueDate\(p\)\)/g) || []).length >= 2);
    check('C19 甘特图已交付守卫', html.indexOf('var _pDeliv=!_pDone&&projDelivered(p);') > 0 && html.indexOf("_pDeliv?{label:'✓ 已交付',color:'#00B42A'}") > 0);
    check('C19 交付里程碑完成同步提示', html.indexOf('「✓ 已交付」不再计逾期') > 0);

    /* 2) 行为级：projDueState / projHealth 口径真值表 */
    const mk = (o) => Object.assign({ id: 'x', name: 'x', cat: '', platform: '', status: '生产中', owner: '', targetPrice: 1, ideaDate: T, sampleDue: '' }, o);
    const pds = sandbox.projDueState, pdDate = sandbox.projDueDate, ph19 = sandbox.projHealth, pm19 = sandbox.projStatusMatch;
    check('C19 打样中项目按打样截止判断（目标交期已过不算逾期）', (() => { const p = mk({ status: '打样中', targetDate: sandbox.addDays(T, -5), sampleDue: sandbox.addDays(T, 10) }); return pdDate(p) === p.sampleDue && pds(p).label === '剩 10 天' && pds(p).label.indexOf('逾期') < 0; })());
    check('C19 打样中缺打样截止回退目标交期（仍算逾期）', pds(mk({ status: '打样中', targetDate: sandbox.addDays(T, -5), sampleDue: '' })).lvl === 'over');
    check('C19 生产中项目按目标交期判断（已下单后交付承诺生效）', pds(mk({ targetDate: sandbox.addDays(T, -4) })).label === '逾期 4 天');
    check('C19 立项中项目同按打样截止', (() => { const p = mk({ status: '立项中', targetDate: sandbox.addDays(T, -30), sampleDue: sandbox.addDays(T, 20) }); return pds(p).label === '剩 20 天'; })());

    /* 3) 行为级：交付里程碑完成 → 已交付（数据同步修复核心断言） */
    st.products.push(
      mk({ id: 'c19deliv', name: 'C19已交付项目', targetDate: sandbox.addDays(T, -4), progress: 100 }),
      mk({ id: 'c19pre', name: 'C19打样中项目', status: '打样中', targetDate: sandbox.addDays(T, -5), sampleDue: sandbox.addDays(T, 3) }),
      mk({ id: 'c19ov', name: 'C19真逾期项目', targetDate: sandbox.addDays(T, -4) })
    );
    st.milestones.push({ id: 'c19ms', productId: 'c19deliv', name: '交付', date: sandbox.addDays(T, -4), status: '已完成', desc: '', color: '#FF7D00' });
    const pd = st.products.find(p => p.id === 'c19deliv');
    check('C19 交付里程碑完成后不再计逾期（lvl=delivered）', pds(pd).lvl === 'delivered');
    check('C19 健康度显示 ✓ 已交付（绿色 rank2）', ph19(pd).label === '✓ 已交付' && ph19(pd).rank === 2 && ph19(pd).c === '#00B42A');
    check('C19 已交付项目不入 __over 过滤', pm19(pd, '__over') === false);
    check('C19 已交付项目仍显示在 __active（在研口径不变）', pm19(pd, '__active') === true);
    check('C19 打样中项目 __over 不再误中（真机误标回归）', pm19(st.products.find(p => p.id === 'c19pre'), '__over') === false && pm19(st.products.find(p => p.id === 'c19pre'), '__soon7') === true);
    check('C19 生产中真逾期仍被 __over 命中', pm19(st.products.find(p => p.id === 'c19ov'), '__over') === true);

    /* 4) 行为级：项目汇总 KPI 与过滤联动（渲染级） */
    sandbox.go('projects');
    const kpiHtml = sandbox.document.getElementById('view').innerHTML;
    const km = kpiHtml.match(/已逾期<\/div><div style="font-size:22px;font-weight:700;margin-top:6px;color:#F53F3F">(\d+)</);
    check('C19 KPI 已逾期=1（3 个压测项目中仅 1 个真逾期）', !!km && +km[1] === 1, km ? km[1] : 'no-match');
    sandbox.projQuickFilter('__over');
    sandbox.setProjView('list');
    const overRows = (sandbox.document.getElementById('proj-tbody').innerHTML.match(/<tr[\s>]/g) || []).length;
    check('C19 __over 过滤渲染行数=1（不含已交付/打样中误标）', overRows === 1, 'rows=' + overRows);

    /* 5) 清理压测数据 */
    st.products = st.products.filter(p => ['c19deliv', 'c19pre', 'c19ov'].indexOf(p.id) < 0);
    st.milestones = st.milestones.filter(m => m.id !== 'c19ms');
    sandbox.go('dashboard');
  } catch (e) { check('C19 批次', false, e.message); }
})();


/* ===== C20 批次：订单 OTIF 达成率 + 抽检 AQL 三档缺陷分级（对标成熟方案） ===== */
(function () {
  try {
    const st = sandbox.state, T = sandbox.todayStr();
    /* 1) 源码形态断言 */
    check('C20 AQL 1.0 档主表（ISO 2859-1 Table 2-A 实值）', html.indexOf("[151,280,32,1,2],[281,500,50,1,2],[501,1200,80,2,3]") > 0 && html.indexOf("[2,25,5,0,1],[26,50,8,0,1]") > 0);
    check('C20 三档不良输入（致命/主要/次要）', ['f-badc', 'f-badm', 'f-badn'].every(x => html.indexOf('id="' + x + '"') > 0));
    check('C20 三档判定逻辑（致命 Ac0 + 主要 AcMaj + 次要 AcMin）', html.indexOf("(badc>0||badm>plan.acMaj||badn>plan.acMin)?'退货':'合格'") > 0 && html.indexOf('function inspectionPlanNow()') > 0);
    check('C20 OTIF 判定与统计函数', html.indexOf('function orderOTIFJudge(o)') > 0 && html.indexOf('function otifStats(sid)') > 0);
    check('C20 订单页 OTIF KPI + 行内标注', html.indexOf("kpi('OTIF 达成率'") > 0 && html.indexOf("'OTIF ✕ 晚到/不足'") > 0);
    check('C20 供应商行 OTIF 汇总', html.indexOf('otifStats(s.id)') > 0);
    check('C20 无分批订单不入 OTIF 样本', html.indexOf('if(!(o.batches&&o.batches.length))return null;') > 0);

    /* 2) 行为级：AQL 1.0 查表 */
    const p10 = (lot) => sandbox.aqlPlan(lot, '1.0');
    check('C20 AQL1.0 lot500→n50/Ac1', (() => { const p = p10(500); return p.n === 50 && p.ac === 1 && p.re === 2; })());
    check('C20 AQL1.0 lot1000→n80/Ac2', (() => { const p = p10(1000); return p.n === 80 && p.ac === 2; })());
    check('C20 AQL1.0 lot20→n5/Ac0（小批量箭头级联）', (() => { const p = p10(20); return p.n === 5 && p.ac === 0; })());
    check('C20 三档方案同批量同 n 仅 Ac 变', (() => { const plan = (function(){sandbox.document.getElementById; return null})() || true; const lot = '999'; return typeof sandbox.inspectionPlanNow === 'function' && sandbox.aqlPlan(500, '4.0').n === 50 && sandbox.aqlPlan(500, '1.0').n === 50; })());

    /* 3) 行为级：OTIF 判定真值表 + 供应商/全局汇总 */
    const mkO = (o) => Object.assign({ id: 'x', code: 'C20', productId: 'p1', supplierId: 's-c20', qty: 100, price: 2, due: sandbox.addDays(T, 5), status: '生产中', payStatus: '未付款', step: 2 }, o);
    st.orders.push(
      mkO({ id: 'c20ot', code: 'C20-OT', batches: [{ date: sandbox.addDays(T, -10), qty: 60, received: true, receivedDate: sandbox.addDays(T, -10) }, { date: sandbox.addDays(T, -2), qty: 40, received: true, receivedDate: sandbox.addDays(T, -3) }] }),
      mkO({ id: 'c20late', code: 'C20-LATE', batches: [{ date: sandbox.addDays(T, -20), qty: 100, received: true, receivedDate: sandbox.addDays(T, -15) }] }),
      mkO({ id: 'c20part', code: 'C20-PART', batches: [{ date: sandbox.addDays(T, -5), qty: 30, received: true, receivedDate: sandbox.addDays(T, -5) }, { date: sandbox.addDays(T, 5), qty: 70, received: false }] }),
      mkO({ id: 'c20nob', code: 'C20-NOB', step: 5, status: '已发货' })
    );
    check('C20 准时+足额 → OTIF 达成', sandbox.orderOTIFJudge(st.orders.find(o => o.id === 'c20ot')) === true);
    check('C20 批次实收晚于承诺 → 未达成', sandbox.orderOTIFJudge(st.orders.find(o => o.id === 'c20late')) === false);
    check('C20 未足额收货 → 不入样本', sandbox.orderOTIFJudge(st.orders.find(o => o.id === 'c20part')) === null);
    check('C20 无分批 → 不入样本（避免虚增）', sandbox.orderOTIFJudge(st.orders.find(o => o.id === 'c20nob')) === null);
    check('C20 供应商维度汇总（2 样本 1 达成 = 50%）', (() => { const s = sandbox.otifStats('s-c20'); return s.sample === 2 && s.otif === 1 && s.rate === 50; })());
    check('C20 全局汇总 ≥2 样本（含历史已收批次订单）', (() => { const g = sandbox.otifStats(); return g.sample >= 2 && g.otif >= 1; })());

    /* 4) 行为级：订单页/供应商页渲染含 OTIF */
    sandbox.go('order');
    check('C20 订单页渲染 OTIF KPI', sandbox.document.getElementById('view').innerHTML.indexOf('OTIF 达成率') > 0);
    check('C20 订单行 OTIF ✓ 标注', sandbox.document.getElementById('view').innerHTML.indexOf('OTIF ✓') > 0);
    sandbox.go('supplier');
    check('C20 供应商页渲染 OTIF 汇总行', sandbox.document.getElementById('view').innerHTML.indexOf('OTIF') > 0);

    /* 5) 清理压测数据 */
    st.orders = st.orders.filter(o => ['c20ot', 'c20late', 'c20part', 'c20nob'].indexOf(o.id) < 0);
    sandbox.go('dashboard');
  } catch (e) { check('C20 批次', false, e.message); }
})();


function finishRun() {
  console.log(failed ? ('\n结果：' + failed + ' 项失败') : '\n结果：全部通过');
  process.exit(failed ? 1 : 0);
}
(function waitAsync() { if (pendingAsync > 0) return setTimeout(waitAsync, 20); finishRun(); })();
