import { Inject } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PRISMA } from './prisma.module';

export const InjectPrisma = () => Inject(PRISMA);
export type Prisma = PrismaClient;
