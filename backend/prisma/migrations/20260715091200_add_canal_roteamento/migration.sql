-- CreateEnum
CREATE TYPE "CanalRoteamento" AS ENUM ('SUS', 'CENTRO_ESPECIALIDADES', 'CENTRO_ODONTOLOGICO');

-- AlterTable
ALTER TABLE "encaminhamentos" ADD COLUMN "canalRoteamento" "CanalRoteamento";
