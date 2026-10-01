/* 静态死按钮审计：抽取所有 onclick/onchange/oninput 处理器，检查函数是否定义 */
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'supplydev.html', 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
const fns = new Set();
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) fns.add(m[1]);
let dead = [];
const attrRe = /(?:onclick|onchange|oninput|onfocus|onblur|onkeydown|onmouseover|onmouseout)=\"([^\"]*)\"/g;
for (const m of src.matchAll(attrRe)) {
  const h = m[1];
  if (!h) continue;
  for (const c of h.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    const pre = h.slice(Math.max(0, c.index - 20), c.index);
    const n = c[1];
    if (['if', 'return', 'function', 'else', 'this', 'event', 'window', 'typeof', 'new', 'Math', 'confirm', 'prompt', 'alert', 'JSON', 'Object', 'String', 'Number', 'var'].includes(n)) continue; /* var( = CSS 变量函数，非 JS 调用（C7 暗色模式引入内联 var() 后加入） */
    /* 跳过方法调用（event.stopPropagation() 等），只审计全局函数 */
    if (/\.$/.test(pre.trim())) continue;
    if (!fns.has(n)) dead.push(n + ' :: ' + h.slice(0, 70));
  }
}
const uniq = [...new Set(dead)];
console.log('未定义函数数:', uniq.length);
uniq.forEach(u => console.log('  DEAD:', u));
process.exit(uniq.length ? 1 : 0);
