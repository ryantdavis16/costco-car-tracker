# 🚗 Costco Car Rental Price Tracker

Checks Costco Travel daily for full-size pickup truck prices at OGG (Maui) and emails you the results.

**Trip:** July 6 (12:00 PM) → July 26 (9:00 AM)

---

## Setup (15 minutes)

### 1. Create a GitHub repo
- Go to github.com → New repository → name it `costco-car-tracker`
- Upload all these files to the repo

### 2. Add GitHub Secrets
Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these 3 secrets:

| Secret Name | Value |
|---|---|
| `GMAIL_USER` | your Gmail address (e.g. `you@gmail.com`) |
| `GMAIL_APP_PASSWORD` | Gmail App Password (see below) |
| `NOTIFY_EMAIL` | email address to receive alerts |

#### How to get a Gmail App Password:
1. Go to [myaccount.google.com](https://myaccount.google.com)
2. Security → 2-Step Verification (enable if not on)
3. Security → App Passwords
4. Create one named "GitHub Actions" → copy the 16-character password

### 3. Enable GitHub Actions
- Go to your repo → **Actions** tab
- Click "I understand my workflows, go ahead and enable them"

### 4. Test it manually
- Actions tab → "Costco Car Rental Price Check" → **Run workflow**
- Check your email after ~2 minutes

---

## How it works

1. GitHub Actions spins up a virtual machine every day at noon Pacific
2. Playwright launches a real Chromium browser (headless)
3. The script navigates to Costco Travel, fills in your search filters, and clicks through
4. Prices are extracted from the results page
5. Results + a screenshot are emailed to you
6. The run log and screenshot are saved as artifacts in GitHub Actions for debugging

---

## Troubleshooting

**No prices in email?**
- Check the Actions run log for errors
- Download the `price-check-screenshot` artifact to see what the browser saw
- Costco may have updated their page layout — the selectors in `check_price.js` may need adjusting

**Email not arriving?**
- Check your spam folder
- Verify your Gmail App Password is correct in Secrets
- Make sure 2FA is enabled on your Google account

---

## Adjusting the schedule

The workflow runs daily at **noon Pacific (7 PM UTC)**. To change it, edit `.github/workflows/price_check.yml`:

```yaml
- cron: '0 19 * * *'   # 7 PM UTC = noon Pacific
```

Use [crontab.guru](https://crontab.guru) to customize the timing.
