#!/usr/bin/env bash
# Wires an EventBridge rule matching source "guardian.ring" / detail-type
# "RingEvent" to the ringEventHandler Lambda. Run after the Lambda is
# deployed (zip dist/lambda + node_modules, or use your preferred
# deploy tool — SAM/CDK/Serverless all work, this is the raw-CLI
# fallback so you're never blocked waiting on a toolchain).
set -e

REGION="${AWS_REGION:-us-east-1}"
RULE_NAME="${RULE_NAME:-guardian-ring-events}"
LAMBDA_NAME="${LAMBDA_NAME:-guardian-ring-event-handler}"
LAMBDA_ARN="${LAMBDA_ARN:?Set LAMBDA_ARN to the deployed function's ARN}"

aws events put-rule \
  --name "$RULE_NAME" \
  --event-pattern '{"source":["guardian.ring"],"detail-type":["RingEvent"]}' \
  --region "$REGION"

aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id "AllowEventBridge-${RULE_NAME}" \
  --action "lambda:InvokeFunction" \
  --principal events.amazonaws.com \
  --source-arn "arn:aws:events:${REGION}:$(aws sts get-caller-identity --query Account --output text):rule/${RULE_NAME}" \
  --region "$REGION" || echo "(permission likely already exists, continuing)"

aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id"="1","Arn"="$LAMBDA_ARN" \
  --region "$REGION"

echo "Done. Test with:"
echo "aws events put-events --entries '[{\"Source\":\"guardian.ring\",\"DetailType\":\"RingEvent\",\"Detail\":\"{\\\"eventType\\\":\\\"person_detected\\\",\\\"location\\\":\\\"front_door\\\"}\"}]'"
