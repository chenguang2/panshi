const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  pg.on('pageerror', e => errors.push(String(e).slice(0, 150)));
  await pg.goto('http://localhost:12345/', { waitUntil: 'networkidle' });
  if (await pg.$('#username')) {
    await pg.fill('#username', 'admin'); await pg.fill('#password', 'panshi123');
    await pg.click('button[type="submit"], .login-btn, button:has-text("登")');
    await pg.waitForTimeout(1200);
  }
  await pg.goto('http://localhost:12345/clickhouse-config', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/ck-impl.png' });
  const counts = await pg.evaluate(() => ({
    badges: document.querySelectorAll('.ph-lite').length,
    ckHero: !!document.querySelector('.ck-hero'),
    verdictPill: document.querySelector('.ck-verdict .pill')?.textContent?.trim(),
    gridTable: !!document.querySelector('.ck-table.grid-table'),
    pills: document.querySelectorAll('.pill.pill-run').length,
    opPub: document.querySelectorAll('.op-pub').length,
    opBtn: document.querySelectorAll('.ck-table .op-btn').length,
    headNoUpper: getComputedStyle(document.querySelector('.ck-table thead th')).textTransform,
    healthVerdict: document.querySelector('.health-verdict')?.textContent?.trim(),
    statusDotOnline: !!document.querySelector('.status-dot.online'),
  }));
  console.log(JSON.stringify(counts, null, 1));
  console.log('pageerrors:', errors.length ? errors : 'NONE');
  await b.close();
})();
