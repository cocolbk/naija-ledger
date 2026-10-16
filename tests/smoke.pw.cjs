// Headless browser smoke test: onboarding, profile save, wallet/category/reset flows,
// and blocked-storage behaviour. Run: BASE_URL=http://127.0.0.1:8901 PW_CHANNEL=msedge node tests/smoke.pw.cjs
// (PW_CHANNEL unset = default Chromium.)
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8901';
const results = [];
const check = (n, c, extra = '') => { results.push((c ? 'PASS' : 'FAIL') + ' ' + n + (c ? '' : ' ' + extra)); };

async function newPage(blockWrites) {
  const launchOpts = { headless: true };
  if (process.env.PW_CHANNEL) launchOpts.channel = process.env.PW_CHANNEL;
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext();
  if (blockWrites) {
    await ctx.addInitScript(() => {
      const s = {};
      Object.defineProperty(window, 'localStorage', { value: {
        getItem: (k) => (k in s ? s[k] : null),
        setItem: () => { throw new DOMException('blocked', 'QuotaExceededError'); },
        removeItem: (k) => { delete s[k]; },
      }, configurable: true });
    });
  }
  const page = await ctx.newPage();
  page.on('dialog', (dlg) => dlg.accept());
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  return { browser, page, errors };
}

async function passOnboarding(page) {
  await page.click('#ob-next');
  await page.click('#ob-next');
  await page.click('#ob-next');
  await page.click('#ob-done');
  await page.waitForTimeout(400);
}

(async () => {
  {
    const { browser, page, errors } = await newPage(false);
    check('no page errors on load', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    check('onboarding shows for fresh user', await page.locator('#onboarding-overlay:not(.hidden)').count() === 1);
    await passOnboarding(page);
    check('onboarding completes', await page.locator('#onboarding-overlay.hidden').count() === 1);
    await page.click('#tabbtn-settings');
    await page.fill('#set-name', 'Adaeze');
    await page.click('#save-profile');
    await page.waitForTimeout(200);
    const note = await page.locator('#settings-note').textContent();
    check('save note shows', /saved/i.test(note || ''), JSON.stringify(note));
    check('avatar initial', (await page.locator('#avatar-initial').textContent()).trim() === 'A');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('naijaLedger.v2') || '{}'));
    check('name persisted', saved.user && saved.user.name === 'Adaeze', JSON.stringify(saved.user));
    await page.fill('#new-wallet-name', 'Shop');
    await page.click('#add-wallet');
    await page.waitForTimeout(200);
    const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem('naijaLedger.v2') || '{}'));
    check('wallet persisted', (saved2.wallets || []).some((w) => w.name === 'Shop'));
    await page.fill('#new-cat-name', 'TestCat');
    await page.click('#add-category');
    await page.waitForTimeout(200);
    const note2 = await page.locator('#settings-note').textContent();
    check('free category gate note', /Premium|premium/i.test(note2 || ''), JSON.stringify(note2));
    await page.click('#reset-data');
    await page.waitForTimeout(300);
    const saved3 = await page.evaluate(() => JSON.parse(localStorage.getItem('naijaLedger.v2') || '{}'));
    check('reset clears name', !saved3.user || !saved3.user.name);
    check('reset restores 1 wallet', Array.isArray(saved3.wallets) && saved3.wallets.length === 1);
    check('onboarding reappears after reset', await page.locator('#onboarding-overlay:not(.hidden)').count() === 1);
    await browser.close();
  }
  {
    const { browser, page, errors } = await newPage(true);
    check('blocked: banner shows', await page.locator('#store-banner:not(.hidden)').count() === 1);
    await passOnboarding(page).catch(() => {});
    await page.click('#tabbtn-settings');
    await page.fill('#set-name', 'Nobody');
    await page.click('#save-profile');
    await page.waitForTimeout(200);
    const note = await page.locator('#settings-note').textContent();
    check('blocked: error note shown, not silent', /Couldn.t save|blocked|storage/i.test(note || ''), JSON.stringify(note));
    check('blocked: no page crash', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    await browser.close();
  }
  const fails = results.filter((r) => r.startsWith('FAIL'));
  console.log(results.join('\n'));
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
