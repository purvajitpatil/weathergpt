import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

const base = 'http://localhost:3000/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 } });

async function closeModal() {
  // Click the X icon inside any open modal
  const x = page.locator('.fixed.inset-0 .lucide-x');
  const count = await x.count().catch(() => 0);
  if (count > 0) {
    await x.first().click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. Desktop dashboard - top
await page.screenshot({ path: path.join(outDir, '1-desktop-top.png') });

// 2. Desktop dashboard - full page
await page.screenshot({ path: path.join(outDir, '2-desktop-fullpage.png'), fullPage: true });

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);

// 3. Map modal
await page.click('#action-btn-show-map');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, '3-modal-map.png') });
await closeModal();

// 4. Alert detail modal
await page.click('#alert-card-alert-1');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, '4-modal-alert-detail.png') });
await closeModal();

// 5. More details modal
await page.click('#action-btn-more-details');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, '5-modal-more-details.png') });
await closeModal();

// 6. Set alert modal
await page.click('#action-btn-set-alert');
await page.waitForTimeout(900);
await page.screenshot({ path: path.join(outDir, '6-modal-set-alert.png') });
await closeModal();

// 7. Language dropdown open
await page.click('#header-language-switcher-btn');
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '7-language-dropdown.png') });
await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 10, y: 10 } }).catch(() => {});
await page.waitForTimeout(300);

// 8. Chat interaction
await page.fill('#chat-composer-input', 'Will it rain in Kochi next week for travel?');
await page.click('#chat-send-btn');
await page.waitForTimeout(6500);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, '8-desktop-after-chat.png') });

// 9. Mobile preview mode
await page.click('#mobile-layout-toggle-btn');
await page.waitForTimeout(1000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, '9-mobile-preview-mode.png') });

// 10. Actual phone viewport
const mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mpage.goto(base, { waitUntil: 'networkidle' });
await mpage.waitForTimeout(1500);
await mpage.screenshot({ path: path.join(outDir, '10-mobile-phone.png') });
await mpage.screenshot({ path: path.join(outDir, '10-mobile-phone-full.png'), fullPage: true });

await browser.close();
console.log('Done. Screenshots written to', outDir);
