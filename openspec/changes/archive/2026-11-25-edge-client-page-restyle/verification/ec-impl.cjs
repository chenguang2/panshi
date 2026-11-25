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
  await pg.goto('http://localhost:12345/edge-client', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/ec-impl.png' });
  const counts = await pg.evaluate(() => ({
    badges: document.querySelectorAll('.ph-lite').length,
    warnBanner: !!document.querySelector('.ec-warn'),
    toolbar: !!document.querySelector('.l5-toolbar'),
    tabs: document.querySelectorAll('.ec-tab').length,
    activeTab: document.querySelector('.ec-tab.active')?.textContent?.trim(),
    gridTables: document.querySelectorAll('.grid-table').length,
    antdTabs: document.querySelectorAll('.ant-tabs').length,
    opsBtns: document.querySelectorAll('.ops .op-btn').length,
    opDanger: document.querySelectorAll('.ops .op-btn.op-danger').length,
    connPill: !!document.querySelector('.ec-conn .pill'),
    noFilterBar: !document.querySelector('.edge-filter-bar'),
  }));
  console.log(JSON.stringify(counts, null, 1));
  console.log('pageerrors:', errors.length ? errors : 'NONE');
  await b.close();
})();
