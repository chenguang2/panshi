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
  await pg.goto('http://localhost:12345/clickhouse-config', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1200);
  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/clickhouse-config.html');
  await d.waitForTimeout(300);
  diff('cardhead-h3', await grab(d, '.ck-cardhead h3'), await grab(pg, '.ck-cardhead h3'));
  diff('cardhead-sub', await grab(d, '.ck-cardhead .ck-sub'), await grab(pg, '.ck-cardhead .ck-sub'));
  diff('verdict-pill', await grab(d, '.ck-verdict .pill'), await grab(pg, '.ck-verdict .pill'));
  diff('ck-name', await grab(d, '.ck-name'), await grab(pg, '.ck-name'));
  diff('ck-addr', await grab(d, '.ck-addr'), await grab(pg, '.ck-addr'));
  diff('tool-btn-meta', await grab(d, '.ck-actions .tool-btn'), await grab(pg, '.ck-actions .tool-btn'));
  diff('badge-accent', await grab(d, '.ph-lite.lite-accent'), await grab(pg, '.ph-lite.lite-accent'));
  diff('badge-bad', await grab(d, '.ph-lite.lite-bad'), await grab(pg, '.ph-lite.lite-bad'));
  diff('th', await grab(d, '.l5-table thead th'), await grab(pg, '.ck-table thead th'));
  diff('op-pub', await grab(d, '.op-pub'), await grab(pg, '.op-pub'));
  diff('test-fail', await grab(d, '.test-fail'), await grab(pg, '.test-fail'));
  await b.close();
  console.log('parity done');
})();
