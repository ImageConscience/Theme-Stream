# Billing QA Checklist (managed app pricing)

> Plans are defined in the **Partner Dashboard** (managed pricing). The app checks `billing.check()` and links merchants to Shopify’s plan page. Set `SHOPIFY_APP_HANDLE` to your app’s handle (Partners URL slug).

## Pre-flight

- [ ] Railway (or host) has `SHOPIFY_APP_URL`, Shopify app keys, and (optional) `SHOPIFY_APP_HANDLE` / `BILLING_ENABLED` / `MANAGED_PLAN_MATCH_*`.
- [ ] Partner Dashboard: managed pricing enabled; public plans **starter** and **streamer** (handles) match `MANAGED_PLAN_MATCH_*` if you customize env.

## Troubleshooting

- **404 on Shopify’s plan page (`admin.shopify.com/.../pricing_plans`)** on a dev store: often a **locale mismatch** between the draft app listing and the dev store (Shopify limitation). Match languages, or test after listing is published.
- **Pricing link is not your Railway URL**: expected — billing UI is hosted by Shopify, not your app.
- **Can’t complete a plan on a dev store** but you need to test the app: set `BILLING_DEV_STORE_BYPASS=true` on your **staging** Railway service (not production). Only **Partner development stores** are allowed through; remove or set `false` before shipping.


## Test cases

1. **Fresh install**
   - Install on a development store.
   - Expect **Choose your plan** → **View plans in Shopify** opens the hosted pricing page.
   - Subscribe; after approval, the app dashboard loads.
2. **Cancel subscription**
   - In the dev store, cancel the app subscription.
   - Re-open the app; expect **Choose your plan** again.
3. **Re-accept**
   - Subscribe again; confirm entries and JSON actions work.
4. **Starter stream cap**
   - On Starter, confirm creating more than three streams is blocked until upgrading to Streamer (via Shopify plan page).

## Post-test

- [ ] Document plan names and trial copy for support / App Store listing.
