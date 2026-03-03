import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureMetaobjectDefinition } from "./services/metaobjects.server";
import { logger } from "./utils/logger.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ admin, session }) => {
      logger.info("[afterAuth] Ensuring metaobject definition exists");
      try {
        const result = await ensureMetaobjectDefinition(admin);
        if (!result.ok) {
          logger.error("[afterAuth] Metaobject definition error:", result.error);
          // Don't throw - we don't want to block installation
        }
        const shop = session?.shop;
        if (shop) {
          const { ensureSchedulerPositionDefinition, syncAllPositionsToMetaobjects } = await import("./services/positions-metaobject.server.js");
          const defResult = await ensureSchedulerPositionDefinition(admin);
          if (!defResult.ok) {
            logger.warn("[afterAuth] theme_stream_position definition:", defResult.error);
          }
          const { listPositions } = await import("./services/positions.server.js");
          const positions = await listPositions(shop);
          await syncAllPositionsToMetaobjects(admin, positions);
        }
      } catch (error) {
        logger.error("[afterAuth] Error in afterAuth hook:", error);
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.January26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
