#!/usr/bin/env bash
# Creates the DynamoDB tables for STORE_BACKEND=dynamo.
# Plain AWS CLI on purpose — no CDK/SAM bootstrap time during a hackathon.
# Idempotent-ish: re-running will just error "table already exists" per table, safe to ignore.
set -e

REGION="${AWS_REGION:-us-east-1}"

create_table() {
  local name=$1
  local key=$2
  echo "Creating table: $name (key: $key)"
  aws dynamodb create-table \
    --table-name "$name" \
    --attribute-definitions AttributeName="$key",AttributeType=S \
    --key-schema AttributeName="$key",KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION"
}

create_table "${TABLE_MEMBERS:-guardian-members}" id
create_table "${TABLE_VISITORS:-guardian-visitors}" id
create_table "${TABLE_POLICIES:-guardian-policies}" id
create_table "${TABLE_EVENTS:-guardian-events}" id
create_table "${TABLE_INCIDENTS:-guardian-incidents}" id
create_table "${TABLE_CONFIG:-guardian-config}" key

echo "Done. Seed guardian-members / guardian-visitors / guardian-policies with"
echo "the same demo data as src/store/memoryStore.ts's seed() before switching"
echo "STORE_BACKEND=dynamo, or the household context will be empty."
