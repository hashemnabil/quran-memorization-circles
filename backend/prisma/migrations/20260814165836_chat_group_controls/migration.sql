-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "adminOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isClosed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "editedAt" TIMESTAMP(3);
