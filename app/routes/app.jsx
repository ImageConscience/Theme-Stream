import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getManagedPricingPageUrl } from "../utils/managed-billing.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const managedPricingUrl = getManagedPricingPageUrl(session?.shop);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    billingNavEnabled: process.env.BILLING_ENABLED !== "false",
    managedPricingUrl,
  };
};

export default function App() {
  const { apiKey, billingNavEnabled, managedPricingUrl } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app/theme-stream">Streams</s-link>
        {billingNavEnabled && (
          <s-link href="/app/theme-stream#plan-billing">Plan &amp; billing</s-link>
        )}
      </s-app-nav>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
        <footer style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "#6d7175", borderTop: "1px solid #e1e3e5" }}>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ marginRight: "1rem", color: "inherit" }}>Privacy</a>
          {billingNavEnabled && managedPricingUrl ? (
            <a
              href={managedPricingUrl}
              target="_top"
              rel="noopener noreferrer"
              style={{ marginRight: "1rem", color: "inherit" }}
            >
              Pricing
            </a>
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
