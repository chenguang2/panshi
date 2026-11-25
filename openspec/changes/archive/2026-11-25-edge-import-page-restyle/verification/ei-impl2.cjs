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
  await pg.goto('http://localhost:12345/edge-import', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(900);
  // 选集群（ClusterSelect 的原生 select，含 test）→ 选节点 → 测试连接
  await pg.evaluate(() => {
    const sel = document.querySelector('.ei-field .cluster-select select') || document.querySelectorAll('.ei-field select')[0];
    const opt = Array.from(sel.options).find(o => o.textContent.includes('test'));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => {
    const sel = document.querySelector('select.ei-input');
    const opt = Array.from(sel.options).find(o => o.textContent.includes('192.168.0.13'));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await pg.click('.ei-field .btn-primary');
  try {
    await pg.waitForFunction(() => document.querySelector('.ei-ok') || document.querySelector('.ei-fail'), { timeout: 60000 });
  } catch (e) {}
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/ei-impl-tested.png' });
  const tested = await pg.evaluate(() => ({
    ok: !!document.querySelector('.ei-ok'),
    counts: Array.from(document.querySelectorAll('.ei-count')).map(c => c.textContent.trim()),
    fail: document.querySelector('.ei-fail')?.textContent?.trim()?.slice(0, 60) || null,
    nextEnabled: !document.querySelector('.step-actions .btn-primary')?.disabled,
  }));
  console.log('tested:', JSON.stringify(tested, null, 1));
  // 下一步 → Step 1 可选卡
  await pg.click('.step-actions .btn-primary');
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/ei-impl-step1.png' });
  const step1 = await pg.evaluate(() => ({
    types: document.querySelectorAll('.ei-ct').length,
    selected: document.querySelectorAll('.ei-ct.selected').length,
  }));
  console.log('step1:', JSON.stringify(step1));
  console.log('pageerrors:', errors.length ? errors : 'NONE');
  await b.close();
})();
