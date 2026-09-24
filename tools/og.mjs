// Renders public/og.png (1200x630 link preview) from the live hero with the nav and buttons removed.
// Run with Playwright available: CHROME=<chromium path> node tools/og.mjs [url]

import { chromium } from 'playwright';
const url = process.argv[2] || 'https://halilemincaliskan.com/';
const b = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.clock.setFixedTime(new Date('2026-09-24T09:41:00'));
await p.goto(url, { waitUntil: 'networkidle' });
await p.addStyleTag({
  content: `
  .bar, .note, .actions, .hint { display: none !important; }
  .chapter--hero { min-height: 630px !important; padding-top: 0 !important; display: flex; align-items: center; }
  .chapter--hero .copy { padding-top: 0 !important; margin-top: -8px; }
  .chapter--hero .display { font-size: 96px !important; line-height: 1.02 !important; }
  .chapter--hero .kicker { font-size: 24px !important; margin-bottom: 14px !important; }
  .chapter--hero .lede { font-size: 28px !important; line-height: 1.3 !important; max-width: 560px !important; margin-top: 28px !important; }
  .og-sub { display: block; margin-top: 16px; font-size: 22px; line-height: 1.45; font-weight: 600; color: #6e6e73; }
  .og-url { position: fixed; left: 60px; bottom: 44px; font: 600 22px/1 var(--font, system-ui); color: #6e6e73; letter-spacing: -0.01em; z-index: 10; }
`,
});
await p.evaluate(() => {
  document.querySelector('.chapter--hero .lede').innerHTML =
    'I build iOS apps with SwiftUI and UIKit. <strong>Shipped 20+ App Store releases.</strong><span class="og-sub">465+ unit tests<br>0 SwiftLint violations in strict mode, 500+ files</span>';
  const u = document.createElement('div');
  u.className = 'og-url';
  u.textContent = 'halilemincaliskan.com';
  document.body.append(u);
  scrollTo(0, 0);
});
await p.waitForTimeout(5000);
await p.screenshot({ path: 'public/og.png' });
await b.close();
