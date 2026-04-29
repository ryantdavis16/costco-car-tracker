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
    await page.waitForTimeout(500);
    // Type character by character to trigger autocomplete JS events
    await page.keyboard.type('OGG', { delay: 150 });
    await page.waitForTimeout(4000); // Wait longer for autocomplete dropdown

    // Take debug screenshot to see dropdown state
    await page.screenshot({ path: 'dropdown_debug.png' });

    // Select OGG from dropdown - try multiple selector patterns
    try {
      const oggOption = page.locator('ul li:has-text("OGG"), ul li:has-text("Kahului"), [role="option"]:has-text("OGG"), .autocomplete-suggestion:has-text("OGG")').first();
      await oggOption.waitFor({ timeout: 5000 });
      await oggOption.click();
      console.log('✅ Selected OGG from dropdown');
    } catch {
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
    // Wait for URL to change to results page
    try {
      await page.waitForURL('**/h=3002**', { timeout: 30000 });
      console.log('✅ Results page URL detected');
    } catch {
      console.log('⚠️ URL did not change, continuing...');
    }
    await page.waitForTimeout(5000);
    try {
      await page.waitForSelector('a[data-category-name][data-price][data-brand]', { timeout: 20000 });
      console.log('✅ Car result cards loaded');
    } catch {
      console.log('⚠️ Could not detect result cards...');
    }
    await page.waitForTimeout(2000);

    // 9. Take a screenshot for debugging
    await page.screenshot({ path: 'results.png', fullPage: false });
    console.log('📸 Screenshot saved to results.png');

    // 10. Extract prices using exact data attributes from Costco's HTML
    console.log('💰 Extracting prices...');
    const prices = await page.evaluate(() => {
      const results = [];

      // All car result cards have data-category-name and data-price attributes
      const cards = document.querySelectorAll('a[data-category-name][data-price][data-brand]');

      cards.forEach((card) => {
        const categoryName = card.getAttribute('data-category-name') || '';
        const brand = card.getAttribute('data-brand') || '';
        const price = card.getAttribute('data-price') || '';
        const priceFormatted = card.getAttribute('data-price-fomatted-and-rounded') || '';
        const carType = card.getAttribute('data-car-type') || '';

        results.push({ categoryName, brand, price: parseFloat(price), priceFormatted, carType });
      });

      return results;
    });

    // Filter for full-size pickups
    const pickupResults = prices.filter(r =>
      r.categoryName.toLowerCase().includes('fullsize pickup') ||
      r.categoryName.toLowerCase().includes('full-size pickup') ||
      r.carType.toLowerCase().includes('pickup')
    );

    const allResults = pickupResults.length > 0 ? pickupResults : prices;

    console.log('\n📊 Pickup truck results found:');
    pickupResults.forEach((r) => console.log(`  ${r.brand} ${r.categoryName}: ${r.priceFormatted}`));

    if (pickupResults.length === 0) {
      console.log('⚠️ No pickup results found, showing all results:');
      prices.forEach((r) => console.log(`  ${r.brand} ${r.categoryName}: ${r.priceFormatted}`));
    }

    // Sort pickups by price
    pickupResults.sort((a, b) => a.price - b.price);

    // 12. Log result as JSON for GitHub Actions to pick up
    const output = {
      timestamp: new Date().toISOString(),
      location: 'OGG - Kahului, Maui',
      dates: 'Jul 6, 2026 12:00 PM → Jul 26, 2026 9:00 AM',
      pickupTrucks: pickupResults,
      allCarsCount: prices.length,
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
