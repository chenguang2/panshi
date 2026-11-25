const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright');
const PROPS = ['font-size','font-weight','color','background-color','border-color','border-radius','height','padding-top','padding-left'];
async function grab(pg, sel) {
  return pg.evaluate(([sel, props]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  }, [sel, PROPS]);
}
function diff(name, D, I) {
  if (!I || !D) { console.log('MISSING', name, D? 'impl-missing':'design-missing'); return; }
  for (const p of PROPS) if ((D[p]||'') !== (I[p]||'')) console.log('DIFF', name, p, '| 设计:', D[p], '| 实现:', I[p]);
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
  await pg.goto('http://localhost:12345/edge-autostart', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(800);
  // 实现侧实际出现的胶囊变体
  const variant = await pg.evaluate(() => {
    const p = document.querySelector('.as-pill');
    return p ? Array.from(p.classList).find(c => c.startsWith('as-') && c !== 'as-pill') : null;
  });
  console.log('impl pill variant present:', variant);
  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/edge-autostart.html');
  await d.waitForTimeout(300);
  diff('pill-generic', await grab(d, '.as-pill'), await grab(pg, '.as-pill'));
  const dVar = await d.evaluate(() => {
    const p = document.querySelector('.as-pill');
    return p ? Array.from(p.classList).find(c => c.startsWith('as-') && c !== 'as-pill') : null;
  });
  console.log('design variant:', dVar, '| impl variant:', variant);
  if (variant && dVar) diff('pill-variant(' + dVar + ' vs ' + variant + ')', await grab(d, '.as-pill.' + dVar), await grab(pg, '.as-pill.' + variant));
  diff('as-op', await grab(d, '.as-op'), await grab(pg, '.as-op'));
  diff('as-op-danger', await grab(d, '.as-op.danger'), await grab(pg, '.as-op.danger'));
  await pg.screenshot({ path: '/tmp/opencode/tools-design/as-impl.png' });
  await b.close();
  console.log('done');
})();
