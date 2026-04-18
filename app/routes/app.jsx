import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getManagedPricingPageUrl } from "../utils/managed-billing.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const managedPricingUrl = await getManagedPricingPageUrl(admin, session?.shop);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    billingNavEnabled: process.env.BILLING_ENABLED !== "false",
    managedPricingUrl,
  };
};

/** Footer: plain anchor works outside `s-app-nav`. */
function ManagedPricingAnchor({ href, children, style }) {
  if (!href) return null;
  return (
    <a href={href} target="_top" rel="noopener noreferrer" style={style}>
      {children}
    </a>
  );
}

/**
 * Left nav lives inside `s-app-nav`, which intercepts `<a>` / `s-link` and routes as embedded app URLs
 * (e.g. …/apps/theme-stream/app/theme-stream). Use a button + top-window navigation to the real admin URL.
 */
function ManagedPricingAppNavButton({ href, children }) {
  if (!href) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.top && window.top !== window.self) {
          window.top.location.assign(href);
        } else {
          window.location.assign(href);
        }
      }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
        padding: 0,
        margin: 0,
        textAlign: "inherit",
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  const { apiKey, billingNavEnabled, managedPricingUrl } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app/theme-stream">Streams</s-link>
        {billingNavEnabled &&
          (managedPricingUrl ? (
            <ManagedPricingAppNavButton href={managedPricingUrl}>Plan &amp; billing</ManagedPricingAppNavButton>
          ) : (
            <s-link href="/app/theme-stream#plan-billing">Plan &amp; billing</s-link>
          ))}
      </s-app-nav>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
        <footer style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "#6d7175", borderTop: "1px solid #e1e3e5" }}>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ marginRight: "1rem", color: "inherit" }}>Privacy</a>
          {billingNavEnabled ? (
            <ManagedPricingAnchor href={managedPricingUrl} style={{ marginRight: "1rem", color: "inherit" }}>
              Pricing
            </ManagedPricingAnchor>
          ) : null}
          <a href="/support" target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>Support</a>
        </footer>
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
