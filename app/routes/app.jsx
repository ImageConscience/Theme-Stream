import { useCallback } from "react";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
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

const navPricingButtonStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  font: "inherit",
  color: "inherit",
  padding: 0,
  margin: 0,
  textAlign: "inherit",
};

/**
 * `s-app-nav` hijacks normal links. Same approach as theme-stream billing buttons: App Bridge
 * `Redirect.Action.REMOTE` (not `window.location` / plain anchors inside the nav slot).
 */
function AppNavManagedPricingButton({ href, children }) {
  const shopify = useAppBridge();
  const onClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!href) return;
      if (shopify) {
        try {
          const redirect = Redirect.create(shopify);
          redirect.dispatch(Redirect.Action.REMOTE, {
            url: href,
            newContext: true,
          });
          return;
        } catch (err) {
          console.error("[app nav] App Bridge redirect failed:", err);
        }
      }
      window.open(href, "_top");
    },
    [shopify, href],
  );

  if (!href) return null;
  return (
    <button type="button" onClick={onClick} style={navPricingButtonStyle}>
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
            <AppNavManagedPricingButton href={managedPricingUrl}>Plan &amp; billing</AppNavManagedPricingButton>
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
