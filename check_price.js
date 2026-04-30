const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  pickupDate: '07/06/2026',
  pickupTime: '12:00 PM',
  dropoffDate: '07/26/2026',
  dropoffTime: '09:00 AM',
};
// ──────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkCostcoCarPrice() {
  console.log('🚗 Starting Costco Travel car rental price check...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  try {
    // 1. Navigate to Costco Travel
    console.log('📍 Navigating to Costco Travel...');
    await page.goto('https://www.costcotravel.com/Rental-Cars', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await sleep(3000);

    // 2. Fill location
    console.log('📝 Filling in search form...');
    await page.waitForSelector('#pickupLocationTextWidget', { timeout: 15000 });
    await page.click('#pickupLocationTextWidget');
    await sleep(300);
    await page.type('#pickupLocationTextWidget', 'OGG', { delay: 100 });
    await sleep(2000);

    // Select OGG from dropdown
    try {
      await page.waitForSelector('ul li', { timeout: 5000 });
      const clicked = await page.evaluate(() => {
        const items = document.querySelectorAll('ul li');
        for (const item of items) {
          if (item.textContent.includes('OGG') || item.textContent.includes('Kahului')) {
            item.click();
            return true;
          }
        }
        return false;
      });
      if (clicked) console.log('✅ Selected OGG from dropdown');
      else {
        await page.keyboard.press('Enter');
        console.log('⚠️ Pressed Enter for OGG');
      }
    } catch {
      await page.keyboard.press('Enter');
    }
    await sleep(500);

    // 3. Fill pickup date
    await page.click('#pickUpDateWidget');
    await page.$eval('#pickUpDateWidget', el => el.value = '');
    await page.type('#pickUpDateWidget', CONFIG.pickupDate, { delay: 30 });
    await page.keyboard.press('Escape');
    await sleep(200);

    // 4. Fill pickup time
    await page.select('#pickupTimeWidget', CONFIG.pickupTime);
    await sleep(200);

    // 5. Fill dropoff date
    await page.click('#dropOffDateWidget');
    await page.$eval('#dropOffDateWidget', el => el.value = '');
    await page.type('#dropOffDateWidget', CONFIG.dropoffDate, { delay: 30 });
    await page.keyboard.press('Escape');
    await sleep(200);

    // 6. Fill dropoff time
    await page.select('#dropoffTimeWidget', CONFIG.dropoffTime);
    await sleep(200);

    // 7. Click Search
    console.log('🔍 Submitting search...');
    await page.click('#findMyCarButton');

    // 8. Wait for results — no time limit on GitHub Actions!
    console.log('⏳ Waiting for results...');
    try {
      await page.waitForSelector('a[data-category-name][data-price][data-brand]', {
        timeout: 120000,
      });
      console.log('✅ Car result cards loaded');
    } catch {
      console.log('⚠️ Could not detect result cards after 2 minutes');
    }

    // 9. Screenshot
    try {
      await page.screenshot({ path: 'results.png' });
      console.log('📸 Screenshot saved');
    } catch {
      console.log('⚠️ Could not take screenshot');
    }

    // 10. Extract prices
    console.log('💰 Extracting prices...');
    const prices = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('a[data-category-name][data-price][data-brand]');
      cards.forEach((card) => {
        results.push({
          categoryName: card.getAttribute('data-category-name') || '',
          brand: card.getAttribute('data-brand') || '',
          price: parseFloat(card.getAttribute('data-price') || '0'),
          priceFormatted: card.getAttribute('data-price-fomatted-and-rounded') || '',
          carType: card.getAttribute('data-car-type') || '',
        });
      });
      return results;
    });

    // Filter for pickup trucks
    const pickupResults = prices
      .filter(r =>
        r.categoryName.toLowerCase().includes('pickup') ||
        r.carType.toLowerCase().includes('pickup')
      )
      .sort((a, b) => a.price - b.price);

    console.log('\n📊 Pickup truck results:');
    if (pickupResults.length > 0) {
      pickupResults.forEach((r) => console.log(`  ${r.brand} ${r.categoryName}: ${r.priceFormatted}`));
    } else {
      console.log('  None found — showing all car count:', prices.length);
    }

    const output = {
      timestamp: new Date().toISOString(),
      location: 'OGG - Kahului, Maui',
      dates: 'Jul 6, 2026 12:00 PM → Jul 26, 2026 9:00 AM',
      pickupTrucks: pickupResults,
      allCarsCount: prices.length,
    };

    require('fs').writeFileSync('price_result.json', JSON.stringify(output, null, 2));
    console.log('✅ Results saved to price_result.json');
    return output;

  } catch (err) {
    console.error('❌ Error:', err.message);
    try { await page.screenshot({ path: 'error_screenshot.png' }); } catch {}
    throw err;
  } finally {
    await browser.close();
  }
}

checkCostcoCarPrice().catch((err) => {
  console.error(err);
  process.exit(1);
});
