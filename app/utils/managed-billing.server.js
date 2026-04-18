/**
 * Partner Dashboard managed app pricing — no Billing API / appSubscriptionCreate in app code.
 * Plans are configured in Shopify Partners; we only check active payment and map subscription names to app logic.
 * @see https://shopify.dev/docs/apps/launch/billing/managed-pricing
 */

const BILLING_ENABLED = process.env.BILLING_ENABLED !== "false";

/** Comma-separated subscription names that count as the Starter plan (must match Partner plan display/handle). */
function nameSetFromEnv(key, fallbackCsv) {
  const raw = process.env[key];
  const csv = raw != null && String(raw).trim() !== "" ? String(raw) : fallbackCsv;
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const STARTER_NAMES = nameSetFromEnv("MANAGED_PLAN_MATCH_STARTER", "starter,Starter");
const STREAMER_NAMES = nameSetFromEnv("MANAGED_PLAN_MATCH_STREAMER", "streamer,Streamer");

export function isBillingEnabled() {
  return BILLING_ENABLED;
}

/**
 * URL of Shopify-hosted plan selection for this app (managed pricing).
 * `SHOPIFY_APP_HANDLE` must match the app handle in the Partner Dashboard (URL slug).
 */
export function getManagedPricingPageUrl(shop) {
  if (!shop) return "";
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  const appHandle = (process.env.SHOPIFY_APP_HANDLE || "").trim();
  if (!appHandle) {
    console.warn(
      "[billing] SHOPIFY_APP_HANDLE is not set. Set it to your app handle from the Partner Dashboard.",
    );
  }
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

/**
 * Map active AppSubscription name to internal plan key for feature limits (e.g. stream cap).
 * Returns null if active but name does not match known plans (no cap).
 */
export function resolvePlanFromSubscriptionName(name) {
  if (name == null || String(name).trim() === "") return null;
  const trimmed = String(name).trim();
  if (STARTER_NAMES.has(trimmed)) return "starter";
  if (STREAMER_NAMES.has(trimmed)) return "streamer";
  const lower = trimmed.toLowerCase();
  if (lower === "starter" || lower.includes("starter")) return "starter";
  if (lower === "streamer" || lower.includes("streamer")) return "streamer";
  return null;
}

/** @param {object} billing - `billing` from `authenticate.admin(request)` */
export async function getManagedBillingStatus(billing) {
  if (!BILLING_ENABLED) {
    return {
      hasActivePayment: true,
      plan: null,
      subscriptionName: null,
    };
  }

  const { hasActivePayment, appSubscriptions } = await billing.check({ isTest: true });
  const sub = appSubscriptions?.[0];
  const subscriptionName = sub?.name != null ? String(sub.name).trim() : null;
  const plan = hasActivePayment ? resolvePlanFromSubscriptionName(subscriptionName) : null;

  return {
    hasActivePayment,
    plan,
    subscriptionName,
  };
}
