import prisma from "../db.server";

/** Convert name to Shopify-style handle: lowercase, spaces to hyphens, alphanumeric + hyphens only */
function handleize(name) {
  if (!name || typeof name !== "string") return "position";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "position";
}

/** Get unique handle for a new position; if base exists, append -2, -3, etc. */
async function getUniqueHandle(shop, baseHandle) {
  let handle = baseHandle;
  let n = 1;
  while (true) {
    const existing = await prisma.blockPosition.findFirst({
      where: { shop, handle },
    });
    if (!existing) return handle;
    n += 1;
    handle = `${baseHandle}-${n}`;
  }
}

const DEFAULT_POSITION_HANDLE = "uncategorized";

/** Ensure default position exists for shop. Call on load. Uncategorized is the default bucket for unsorted content. */
export async function ensureDefaultPosition(shop) {
  const existingByNewHandle = await prisma.blockPosition.findFirst({
    where: { shop, handle: DEFAULT_POSITION_HANDLE },
  });
  if (existingByNewHandle) return existingByNewHandle;

  const legacy = await prisma.blockPosition.findFirst({
    where: { shop, handle: "homepage_banner" },
  });
  if (legacy) {
    return prisma.blockPosition.update({
      where: { id: legacy.id },
      data: {
        name: "Uncategorized",
        description: "Default position for scheduled content",
        handle: DEFAULT_POSITION_HANDLE,
      },
    });
  }

  return prisma.blockPosition.create({
    data: {
      shop,
      name: "Uncategorized",
      description: "Default position for scheduled content",
      handle: DEFAULT_POSITION_HANDLE,
    },
  });
}

/** True if position is the default bucket (not editable/deletable) */
export function isDefaultPosition(position) {
  return position?.handle === DEFAULT_POSITION_HANDLE;
}

/** List all positions for a shop */
export async function listPositions(shop) {
  await ensureDefaultPosition(shop);
  return prisma.blockPosition.findMany({
    where: { shop },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Get position by handle for a shop */
export async function getPositionByHandle(shop, handle) {
  return prisma.blockPosition.findFirst({
    where: { shop, handle },
  });
}

/** Create a new position. Handle is handleized from name (e.g. "Homepage Banner" -> "homepage-banner"). */
export async function createPosition(shop, { name, description }) {
  const baseHandle = handleize(name || "Position");
  const handle = await getUniqueHandle(shop, baseHandle);
  const maxOrder = await prisma.blockPosition.aggregate({
    where: { shop },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
  return prisma.blockPosition.create({
    data: { shop, name: (name || "Position").trim(), description: description || null, handle, sortOrder },
  });
}

/** Update a position. Cannot update the default Uncategorized position. */
export async function updatePosition(shop, id, { name, description }) {
  const existing = await prisma.blockPosition.findFirst({ where: { id, shop } });
  if (!existing) return null;
  if (existing.handle === DEFAULT_POSITION_HANDLE) return null;
  return prisma.blockPosition.update({
    where: { id },
    data: {
      ...(name != null && { name }),
      ...(description !== undefined && { description }),
    },
  });
}

/** Delete a position. Cannot delete the default Uncategorized position. */
export async function deletePosition(shop, id) {
  const existing = await prisma.blockPosition.findFirst({ where: { id, shop } });
  if (!existing) return null;
  if (existing.handle === DEFAULT_POSITION_HANDLE) return null;
  return prisma.blockPosition.delete({ where: { id } });
}

/** Reorder positions. ids = ordered array of position ids. */
export async function reorderPositions(shop, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const positions = await prisma.blockPosition.findMany({
    where: { shop, id: { in: ids } },
    select: { id: true },
  });
  const validIds = new Set(positions.map((p) => p.id));
  const orderedIds = ids.filter((id) => validIds.has(id));
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.blockPosition.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
}
