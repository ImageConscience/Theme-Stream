/**
 * Support page – publicly accessible. Required for Built for Shopify.
 */

import { useLoaderData } from "react-router";

export const loader = () => {
  return {
    supportEmail: process.env.SUPPORT_EMAIL || "loyalestapp@gmail.com",
    appUrl: process.env.SHOPIFY_APP_URL || "",
  };
};

export default function Support() {
  const { supportEmail, appUrl } = useLoaderData();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: "560px", margin: "0 auto", padding: "2rem 1rem", lineHeight: 1.6, color: "#333" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Theme Stream Support</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Get help with scheduling banners, theme blocks, and billing.
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Contact Us</h2>
        <p>
          Email:{" "}
          <a href={`mailto:${supportEmail}`} style={{ color: "#0066cc" }}>{supportEmail}</a>
        </p>
        <p style={{ marginTop: "0.5rem", fontSize: "0.95rem", color: "#555" }}>
          We typically respond within 1–2 business days.
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>Resources</h2>
        <ul style={{ marginLeft: "1.25rem" }}>
          <li>
            <a href="/privacy" style={{ color: "#0066cc" }}>Privacy Policy</a>
          </li>
          <li>
            <a href="https://help.shopify.com" style={{ color: "#0066cc" }} target="_blank" rel="noopener noreferrer">
              Shopify Help Center
            </a>
          </li>
        </ul>
      </section>

      <p style={{ marginTop: "2rem", color: "#666", fontSize: "0.9rem" }}>
        <a href={appUrl ? `${appUrl.replace(/\/$/, "")}/app/theme-stream` : "/app/theme-stream"} style={{ color: "#0066cc" }}>← Back to Theme Stream</a>
      </p>
    </div>
  );
}
