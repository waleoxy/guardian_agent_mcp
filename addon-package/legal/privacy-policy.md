# Guardian Privacy Policy (draft)

\*\*This is a draft for hackathon/demo use, written to match exactly
what the code in this repository does.

## What Guardian is

Guardian is a household safety agent accessed through Alexa+. It
monitors events from connected devices (such as Ring) and household
context you provide, and helps decide how to respond — informing you,
asking for confirmation, or escalating — according to policies you
set.

## What is collected

- **Household member information you provide**: names, roles (e.g.
  owner, parent, child), routines, and vulnerability flags used to
  judge whether an event is expected.
- **Event data**: timestamps, event types (e.g. "person detected"),
  and locations (e.g. "front door") received from connected devices.
  Guardian does not store camera footage, audio, or images — only
  structured event metadata.
- **Incidents and policies**: records of situations Guardian flagged
  (e.g. a wellness check) and the safety rules defined,
  including rules set by voice through the natural-language policy
  feature.
- **What is not collected**: payment information, government ID numbers,
  or biometric data. Guardian does not perform facial recognition —
  event classification (e.g. "person detected") comes from the
  connected device/service, not from Guardian itself.

## How it is used

Solely to operate the product: deciding how to respond to events,
showing household status on the dashboard, and improving the
accuracy of the reasoning over time within the user's household's data.

## Where it's stored

Event, incident, member, and policy data is stored in Amazon DynamoDB. Reasoning that uses a large language model (Amazon Bedrock) sends the relevant event and household context to the model for that single decision; it is not used to train shared models across households.

## Data retention and deletion

## Third parties

Guardian integrates with Ring (event source) and Amazon Alexa+
(voice/visual interface). Each has its own privacy policy governing
data they process outside of Guardian.

---
