const { chromium } = require('playwright');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  pickupLocation: 'OGG',
  pickupDate: '07/06/2026',
  pickupTime: '12:00 PM',
  dropoffDate: '07/26/2026',
  dropoffTime: '09:00 AM',
  carCategory: 'Full-size Pickup',
  // Set these as GitHub Actions secrets (see README)
  notifyEmail: process.env.NOTIFY_EMAIL,
};
// ──────────────────────────────────────────────────────────────────────────────

async function checkCostcoCarPrice() {
  console.log('🚗 Starting Costco Travel car rental price check...');

  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io/chromium/stealth?token=${browserlessKey}`
  );

  const context = browser.contexts()[0] || await browser.newContext();

  const page = await context.newPage();

  try {
    // 1. Navigate to Costco Travel car rentals
    console.log('📍 Navigating to Costco Travel...');
    await page.goto('https://www.costcotravel.com/Rental-Cars', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000); // Let JS render after load

    // 2. Fill in pickup location
    console.log('📝 Filling in search form...');
    await page.waitForSelector('input[placeholder*="Pick-up"], input[id*="pickup"], input[name*="pickup"]', {
      timeout: 15000,
    });

    // Click and fill the pickup location field
    const locationInput = page.locator('#pickupLocationTextWidget');
    await locationInput.click();
    await locationInput.fill('OGG');
    await page.waitForTimeout(3000); // Wait for autocomplete dropdown to appear

    // Select OGG from dropdown - try multiple selector patterns
    try {
      const oggOption = page.locator('ul li:has-text("OGG"), ul li:has-text("Kahului"), [role="option"]:has-text("OGG")').first();
      await oggOption.waitFor({ timeout: 8000 });
      await oggOption.click();
      console.log('✅ Selected OGG from dropdown');
    } catch {
      // Take a screenshot to see what the dropdown looks like
      await page.screenshot({ path: 'dropdown_debug.png' });
      console.log('⚠️ Could not find OGG dropdown option, pressing Enter');
      await locationInput.press('Enter');
    }
    await page.waitForTimeout(1000);

    // 3. Fill pickup date - use the datepicker properly
    const pickupDateInput = page.locator('#pickUpDateWidget');
    await pickupDateInput.click();
    await page.waitForTimeout(500);
    await pickupDateInput.fill('');
    await pickupDateInput.type(CONFIG.pickupDate, { delay: 50 });
    await page.keyboard.press('Escape'); // Close datepicker
    await page.waitForTimeout(500);

    // 4. Fill pickup time
    try {
      await page.locator('#pickupTimeWidget').selectOption({ value: CONFIG.pickupTime });
    } catch {
      console.log('⚠️  Could not set pickup time, continuing...');
    }
    await page.waitForTimeout(500);

    // 5. Fill dropoff date
    const dropoffDateInput = page.locator('#dropOffDateWidget');
    await dropoffDateInput.click();
    await page.waitForTimeout(500);
    await dropoffDateInput.fill('');
    await dropoffDateInput.type(CONFIG.dropoffDate, { delay: 50 });
    await page.keyboard.press('Escape'); // Close datepicker
    await page.waitForTimeout(500);

    // 6. Fill dropoff time
    try {
      await page.locator('#dropoffTimeWidget').selectOption({ value: CONFIG.dropoffTime });
    } catch {
      console.log('⚠️  Could not set dropoff time, continuing...');
    }
    await page.waitForTimeout(500);

    // 7. Click Search button
    console.log('🔍 Submitting search...');
    await page.locator('#findMyCarButton').click();

    // 8. Wait for results
    console.log('⏳ Waiting for results...');
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
    await page.waitForTimeout(3000);

    // 9. Take a screenshot for debugging
    await page.screenshot({ path: 'results.png', fullPage: false });
    console.log('📸 Screenshot saved to results.png');

    // 10. Extract prices — look for full-size pickup trucks
    console.log('💰 Extracting prices...');
    const prices = await page.evaluate(() => {
      const results = [];

      // Common Costco Travel result card patterns
      const cards = document.querySelectorAll(
        '.car-result, .vehicle-card, [class*="carResult"], [class*="vehicle"], .result-item'
      );

      cards.forEach((card) => {
        const nameEl = card.querySelector('[class*="vehicleName"], [class*="carName"], h3, h4, .vehicle-name');
        const priceEl = card.querySelector('[class*="price"], [class*="rate"], .total-price, .daily-rate');
        const categoryEl = card.querySelector('[class*="category"], [class*="class"], .car-category');

        if (nameEl || categoryEl) {
          results.push({
            name: nameEl?.textContent?.trim() || '',
            category: categoryEl?.textContent?.trim() || '',
            price: priceEl?.textContent?.trim() || '',
          });
        }
      });

      // Fallback: grab all price elements on the page
      if (results.length === 0) {
        document.querySelectorAll('[class*="price"], [class*="total"]').forEach((el) => {
          const text = el.textContent.trim();
          if (text.includes('$')) {
            results.push({ name: 'Unknown', price: text });
          }
        });
      }

      return results;
    });

    // 11. Filter for pickup trucks
    const pickupResults = prices.filter(
      (r) =>
        r.name?.toLowerCase().includes('pickup') ||
        r.name?.toLowerCase().includes('truck') ||
        r.category?.toLowerCase().includes('pickup') ||
        r.category?.toLowerCase().includes('truck')
    );

    const allResults = pickupResults.length > 0 ? pickupResults : prices;

    console.log('\n📊 Results found:');
    allResults.forEach((r) => console.log(`  ${r.name || r.category}: ${r.price}`));

    // 12. Log result as JSON for GitHub Actions to pick up
    const output = {
      timestamp: new Date().toISOString(),
      config: CONFIG,
      results: allResults,
      rawResultCount: prices.length,
    };

    const fs = require('fs');
    fs.writeFileSync('price_result.json', JSON.stringify(output, null, 2));
    console.log('\n✅ Results saved to price_result.json');

    return output;
  } catch (err) {
    console.error('❌ Error during price check:', err.message);
    await page.screenshot({ path: 'error_screenshot.png' });
    throw err;
  } finally {
    await browser.close();
  }
}

checkCostcoCarPrice().catch((err) => {
  console.error(err);
  process.exit(1);
});
