import prisma from "../db.server";
import crypto from "crypto";

/** Generate a URL-safe unique handle for new positions */
function generateHandle() {
  return `pos_${crypto.randomBytes(6).toString("base64url")}`;
}

/** Ensure default position exists for shop. Call on load. */
export async function ensureDefaultPosition(shop) {
  const existing = await prisma.blockPosition.findFirst({
    where: { shop, handle: "homepage_banner" },
  });
  if (existing) {
    if (existing.name === "Homepage Banner") {
      return prisma.blockPosition.update({
        where: { id: existing.id },
        data: { name: "Uncategorized", description: "Default position for scheduled content" },
      });
    }
    return existing;
  }
  return prisma.blockPosition.create({
    data: {
      shop,
      name: "Uncategorized",
      description: "Default position for scheduled content",
      handle: "homepage_banner",
    },
  });
}

/** List all positions for a shop */
export async function listPositions(shop) {
  await ensureDefaultPosition(shop);
  return prisma.blockPosition.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
}

/** Get position by handle for a shop */
export async function getPositionByHandle(shop, handle) {
  return prisma.blockPosition.findFirst({
    where: { shop, handle },
  });
}

/** Create a new position */
export async function createPosition(shop, { name, description }) {
  const handle = generateHandle();
  return prisma.blockPosition.create({
    data: { shop, name, description: description || null, handle },
  });
}

/** Update a position */
export async function updatePosition(shop, id, { name, description }) {
  const existing = await prisma.blockPosition.findFirst({ where: { id, shop } });
  if (!existing) return null;
  return prisma.blockPosition.update({
    where: { id },
    data: {
      ...(name != null && { name }),
      ...(description !== undefined && { description }),
    },
  });
}

/** Delete a position */
export async function deletePosition(shop, id) {
  const existing = await prisma.blockPosition.findFirst({ where: { id, shop } });
  if (!existing) return null;
  return prisma.blockPosition.delete({ where: { id } });
}
