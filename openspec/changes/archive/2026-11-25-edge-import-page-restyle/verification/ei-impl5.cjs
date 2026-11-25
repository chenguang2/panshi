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
  await pg.click('.cluster-select');
  await pg.waitForSelector('.ant-select-dropdown .ant-select-item-option', { timeout: 8000 });
  // 精确文本匹配（textContent === 'test'）
  await pg.evaluate(() => {
    const opt = Array.from(document.querySelectorAll('.ant-select-dropdown .ant-select-item-option'))
      .find(o => o.textContent.trim() === 'test');
    if (opt) opt.click();
  });
  await pg.waitForTimeout(900);
  const picked = await pg.evaluate(() => document.querySelector('.cluster-select .ant-select-selection-item')?.textContent);
  console.log('picked:', picked);
  const nodeOpts = await pg.evaluate(() => Array.from(document.querySelectorAll('select.ei-input option')).map(o => o.textContent.trim()).filter(t => t.includes('192.168.0.1')));
  console.log('test nodes:', JSON.stringify(nodeOpts));
  await pg.evaluate(() => {
    const s = document.querySelector('select.ei-input');
    const opt = Array.from(s.options).find(o => o.textContent.includes('192.168.0.13'));
    if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await pg.waitForTimeout(200);
  const enabled = await pg.evaluate(() => !document.querySelector('.ei-field .btn-primary')?.disabled);
  console.log('btn enabled:', enabled);
  if (!enabled) { console.log('STILL DISABLED — abort'); await b.close(); return; }
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
  }));
  console.log('tested:', JSON.stringify(tested, null, 1));
  await pg.click('.step-actions .btn-primary');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: '/tmp/opencode/tools-design/ei-impl-step1.png' });
  const step1 = await pg.evaluate(() => ({
    types: document.querySelectorAll('.ei-ct').length,
    selected: document.querySelectorAll('.ei-ct.selected').length,
    dot2active: document.querySelectorAll('.ei-steps .ei-step')[1]?.classList.contains('active'),
  }));
  console.log('step1:', JSON.stringify(step1));
  console.log('pageerrors:', errors.length ? errors : 'NONE');
  await b.close();
})();
