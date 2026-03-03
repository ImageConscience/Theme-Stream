/**
 * Sync BlockPosition records to theme_stream_position metaobject entries.
 * Enables the theme block to use a metaobject picker for position selection.
 */
import { logger } from "../utils/logger.server";

/** Type matches TOML [metaobjects.app.theme_stream_position] -> $app:theme_stream_position */
const METAOBJECT_TYPE = "$app:theme_stream_position";

/** Ensure theme_stream_position metaobject definition exists on the shop. Creates via GraphQL if TOML deploy didn't. */
export async function ensureSchedulerPositionDefinition(admin) {
  try {
    const checkRes = await admin.graphql(
      `#graphql
      query($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          type
          name
        }
      }
    `,
      { variables: { type: METAOBJECT_TYPE } },
    );
    const checkJson = await checkRes.json();
    const def = checkJson?.data?.metaobjectDefinitionByType;
    if (def?.id) {
      logger.info("[theme_stream_position] metaobject definition exists: type=%s id=%s", def.type, def.id);
      return { ok: true };
    }
    logger.warn("[theme_stream_position] metaobject definition NOT found for type=%s. checkJson=%s", METAOBJECT_TYPE, JSON.stringify(checkJson));
    logger.info("Creating theme_stream_position metaobject definition");
    const createRes = await admin.graphql(
      `#graphql
      mutation CreateSchedulerPositionDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id type name }
          userErrors { field message }
        }
      }
    `,
      {
        variables: {
          definition: {
            type: METAOBJECT_TYPE,
            name: "Theme Stream Position",
            fieldDefinitions: [
              { key: "name", name: "Name", type: "single_line_text_field" },
              { key: "description", name: "Description", type: "multi_line_text_field" },
            ],
            access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
          },
        },
      },
    );
    const createJson = await createRes.json();
    const errs = createJson?.data?.metaobjectDefinitionCreate?.userErrors;
    if (errs?.length) {
      const msg = errs.map((e) => e.message).join(", ");
      if (msg.includes("taken") || msg.includes("TAKEN") || msg.includes("already exists")) {
        logger.debug("theme_stream_position definition already exists (from TOML or prior create)");
        return { ok: true };
      }
      logger.warn("ensureSchedulerPositionDefinition errors:", errs);
      return { ok: false, error: msg };
    }
    logger.info("Created theme_stream_position metaobject definition");
    return { ok: true };
  } catch (e) {
    logger.error("ensureSchedulerPositionDefinition error:", e);
    return { ok: false, error: e.message };
  }
}

/** Sync all positions to metaobjects (for existing positions, run on app load) */
export async function syncAllPositionsToMetaobjects(admin, positions) {
  const hasUncategorized = (positions || []).some((p) => p.handle === "uncategorized");
  if (hasUncategorized) {
    await deletePositionMetaobject(admin, "homepage_banner");
  }
  for (const p of positions || []) {
    try {
      const existing = await admin.graphql(
        `#graphql
        query($handle: MetaobjectHandleInput!) {
          metaobjectByHandle(handle: $handle) { id }
        }`,
        { variables: { handle: { type: METAOBJECT_TYPE, handle: p.handle } } },
      );
      const json = await existing.json();
      if (json?.data?.metaobjectByHandle?.id) {
        await updatePositionMetaobject(admin, p);
      } else {
        await syncPositionToMetaobject(admin, p);
      }
    } catch (e) {
      logger.warn("syncAllPositionsToMetaobjects:", p.handle, e);
    }
  }
}

/** Create metaobject entry for a position */
export async function syncPositionToMetaobject(admin, position) {
  try {
    const res = await admin.graphql(
      `#graphql
      mutation CreatePositionMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metaobject: {
            type: METAOBJECT_TYPE,
            handle: position.handle,
            fields: [
              { key: "name", value: position.name },
              ...(position.description ? [{ key: "description", value: position.description }] : []),
            ],
          },
        },
      },
    );
    const json = await res.json();
    const errs = json?.data?.metaobjectCreate?.userErrors;
    if (errs?.length) {
      logger.warn("syncPositionToMetaobject create errors:", errs);
      return null;
    }
    return json?.data?.metaobjectCreate?.metaobject;
  } catch (e) {
    logger.warn("syncPositionToMetaobject create error:", e);
    return null;
  }
}

/** Update metaobject entry for a position (lookup by handle) */
export async function updatePositionMetaobject(admin, position) {
  try {
    const listRes = await admin.graphql(
      `#graphql
      query FindPositionMetaobject($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
        }
      }`,
      {
        variables: {
          handle: { type: METAOBJECT_TYPE, handle: position.handle },
        },
      },
    );
    const listJson = await listRes.json();
    const node = listJson?.data?.metaobjectByHandle;
    if (!node) return null;

    const updateRes = await admin.graphql(
      `#graphql
      mutation UpdatePositionMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: node.id,
          metaobject: {
            fields: [
              { key: "name", value: position.name },
              ...(position.description != null ? [{ key: "description", value: position.description || "" }] : []),
            ],
          },
        },
      },
    );
    const updateJson = await updateRes.json();
    const errs = updateJson?.data?.metaobjectUpdate?.userErrors;
    if (errs?.length) {
      logger.warn("updatePositionMetaobject errors:", errs);
      return null;
    }
    return updateJson?.data?.metaobjectUpdate?.metaobject;
  } catch (e) {
    logger.warn("updatePositionMetaobject error:", e);
    return null;
  }
}

/** Delete metaobject entry by handle */
export async function deletePositionMetaobject(admin, handle) {
  try {
    const listRes = await admin.graphql(
      `#graphql
      query FindPositionMetaobject($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
        }
      }`,
      {
        variables: {
          handle: { type: METAOBJECT_TYPE, handle },
        },
      },
    );
    const listJson = await listRes.json();
    const node = listJson?.data?.metaobjectByHandle;
    if (!node) return true;

    const delRes = await admin.graphql(
      `#graphql
      mutation DeletePositionMetaobject($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }`,
      { variables: { id: node.id } },
    );
    const delJson = await delRes.json();
    const errs = delJson?.data?.metaobjectDelete?.userErrors;
    if (errs?.length) {
      logger.warn("deletePositionMetaobject errors:", errs);
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("deletePositionMetaobject error:", e);
    return false;
  }
}
