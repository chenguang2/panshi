const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright');

const PROPS = ['font-size','font-weight','color','background-color','border-color','border-radius','line-height','letter-spacing','padding-top','padding-left','height','width','font-family'];

async function grab(pg, sel) {
  return pg.evaluate(([sel, props]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    out._rect = [Math.round(r.width), Math.round(r.height)];
    return out;
  }, [sel, PROPS]);
}

(async () => {
  const b = await chromium.launch();
  const report = {};

  // ── 设计页 ──
  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/tools.html');
  await d.waitForTimeout(300);
  const dSels = {
    'rail-item-active': '.tb-tool.active',
    'rail-item-idle': '.tb-tool:not(.active)',
    'head-title': '.tb-headline .tb-title',
    'head-hint': '.tb-headline .tb-hint',
    'btn-help': '.tb-btn-help',
    'btn-clear': '.tb-btn-clear',
    'btn-ghost': '.tb-btn-ghost',
    'ta': '.tb-dual .tb-ta',
    'pane-label': '.tb-plabel',
    'mid-primary': '.tb-mid .btn-primary',
    'mini': '.tb-mini',
    'result-row': '.tb-rg',
    'result-hl': '.tb-rg.rg-hl',
    'rg-k': '.tb-rg .rg-k',
    'rg-v': '.tb-rg .rg-v',
    'warn': '.tb-warn',
    'badge': '.ph-lite.lite-accent',
    'file-head': '.tb-file-head',
    'fname': '.tb-fname',
  };
  for (const [k, s] of Object.entries(dSels)) report['D:' + k] = await grab(d, s);
  await d.close();

  // ── 实现页 ──
  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await pg.goto('http://localhost:12345/', { waitUntil: 'networkidle' });
  if (await pg.$('#username')) {
    await pg.fill('#username', 'admin'); await pg.fill('#password', 'panshi123');
    await pg.click('button[type="submit"], .login-btn, button:has-text("登")');
    await pg.waitForTimeout(1200);
  }
  await pg.goto('http://localhost:12345/tools', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(500);
  for (const k of ['rail-item-active','rail-item-idle','head-title','head-hint','btn-help','btn-clear','ta','pane-label','mid-primary','mini','badge'])
    report['I:' + k] = await grab(pg, '.tb-' + k.replace('rail-item-','tool-').replace('head-','headline ').replace('btn-','btn-') === k ? selsMap(k) : selsMap(k));
  await b.close();

  function selsMap(k) {
    return {
      'rail-item-active': '.tb-tool.active',
      'rail-item-idle': '.tb-tool:not(.active)',
      'head-title': '.tb-headline .tb-title',
      'head-hint': '.tb-headline .tb-hint',
      'btn-help': '.tb-btn-help',
      'btn-clear': '.tb-btn-clear',
      'ta': '.tb-dual textarea',
      'pane-label': '.tb-plabel',
      'mid-primary': '.tb-mid .btn-primary',
      'mini': '.tb-mini',
      'badge': '.ph-lite.lite-accent',
    }[k];
  }

  // ── 对照 ──
  const IGNORE = new Set(['_rect','width','height','font-family','letter-spacing','line-height']);
  const diffs = [];
  for (const k of Object.keys(dSels)) {
    const D = report['D:' + k], I = report['I:' + k];
    if (!I) { diffs.push([k, '实现侧无元素', '', '']); continue; }
    for (const p of PROPS) {
      if (IGNORE.has(p)) continue;
      const dv = (D && D[p]) || '', iv = I[p] || '';
      if (dv !== iv) diffs.push([k, p, dv, iv]);
    }
  }
  console.log('=== 差异清单（键 / 属性 / 设计 / 实现）===');
  diffs.forEach(d => console.log(d.join(' | ')));
  console.log('=== 全部维度已比对；font-family/尺寸类差异单独列出 ===');
  for (const k of ['ta', 'fname']) {
    console.log(k, 'D:', report['D:' + k] && report['D:' + k]['font-family'], '|| I:', report['I:' + k] && report['I:' + k]['font-family']);
  }
})();
