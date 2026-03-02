import { Buffer } from "buffer";
import { authenticate } from "../shopify.server";
import { ensureActiveSubscription } from "../utils/billing.server";
import { parseLocalDateTimeToUTC, getDefaultDateBounds } from "../utils/datetime";
import { json } from "../utils/responses.server";
import { logger } from "../utils/logger.server";
import { ensureMetaobjectDefinition } from "./metaobjects.server";
import { BLOCK_TYPES, DEFAULT_BLOCK_TYPE } from "../constants/block-types";

const METAOBJECTS_PAGE_SIZE = 100;
const FILES_PAGE_SIZE = 250;

/** Fetch all metaobjects via cursor pagination */
async function fetchAllMetaobjects(admin) {
  const allNodes = [];
  let after = null;
  const query = `#graphql
    query ListSchedulableEntities($first: Int!, $after: String) {
      metaobjects(type: "schedulable_entity", first: $first, after: $after) {
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

/** Fetch all files via cursor pagination */
async function fetchAllFiles(admin, queryFilter, pageSize = 250) {
  const allEdges = [];
  let after = null;
  const gql = `#graphql
    query GetFiles($first: Int!, $after: String, $fileQuery: String) {
      files(first: $first, after: $after, query: $fileQuery) {
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
    const pageInfo = data.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    after = pageInfo.endCursor;
  } while (true);
  return allEdges;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop;

  const confirmationUrl = await ensureActiveSubscription(admin, request);
  if (confirmationUrl) {
    return json({ redirectUrl: confirmationUrl });
  }

  try {
    // Fetch shop timezone (store timezone is source of truth for scheduling)
    let storeTimeZone = "UTC";
    try {
      const shopResponse = await admin.graphql(
        `#graphql
        query GetShopTimezone {
          shop {
            ianaTimezone
          }
        }
      `,
      );
      const shopJson = await shopResponse.json();
      if (shopJson?.data?.shop?.ianaTimezone) {
        storeTimeZone = shopJson.data.shop.ianaTimezone;
      }
    } catch (shopError) {
      logger.warn("Could not fetch shop timezone:", shopError);
    }

    let entries = [];
    try {
      entries = await fetchAllMetaobjects(admin);
      logger.debug("Loader fetched", entries.length, "metaobject entries");
    } catch (metaError) {
      const errorMessages = metaError.message || "";
      if (errorMessages.includes("metaobject definition") || errorMessages.includes("type")) {
        logger.warn("Metaobject definition may not exist yet. Returning empty entries.");
    return {
      entries: [],
      mediaFiles: [],
      videoFiles: [],
      storeTimeZone,
      blockTypes: BLOCK_TYPES,
      defaultBlockType: DEFAULT_BLOCK_TYPE,
      positions: [],
      error: "Metaobject definition not found. Please ensure the app has been properly installed.",
    };
      }
      throw metaError;
    }

    let mediaFiles = [];
    let videoFiles = [];
    try {
      let imgEdges = await fetchAllFiles(admin, "media_type:IMAGE", FILES_PAGE_SIZE);
      let vidEdges = await fetchAllFiles(admin, "media_type:VIDEO", 100);
      if (imgEdges.length === 0) {
        const allEdges = await fetchAllFiles(admin, null, FILES_PAGE_SIZE);
        imgEdges = allEdges.filter((e) => e.node.image != null);
        vidEdges = allEdges.filter((e) => e.node.sources != null);
        logger.debug("Media filter returned 0; fetched all files:", allEdges.length, "images:", imgEdges.length, "videos:", vidEdges.length);
      }
      mediaFiles = imgEdges
        .map((edge) => ({
          id: edge.node.id,
          url: edge.node.image?.url || "",
          alt: edge.node.alt || "",
          createdAt: edge.node.createdAt,
          type: "image",
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      videoFiles = vidEdges
        .map((edge) => ({
          id: edge.node.id,
          url: edge.node.sources?.[0]?.url || "",
          alt: edge.node.alt || "",
          createdAt: edge.node.createdAt,
          type: "video",
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      logger.debug("Loader fetched", mediaFiles.length, "images and", videoFiles.length, "videos");
    } catch (error) {
      logger.error("Error loading media files:", error);
    }

    let positions = [];
    if (shop) {
      try {
        const { listPositions } = await import("./positions.server.js");
        positions = await listPositions(shop);
      } catch (posErr) {
        logger.warn("Could not load positions:", posErr);
      }
    }

    return {
      entries,
      mediaFiles,
      videoFiles,
      storeTimeZone,
      blockTypes: BLOCK_TYPES,
      defaultBlockType: DEFAULT_BLOCK_TYPE,
      positions,
    };
  } catch (error) {
    logger.error("Error loading schedulable entities:", error);
    return {
      entries: [],
      mediaFiles: [],
      videoFiles: [],
      storeTimeZone: "UTC",
      blockTypes: BLOCK_TYPES,
      defaultBlockType: DEFAULT_BLOCK_TYPE,
      positions: [],
      error: `Failed to load entries: ${error.message}`,
    };
  }
};

export const action = async ({ request }) => {
  try {
    logger.debug("[ACTION] ========== ACTION CALLED ==========");
    logger.debug("[ACTION] Request URL:", request.url);
    logger.debug("[ACTION] Request method:", request.method);
    logger.debug("[ACTION] Content-Type:", request.headers.get("content-type"));
    logger.debug("[ACTION] Accept header:", request.headers.get("accept"));
    logger.debug("[ACTION] X-Requested-With:", request.headers.get("x-requested-with"));

    const { admin } = await authenticate.admin(request);

    const confirmationUrl = await ensureActiveSubscription(admin, request);
    if (confirmationUrl) {
      return json({ redirectUrl: confirmationUrl });
    }

    const acceptHeader = request.headers.get("accept") || "";
    const isFetcherRequest =
      acceptHeader.includes("*/*") || acceptHeader.includes("application/json") || !acceptHeader.includes("text/html");
    logger.debug("[ACTION] Is fetcher request:", isFetcherRequest);

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();

      if (body.intent === "delete") {
        logger.debug("[ACTION] Processing delete request for entry:", body.id);
        const deleteResponse = await admin.graphql(
          `#graphql
          mutation DeleteSchedulableEntity($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `,
          { variables: { id: body.id } },
        );

        const deleteJson = await deleteResponse.json();

        if (deleteJson?.errors) {
          const errors = deleteJson.errors.map((e) => e.message).join(", ");
          logger.error("[ACTION] GraphQL errors deleting entry:", errors);
          return json({ error: `Failed to delete entry: ${errors}`, success: false });
        }

        if (deleteJson?.data?.metaobjectDelete?.userErrors?.length > 0) {
          const errors = deleteJson.data.metaobjectDelete.userErrors
            .map((e) => e.message)
            .join(", ");
          logger.error("[ACTION] User errors deleting entry:", errors);
          return json({ error: `Failed to delete entry: ${errors}`, success: false });
        }

        logger.debug("[ACTION] Entry deleted successfully");
        return json({ success: true, message: "Entry deleted successfully!" });
      }

      if (body.intent === "update") {
        logger.debug("[ACTION] Processing update request for entry:", body.id);

        const fields = [];
        // Store timezone is source of truth for scheduling; fallback to user timezone for backward compat
        const storeTimeZone =
          (typeof body.store_timezone === "string" && body.store_timezone.trim()) ||
          (typeof body.storeTimezone === "string" && body.storeTimezone.trim()) ||
          (typeof body.timezone === "string" && body.timezone.trim()) ||
          null;
        const rawOffset = body.timezoneOffset ?? body.timezone_offset;
        const fallbackOffset =
          rawOffset !== undefined && rawOffset !== null && rawOffset !== "" && !Number.isNaN(Number(rawOffset))
            ? Number(rawOffset)
            : undefined;

        if (body.title) fields.push({ key: "title", value: body.title });
        if (body.positionId) fields.push({ key: "position_id", value: body.positionId });
        if (body.blockType) fields.push({ key: "block_type", value: body.blockType });
        if (body.typeConfig !== undefined && typeof body.typeConfig === "string") {
          fields.push({ key: "type_config", value: body.typeConfig });
        }
        if (body.headline !== undefined) fields.push({ key: "headline", value: body.headline || "" });
        if (body.description !== undefined) fields.push({ key: "description", value: body.description || "" });

        if (body.startAt !== undefined) {
          if (body.startAt) {
            const formattedStart = parseLocalDateTimeToUTC(body.startAt, storeTimeZone, fallbackOffset);
            if (!formattedStart) {
              return json({ error: "Invalid Start Date format. Please ensure the date is valid.", success: false });
            }
            fields.push({ key: "start_at", value: formattedStart });
          } else {
            const defaults = getDefaultDateBounds(storeTimeZone, fallbackOffset);
            fields.push({ key: "start_at", value: defaults.start });
          }
        }

        if (body.endAt !== undefined) {
          if (body.endAt) {
            const formattedEnd = parseLocalDateTimeToUTC(body.endAt, storeTimeZone, fallbackOffset);
            if (!formattedEnd) {
              return json({ error: "Invalid End Date format. Please ensure the date is valid.", success: false });
            }
            fields.push({ key: "end_at", value: formattedEnd });
          } else {
            const defaults = getDefaultDateBounds(storeTimeZone, fallbackOffset);
            fields.push({ key: "end_at", value: defaults.end });
          }
        }

        if (body.desktopBanner) fields.push({ key: "desktop_banner", value: body.desktopBanner });
        if (body.mobileBanner) fields.push({ key: "mobile_banner", value: body.mobileBanner });
        if (body.targetUrl !== undefined) fields.push({ key: "target_url", value: body.targetUrl || "" });
        if (body.buttonText !== undefined) fields.push({ key: "button_text", value: body.buttonText || "" });

        // Build type_config from type-specific fields
        const blockType = body.blockType || "hero";
        const addStyling = (c) => ({
          ...c,
          css_class: (body.cssClass || "").trim() || null,
          custom_css: (body.customCss || "").trim() || null,
          // Image/Video height & fit (for blocks with media)
          image_height: body.imageHeight || "adapt_to_image",
          image_height_mobile: body.imageHeightMobile || "adapt_to_image",
          image_fit: body.imageFit || "cover",
          image_fit_mobile: body.imageFitMobile || "cover",
          // Button styling
          button_bg_color: body.buttonBgColor || null,
          button_text_color: body.buttonTextColor || null,
          button_border_radius: body.buttonBorderRadius != null ? String(body.buttonBorderRadius) : null,
          button_padding_vertical: body.buttonPaddingVertical != null ? String(body.buttonPaddingVertical) : null,
          button_padding_horizontal: body.buttonPaddingHorizontal != null ? String(body.buttonPaddingHorizontal) : null,
          button_font_size: body.buttonFontSize != null ? String(body.buttonFontSize) : null,
          // Text styling
          headline_font_size: body.headlineFontSize != null ? String(body.headlineFontSize) : null,
          description_font_size: body.descriptionFontSize != null ? String(body.descriptionFontSize) : null,
          headline_color: body.headlineColor || null,
          description_color: body.descriptionColor || null,
          headline_color_below: body.headlineColorBelow || null,
          description_color_below: body.descriptionColorBelow || null,
          button_bg_color_below: body.buttonBgColorBelow || null,
          button_text_color_below: body.buttonTextColorBelow || null,
          text_alignment: body.textAlignment || null,
          vertical_alignment: body.verticalAlignment || null,
          mobile_content_below: body.mobileContentBelow === true || body.mobileContentBelow === "true",
          // Overlay (0 = off, 1-100 = opacity %)
          overlay_opacity: body.overlayOpacity != null ? Math.min(100, Math.max(0, Number(body.overlayOpacity))) : null,
          overlay_color: body.overlayColor || null,
        });
        let typeConfigStr = body.typeConfig;
        if (typeConfigStr === undefined || typeof typeConfigStr !== "string") {
          if (blockType === "hero") {
            typeConfigStr = JSON.stringify(addStyling({
              headline: body.headline || "",
              description: body.description || "",
              desktop_banner: body.desktopBanner || null,
              mobile_banner: body.mobileBanner || null,
              target_url: body.targetUrl || null,
              button_text: body.buttonText || null,
            }));
          } else if (blockType === "announcement_bar") {
            typeConfigStr = JSON.stringify(addStyling({
              text: body.announcementText || "",
              link: body.announcementLink || null,
              bg_color: body.announcementBgColor || "#000000",
              text_color: body.announcementTextColor || "#ffffff",
            }));
          } else if (blockType === "collection_banner") {
            typeConfigStr = JSON.stringify(addStyling({
              collection_handle: body.collectionHandle || "",
              image: body.collectionBannerImage || null,
              headline: body.collectionHeadline || null,
              description: body.collectionDescription || null,
              button_text: body.collectionButtonText || null,
            }));
            if (body.collectionBannerImage) fields.push({ key: "desktop_banner", value: body.collectionBannerImage });
          } else if (blockType === "countdown_banner") {
            const targetDateUtc = body.countdownTargetDate
              ? parseLocalDateTimeToUTC(body.countdownTargetDate, storeTimeZone, fallbackOffset)
              : null;
            typeConfigStr = JSON.stringify(addStyling({
              target_date: targetDateUtc,
              headline: body.countdownHeadline || null,
              subtext: body.countdownSubtext || null,
              background_image: body.countdownBgImage || null,
              background_color: body.countdownBgColor || "#000000",
              text_color: body.countdownTextColor || "#ffffff",
              target_url: body.countdownTargetUrl || null,
              button_text: body.countdownButtonText || null,
            }));
            if (body.countdownBgImage) fields.push({ key: "desktop_banner", value: body.countdownBgImage });
          } else if (blockType === "image_with_text") {
            typeConfigStr = JSON.stringify(addStyling({
              image: body.imageWithTextImage || null,
              headline: body.imageWithTextHeadline || null,
              description: body.imageWithTextDescription || null,
              button_text: body.imageWithTextButtonText || null,
              button_link: body.imageWithTextButtonLink || null,
              layout: body.imageWithTextLayout || "image_left",
            }));
            if (body.imageWithTextImage) fields.push({ key: "desktop_banner", value: body.imageWithTextImage });
          } else if (blockType === "background_video") {
            const vidOverlay = body.overlayOpacity != null ? Math.min(100, Math.max(0, Number(body.overlayOpacity))) : Math.min(100, Math.max(0, Number(body.videoOverlayOpacity) || 50));
            typeConfigStr = JSON.stringify(addStyling({
              video_url: body.videoUrl || null,
              video_file: body.videoFile || null,
              headline: body.videoHeadline || null,
              description: body.videoDescription || null,
              button_text: body.videoButtonText || null,
              button_link: body.videoButtonLink || null,
              overlay_opacity: vidOverlay,
            }));
            if (body.videoFile) fields.push({ key: "desktop_banner", value: body.videoFile });
          } else if (blockType === "promo_card") {
            typeConfigStr = JSON.stringify(addStyling({
              image: body.promoCardImage || null,
              title: body.promoCardTitle || null,
              description: body.promoCardDescription || null,
              cta_url: body.promoCardCtaUrl || null,
              cta_text: body.promoCardCtaText || null,
            }));
            if (body.promoCardImage) fields.push({ key: "desktop_banner", value: body.promoCardImage });
          } else {
            typeConfigStr = "{}";
          }
        }
        if (typeConfigStr) fields.push({ key: "type_config", value: typeConfigStr });

        const updateResponse = await admin.graphql(
          `#graphql
          mutation UpdateSchedulableEntity($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject {
                id
                handle
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              id: body.id,
              metaobject: {
                fields,
              },
            },
          },
        );

        const updateJson = await updateResponse.json();

        if (updateJson?.errors) {
          const errors = updateJson.errors.map((e) => e.message).join(", ");
          logger.error("[ACTION] GraphQL errors updating entry:", errors);
          return json({ error: `Failed to update entry: ${errors}`, success: false });
        }

        if (updateJson?.data?.metaobjectUpdate?.userErrors?.length > 0) {
          const errors = updateJson.data.metaobjectUpdate.userErrors
            .map((e) => e.message)
            .join(", ");
          logger.error("[ACTION] User errors updating entry:", errors);
          return json({ error: `Failed to update entry: ${errors}`, success: false });
        }

        logger.debug("[ACTION] Entry updated successfully");
        return json({ success: true, message: "Entry updated successfully!" });
      }

      if (body.intent === "toggleStatus") {
        logger.debug("[ACTION] Processing toggle status request for entry:", body.id, "to status:", body.status);

        const toggleResponse = await admin.graphql(
          `#graphql
          mutation ToggleEntryStatus($id: ID!, $metaobject: MetaobjectUpdateInput!) {
            metaobjectUpdate(id: $id, metaobject: $metaobject) {
              metaobject {
                id
                handle
                capabilities {
                  publishable {
                    status
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              id: body.id,
              metaobject: {
                capabilities: {
                  publishable: {
                    status: body.status,
                  },
                },
              },
            },
          },
        );

        const toggleJson = await toggleResponse.json();

        if (toggleJson?.errors) {
          const errors = toggleJson.errors.map((e) => e.message).join(", ");
          logger.error("[ACTION] GraphQL errors toggling status:", errors);
          return json({ error: `Failed to toggle status: ${errors}`, success: false });
        }

        if (toggleJson?.data?.metaobjectUpdate?.userErrors?.length > 0) {
          const errors = toggleJson.data.metaobjectUpdate.userErrors
            .map((e) => e.message)
            .join(", ");
          logger.error("[ACTION] User errors toggling status:", errors);
          return json({ error: `Failed to toggle status: ${errors}`, success: false });
        }

        logger.debug("[ACTION] Status toggled successfully");
        return json({ success: true, message: "Status updated successfully!" });
      }

      if (body.intent === "positionCreate") {
        const { admin, session } = await authenticate.admin(request);
        const shop = session?.shop;
        if (!shop) return json({ error: "Invalid session", success: false });
        const { createPosition } = await import("./positions.server.js");
        const name = (body.name || "").trim();
        if (!name) return json({ error: "Position name is required", success: false });
        const position = await createPosition(shop, {
          name,
          description: (body.description || "").trim() || null,
        });
        const { syncPositionToMetaobject } = await import("./positions-metaobject.server.js");
        await syncPositionToMetaobject(admin, position);
        return json({ success: true, message: "Position created!", position: { id: position.id, name: position.name, handle: position.handle, description: position.description } });
      }

      if (body.intent === "positionUpdate") {
        const { admin, session } = await authenticate.admin(request);
        const shop = session?.shop;
        if (!shop) return json({ error: "Invalid session", success: false });
        const { updatePosition } = await import("./positions.server.js");
        const updated = await updatePosition(shop, body.id, {
          name: body.name != null ? String(body.name).trim() : undefined,
          description: body.description !== undefined ? (body.description ? String(body.description).trim() : null) : undefined,
        });
        if (!updated) return json({ error: "Position not found", success: false });
        const { updatePositionMetaobject } = await import("./positions-metaobject.server.js");
        await updatePositionMetaobject(admin, updated);
        return json({ success: true, message: "Position updated!", position: updated });
      }

      if (body.intent === "positionDelete") {
        const { admin, session } = await authenticate.admin(request);
        const shop = session?.shop;
        if (!shop) return json({ error: "Invalid session", success: false });
        const { deletePosition } = await import("./positions.server.js");
        const deleted = await deletePosition(shop, body.id);
        if (!deleted) return json({ error: "Position not found", success: false });
        const { deletePositionMetaobject } = await import("./positions-metaobject.server.js");
        await deletePositionMetaobject(admin, deleted.handle);
        return json({ success: true, message: "Position deleted!" });
      }
    }

    const formData = await request.formData();
    logger.debug("[ACTION] FormData received, checking contents...");

    const formDataKeys = [];
    for (const [key, value] of formData.entries()) {
      formDataKeys.push(key);
      logger.debug(
        "[ACTION] FormData key:",
        key,
        "value type:",
        value instanceof File ? "File" : typeof value,
        value instanceof File ? `(${value.name}, ${value.size} bytes)` : "",
      );
    }
    logger.debug("[ACTION] All formData keys:", formDataKeys);

    const file = formData.get("file");
    const hasTitle = formData.get("title");

    logger.debug(
      "[ACTION] File present:",
      !!file,
      "Has title:",
      !!hasTitle,
      "File type:",
      file instanceof File ? file.type : typeof file,
    );

    if (file && !hasTitle) {
      logger.debug("[ACTION] Detected file upload request - using official Shopify staged upload method");
      try {
        logger.debug("[ACTION] Admin authenticated successfully for file upload");

        if (!file) {
          return json({ error: "No file provided", success: false });
        }

        if (typeof file === "string") {
          return json({
            error: "File upload failed: File object not received.",
            success: false,
          });
        }

        const isFileLike =
          file instanceof File ||
          file instanceof Blob ||
          (typeof file === "object" &&
            file !== null &&
            (typeof file.arrayBuffer === "function" || typeof file.stream === "function"));

        if (!isFileLike) {
          return json({ error: `Invalid file format. Received: ${typeof file}`, success: false });
        }

        const fileName = file.name || `upload-${Date.now()}.jpg`;
        const fileType = file.type || "image/jpeg";
        const fileSize = file.size || 0;

        logger.debug("[ACTION] File:", fileName, "Type:", fileType, "Size:", fileSize, "bytes");

        let arrayBuffer;
        if (typeof file.arrayBuffer === "function") {
          arrayBuffer = await file.arrayBuffer();
        } else if (typeof file.stream === "function") {
          const stream = file.stream();
          const chunks = [];
          const reader = stream.getReader();
          let readerDone = false;
          while (!readerDone) {
            const { done, value } = await reader.read();
            readerDone = done;
            if (!done && value) {
              chunks.push(value);
            }
          }
          const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
          arrayBuffer = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            arrayBuffer.set(chunk, offset);
            offset += chunk.length;
          }
        } else {
          return json({ error: "File object doesn't support reading", success: false });
        }
        const fileBuffer = Buffer.from(arrayBuffer);

        logger.debug("[ACTION] Step 1: Creating staged upload target...");
        const stagedUploadResponse = await admin.graphql(
          `#graphql
          mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets {
                url
                resourceUrl
                parameters {
                  name
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              input: [
                {
                  filename: fileName,
                  mimeType: fileType,
                  resource: "IMAGE",
                  httpMethod: "POST",
                },
              ],
            },
          },
        );

        const stagedUploadJson = await stagedUploadResponse.json();
        logger.debug("[ACTION] Staged upload response received");

        if (stagedUploadJson?.errors) {
          const errors = stagedUploadJson.errors.map((e) => e.message).join(", ");
          logger.error("[ACTION] GraphQL errors creating staged upload:", errors);
          return json({ error: `Failed to create staged upload: ${errors}`, success: false });
        }

        if (stagedUploadJson?.data?.stagedUploadsCreate?.userErrors?.length > 0) {
          const errors = stagedUploadJson.data.stagedUploadsCreate.userErrors
            .map((e) => e.message)
            .join(", ");
          logger.error("[ACTION] User errors creating staged upload:", errors);
          return json({ error: `Failed to create staged upload: ${errors}`, success: false });
        }

        const stagedTarget = stagedUploadJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
        if (!stagedTarget || !stagedTarget.url) {
          logger.error("[ACTION] Invalid staged upload response:", JSON.stringify(stagedUploadJson, null, 2));
          return json({ error: "Failed to create staged upload target", success: false });
        }

        logger.debug("[ACTION] Staged upload created. Upload URL:", stagedTarget.url);
        logger.debug("[ACTION] Resource URL:", stagedTarget.resourceUrl);
        logger.debug("[ACTION] Parameters:", stagedTarget.parameters?.length || 0, "parameters");

        logger.debug("[ACTION] Step 2: Uploading file to Google Cloud Storage...");
        const FormData = (await import("form-data")).default;
        const uploadFormData = new FormData();

        if (Array.isArray(stagedTarget.parameters)) {
          for (const param of stagedTarget.parameters) {
            uploadFormData.append(param.name, param.value);
            logger.debug(
              "[ACTION] Added parameter:",
              param.name,
              "=",
              param.value.substring(0, 50) + (param.value.length > 50 ? "..." : ""),
            );
          }
        }

        uploadFormData.append("file", fileBuffer, {
          filename: fileName,
          contentType: fileType,
        });

        logger.debug("[ACTION] Uploading to:", stagedTarget.url);
        logger.debug("[ACTION] File buffer size:", fileBuffer.length, "bytes");

        const uploadHeaders = uploadFormData.getHeaders();
        logger.debug("[ACTION] Upload headers:", Object.keys(uploadHeaders));

        const { request: undiciRequest } = await import("undici");
        const uploadResponse = await undiciRequest(stagedTarget.url, {
          method: "POST",
          headers: uploadHeaders,
          body: uploadFormData,
        });

        if (uploadResponse.statusCode >= 400) {
          const responseBody = await uploadResponse.body.text();
          logger.error("[ACTION] GCS upload failed:", uploadResponse.statusCode);
          logger.error("[ACTION] Response body:", responseBody);
          return json({
            error: `Cloud storage upload failed: ${uploadResponse.statusCode}`,
            details: responseBody.substring(0, 200),
            success: false,
          });
        }

        const responseBody = await uploadResponse.body.text();
        logger.debug("[ACTION] GCS upload response:", uploadResponse.statusCode, responseBody.substring(0, 200));

        logger.debug("[ACTION] File uploaded successfully to GCS");

        logger.debug("[ACTION] Step 3: Creating file record in Shopify...");
        const fileCreateResponse = await admin.graphql(
          `#graphql
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                ... on MediaImage {
                  id
                  fileStatus
                  alt
                  image {
                    url
                    altText
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              files: [
                {
                  contentType: "IMAGE",
                  originalSource: stagedTarget.resourceUrl,
                  alt: file.name || "",
                },
              ],
            },
          },
        );

        const fileCreateJson = await fileCreateResponse.json();
        logger.debug("[ACTION] File create response received");
        logger.debug("[ACTION] File create response:", JSON.stringify(fileCreateJson, null, 2));

        if (fileCreateJson?.errors) {
          const errors = fileCreateJson.errors.map((e) => e.message).join(", ");
          logger.error("[ACTION] GraphQL errors creating file:", errors);
          return json({ error: `Failed to register file: ${errors}`, success: false });
        }

        if (fileCreateJson?.data?.fileCreate?.userErrors?.length > 0) {
          const errors = fileCreateJson.data.fileCreate.userErrors
            .map((e) => e.message)
            .join(", ");
          logger.error("[ACTION] User errors creating file:", errors);
          return json({ error: `Failed to register file: ${errors}`, success: false });
        }

        const uploadedFile = fileCreateJson?.data?.fileCreate?.files?.[0];
        if (!uploadedFile?.id) {
          logger.error("[ACTION] No file ID returned in response");
          return json({ error: "File registration failed", success: false });
        }

        logger.debug("[ACTION] File uploaded successfully, ID:", uploadedFile.id);
        logger.debug("[ACTION] File status:", uploadedFile.fileStatus);
        logger.debug("[ACTION] File alt:", uploadedFile.alt);
        logger.debug("[ACTION] File image URL:", uploadedFile.image?.url);

        let fileUrl = uploadedFile.image?.url;
        let fileAlt = uploadedFile.alt || file.name;

        if (!fileUrl && uploadedFile.fileStatus !== "READY") {
          logger.debug("[ACTION] File is still processing, waiting for URL...");
          for (let i = 0; i < 5; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            const checkResponse = await admin.graphql(
              `#graphql
              query ($id: ID!) {
                node(id: $id) {
                  ... on MediaImage {
                    id
                    alt
                    image {
                      url
                    }
                  }
                }
              }
            `,
              { variables: { id: uploadedFile.id } },
            );
            const checkJson = await checkResponse.json();
            const fileNode = checkJson?.data?.node;
            if (fileNode?.image?.url) {
              fileUrl = fileNode.image.url;
              fileAlt = fileNode.alt || fileName;
              logger.debug("[ACTION] File URL now available:", fileUrl);
              break;
            }

            logger.debug("[ACTION] Still processing, attempt", i + 1, "of 5");
          }
        }

        const successResponse = json(
          {
            success: true,
            file: {
              id: uploadedFile.id,
              url: fileUrl || uploadedFile.image?.url || stagedTarget.resourceUrl,
              alt: fileAlt,
              createdAt: new Date().toISOString(),
            },
          },
          { status: 200 },
        );

        logger.debug("[ACTION] Returning success response:", JSON.stringify({ success: true, file: { id: uploadedFile.id } }));
        logger.debug("[ACTION] Response Content-Type:", successResponse.headers.get("content-type"));
        logger.debug("[ACTION] Response status:", successResponse.status);

        return successResponse;
      } catch (error) {
        logger.error("[ACTION] Error uploading file:", error);
        logger.error("[ACTION] Error message:", error.message);
        logger.error("[ACTION] Error stack:", error.stack);
        return json({ error: error.message || "File upload failed", success: false });
      }
    }

    logger.debug("[ACTION] Action called - starting entry creation");
    logger.debug("[ACTION] Admin authenticated successfully");
    logger.debug("[ACTION] Form data received");

    const positionId = String(formData.get("position_id") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const headline = String(formData.get("headline") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const startAt = String(formData.get("start_at") || "").trim();
    const endAt = String(formData.get("end_at") || "").trim();
    const targetUrl = String(formData.get("target_url") || "").trim();
    const buttonText = String(formData.get("button_text") || "").trim();
    const status = formData.get("status") ? "ACTIVE" : "DRAFT";
    const desktopBanner = String(formData.get("desktop_banner") || "").trim();
    const mobileBanner = String(formData.get("mobile_banner") || "").trim();
    const blockType = String(formData.get("block_type") || "").trim() || DEFAULT_BLOCK_TYPE;
    // Store timezone is source of truth; fallback to user timezone for backward compat
    const storeTimeZone =
      String(formData.get("store_timezone") || formData.get("storeTimezone") || "").trim() ||
      String(formData.get("timezone") || "").trim() ||
      null;
    const userTimezoneOffsetRaw = formData.get("timezone_offset");
    const fallbackOffset =
      userTimezoneOffsetRaw !== null && userTimezoneOffsetRaw !== undefined && userTimezoneOffsetRaw !== "" && !Number.isNaN(Number(userTimezoneOffsetRaw))
        ? Number(userTimezoneOffsetRaw)
        : undefined;

    if (!title) {
      return json({ error: "Title is required", success: false }, { status: 400 });
    }
    if (!positionId) {
      return json({ error: "Position ID is required", success: false }, { status: 400 });
    }
    if (blockType === "announcement_bar") {
      const annText = String(formData.get("announcement_text") || "").trim();
      if (!annText) {
        return json({ error: "Message is required for Announcement Bar", success: false }, { status: 400 });
      }
    }
    if (blockType === "collection_banner") {
      const collHandle = String(formData.get("collection_handle") || "").trim();
      if (!collHandle) {
        return json({ error: "Collection handle is required for Collection Banner", success: false }, { status: 400 });
      }
    }
    if (blockType === "countdown_banner") {
      const targetDate = String(formData.get("countdown_target_date") || "").trim();
      if (!targetDate) {
        return json({ error: "Target date is required for Countdown Banner", success: false }, { status: 400 });
      }
    }
    if (blockType === "image_with_text") {
      const imgId = String(formData.get("image_with_text_image") || "").trim();
      if (!imgId) {
        return json({ error: "Image is required for Image with Text", success: false }, { status: 400 });
      }
    }
    if (blockType === "background_video") {
      const vidUrl = String(formData.get("video_url") || "").trim();
      const vidFile = String(formData.get("video_file") || "").trim();
      if (!vidUrl && !vidFile) {
        return json({ error: "Video URL or Video file is required for Background Video", success: false }, { status: 400 });
      }
    }
    if (blockType === "promo_card") {
      const promoImg = String(formData.get("promo_card_image") || "").trim();
      if (!promoImg) {
        return json({ error: "Image is required for Promo Card", success: false }, { status: 400 });
      }
    }

    logger.debug("Raw form data:", {
      positionId,
      title,
      headline,
      description,
      startAt,
      endAt,
      targetUrl,
      buttonText,
      status,
      desktopBanner,
      mobileBanner,
      storeTimeZone,
      fallbackOffset,
    });

    const defaults = getDefaultDateBounds(storeTimeZone, fallbackOffset);
    const formattedStartAt = startAt ? parseLocalDateTimeToUTC(startAt, storeTimeZone, fallbackOffset) : defaults.start;
    const formattedEndAt = endAt ? parseLocalDateTimeToUTC(endAt, storeTimeZone, fallbackOffset) : defaults.end;

    if (!formattedStartAt || !formattedEndAt) {
      return json({ error: "Invalid date/time values", success: false }, { status: 400 });
    }

    logger.debug("Creating metaobject with fields:", JSON.stringify({
      positionId,
      formattedStartAt,
      formattedEndAt,
      status,
    }, null, 2));

    const defResult = await ensureMetaobjectDefinition(admin);
    if (!defResult.ok) {
      return json({ error: defResult.error || "Failed to ensure metaobject definition", success: false });
    }

    const cssClass = String(formData.get("css_class") || "").trim() || null;
    const customCss = String(formData.get("custom_css") || "").trim() || null;
    const imgHeight = String(formData.get("image_height") || "adapt_to_image").trim();
    const imgHeightMobile = String(formData.get("image_height_mobile") || "adapt_to_image").trim();
    const imgFit = String(formData.get("image_fit") || "cover").trim();
    const imgFitMobile = String(formData.get("image_fit_mobile") || "cover").trim();
    const btnBg = String(formData.get("button_bg_color") || "").trim() || null;
    const btnText = String(formData.get("button_text_color") || "").trim() || null;
    const btnRadius = formData.get("button_border_radius");
    const btnPadV = formData.get("button_padding_vertical");
    const btnPadH = formData.get("button_padding_horizontal");
    const btnFontSize = formData.get("button_font_size");
    const headFontSize = formData.get("headline_font_size");
    const descFontSize = formData.get("description_font_size");
    const headColor = String(formData.get("headline_color") || "").trim() || null;
    const descColor = String(formData.get("description_color") || "").trim() || null;
    const headColorBelow = String(formData.get("headline_color_below") || "").trim() || null;
    const descColorBelow = String(formData.get("description_color_below") || "").trim() || null;
    const btnBgBelow = String(formData.get("button_bg_color_below") || "").trim() || null;
    const btnTextBelow = String(formData.get("button_text_color_below") || "").trim() || null;
    const textAlign = String(formData.get("text_alignment") || "").trim() || null;
    const addCreateStyling = (c) => ({
      ...c,
      css_class: cssClass,
      custom_css: customCss,
      image_height: imgHeight || "adapt_to_image",
      image_height_mobile: imgHeightMobile || "adapt_to_image",
      image_fit: imgFit || "cover",
      image_fit_mobile: imgFitMobile || "cover",
      button_bg_color: btnBg,
      button_text_color: btnText,
      button_border_radius: btnRadius != null && btnRadius !== "" ? String(btnRadius) : null,
      button_padding_vertical: btnPadV != null && btnPadV !== "" ? String(btnPadV) : null,
      button_padding_horizontal: btnPadH != null && btnPadH !== "" ? String(btnPadH) : null,
      button_font_size: btnFontSize != null && btnFontSize !== "" ? String(btnFontSize) : null,
      headline_font_size: headFontSize != null && headFontSize !== "" ? String(headFontSize) : null,
      description_font_size: descFontSize != null && descFontSize !== "" ? String(descFontSize) : null,
      headline_color: headColor,
      description_color: descColor,
      headline_color_below: headColorBelow,
      description_color_below: descColorBelow,
      button_bg_color_below: btnBgBelow,
      button_text_color_below: btnTextBelow,
      text_alignment: textAlign,
      vertical_alignment: (() => {
        const v = formData.get("vertical_alignment");
        return v != null && v !== "" ? String(v).trim() : null;
      })(),
      mobile_content_below: formData.get("mobile_content_below") === "on" || formData.get("mobile_content_below") === "true",
      overlay_opacity: (() => {
        const v = formData.get("overlay_opacity");
        return v != null && v !== "" ? Math.min(100, Math.max(0, Number(v))) : null;
      })(),
      overlay_color: String(formData.get("overlay_color") || "").trim() || null,
    });

    let typeConfig = "{}";
    if (blockType === "hero") {
      typeConfig = JSON.stringify(addCreateStyling({
        headline,
        description,
        desktop_banner: desktopBanner || null,
        mobile_banner: mobileBanner || null,
        target_url: targetUrl || null,
        button_text: buttonText || null,
      }));
    } else if (blockType === "announcement_bar") {
      const annText = String(formData.get("announcement_text") || "").trim();
      const annLink = String(formData.get("announcement_link") || "").trim();
      const annBg = String(formData.get("announcement_bg_color") || "#000000").trim();
      const annColor = String(formData.get("announcement_text_color") || "#ffffff").trim();
      typeConfig = JSON.stringify(addCreateStyling({
        text: annText,
        link: annLink || null,
        bg_color: annBg,
        text_color: annColor,
      }));
    } else if (blockType === "collection_banner") {
      const collHandle = String(formData.get("collection_handle") || "").trim();
      const collImage = String(formData.get("collection_banner_image") || "").trim();
      const collHeadline = String(formData.get("collection_headline") || "").trim();
      const collDesc = String(formData.get("collection_description") || "").trim();
      const collBtn = String(formData.get("collection_button_text") || "").trim();
      typeConfig = JSON.stringify(addCreateStyling({
        collection_handle: collHandle,
        image: collImage || null,
        headline: collHeadline || null,
        description: collDesc || null,
        button_text: collBtn || null,
      }));
      if (collImage) {
        fields.push({ key: "desktop_banner", value: collImage });
      }
    } else if (blockType === "countdown_banner") {
      const targetDateRaw = String(formData.get("countdown_target_date") || "").trim();
      const targetDateUtc = targetDateRaw
        ? parseLocalDateTimeToUTC(targetDateRaw, storeTimeZone, fallbackOffset)
        : null;
      const cdHeadline = String(formData.get("countdown_headline") || "").trim();
      const cdSubtext = String(formData.get("countdown_subtext") || "").trim();
      const cdBgImg = String(formData.get("countdown_bg_image") || "").trim();
      const cdBgColor = String(formData.get("countdown_bg_color") || "#000000").trim();
      const cdTextColor = String(formData.get("countdown_text_color") || "#ffffff").trim();
      const cdLink = String(formData.get("countdown_target_url") || "").trim();
      const cdBtn = String(formData.get("countdown_button_text") || "").trim();
      typeConfig = JSON.stringify(addCreateStyling({
        target_date: targetDateUtc,
        headline: cdHeadline || null,
        subtext: cdSubtext || null,
        background_image: cdBgImg || null,
        background_color: cdBgColor,
        text_color: cdTextColor,
        target_url: cdLink || null,
        button_text: cdBtn || null,
      }));
      if (cdBgImg) fields.push({ key: "desktop_banner", value: cdBgImg });
    } else if (blockType === "image_with_text") {
      const iwtImage = String(formData.get("image_with_text_image") || "").trim();
      const iwtHeadline = String(formData.get("image_with_text_headline") || "").trim();
      const iwtDesc = String(formData.get("image_with_text_description") || "").trim();
      const iwtBtn = String(formData.get("image_with_text_button_text") || "").trim();
      const iwtLink = String(formData.get("image_with_text_button_link") || "").trim();
      const iwtLayout = String(formData.get("image_with_text_layout") || "image_left").trim();
      typeConfig = JSON.stringify(addCreateStyling({
        image: iwtImage,
        headline: iwtHeadline || null,
        description: iwtDesc || null,
        button_text: iwtBtn || null,
        button_link: iwtLink || null,
        layout: iwtLayout,
      }));
      if (iwtImage) fields.push({ key: "desktop_banner", value: iwtImage });
    } else if (blockType === "background_video") {
      const vidUrl = String(formData.get("video_url") || "").trim();
      const vidFile = String(formData.get("video_file") || "").trim();
      const vidHeadline = String(formData.get("video_headline") || "").trim();
      const vidDesc = String(formData.get("video_description") || "").trim();
      const vidBtn = String(formData.get("video_button_text") || "").trim();
      const vidLink = String(formData.get("video_button_link") || "").trim();
      typeConfig = JSON.stringify(addCreateStyling({
        video_url: vidUrl || null,
        video_file: vidFile || null,
        headline: vidHeadline || null,
        description: vidDesc || null,
        button_text: vidBtn || null,
        button_link: vidLink || null,
      }));
      if (vidFile) fields.push({ key: "desktop_banner", value: vidFile });
    } else if (blockType === "promo_card") {
      const promoImg = String(formData.get("promo_card_image") || "").trim();
      const promoTitle = String(formData.get("promo_card_title") || "").trim();
      const promoDesc = String(formData.get("promo_card_description") || "").trim();
      const promoUrl = String(formData.get("promo_card_cta_url") || "").trim();
      const promoBtn = String(formData.get("promo_card_cta_text") || "").trim();
      typeConfig = JSON.stringify(addCreateStyling({
        image: promoImg,
        title: promoTitle || null,
        description: promoDesc || null,
        cta_url: promoUrl || null,
        cta_text: promoBtn || null,
      }));
      if (promoImg) fields.push({ key: "desktop_banner", value: promoImg });
    }

    const fields = [
      { key: "title", value: title },
      { key: "position_id", value: positionId },
      { key: "block_type", value: blockType },
      { key: "type_config", value: typeConfig },
      { key: "headline", value: headline },
      { key: "description", value: description },
      { key: "start_at", value: formattedStartAt },
      { key: "end_at", value: formattedEndAt },
      { key: "target_url", value: targetUrl },
      { key: "button_text", value: buttonText },
    ];

    if (desktopBanner) {
      fields.push({ key: "desktop_banner", value: desktopBanner });
    }
    if (mobileBanner) {
      fields.push({ key: "mobile_banner", value: mobileBanner });
    }

    const createResponse = await admin.graphql(
      `#graphql
      mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
            capabilities {
              publishable {
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
      {
        variables: {
          metaobject: {
            type: "schedulable_entity",
            fields,
            capabilities: {
              publishable: {
                status,
              },
            },
          },
        },
      },
    );

    const createJson = await createResponse.json();

    if (createJson?.errors) {
      const errors = createJson.errors.map((e) => e.message).join(", ");
      logger.error("[ACTION] GraphQL errors creating entry:", errors);
      return json({ error: `Failed to create entry: ${errors}`, success: false });
    }

    if (createJson?.data?.metaobjectCreate?.userErrors?.length > 0) {
      const errors = createJson.data.metaobjectCreate.userErrors
        .map((e) => e.message)
        .join(", ");
      logger.error("[ACTION] User errors creating entry:", errors);
      return json({ error: `Failed to create entry: ${errors}`, success: false });
    }

    const createdMetaobject = createJson?.data?.metaobjectCreate?.metaobject;
    if (!createdMetaobject?.id) {
      return json({
        error: `Unknown error occurred while creating entry. Response: ${JSON.stringify(createJson)}`,
        success: false,
      });
    }

    logger.debug("[ACTION] Entry created successfully, returning success");
    return json({ success: true, message: "Entry created successfully!" });
  } catch (error) {
    logger.error("[ACTION] ========== ERROR IN ACTION ==========");
    logger.error("[ACTION] Error message:", error.message);
    logger.error("[ACTION] Error name:", error.name);
    logger.error("[ACTION] Error stack:", error.stack);
    logger.error("[ACTION] Full error:", error);

    return json({
      error: `Failed to process request: ${error.message || "Unknown error"}`,
      success: false,
    });
  }
};
