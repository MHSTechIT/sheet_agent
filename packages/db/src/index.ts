// Re-export Prisma generated types so callers can `import type` from
// `@sheet-agent/db`. The actual PrismaClient instantiation happens in the API
// app (backend/src/common/prisma.module.ts) — we don't instantiate here
// because this package's main is a .ts file and we want runtime resolution to
// be unambiguous.
export * from '@prisma/client';
