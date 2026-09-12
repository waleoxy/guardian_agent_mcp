# Friction Log

Amazon's hackathon guidelines note a friction log can earn up to a 10%
judging bonus. Log entries as you hit them — don't reconstruct this
from memory the night before submission. Format per entry: **what you
tried → what happened → what would have helped**.

## Pre-seeded: documentation friction found before writing any Amazon-specific code

- **What I tried**: Determine whether Guardian (a single-household
  personal agent, no third-party user accounts) needs to implement the
  full OAuth 2.1 + PKCE account-linking flow described in the MCP
  Toolkit auth checklist.
- **What happened**: The checklist presents the OAuth requirements as
  unconditionally "Required," with no visible branch for add-ons that
  don't do account linking. It's inferable from context (the PRM/token
  flow is clearly about linking a customer's account with a
  third-party service) that a personal agent may not need it, but this
  isn't stated explicitly.
- **What would have helped**: A short note in the auth checklist
  clarifying which requirements apply only to account-linking add-ons
  vs. all MCP add-ons.

## Template for your own entries

### [Ring]

- What I tried:
- What happened:
- What would have helped:

### [Alexa+ / MCP Toolkit]

- What I tried:
- What happened:
- What would have helped:

### [AWS — Bedrock]

- What I tried:
- What happened:
- What would have helped:

### [AWS — Lambda / API Gateway / EventBridge]

- What I tried:
- What happened:
- What would have helped:

### [Fire TV]

- What I tried:
- What happened:
- What would have helped:
