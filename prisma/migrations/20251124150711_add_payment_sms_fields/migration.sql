-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOMO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "paystackReference" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "ticketCode" TEXT;
