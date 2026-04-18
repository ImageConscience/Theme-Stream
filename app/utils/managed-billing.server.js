/**
 * Partner Dashboard managed app pricing — no Billing API / appSubscriptionCreate in app code.
 * Plans are configured in Shopify Partners; we only check active payment and map subscription names to app logic.
 * @see https://shopify.dev/docs/apps/launch/billing/managed-pricing
 */

const BILLING_ENABLED = process.env.BILLING_ENABLED !== "false";
/** When `true`, Partner development stores skip the active-subscription check (use if the hosted plan page is unreachable). Never affects real merchant shops. */
const BILLING_DEV_STORE_BYPASS = process.env.BILLING_DEV_STORE_BYPASS === "true";

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

const APP_HANDLE_QUERY = `#graphql
  query ThemeStreamAppBillingHandle {
    currentAppInstallation {
      app {
        handle
      }
    }
  }
`;

/**
 * Shopify-hosted plan page (not your app host). Pattern:
 * https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
 *
 * Resolves `:app_handle` from the Admin API when `admin` is provided (recommended), so it matches
 * the installed app even if `SHOPIFY_APP_HANDLE` in env is wrong. Falls back to `SHOPIFY_APP_HANDLE`.
 *
 * @param {object | null | undefined} admin - REST/GraphQL admin from `authenticate.admin` (optional)
 * @param {string | undefined} shop - `*.myshopify.com`
 */
export async function getManagedPricingPageUrl(admin, shop) {
  if (!shop) return "";
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  let appHandle = (process.env.SHOPIFY_APP_HANDLE || "").trim();

  if (admin?.graphql) {
    try {
      const response = await admin.graphql(APP_HANDLE_QUERY);
      const json = await response.json();
      if (json?.errors?.length) {
        console.warn("[billing] App handle query errors:", json.errors.map((e) => e.message).join("; "));
      } else {
        const apiHandle = json?.data?.currentAppInstallation?.app?.handle;
        if (apiHandle && String(apiHandle).trim()) {
          appHandle = String(apiHandle).trim();
        }
      }
    } catch (err) {
      console.warn("[billing] Could not load app handle from Admin API:", err?.message);
    }
  }

  if (!appHandle) {
    console.warn(
      "[billing] App handle unknown. Set SHOPIFY_APP_HANDLE to your app URL slug in Partner Dashboard, or ensure the Admin API returns currentAppInstallation.app.handle.",
    );
    return "";
  }

  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

/**
 * Map active AppSubscription name to internal plan key for feature limits (e.g. stream cap).
 * Returns null if active but name does not match known plans (no cap).
 */
const SHOP_PARTNER_DEV_QUERY = `#graphql
  query ThemeStreamShopPartnerDevelopment {
    shop {
      plan {
        partnerDevelopment
      }
    }
  }
`;

/**
 * `true` only for stores created as Partner **development** stores (not production merchants).
 */
export async function getShopPartnerDevelopment(admin) {
  if (!admin?.graphql) return false;
  try {
    const response = await admin.graphql(SHOP_PARTNER_DEV_QUERY);
    const json = await response.json();
    if (json?.errors?.length) {
      console.warn("[billing] partnerDevelopment query:", json.errors.map((e) => e.message).join("; "));
      return false;
    }
    return Boolean(json?.data?.shop?.plan?.partnerDevelopment);
  } catch (err) {
    console.warn("[billing] Could not read shop.plan.partnerDevelopment:", err?.message);
    return false;
  }
}

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

/**
 * @param {object} billing - from `authenticate.admin(request)`
 * @param {object | null | undefined} admin - GraphQL admin (optional; required for dev-store bypass)
 */
export async function getManagedBillingStatus(billing, admin) {
  if (!BILLING_ENABLED) {
    return {
      hasActivePayment: true,
      plan: null,
      subscriptionName: null,
      devStoreBypass: false,
    };
  }

  if (BILLING_DEV_STORE_BYPASS && admin) {
    const isPartnerDevStore = await getShopPartnerDevelopment(admin);
    if (isPartnerDevStore) {
      return {
        hasActivePayment: true,
        plan: null,
        subscriptionName: null,
        devStoreBypass: true,
      };
    }
  }

  const { hasActivePayment, appSubscriptions } = await billing.check({ isTest: true });
  const sub = appSubscriptions?.[0];
  const subscriptionName = sub?.name != null ? String(sub.name).trim() : null;
  const plan = hasActivePayment ? resolvePlanFromSubscriptionName(subscriptionName) : null;

  return {
    hasActivePayment,
    plan,
    subscriptionName,
    devStoreBypass: false,
  };
}
