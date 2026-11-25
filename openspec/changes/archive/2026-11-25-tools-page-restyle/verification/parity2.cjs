const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright');
const PROPS = ['font-size','font-weight','color','background-color','border-color','border-radius','padding-top','padding-left'];

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
  for (const p of PROPS) {
    if ((D[p] || '') !== (I[p] || '')) console.log('DIFF', name, p, '| 设计:', D[p], '| 实现:', I[p]);
  }
}

(async () => {
  const b = await chromium.launch();
  const d = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await d.goto('file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/tools.html');
  await d.waitForTimeout(300);
  const D = {
    ghost: await grab(d, '.tb-btn-ghost'),
    resultRow: await grab(d, '.tb-rg'),
    resultHl: await grab(d, '.tb-rg.rg-hl'),
    rgk: await grab(d, '.rg-k'),
    warn: await grab(d, '.tb-warn'),
    fileHead: await grab(d, '.tb-file-head'),
    fname: await grab(d, '.tb-fname'),
    warnline: await grab(d, '.tb-warnline'),
  };
  await d.close();

  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await pg.goto('http://localhost:12345/', { waitUntil: 'networkidle' });
  if (await pg.$('#username')) {
    await pg.fill('#username', 'admin'); await pg.fill('#password', 'panshi123');
    await pg.click('button[type="submit"], .login-btn, button:has-text("登")');
    await pg.waitForTimeout(1200);
  }

  // 时间戳 → 结果格 + ghost
  await pg.goto('http://localhost:12345/tools?tool=timestamp', { waitUntil: 'networkidle' });
  await pg.fill('textarea', '1750000000');
  await pg.waitForTimeout(300);
  diff('ghost', D.ghost, await grab(pg, '.tb-btn-ghost'));
  diff('resultRow', D.resultRow, await grab(pg, '.tb-rg'));
  diff('resultHl', D.resultHl, await grab(pg, '.tb-rg.rg-hl'));
  diff('rgk', D.rgk, await grab(pg, '.rg-k'));

  // SM4 → 警示条
  await pg.goto('http://localhost:12345/tools?tool=sm4', { waitUntil: 'networkidle' });
  await pg.locator('.tb-keyrow input').fill('abc123');
  await pg.waitForTimeout(300);
  diff('warn', D.warn, await grab(pg, '.tb-warn'));

  // Keepalived → 文件卡 + 警告行
  await pg.goto('http://localhost:12345/tools?tool=keepalived', { waitUntil: 'networkidle' });
  await pg.fill('.tb-field-vip input', '10.128.216.154');
  await pg.fill('.tb-nodes', '10.128.216.160 ens7\n10.128.216.161 eth1');
  await pg.waitForTimeout(400);
  diff('warnline', D.warnline, await grab(pg, '.tb-warnline'));
  diff('fileHead', D.fileHead, await grab(pg, '.tb-file-head'));
  diff('fname', D.fname, await grab(pg, '.tb-fname'));

  console.log('done');
  await b.close();
})();
