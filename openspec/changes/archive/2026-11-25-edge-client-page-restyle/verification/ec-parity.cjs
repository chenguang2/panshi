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
  await pg.goto('http://localhost:12345/edge-client', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(900);
  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/edge-client.html');
  await d.waitForTimeout(300);
  diff('warn-banner', await grab(d, '.ec-warn'), await grab(pg, '.ec-warn'));
  diff('tab-active', await grab(d, '.ec-tab.active'), await grab(pg, '.ec-tab.active'));
  diff('tab-idle', await grab(d, '.ec-tab:not(.active)'), await grab(pg, '.ec-tab:not(.active)'));
  diff('tabbar', await grab(d, '.ec-tabbar'), await grab(pg, '.ec-tabbar'));
  diff('mode-select', await grab(d, '.l5-toolbar select.l5-select'), await grab(pg, '.l5-toolbar select.l5-select'));
  diff('badge', await grab(d, '.ph-lite.lite-accent'), await grab(pg, '.ph-lite.lite-accent'));
  diff('th', await grab(d, '.l5-table thead th'), await grab(pg, '.grid-table thead th'));
  await b.close();
  console.log('parity done');
})();
