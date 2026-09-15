# Guardian Privacy Policy

**Last updated: September 2025. This policy covers the Guardian household safety agent as submitted for the Alexa+ MCP Hackathon.**

## What Guardian is

Guardian is a household safety agent accessed through Alexa+. It monitors events from connected devices (such as Ring) and household context you provide, and helps decide how to respond — informing you, asking for confirmation, or escalating — according to policies you set.

## What is collected

- **Household member information you provide**: names, roles (e.g. owner, parent, child), routines, and vulnerability flags used to judge whether an event is expected.
- **Event data**: timestamps, event types (e.g. "person detected"), and locations (e.g. "front door") received from connected devices. Guardian does not store camera footage, audio, or images — only structured event metadata.
- **Incidents and policies**: records of situations Guardian flagged (e.g. a wellness check) and the safety rules you define, including rules set by voice through the natural-language policy feature.
- **What is not collected**: payment information, government ID numbers, or biometric data. Guardian does not perform facial recognition — event classification comes from the connected device, not Guardian itself.

## How it is used

Solely to operate the product: deciding how to respond to events, showing household status on the dashboard, and reasoning within your household's data. Your data is never used to train shared models across households.

## Where it is stored

Event, incident, member, and policy data is stored in Amazon DynamoDB in the AWS region you deploy to (default: us-east-1). Reasoning via Amazon Bedrock sends the relevant event and household context to the model for that single decision only.

## Data retention and deletion

Event records are retained until you delete them via the Guardian API or by clearing the DynamoDB tables directly. You own and control the infrastructure — there is no separate deletion request process.

## Third parties

Guardian integrates with Ring (event source) and Amazon Alexa+ (voice/visual interface). Each has its own privacy policy governing data they process outside of Guardian.

## Changes

Material changes will be reflected in an updated "Last updated" date above and a commit to the repository.

## Contact

Open an issue at https://github.com/waleoxy/guardian_agent_mcp or contact the repository owner via GitHub.
