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
  if (!I) { console.log('MISSING-IMPL', name); return; }
  if (!D) { console.log('MISSING-DESIGN', name); return; }
  for (const p of PROPS) if ((D[p]||'') !== (I[p]||'')) console.log('DIFF', name, p, '| 设计:', D[p], '| 实现:', I[p]);
}
(async () => {
  const b = await chromium.launch();
  const errors = [];
  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  pg.on('pageerror', e => errors.push(String(e).slice(0,150)));
  await pg.goto('http://localhost:12345/', { waitUntil: 'networkidle' });
  if (await pg.$('#username')) {
    await pg.fill('#username', 'admin'); await pg.fill('#password', 'panshi123');
    await pg.click('button[type="submit"], .login-btn, button:has-text("登")');
    await pg.waitForTimeout(1200);
  }
  await pg.goto('http://localhost:12345/edge-autostart', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/as-impl.png' });

  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/edge-autostart.html');
  await d.waitForTimeout(300);
  const pairs = [
    ['toolbar-group', '.l5-toolbar select', '.l5-toolbar select'],
    ['toolbar-search', '.l5-toolbar .l5-search input', '.l5-toolbar .l5-search input'],
    ['tool-btn', '.l5-toolbar .tool-btn', '.l5-toolbar .tool-btn'],
    ['chip', '.l5-chiprow .f-chip.chip-status', '.l5-chiprow .f-chip.chip-status'],
    ['chip-active', '.l5-chiprow .f-chip.chip-status.active', '.l5-chiprow .f-chip.chip-status.active'],
    ['pill-enabled', '.as-pill.as-enabled', '.as-pill.as-enabled'],
    ['pill-denied', '.as-pill.as-denied', '.as-pill.as-denied'],
    ['op-btn', '.l5-table .as-op', '.l5-table .as-op'],
    ['badge', '.ph-lite.lite-accent', '.ph-lite.lite-accent'],
  ];
  for (const [name, ds, is] of pairs) diff(name, await grab(d, ds), await grab(pg, is));
  const counts = await pg.evaluate(() => ({
    chips: document.querySelectorAll('.l5-chiprow .f-chip').length,
    pills: document.querySelectorAll('.as-pill').length,
    dots: document.querySelectorAll('.cl-cell .cl-dot').length,
    hasStatusDropdown: !!document.querySelector('input[placeholder="全部状态"], .ant-select[placeholder]'),
  }));
  console.log('impl counts:', JSON.stringify(counts));
  console.log('pageerrors:', errors.length ? errors : 'NONE');
  await b.close();
})();
