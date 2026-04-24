import { logger } from "../utils/logger.server";

const METAOBJECTS_PAGE_SIZE = 100;
const FILES_PAGE_SIZE = 250;

const LEGACY_POSITION_HANDLE = "homepage_banner";
const DEFAULT_POSITION_HANDLE = "uncategorized";

/** Fetch all metaobjects via cursor pagination */
export async function fetchAllMetaobjects(admin) {
  const allNodes = [];
  let after = null;
  const query = `#graphql
    query ListSchedulableEntities($first: Int!, $after: String) {
      metaobjects(type: "theme_stream_schedulable_entity", first: $first, after: $after) {
          nodes {
            id
            handle
            fields {
              key
              value
              reference {
                ... on MediaImage {
                  id
                image { url }
              }
            }
          }
          capabilities { publishable { status } }
            updatedAt
          }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  do {
    const response = await admin.graphql(query, {
      variables: { first: METAOBJECTS_PAGE_SIZE, after },
    });
    const json = await response.json();
    if (json?.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
    const data = json?.data?.metaobjects;
    if (!data) break;
    allNodes.push(...(data.nodes ?? []));
    const pageInfo = data.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  } while (true);
  return allNodes;
}

/** Reassign all entries with a given position_id to a new handle. */
export async function reassignEntriesToPosition(admin, fromHandle, toHandle) {
  const nodes = await fetchAllMetaobjects(admin);
  const toUpdate = (nodes || []).filter((n) => {
    const posField = (n.fields || []).find((f) => f.key === "position_id");
    return posField && String(posField.value || "").trim() === fromHandle;
  });
  if (toUpdate.length === 0) return 0;
  logger.info("[reassign] Moving %d entries from '%s' to '%s'", toUpdate.length, fromHandle, toHandle);
  let updated = 0;
  for (const node of toUpdate) {
    try {
      const res = await admin.graphql(
        `#graphql
        mutation UpdatePositionId($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: node.id,
            metaobject: { fields: [{ key: "position_id", value: toHandle }] },
          },
        },
      );
      const json = await res.json();
      if (json?.data?.metaobjectUpdate?.userErrors?.length) {
        logger.warn("[reassign] Failed to update entry", node.id, json.data.metaobjectUpdate.userErrors);
      } else {
        updated++;
      }
    } catch (e) {
      logger.warn("[reassign] Error updating entry", node.id, e);
    }
  }
  return updated;
}

/** Migrate theme_stream_schedulable_entity entries with position_id "homepage_banner" to "uncategorized". */
export async function migratePositionIdInEntries(admin, nodes) {
  const toMigrate = (nodes || []).filter((n) => {
    const posField = (n.fields || []).find((f) => f.key === "position_id");
    return posField && String(posField.value || "").trim() === LEGACY_POSITION_HANDLE;
  });
  if (toMigrate.length === 0) return;
  logger.info("[migrate] Updating", toMigrate.length, "entries from position_id homepage_banner to uncategorized");
  for (const node of toMigrate) {
    try {
      const res = await admin.graphql(
        `#graphql
        mutation UpdatePositionId($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id }
            userErrors { field message }
          }
        }
      `,
        {
          variables: {
            id: node.id,
            metaobject: {
              fields: [{ key: "position_id", value: DEFAULT_POSITION_HANDLE }],
            },
          },
        },
      );
      const json = await res.json();
      if (json?.data?.metaobjectUpdate?.userErrors?.length) {
        logger.warn("[migrate] Failed to update entry", node.id, json.data.metaobjectUpdate.userErrors);
      } else {
        const posField = (node.fields || []).find((f) => f.key === "position_id");
        if (posField) posField.value = DEFAULT_POSITION_HANDLE;
      }
    } catch (e) {
      logger.warn("[migrate] Error updating entry", node.id, e);
    }
  }
}

/**
 * Fetch files from Shopify. Defaults to a single page of recent files since stores
 * can have tens of thousands of files; paginating all of them on every loader run
 * is prohibitively slow. Pass `{ paginate: true }` to walk every page (rare).
 */
export async function fetchAllFiles(admin, queryFilter, pageSize = FILES_PAGE_SIZE, { paginate = false } = {}) {
  const allEdges = [];
  let after = null;
  const gql = `#graphql
    query GetFiles($first: Int!, $after: String, $fileQuery: String) {
      files(first: $first, after: $after, query: $fileQuery, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                createdAt
                ... on MediaImage {
                  alt
              image { url width height }
            }
            ... on Video {
              alt
              sources { url mimeType }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  do {
    const response = await admin.graphql(gql, {
      variables: { first: pageSize, after, fileQuery: queryFilter },
    });
    const json = await response.json();
    if (json?.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
    const data = json?.data?.files;
    if (!data) break;
    allEdges.push(...(data.edges ?? []));
    if (!paginate) break;
    const pageInfo = data.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  } while (true);
  return allEdges;
}

export { FILES_PAGE_SIZE };
