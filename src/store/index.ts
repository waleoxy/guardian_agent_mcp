import { IGuardianStore } from "./types";
import { MemoryStore } from "./memoryStore";
import { DynamoStore } from "./dynamoStore";
import { PostgresStore } from "./postgresStore";

/**
 * Single switch for the whole app's storage backend. Everything else
 * imports `store` from here and only ever sees IGuardianStore.
 *
 *   STORE_BACKEND=memory   (default) -> in-memory, seeded, zero deps
 *   STORE_BACKEND=postgres           -> local Postgres via node-postgres
 *                                       (see postgres/schema.sql, docker-compose.yml)
 *   STORE_BACKEND=dynamo              -> real DynamoDB tables (see
 *                                        infra/dynamodb-tables.sh to create them)
 */
function selectBackend(): IGuardianStore {
  switch (process.env.STORE_BACKEND) {
    case "dynamo":
      return new DynamoStore();
    case "postgres":
      return new PostgresStore();
    default:
      return new MemoryStore();
  }
}

export const store: IGuardianStore = selectBackend();

export type { IGuardianStore } from "./types";
