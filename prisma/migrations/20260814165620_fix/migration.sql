/*
  Warnings:

  - You are about to drop the `_EditalToUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_EditalToUser" DROP CONSTRAINT "_EditalToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "_EditalToUser" DROP CONSTRAINT "_EditalToUser_B_fkey";

-- DropTable
DROP TABLE "_EditalToUser";
