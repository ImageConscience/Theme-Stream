const BILLING_ENABLED = process.env.BILLING_ENABLED !== "false";
const CURRENCY_CODE = (process.env.BILLING_CURRENCY || "USD").toUpperCase();
const INTERVAL = (process.env.BILLING_INTERVAL || "EVERY_30_DAYS").toUpperCase();
const TRIAL_DAYS = Number.parseInt(process.env.BILLING_TRIAL_DAYS ?? "7", 10);

/**
 * Parse price from env. Empty string is not nullish for ?? so Number.parseFloat("") is NaN and
 * broke isBillingConfigured — treat blank / invalid as default.
 */
function parseBillingPrice(envKey, defaultPrice) {
  const raw = process.env[envKey];
  const str = raw == null || String(raw).trim() === "" ? String(defaultPrice) : String(raw).trim();
  const n = Number.parseFloat(str);
  return Number.isFinite(n) && n > 0 ? n : defaultPrice;
}

/** Base URL for billing return links (no trailing slash). Required for real charges + Plan & billing UI. */
const APP_BASE_URL = (process.env.BILLING_RETURN_URL || process.env.SHOPIFY_APP_URL || "")
  .trim()
  .replace(/\/$/, "");

/** Plan keys: starter (Standard only), streamer (Standard only), streamer_plus (Plus only) */
const PLAN_CONFIG = {
  starter: {
    name: (process.env.BILLING_PLAN_STARTER_NAME || "Starter").trim() || "Starter",
    price: parseBillingPrice("BILLING_PRICE_STARTER", 9),
    forShopifyPlus: false,
    maxStreams: 3,
  },
  streamer: {
    name: (process.env.BILLING_PLAN_STREAMER_NAME || "Streamer").trim() || "Streamer",
    price: parseBillingPrice("BILLING_PRICE_STREAMER", 29),
    forShopifyPlus: false,
    maxStreams: null,
  },
  streamer_plus: {
    name: (process.env.BILLING_PLAN_STREAMER_PLUS_NAME || "Streamer Plus").trim() || "Streamer Plus",
    price: parseBillingPrice("BILLING_PRICE_STREAMER_PLUS", 49),
    forShopifyPlus: true,
    maxStreams: null,
  },
};

const SHOP_PLAN_QUERY = `#graphql
  query GetShopPlan {
    shop {
      plan {
        partnerDevelopment
        shopifyPlus
        publicDisplayName
      }
    }
  }
`;

const CHECK_SUBSCRIPTION_QUERY = `#graphql
  query CheckThemeStreamSubscription {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                interval
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

const CREATE_SUBSCRIPTION_MUTATION = `#graphql
  mutation CreateThemeStreamSubscription(
    $name: String!
    $trialDays: Int
    $amount: Decimal!
    $currencyCode: CurrencyCode!
    $interval: AppPricingInterval!
    $returnUrl: URL!
    $test: Boolean
    $replacementBehavior: AppSubscriptionReplacementBehavior
  ) {
    appSubscriptionCreate(
      name: $name
      trialDays: $trialDays
      returnUrl: $returnUrl
      test: $test
      replacementBehavior: $replacementBehavior
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              interval: $interval
              price: { amount: $amount, currencyCode: $currencyCode }
            }
          }
        }
      ]
    ) {
      appSubscription {
        id
        name
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

const VALID_PLAN_KEYS = ["starter", "streamer", "streamer_plus"];
const isBillingConfigured =
  BILLING_ENABLED &&
  APP_BASE_URL &&
  VALID_PLAN_KEYS.every(
    (k) =>
      PLAN_CONFIG[k].price > 0 &&
      typeof PLAN_CONFIG[k].name === "string" &&
      PLAN_CONFIG[k].name.length > 0,
  );

const APP_BRIDGE_REDIRECT_HEADER = "X-Shopify-App-Bridge-Redirect";
const APP_BRIDGE_REDIRECT_URL_HEADER = "X-Shopify-App-Bridge-Redirect-Url";

export function createAppBridgeRedirect(confirmationUrl) {
  return new Response(JSON.stringify({ redirectUrl: confirmationUrl }), {
    status: 200,
    headers: {
      [APP_BRIDGE_REDIRECT_HEADER]: "1",
      [APP_BRIDGE_REDIRECT_URL_HEADER]: confirmationUrl,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Returns plan config for a given key */
export function getPlanConfig(planKey) {
  return PLAN_CONFIG[planKey] ?? null;
}

/**
 * True when recurring billing is fully configured (charges can be created).
 * Requires BILLING_ENABLED, SHOPIFY_APP_URL or BILLING_RETURN_URL, and valid plan prices/names.
 */
export function isMerchantBillingUiEnabled() {
  return isBillingConfigured;
}

/**
 * Show Plan & billing in the embedded app.
 * - Dev stores / Billing API unavailable: hasActive is true but plan is often null — still show so
 *   merchants can attempt plan changes (may use test charges or see Shopify’s message).
 * - Production: show when config is complete, or we matched a plan from Shopify.
 */
export function shouldShowPlanBillingUi(billingStatus) {
  if (!BILLING_ENABLED) return false;
  if (isMerchantBillingUiEnabled()) return true;
  if (billingStatus?.plan) return true;
  if (billingStatus?.hasActive) return true;
  return false;
}

/** Check subscription status and shop type. Returns { hasActive, plan, shopifyPlus, partnerDevelopment } */
export async function checkSubscriptionStatus(admin) {
  const result = { hasActive: false, plan: null, shopifyPlus: false, partnerDevelopment: false };

  if (!isBillingConfigured) {
    if (BILLING_ENABLED) {
      console.warn("[billing] Billing enabled but config incomplete. Skipping check.");
    }
    result.hasActive = true;
    return result;
  }

  try {
    const planResponse = await admin.graphql(SHOP_PLAN_QUERY);
    const planJson = await planResponse.json();
    const shopPlan = planJson?.data?.shop?.plan ?? {};
    result.partnerDevelopment = shopPlan.partnerDevelopment ?? false;
    result.shopifyPlus = shopPlan.shopifyPlus ?? false;

  } catch (planError) {
    console.warn("[billing] Could not check shop plan:", planError?.message);
  }

  try {
    const response = await admin.graphql(CHECK_SUBSCRIPTION_QUERY);
    const json = await response.json();

    if (json?.errors?.length) {
      const message = json.errors.map((e) => e.message).join(", ");
      throw new Error(`[billing] Failed to check subscriptions: ${message}`);
    }

    const activeSubscriptions =
      json?.data?.currentAppInstallation?.activeSubscriptions?.filter(Boolean) ?? [];

    for (const sub of activeSubscriptions) {
      if (sub.status !== "ACTIVE") continue;
      const name = (sub.name || "").trim();
      for (const [key, config] of Object.entries(PLAN_CONFIG)) {
        if (name === config.name) {
          const price = sub.lineItems?.[0]?.plan?.pricingDetails?.price;
          if (price) {
            const amountMatch = Number.parseFloat(price.amount) === config.price;
            const currencyMatch = price.currencyCode === CURRENCY_CODE;
            if (!amountMatch || !currencyMatch) continue;
          }
          result.hasActive = true;
          result.plan = key;
          return result;
        }
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Apps without a public distribution cannot use the Billing API")
    ) {
      console.warn("[billing] App not public yet; skipping billing.");
      result.hasActive = true;
      return result;
    }
    console.error("[billing] Error checking subscription:", error);
    throw error;
  }

  return result;
}

/**
 * Create a subscription for the given plan key. Returns confirmation URL or null.
 * @param {object} [options]
 * @param {boolean} [options.isPlanChange] — true when merchant already has an active subscription (upgrade/downgrade)
 */
export async function createSubscriptionForPlan(admin, request, planKey, options = {}) {
  const { isPlanChange = false } = options;
  if (!VALID_PLAN_KEYS.includes(planKey)) {
    throw new Error(`[billing] Invalid plan key: ${planKey}`);
  }

  if (!isBillingConfigured) {
    if (BILLING_ENABLED) {
      throw new Error(
        "Billing is not fully configured. Please set BILLING_PRICE_* and related environment variables.",
      );
    }
    return null;
  }

  const config = PLAN_CONFIG[planKey];
  if (!config || config.price <= 0) {
    throw new Error(`[billing] Invalid plan config for: ${planKey}`);
  }

  try {
    const planResponse = await admin.graphql(SHOP_PLAN_QUERY);
    const planJson = await planResponse.json();
    const shopifyPlus = planJson?.data?.shop?.plan?.shopifyPlus ?? false;

    if (planKey === "streamer_plus" && !shopifyPlus) {
      throw new Error("[billing] Streamer Plus is only available for Shopify Plus stores.");
    }
    if ((planKey === "starter" || planKey === "streamer") && shopifyPlus) {
      throw new Error("[billing] Starter and Streamer are for Shopify Standard only. Please choose Streamer Plus.");
    }
  } catch (planError) {
    if (planError.message?.startsWith("[billing]")) throw planError;
    console.warn("[billing] Could not verify shop plan:", planError?.message);
  }

  const url = new URL(request.url);
  const hostParam = url.searchParams.get("host");
  const shopParam =
    url.searchParams.get("shop") ||
    url.searchParams.get("shopify") ||
    admin?.session?.shop ||
    request.headers.get("x-shopify-shop-domain") ||
    undefined;

  const returnUrl = new URL("/app/theme-stream", APP_BASE_URL);
  if (hostParam) returnUrl.searchParams.set("host", hostParam);
  if (shopParam) returnUrl.searchParams.set("shop", shopParam);

  try {
    const trialDays =
      !isPlanChange && Number.isFinite(TRIAL_DAYS) && TRIAL_DAYS > 0 ? TRIAL_DAYS : null;
    const creationResponse = await admin.graphql(CREATE_SUBSCRIPTION_MUTATION, {
      variables: {
        name: config.name,
        trialDays,
        amount: config.price.toFixed(2),
        currencyCode: CURRENCY_CODE,
        interval: INTERVAL,
        returnUrl: returnUrl.toString(),
        test: false,
        replacementBehavior: isPlanChange ? "APPLY_IMMEDIATELY" : null,
      },
    });
    const creationJson = await creationResponse.json();

    if (creationJson?.errors?.length) {
      const message = creationJson.errors.map((e) => e.message).join(", ");
      if (message.includes("Apps without a public distribution cannot use the Billing API")) {
        throw new Error(
          "Billing requires the app to be listed in the App Store. Submit your app for review in the Shopify Partner Dashboard to enable billing.",
        );
      }
      throw new Error(`[billing] Failed to create subscription: ${message}`);
    }

    const userErrors =
      creationJson?.data?.appSubscriptionCreate?.userErrors?.filter(Boolean) ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((e) => e.message).join(", ");
      if (message.includes("Apps without a public distribution cannot use the Billing API")) {
        throw new Error(
          "Billing requires the app to be listed in the App Store. Submit your app for review in the Shopify Partner Dashboard to enable billing.",
        );
      }
      throw new Error(`[billing] Subscription creation errors: ${message}`);
    }

    const confirmationUrl = creationJson?.data?.appSubscriptionCreate?.confirmationUrl;
    if (!confirmationUrl) {
      throw new Error("[billing] Missing confirmation URL.");
    }

    console.log("[billing] Created subscription for", planKey, "->", confirmationUrl);
    return confirmationUrl;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Apps without a public distribution cannot use the Billing API")
    ) {
      throw new Error(
        "Billing requires the app to be listed in the App Store. Submit your app for review in the Shopify Partner Dashboard to enable billing.",
      );
    }
    throw error;
  }
}
