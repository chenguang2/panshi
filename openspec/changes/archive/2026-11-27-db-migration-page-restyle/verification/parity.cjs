// db-migration-page-restyle parity 五步法（#82）：同数据注入 → 逐元素量测
const { chromium } = require('@playwright/test');
const fs = require('fs');

const DESIGN = 'file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/db-migration.html';
const REAL = 'http://localhost:12345/db-migration';
const OUT = '/tmp/opencode/parity-dbm';

function norm(c) {
  if (!c) return '';
  if (c.startsWith('oklch')) return c.replace(/\s+/g, ' ');
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split('/'); const rgb = p[0].trim().split(',').map(x=>parseFloat(x)); const a = p[1]!==undefined? parseFloat(p[1]) : 1;
    if (a===1) return `rgb(${rgb.join(', ')})`; return `rgba(${rgb.join(', ')}, ${a})`; }
  return c;
}

const PAIRS = [
  ['页头标题', '.page-header h1', '.page-header h1'],
  ['状态带容器', '.mig-band', '.status-band'],
  ['状态带标签', '.mig-band .mig-lbl', '.status-band .band-label'],
  ['状态带值', '.mig-band .mig-val', '.status-band .band-value'],
  ['任务卡头标题', '.mig-cardhead h3', '.l5-card.db-migration-card .mig-cardhead h3'],
  ['任务卡头副注', '.l5-card .mig-cardhead .mig-sub', '.l5-card.db-migration-card .mig-cardhead .mig-sub'],
  ['卡头容器', '.l5-card .mig-cardhead', '.l5-card.db-migration-card .mig-cardhead'],
  ['流向标签', '.flow-panel .unit-label', '.flow-panel .unit-label'],
  ['流向下拉', '.mig-select', '.flow-select'],
  ['危险徽签', '.flow-danger', '.flow-danger'],
  ['日志勾选', '.checkbox-label', '.checkbox-label'],
  ['发起按钮', '.migrate-btn', '.migrate-btn'],
  ['风险标题', '.risk-title', '.risk-panel-title'],
  ['风险条目', '.risk-list li', '.risk-list li'],
  ['历史卡头标题', '.l5-card:nth-of-type(3) .mig-cardhead h3', '.db-migration-history-card .mig-cardhead h3'],
  ['历史表头', '.l5-table thead th', '.migration-history-table thead th'],
  ['历史单元格', '.l5-table tbody tr:first-child td', '.migration-history-table tbody tr.ant-table-row td'],
  ['状态胶囊', '.pill-run', '.pill-run'],
  ['方向标签', '.hist-flow .lp-tag', '.hist-flow .lp-tag'],
  ['模式弱化', '.c-dim', '.c-dim'],
  ['等宽数值', '.c-mono', '.migration-history-table .c-mono'],
  ['分页条', '.l5-pager', '.l5-pager'],
  ['分页页码钮', '.p-btn', '.l5-pager .p-btn'],
  ['清理历史按钮', '.mig-head-actions .btn.btn-secondary.btn-sm', '.history-cleanup-btn'],
  ['重启横幅样张', '.alert-warning', '.alert-warning'],
];

const PROPS = ['fontSize','fontWeight','color','backgroundColor','paddingTop','paddingBottom','paddingLeft','paddingRight','borderTopWidth','borderColor','borderRadius','lineHeight','fontFamily','height'];

(async () => {
  const browser = await chromium.launch();
  const report = { pairs: [], overflow: {}, shots: {} };

  // ── 设计页 ──
  const dp = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await dp.goto(DESIGN); await dp.waitForTimeout(400);
  await dp.screenshot({ path: `${OUT}/design-top.png` });
  report.shots.design = `${OUT}/design-top.png`;

  // ── 实现页（登录） ──
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const rp = await ctx.newPage();
  await rp.goto('http://localhost:12345/');
  await rp.fill('#username', 'admin'); await rp.fill('#password', 'panshi123');
  await Promise.all([
    rp.waitForResponse((r) => r.url().includes('/auth/login'), { timeout: 8000 }).catch(() => null),
    rp.click('button', { hasText: /登\s*录/ }),
  ]);
  await rp.waitForTimeout(1800);
  await rp.goto(REAL);
  await rp.waitForSelector('.mig-cardhead', { timeout: 15000 });
  await rp.waitForTimeout(1000);
  await rp.screenshot({ path: `${OUT}/real-top.png` });
  report.shots.real = `${OUT}/real-top.png`;

  for (const [name, ds, rs] of PAIRS) {
    const d = await dp.$(ds);
    const r = await rp.$(rs);
    const entry = { name, designFound: !!d, realFound: !!r };
    if (d && r) {
      entry.design = await d.evaluate((el, props) => {
        const norm = (c) => {
          if (!c) return '';
          if (c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return 'transparent';
          const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
        }
        const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        const o = {}; for (const p of props) o[p] = p==='height'||p==='width' ? Math.round(b[p]) : norm(cs[p]); return o;
      }, PROPS);
      entry.real = await r.evaluate((el, props) => {
        const norm = (c) => {
          if (!c) return '';
          if (c === 'rgba(0, 0, 0, 0)' || c === 'transparent') return 'transparent';
          const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
        }
        const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        const o = {}; for (const p of props) o[p] = p==='height'||p==='width' ? Math.round(b[p]) : norm(cs[p]); return o;
      }, PROPS);
    }
    report.pairs.push(entry);
  }

  // 历史表序号列渲染宽（设计 colgroup 45 vs 实现固定 45）
  for (const [tag, pg, sel] of [['design', dp, '.l5-table thead th:first-child'], ['real', rp, '.migration-history-table thead th:first-child']]) {
    const el = await pg.$(sel);
    if (el) report.overflow[`idxcol_${tag}`] = Math.round((await el.boundingBox()).width);
  }
  // 横向溢出检查：1600 与 1366
  for (const width of [1600, 1366]) {
    await rp.setViewportSize({ width, height: 1000 }); await rp.waitForTimeout(300);
    report.overflow[`real_${width}`] = await rp.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
      tableScroll: (() => { const t = document.querySelector('.migration-history-table .ant-table-content'); return t ? { sw: t.scrollWidth, cw: t.clientWidth } : null })(),
    }));
  }
  await rp.setViewportSize({ width: 1600, height: 1000 });


  // 终版截图（verification 存档）
  await dp.screenshot({ path: '/home/qcg/panshi/openspec/changes/db-migration-page-restyle/verification/design-1600.png', fullPage: true });
  await rp.screenshot({ path: '/home/qcg/panshi/openspec/changes/db-migration-page-restyle/verification/real-1600.png', fullPage: true });
  await rp.setViewportSize({ width: 1366, height: 1000 });
  await rp.waitForTimeout(400);
  await rp.screenshot({ path: '/home/qcg/panshi/openspec/changes/db-migration-page-restyle/verification/real-1366.png', fullPage: true });
  await rp.setViewportSize({ width: 1600, height: 1000 });
  fs.writeFileSync(`${OUT}/parity-report.json`, JSON.stringify(report, null, 2));
  // 打印差异摘要
  for (const e of report.pairs) {
    if (!e.designFound || !e.realFound) { console.log(`✗ ${e.name}: design=${e.designFound} real=${e.realFound}`); continue; }
    const diffs = [];
    for (const k of PROPS) {
      const dv = e.design[k], rv = e.real[k];
      if (String(dv) !== String(rv)) {
        // 数值类属性允许 1px 舍入
        if (['paddingTop','paddingBottom','paddingLeft','paddingRight','height','width'].includes(k) && Math.abs(parseFloat(dv)-parseFloat(rv))<=1) continue;
        diffs.push(`${k}: ${dv} ≠ ${rv}`);
      }
    }
    console.log(diffs.length ? `≠ ${e.name}: ${diffs.join(' | ')}` : `✓ ${e.name}`);
  }
  console.log('overflow:', JSON.stringify(report.overflow));
  await browser.close();
})();
