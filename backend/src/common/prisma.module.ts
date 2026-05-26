import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PRISMA = Symbol('PRISMA');

const prismaClient = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

@Global()
@Module({
  providers: [{ provide: PRISMA, useValue: prismaClient }],
  exports: [PRISMA],
})
export class PrismaModule {}
