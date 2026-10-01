/* C5 备份加密真加密原语验证：Node 22 内置 webcrypto（OpenSSL 实现）= 与 WebView2 同源的 WebCrypto 行为。
 * 与 verify.js 桩互补：桩验证流程逻辑，本脚本验证 真实 AES-GCM-256 + PBKDF2-SHA256(10万迭代) 往返。
 * 用法：node _tests/enc_webcrypto.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'supplydev.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: 未找到 <script> 块'); process.exit(1); }

/* 最小 DOM 桩：只为把脚本加载到「函数全部提升」的状态（顶层 authRender 等抛错可容忍） */
function makeEl(tag) {
  return {
    tagName: tag, innerHTML: '', textContent: '', value: '', style: {}, files: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild() {}, addEventListener() {}, click() {}, getAttribute() { return null; },
    querySelector() { return null; }, closest() { return null; }, setAttribute() {},
    focus() {}, select() {}
  };
}
const docStub = {
  querySelector() { return makeEl('q'); }, querySelectorAll() { return []; },
  getElementById() { return makeEl('q'); }, createElement(t) { return makeEl(t); }, addEventListener() {}
};
const sandbox = {
  document: docStub,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  crypto: require('crypto').webcrypto, /* 真 WebCrypto */
  Blob: function (p) { this._s = p.map(String).join(''); },
  URL: { createObjectURL: () => 'blob:x' },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (b) => Buffer.from(b, 'base64').toString('binary'),
  confirm: () => true, console, setTimeout, clearTimeout,
  setInterval() { return 0; }, clearInterval() {}, fetch() { return Promise.reject(new Error('offline')); },
  addEventListener() {}, removeEventListener() {}, TextEncoder, TextDecoder
};
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
try { vm.runInContext(m[1], ctx, { filename: 'supplydev-inline.js' }); } catch (e) { /* 顶层骨架调用抛错可容忍：函数声明已提升 */ }

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS ' + name);
  else { failed++; console.error('FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

(async function main() {
  check('真 WebCrypto 可用（subtle.encrypt 为原生实现）', typeof sandbox.crypto.subtle.encrypt === 'function');
  const payload = { _app: 'supplydev', products: [{ id: 't1', name: '真实加密中文✓往返' }] };

  const env = await sandbox.encBackupText(payload, 'pw-real');
  check('真实加密信封可识别', sandbox.looksEncryptedBackup(env));
  const d = JSON.parse(env);
  check('真实信封字段', d.iter === 100000 && d.kdf === 'PBKDF2-SHA256' && d._cipher === 'AES-GCM' && /^[0-9a-f]{32}$/.test(d.salt), JSON.stringify({ iter: d.iter, kdf: d.kdf }));

  const back = await sandbox.decBackupText(env, 'pw-real');
  check('真实 AES-GCM 解密往返一致（含中文）', back.products[0].name === '真实加密中文✓往返' && back._app === 'supplydev');

  let wrongRejected = false;
  try { await sandbox.decBackupText(env, 'bad-password'); } catch (e) { wrongRejected = true; }
  check('真实 GCM 认证标签拒绝错误密码', wrongRejected);

  let tamperRejected = false;
  try {
    const dj = JSON.parse(env);
    const raw = Buffer.from(dj.data, 'base64'); raw[raw.length - 20] ^= 0x01; /* 篡改密文中段 */
    dj.data = Buffer.from(raw).toString('base64');
    await sandbox.decBackupText(JSON.stringify(dj), 'pw-real');
  } catch (e) { tamperRejected = true; }
  check('真实 GCM 拒绝被篡改密文', tamperRejected);

  const env2 = await sandbox.encBackupText(payload, 'pw-real');
  check('随机盐+IV → 密文不确定', env2 !== env);

  /* 2000 项目规模：真实 10 万迭代派生 + 加解密总耗时 */
  const big = JSON.parse(JSON.stringify(payload));
  for (let i = 0; i < 2000; i++) big.products.push({ id: 'x' + i, name: '压测项目' + i });
  const t0 = Date.now();
  const bigEnv = await sandbox.encBackupText(big, 'pw');
  const bigBack = await sandbox.decBackupText(bigEnv, 'pw');
  const ms = Date.now() - t0;
  check('2000 项目加密往返完整', bigBack.products.length === 2001);
  check('2000 项目往返耗时可接受（<5s）', ms < 5000, ms + 'ms');

  console.log(failed ? ('\n结果：' + failed + ' 项失败') : '\n结果：全部通过');
  process.exit(failed ? 1 : 0);
})();
