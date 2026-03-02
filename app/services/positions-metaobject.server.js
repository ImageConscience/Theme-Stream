/**
 * Sync BlockPosition records to scheduler_position metaobject entries.
 * Enables the theme block to use a metaobject picker for position selection.
 */
import { logger } from "../utils/logger.server";

/** Type matches TOML [metaobjects.app.scheduler_position] -> $app:scheduler_position */
const METAOBJECT_TYPE = "$app:scheduler_position";

/** Sync all positions to metaobjects (for existing positions, run on app load) */
export async function syncAllPositionsToMetaobjects(admin, positions) {
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
