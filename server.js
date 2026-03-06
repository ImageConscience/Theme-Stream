#!/usr/bin/env node
/**
 * Custom server: webhook routes use raw body (required for HMAC verification).
 * Other routes use standard React Router.
 */
import express from "express";
import compression from "compression";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { createRequestHandler } from "@react-router/express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEBHOOK_PATHS = [
  "/webhooks/app/uninstalled",
  "/webhooks/app/scopes_update",
  "/webhooks/compliance",
];

async function main() {
  const buildPath = path.resolve(process.argv[2] || "./build/server/index.js");
  const build = await import(pathToFileURL(buildPath).href);
  const buildModule = build.default || build;

  const port = Number(process.env.PORT) || 3000;
  const app = express();

  app.disable("x-powered-by");
  app.use(compression());
  app.use(
    "/assets",
    express.static(path.join(__dirname, "build/client/assets"), { immutable: true, maxAge: "1y" })
  );
  app.use(express.static(path.join(__dirname, "build/client"), { maxAge: "1h" }));
  app.use(express.static("public", { maxAge: "1h" }));
  app.use(morgan("tiny"));

  // Webhook routes: raw body only (no JSON parsing) - required for HMAC verification.
  // Create a req-like stream so createRequestHandler gets the raw body.
  const { Readable } = await import("stream");
  app.post(
    WEBHOOK_PATHS,
    express.raw({ type: "application/json" }),
    async (req, res, next) => {
      try {
        const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body ?? "");
        const bodyStream = Readable.from([Buffer.from(rawBody, "utf8")]);
        const reqWithRawBody = Object.assign(bodyStream, {
          method: req.method,
          get: req.get?.bind(req),
          hostname: req.hostname,
          protocol: req.protocol,
          originalUrl: req.originalUrl,
          headers: req.headers,
          socket: req.socket,
          on: bodyStream.on?.bind(bodyStream),
        });
        const handler = createRequestHandler({
          build: buildModule,
          mode: process.env.NODE_ENV,
        });
        await handler(reqWithRawBody, res, next);
      } catch (err) {
        next(err);
      }
    }
  );

  app.all(
    "*",
    createRequestHandler({
      build: buildModule,
      mode: process.env.NODE_ENV,
    })
  );

  app.listen(port, () => {
    console.log(`[server] http://localhost:${port}`);
  });
}

function pathToFileURL(p) {
  return new URL(`file:${path.resolve(p).replace(/\\/g, "/")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
