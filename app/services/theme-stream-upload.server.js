import { Buffer } from "buffer";
import { logger } from "../utils/logger.server";

/**
 * Upload a file to Shopify using the staged upload flow.
 * Creates a staged target, uploads to GCS, then registers the file via fileCreate.
 *
 * @param {Object} admin - Shopify Admin API client
 * @param {File|Blob} file - File to upload
 * @returns {{ success: true, file: object } | { success: false, error: string }}
 */
export async function uploadFileToShopify(admin, file) {
  if (!file) {
    return { success: false, error: "No file provided" };
  }

  if (typeof file === "string") {
    return {
      success: false,
      error: "File upload failed: File object not received.",
    };
  }

  const isFileLike =
    file instanceof File ||
    file instanceof Blob ||
    (typeof file === "object" &&
      file !== null &&
      (typeof file.arrayBuffer === "function" || typeof file.stream === "function"));

  if (!isFileLike) {
    return { success: false, error: `Invalid file format. Received: ${typeof file}` };
  }

  const fileName = file.name || `upload-${Date.now()}.jpg`;
  const fileType = file.type || "image/jpeg";
  const fileSize = file.size || 0;

  logger.debug("[upload] File:", fileName, "Type:", fileType, "Size:", fileSize, "bytes");

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
    return { success: false, error: "File object doesn't support reading" };
  }
  const fileBuffer = Buffer.from(arrayBuffer);

  logger.debug("[upload] Step 1: Creating staged upload target...");
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
  logger.debug("[upload] Staged upload response received");

  if (stagedUploadJson?.errors) {
    const errors = stagedUploadJson.errors.map((e) => e.message).join(", ");
    logger.error("[upload] GraphQL errors creating staged upload:", errors);
    return { success: false, error: `Failed to create staged upload: ${errors}` };
  }

  if (stagedUploadJson?.data?.stagedUploadsCreate?.userErrors?.length > 0) {
    const errors = stagedUploadJson.data.stagedUploadsCreate.userErrors
      .map((e) => e.message)
      .join(", ");
    logger.error("[upload] User errors creating staged upload:", errors);
    return { success: false, error: `Failed to create staged upload: ${errors}` };
  }

  const stagedTarget = stagedUploadJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!stagedTarget || !stagedTarget.url) {
    logger.error("[upload] Invalid staged upload response:", JSON.stringify(stagedUploadJson, null, 2));
    return { success: false, error: "Failed to create staged upload target" };
  }

  logger.debug("[upload] Step 2: Uploading file to Google Cloud Storage...");
  const FormData = (await import("form-data")).default;
  const uploadFormData = new FormData();

  if (Array.isArray(stagedTarget.parameters)) {
    for (const param of stagedTarget.parameters) {
      uploadFormData.append(param.name, param.value);
    }
  }

  uploadFormData.append("file", fileBuffer, {
    filename: fileName,
    contentType: fileType,
  });

  const uploadHeaders = uploadFormData.getHeaders();
  const { request: undiciRequest } = await import("undici");
  const uploadResponse = await undiciRequest(stagedTarget.url, {
    method: "POST",
    headers: uploadHeaders,
    body: uploadFormData,
  });

  if (uploadResponse.statusCode >= 400) {
    const responseBody = await uploadResponse.body.text();
    logger.error("[upload] GCS upload failed:", uploadResponse.statusCode);
    logger.error("[upload] Response body:", responseBody);
    return {
      success: false,
      error: `Cloud storage upload failed: ${uploadResponse.statusCode}`,
    };
  }

  logger.debug("[upload] Step 3: Creating file record in Shopify...");
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

  if (fileCreateJson?.errors) {
    const errors = fileCreateJson.errors.map((e) => e.message).join(", ");
    logger.error("[upload] GraphQL errors creating file:", errors);
    return { success: false, error: `Failed to register file: ${errors}` };
  }

  if (fileCreateJson?.data?.fileCreate?.userErrors?.length > 0) {
    const errors = fileCreateJson.data.fileCreate.userErrors
      .map((e) => e.message)
      .join(", ");
    logger.error("[upload] User errors creating file:", errors);
    return { success: false, error: `Failed to register file: ${errors}` };
  }

  const uploadedFile = fileCreateJson?.data?.fileCreate?.files?.[0];
  if (!uploadedFile?.id) {
    logger.error("[upload] No file ID returned in response");
    return { success: false, error: "File registration failed" };
  }

  let fileUrl = uploadedFile.image?.url;
  let fileAlt = uploadedFile.alt || file.name;

  if (!fileUrl && uploadedFile.fileStatus !== "READY") {
    logger.debug("[upload] File is still processing, waiting for URL...");
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
        logger.debug("[upload] File URL now available:", fileUrl);
        break;
      }
    }
  }

  return {
    success: true,
    file: {
      id: uploadedFile.id,
      url: fileUrl || uploadedFile.image?.url || stagedTarget.resourceUrl,
      alt: fileAlt,
      createdAt: new Date().toISOString(),
    },
  };
}
