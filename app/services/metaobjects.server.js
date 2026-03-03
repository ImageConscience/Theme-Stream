import { logger } from "../utils/logger.server";

const METAOBJECT_TYPE = "theme_stream_schedulable_entity";

/**
 * Field definitions for the universal schedulable entity.
 * Includes block_type and type_config for multi-type support.
 * Legacy hero fields retained for backward compatibility.
 */
const FIELD_DEFINITIONS = [
  { name: "Title", key: "title", type: "single_line_text_field", required: true },
  { name: "Position", key: "position_id", type: "single_line_text_field", required: true },
  { name: "Block Type", key: "block_type", type: "single_line_text_field", required: false },
  { name: "Type Config", key: "type_config", type: "json", required: false },
  { name: "Start At", key: "start_at", type: "date_time", required: false },
  { name: "End At", key: "end_at", type: "date_time", required: false },
  { name: "Description", key: "description", type: "single_line_text_field", required: false },
  { name: "Desktop Banner", key: "desktop_banner", type: "file_reference", required: false },
  { name: "Mobile Banner", key: "mobile_banner", type: "file_reference", required: false },
  { name: "Target URL", key: "target_url", type: "url", required: false },
  { name: "Headline", key: "headline", type: "single_line_text_field", required: false },
  { name: "Button Text", key: "button_text", type: "single_line_text_field", required: false },
  { name: "Sort Order", key: "sort_order", type: "number_integer", required: false },
];

/**
 * Ensure the metaobject definition exists. Creates if missing.
 * Called from afterAuth and as fallback in create action.
 */
export async function ensureMetaobjectDefinition(admin) {
  try {
    const checkResponse = await admin.graphql(
      `#graphql
      query($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
          type
          name
          fieldDefinitions {
            key
            name
            type { name }
          }
        }
      }
    `,
      { variables: { type: METAOBJECT_TYPE } },
    );
    const checkJson = await checkResponse.json();

    if (checkJson?.errors) {
      logger.warn("Error checking metaobject definition:", checkJson.errors);
      return { ok: false, error: checkJson.errors.map((e) => e.message).join(", ") };
    }

    const exists = Boolean(checkJson?.data?.metaobjectDefinitionByType?.id);

    if (exists) {
      const def = checkJson.data.metaobjectDefinitionByType;
      logger.debug("Metaobject definition already exists:", def.id);

      const existingKeys = (def.fieldDefinitions || []).map((f) => f.key);
      const needsBlockType = !existingKeys.includes("block_type");
      const needsTypeConfig = !existingKeys.includes("type_config");
      const needsSortOrder = !existingKeys.includes("sort_order");
      const positionField = (def.fieldDefinitions || []).find((f) => f.key === "position_id");
      const needsPositionNameUpdate = positionField && positionField.name !== "Position";

      if (needsPositionNameUpdate) {
        try {
          await admin.graphql(
            `#graphql
            mutation UpdatePositionField($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
              metaobjectDefinitionUpdate(id: $id, definition: $definition) {
                metaobjectDefinition { id }
                userErrors { field message }
              }
            }
          `,
            {
              variables: {
                id: def.id,
                definition: {
                  fieldDefinitions: [
                    {
                      update: {
                        key: "position_id",
                        name: "Position",
                      },
                    },
                  ],
                },
              },
            },
          );
          logger.info("Updated position_id field name to 'Position'");
        } catch (updateError) {
          logger.warn("Could not update position_id field name:", updateError);
        }
      }

      if (needsBlockType || needsTypeConfig || needsSortOrder) {
        const fieldDefinitions = [];
        if (needsBlockType) {
          fieldDefinitions.push({
            create: {
              key: "block_type",
              name: "Block Type",
              type: "single_line_text_field",
            },
          });
        }
        if (needsTypeConfig) {
          fieldDefinitions.push({
            create: {
              key: "type_config",
              name: "Type Config",
              type: "json",
            },
          });
        }
        if (needsSortOrder) {
          fieldDefinitions.push({
            create: {
              key: "sort_order",
              name: "Sort Order",
              type: "number_integer",
            },
          });
        }
        if (fieldDefinitions.length > 0) {
          try {
            const updateResponse = await admin.graphql(
              `#graphql
              mutation AddBlockTypeFields($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
                metaobjectDefinitionUpdate(id: $id, definition: $definition) {
                  metaobjectDefinition { id }
                  userErrors { field message }
                }
              }
            `,
              {
                variables: {
                  id: def.id,
                  definition: { fieldDefinitions },
                },
              },
            );
            const updateJson = await updateResponse.json();
            if (updateJson?.data?.metaobjectDefinitionUpdate?.userErrors?.length) {
              logger.warn("Could not add block_type/type_config:", updateJson.data.metaobjectDefinitionUpdate.userErrors);
            } else {
              logger.info("Added block_type and type_config fields to existing definition");
            }
          } catch (updateError) {
            logger.warn("Could not add block_type/type_config fields:", updateError);
          }
        }
      }

      // Update capabilities if needed
      try {
        await admin.graphql(
          `#graphql
          mutation UpdateSchedulableEntityDefinition($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
            metaobjectDefinitionUpdate(id: $id, definition: $definition) {
              metaobjectDefinition { id }
              userErrors { field message }
            }
          }
        `,
          {
            variables: {
              id: def.id,
              definition: {
                capabilities: {
                  onlineStore: { enabled: true, data: { urlHandle: "theme-stream-schedulable-entity" } },
                  renderable: {
                    enabled: true,
                    data: { metaTitleKey: "title", metaDescriptionKey: "description" },
                  },
                },
              },
            },
          },
        );
      } catch (updateError) {
        logger.warn("Could not update metaobject capabilities:", updateError);
      }
      return { ok: true };
    }

    logger.info("Creating metaobject definition:", METAOBJECT_TYPE);

    const createResponse = await admin.graphql(
      `#graphql
      mutation CreateSchedulableEntityDefinition($definition: MetaobjectDefinitionCreateInput!) {
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
            name: "Theme Stream Schedulable Entity",
            fieldDefinitions: FIELD_DEFINITIONS,
            access: { storefront: "PUBLIC_READ" },
            capabilities: {
              publishable: { enabled: true },
              onlineStore: { enabled: true, data: { urlHandle: "theme-stream-schedulable-entity" } },
              renderable: {
                enabled: true,
                data: { metaTitleKey: "title", metaDescriptionKey: "description" },
              },
            },
          },
        },
      },
    );

    const createJson = await createResponse.json();

    if (createJson?.data?.metaobjectDefinitionCreate?.userErrors?.length > 0) {
      const errors = createJson.data.metaobjectDefinitionCreate.userErrors
        .map((e) => `${e.field}: ${e.message}`)
        .join(", ");
      return { ok: false, error: errors };
    }

    if (createJson?.data?.metaobjectDefinitionCreate?.metaobjectDefinition?.id) {
      logger.info("Created metaobject definition:", createJson.data.metaobjectDefinitionCreate.metaobjectDefinition.id);
      return { ok: true };
    }

    return { ok: false, error: "Unexpected response from metaobjectDefinitionCreate" };
  } catch (error) {
    logger.error("ensureMetaobjectDefinition error:", error);
    return { ok: false, error: error.message };
  }
}

export { METAOBJECT_TYPE, FIELD_DEFINITIONS };
