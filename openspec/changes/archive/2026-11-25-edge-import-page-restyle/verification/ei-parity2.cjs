const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright');
const PROPS = ['font-size','font-weight','color','background-color','border-color','border-radius','height','padding-top','padding-left'];
async function grab(pg, sel) {
  return pg.evaluate(([sel, props]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs.getPropertyValue(p);
    return o;
  }, [sel, PROPS]);
}
function diff(name, D, I) {
  if (!D || !I) { console.log('MISSING', name, !D ? '(design)' : '(impl)'); return; }
  let n = 0;
  for (const p of PROPS) if ((D[p]||'') !== (I[p]||'')) { console.log('DIFF', name, p, '| 设计:', D[p], '| 实现:', I[p]); n++; }
  if (!n) console.log('OK', name);
}
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await pg.goto('http://localhost:12345/', { waitUntil: 'networkidle' });
  if (await pg.$('#username')) {
    await pg.fill('#username', 'admin'); await pg.fill('#password', 'panshi123');
    await pg.click('button[type="submit"], .login-btn, button:has-text("登")');
    await pg.waitForTimeout(1200);
  }
  await pg.goto('http://localhost:12345/edge-import', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(900);
  await pg.click('.cluster-select');
  await pg.waitForSelector('.ant-select-dropdown .ant-select-item-option', { timeout: 8000 });
  await pg.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('.ant-select-dropdown .ant-select-item-option')).find(o => o.textContent.trim() === 'test');
    if (opt) opt.click();
  });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => {
    const s = document.querySelector('select.ei-input');
    const opt = Array.from(s.options).find(o => o.textContent.includes('192.168.0.13'));
    if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await pg.click('.ei-field .btn-primary');
  try { await pg.waitForFunction(() => document.querySelector('.ei-ok'), { timeout: 60000 }); } catch (e) {}
  await pg.waitForTimeout(400);
  // Step 0（含成功横幅）量测 vs 设计页 Step 0 样张
  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/edge-import.html');
  await d.waitForTimeout(300);
  diff('field-label', await grab(d, '.ei-field > label'), await grab(pg, '.ei-field > label'));
  diff('ei-input', await grab(d, '.ei-input'), await grab(pg, '.ei-input'));
  diff('ok-banner', await grab(d, '.ei-ok'), await grab(pg, '.ei-ok'));
  diff('ok-title', await grab(d, '.ei-ok .t'), await grab(pg, '.ei-ok .t'));
  diff('count-chip', await grab(d, '.ei-count'), await grab(pg, '.ei-count'));
  diff('steps-line-done', await grab(d, '.ei-line.done'), await grab(pg, '.ei-line.done'));
  // 推进 Step 1 后量测可选卡
  await pg.click('.step-actions .btn-primary');
  await pg.waitForTimeout(400);
  diff('cardhead-h3', await grab(d, '.ei-cardhead h3'), await grab(pg, '.ei-cardhead h3'));
  diff('ct-selected', await grab(d, '.ei-ct.selected'), await grab(pg, '.ei-ct.selected'));
  diff('ct-icon', await grab(d, '.ei-ct.selected svg'), await grab(pg, '.ei-ct.selected svg'));
  diff('ct-name', await grab(d, '.ei-ct .n'), await grab(pg, '.ei-ct .n'));
  diff('ct-check', await grab(d, '.ei-ct .ck'), await grab(pg, '.ei-ct .ck'));
  await b.close();
  console.log('parity done');
})();
