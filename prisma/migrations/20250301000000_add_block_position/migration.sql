-- CreateTable
CREATE TABLE "BlockPosition" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "handle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockPosition_shop_handle_key" ON "BlockPosition"("shop", "handle");

-- CreateIndex
CREATE INDEX "BlockPosition_shop_idx" ON "BlockPosition"("shop");
