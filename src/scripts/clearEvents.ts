import { DynamoDBClient, ScanCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const EVENTS_TABLE = process.env.TABLE_EVENTS ?? "guardian-events";
const INCIDENTS_TABLE = process.env.TABLE_INCIDENTS ?? "guardian-incidents";

const client = new DynamoDBClient({ region: REGION });

async function clearTable(table: string) {
  const { Items = [] } = await client.send(new ScanCommand({ TableName: table, ProjectionExpression: "id" }));
  await Promise.all(Items.map(item => client.send(new DeleteItemCommand({ TableName: table, Key: { id: item.id } }))));
  console.log(`Cleared ${Items.length} items from ${table}`);
}

async function main() {
  await clearTable(EVENTS_TABLE);
  await clearTable(INCIDENTS_TABLE);
}

main().catch(err => { console.error(err); process.exit(1); });
