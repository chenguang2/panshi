const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright');
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
  await pg.waitForTimeout(800);
  await pg.click('.l5-toolbar .btn-primary');
  try {
    await pg.waitForFunction(() => document.querySelectorAll('.ops .op-btn').length > 0 || document.querySelector('.ant-alert-error, .ant-alert-warning'), { timeout: 25000 });
  } catch (e) { /* timeout */ }
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/ec-impl-query.png' });
  const counts = await pg.evaluate(() => ({
    connPill: !!document.querySelector('.ec-conn .pill'),
    connAddr: document.querySelector('.ec-conn .c-mono')?.textContent,
    opsBtns: document.querySelectorAll('.ops .op-btn').length,
    opDanger: document.querySelectorAll('.ops .op-btn.op-danger').length,
    idMono: !!document.querySelector('.c-mono.c-dim[title]'),
    tabCounts: Array.from(document.querySelectorAll('.ec-tabn')).map(x => x.textContent),
  }));
  console.log(JSON.stringify(counts, null, 1));
  await b.close();
})();
