import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  try {
    return new PrismaClient()
  } catch {
    console.warn("[Prisma] Failed to initialize — database may be unavailable")
    return new Proxy({} as PrismaClient, {
      get(_, prop) {
        // Return a model proxy that returns empty results for queries
        if (typeof prop === "string" && prop !== "then") {
          return new Proxy({}, {
            get() {
              return async () => []
            },
          })
        }
        return undefined
      },
    })
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
