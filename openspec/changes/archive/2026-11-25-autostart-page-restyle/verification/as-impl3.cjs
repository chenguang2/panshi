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
  await pg.goto('http://localhost:12345/edge-autostart', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/as-impl-v2.png' });
  // 平铺视图
  await pg.click('.seg-opt:has-text("平铺")');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/as-impl-flat.png' });
  const counts = await pg.evaluate(() => ({
    seg: document.querySelectorAll('.seg .seg-opt').length,
    batchbar: !!document.querySelector('.l5-batchbar'),
    listPager: !!document.querySelector('.l5-pager'),
    antdPager: !!document.querySelector('.ant-pagination'),
    gridTable: !!document.querySelector('table.grid-table, .grid-table table') || document.querySelector('.ant-table')?.closest('[class*="grid-table"]') != null,
    chips: document.querySelectorAll('.l5-chiprow .f-chip').length,
    groupRows: document.querySelectorAll('.l5-group-row').length,
    pills: document.querySelectorAll('.pill.as-enabled, .pill.as-unset, .pill.as-denied, .pill.as-disabled, .pill.as-notcfg, .pill.as-failed').length,
    refreshLabel: document.querySelector('.l5-toolbar .tool-btn')?.textContent?.trim(),
    noZhongzai: !document.body.textContent.includes('重载'),
    colBtn: document.querySelector('.l5-toolbar [class*="pop"], .l5-toolbar .ant-popover') !== null || document.body.textContent.includes('列配置'),
  }));
  console.log(JSON.stringify(counts, null, 1));
  console.log('pageerrors:', errors.length ? errors : 'NONE');
  await b.close();
})();
