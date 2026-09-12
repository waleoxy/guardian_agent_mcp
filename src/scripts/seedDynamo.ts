import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { seedMembers, seedVisitors, seedPolicies } from "../store/seedData";

/**
 * Run after infra/dynamodb-tables.sh, before setting STORE_BACKEND=dynamo:
 *
 *   npx ts-node src/scripts/seedDynamo.ts
 *
 * Populates guardian-members / guardian-visitors / guardian-policies
 * with the same demo household MemoryStore seeds itself with, so
 * switching backends doesn't lose your demo data.
 */

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLES = {
  members: process.env.TABLE_MEMBERS ?? "guardian-members",
  visitors: process.env.TABLE_VISITORS ?? "guardian-visitors",
  policies: process.env.TABLE_POLICIES ?? "guardian-policies",
  config: process.env.TABLE_CONFIG ?? "guardian-config",
};

async function main() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  for (const item of seedMembers) {
    await client.send(new PutCommand({ TableName: TABLES.members, Item: item }));
  }
  for (const item of seedVisitors) {
    await client.send(new PutCommand({ TableName: TABLES.visitors, Item: item }));
  }
  for (const item of seedPolicies) {
    await client.send(new PutCommand({ TableName: TABLES.policies, Item: item }));
  }
  await client.send(
    new PutCommand({
      TableName: TABLES.config,
      Item: { key: "monitoringActive", value: false },
    }),
  );

  console.log(
    `Seeded ${seedMembers.length} members, ${seedVisitors.length} visitors, ${seedPolicies.length} policies, and monitoring config.`,
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
