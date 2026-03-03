/**
 * Debug route: GET /app/metaobject-debug
 * Returns metaobject definition info to diagnose theme block Position picker.
 * Remove or protect in production.
 */
import { json } from "../utils/responses.server";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

const CLIENT_ID = process.env.SHOPIFY_API_KEY || "";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const results = {
    timestamp: new Date().toISOString(),
    clientId: CLIENT_ID,
    typeFormats: {},
    allDefinitions: [],
    errors: [],
  };

  const typeFormats = [
    "$app:theme_stream_position",
    "app--294624854017--theme_stream_position",
    "app--" + CLIENT_ID + "-theme_stream_position",
    "app--" + CLIENT_ID + "--theme_stream_position",
    "app.theme_stream_position",
    "theme_stream_position",
  ];

  for (const type of typeFormats) {
    try {
      const res = await admin.graphql(
        `#graphql
        query($type: String!) {
          metaobjectDefinitionByType(type: $type) {
            id
            type
            name
          }
        }
      `,
        { variables: { type } },
      );
      const jsonRes = await res.json();
      const def = jsonRes?.data?.metaobjectDefinitionByType;
      results.typeFormats[type] = def ? { id: def.id, type: def.type, name: def.name } : null;
      if (jsonRes?.errors?.length) {
        results.typeFormats[type] = { error: jsonRes.errors.map((e) => e.message).join(", ") };
      }
    } catch (e) {
      results.typeFormats[type] = { error: e.message };
    }
  }

  try {
    const listRes = await admin.graphql(
      `#graphql
      query {
        metaobjectDefinitions(first: 50) {
          nodes {
            id
            type
            name
          }
        }
      }
    `,
    );
    const listJson = await listRes.json();
    results.allDefinitions = listJson?.data?.metaobjectDefinitions?.nodes ?? [];
    if (listJson?.errors?.length) {
      results.errors.push("metaobjectDefinitions: " + listJson.errors.map((e) => e.message).join(", "));
    }
  } catch (e) {
    results.errors.push("metaobjectDefinitions: " + e.message);
  }

  return json(results, {
    headers: { "Cache-Control": "no-store" },
  });
};

export default function MetaobjectDebug() {
  const results = useLoaderData() ?? {};
  const themeStreamType = results.typeFormats?.["$app:theme_stream_position"]?.type
    || (results.allDefinitions || []).find((d) => (d.type || "").includes("theme_stream_position"))?.type;
  return (
    <div style={{ fontFamily: "monospace", padding: "1rem", fontSize: "0.875rem", whiteSpace: "pre-wrap", maxWidth: "800px" }}>
      <h2>Metaobject Debug</h2>
      <p>Use this to diagnose theme block Position picker. Check <code>typeFormats</code> or <code>allDefinitions</code> for the actual <code>type</code> value.</p>
      {themeStreamType && (
        <p style={{ background: "#e8f5e9", padding: "0.5rem", borderRadius: "4px", marginBottom: "1rem" }}>
          <strong>theme_stream_position type:</strong> <code>{themeStreamType}</code> — use this exact value for <code>metaobject_type</code> in the theme block schema.
        </p>
      )}
      {!themeStreamType && results.typeFormats && (
        <p style={{ background: "#fff3e0", padding: "0.5rem", borderRadius: "4px", marginBottom: "1rem" }}>
          No theme_stream_position definition found. Open Theme Stream and ensure positions exist. The definition is created on app load.
        </p>
      )}
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </div>
  );
}
