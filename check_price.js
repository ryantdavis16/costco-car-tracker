const { chromium } = require('playwright');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  pickupLocation: 'OGG',
  pickupDate: '07/06/2025',
  pickupTime: '12:00 PM',
  dropoffDate: '07/26/2025',
  dropoffTime: '09:00 AM',
  carCategory: 'Full-size Pickup',
  // Set these as GitHub Actions secrets (see README)
  notifyEmail: process.env.NOTIFY_EMAIL,
};
// ──────────────────────────────────────────────────────────────────────────────

async function checkCostcoCarPrice() {
  console.log('🚗 Starting Costco Travel car rental price check...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // 1. Navigate to Costco Travel car rentals
    console.log('📍 Navigating to Costco Travel...');
    await page.goto('https://www.costcotravel.com/Rental-Cars', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 2. Fill in pickup location
    console.log('📝 Filling in search form...');
    await page.waitForSelector('input[placeholder*="Pick-up"], input[id*="pickup"], input[name*="pickup"]', {
      timeout: 15000,
    });

    // Click and fill the pickup location field
    const locationInput = page.locator('input[placeholder*="Pick-up"], input[id*="pickupLocation"], #pickupLocationTextInput').first();
    await locationInput.click();
    await locationInput.fill('OGG');
    await page.waitForTimeout(1500); // Wait for autocomplete

    // Select OGG from dropdown
    const oggOption = page.locator('text=OGG, li:has-text("Kahului"), [data-value="OGG"]').first();
    try {
      await oggOption.waitFor({ timeout: 5000 });
      await oggOption.click();
    } catch {
      // Try pressing Enter if dropdown doesn't appear
      await locationInput.press('Enter');
    }

    // 3. Fill pickup date
    const pickupDateInput = page.locator('input[id*="pickupDate"], input[placeholder*="Pick-up Date"], #pickUpDate').first();
    await pickupDateInput.click();
    await pickupDateInput.fill(CONFIG.pickupDate);
    await page.waitForTimeout(500);

    // 4. Fill pickup time
    const pickupTimeSelect = page.locator('select[id*="pickupTime"], select[name*="pickupTime"]').first();
    try {
      await pickupTimeSelect.selectOption({ label: CONFIG.pickupTime });
    } catch {
      console.log('⚠️  Could not set pickup time via select, continuing...');
    }

    // 5. Fill dropoff date
    const dropoffDateInput = page.locator('input[id*="returnDate"], input[placeholder*="Return Date"], #returnDate').first();
    await dropoffDateInput.click();
    await dropoffDateInput.fill(CONFIG.dropoffDate);
    await page.waitForTimeout(500);

    // 6. Fill dropoff time
    const dropoffTimeSelect = page.locator('select[id*="returnTime"], select[name*="returnTime"]').first();
    try {
      await dropoffTimeSelect.selectOption({ label: CONFIG.dropoffTime });
    } catch {
      console.log('⚠️  Could not set dropoff time via select, continuing...');
    }

    // 7. Click Search button
    console.log('🔍 Submitting search...');
    const searchButton = page.locator('button[type="submit"], button:has-text("Search"), input[value="Search"]').first();
    await searchButton.click();

    // 8. Wait for results
    console.log('⏳ Waiting for results...');
    await page.waitForLoadState('networkidle', { timeout: 30000 });
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
