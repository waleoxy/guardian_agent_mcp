import { IGuardianStore } from "./types";
import { MemoryStore } from "./memoryStore";
import { DynamoStore } from "./dynamoStore";

/**
 * Single switch for the whole app's storage backend. Everything else
 * imports `store` from here and only ever sees IGuardianStore.
 *
 *   STORE_BACKEND=memory (default) -> in-memory, seeded, zero AWS deps
 *   STORE_BACKEND=dynamo           -> real DynamoDB tables (see
 *                                     infra/dynamodb-tables.sh to create them)
 */
export const store: IGuardianStore =
  process.env.STORE_BACKEND === "dynamo" ? new DynamoStore() : new MemoryStore();

export type { IGuardianStore } from "./types";
