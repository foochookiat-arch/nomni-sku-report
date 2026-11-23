# Daily Nomni Procure SKU spending report

Every morning at about 10am Singapore time, GitHub logs in to Nomni Procure (buyer.zeemart.co), exports the **Spending report → SKU → Summary** for yesterday, and saves it as `reports/SpendingBySKU_YYYYMMDD.xlsx` in this repo. Your Mac can stay closed.

## One-time setup (about 10 minutes)

1. Create a **private** GitHub repo (for example `nomni-sku-report`) and upload everything in this folder, including the hidden `.github` folder.
2. In the repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `NOMNI_EMAIL` with your Nomni Procure login email
   - `NOMNI_PASSWORD` with your Nomni Procure password
3. Go to **Actions → Daily Nomni SKU spending report → Run workflow** and run it once by hand.
   - When it succeeds, `reports/` has yesterday's file.
   - If it fails, open the run and download the `failure-screenshot` artifact to see where it stopped.

## Sending the report to the recipe costing app

After saving the file, the workflow uploads it to the recipe costing app (SKU Listing), the same as **Upload Price List**: unchanged prices just update the month, and price changes or new items go to **Review Price**. It needs two more repository secrets:

- `RECIPE_APP_URL`: the app's live address, for example `https://your-app.vercel.app`
- `PRICE_IMPORT_TOKEN`: the same value as `PRICE_IMPORT_TOKEN` in the app's Vercel environment variables
- `VERCEL_BYPASS_SECRET`: needed because the app has Vercel Authentication on. In Vercel, open the project's **Settings → Deployment Protection → Protection Bypass for Automation**, create a secret, and paste it here.

If the upload step fails, its log shows the HTTP status and the app's reply.

## Running a specific day

Use **Run workflow** and fill in `report_date` (for example `2026-11-20`).

## Notes

- If Nomni adds a verification code (2FA) to login, the script can't get past it. Use a separate Nomni user without 2FA, or tell Claude.
- The file has the same columns as a manual export: SKU, Supplier, Expense category, Tag, Average price, Quantity, UOM, Amount, % of total.
- If Nomni redesigns its report page, the Export → Summary click may need updating.
