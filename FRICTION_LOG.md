# Friction Log

Amazon's hackathon guidelines note a friction log can earn up to a 10%
judging bonus. Format per entry: **what you tried → what happened →
what would have helped**.

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

---

### [Alexa+ / MCP Toolkit] — Streamable HTTP vs. SSE ambiguity

- **What I tried**: Implement the MCP transport layer. The MCP spec
  describes two transports: stdio (local) and SSE (remote). The Alexa+
  MCP Toolkit docs say "Streamable HTTP" is required, which is a newer
  transport introduced in the MCP spec after SSE.
- **What happened**: The `@modelcontextprotocol/sdk` npm package
  supports Streamable HTTP via `StreamableHTTPServerTransport`, but
  the docs for it lag behind the implementation — the class name,
  constructor signature, and session-management behavior aren't
  documented in the MCP Toolkit pages, only in the SDK's own changelog
  and source. Had to cross-reference the SDK source to confirm the
  correct constructor options (`sessionIdGenerator`, `onsessioninitialized`)
  and that a single POST endpoint handles both the initial handshake
  and subsequent tool calls, unlike SSE which uses separate GET/POST
  routes.
- **What would have helped**: A minimal working Streamable HTTP server
  example in the MCP Toolkit docs — even 30 lines — would have
  eliminated the cross-referencing step. The SSE example is there;
  Streamable HTTP isn't.

---

### [Alexa+ / MCP Toolkit] — `addon.json` schema not machine-readable

- **What I tried**: Build `addon-package/addon.json` to the correct
  schema so `alexa-ai deploy` would accept it without iteration.
- **What happened**: The MCP Toolkit docs describe the manifest fields
  in prose and show a partial example, but there's no published JSON
  Schema or OpenAPI spec for `addon.json`. Fields like `mediaAssets`
  (icon sizes, carousel dimensions, required vs. optional) and the
  exact shape of the `integrations[].config.endpoints` block required
  reading the prose carefully and inferring the schema from the
  example fragments. The `spokenForm` field for the add-on name
  (IPA pronunciation) isn't mentioned in the main manifest docs at all
  — found it in a separate "store listing" page.
- **What would have helped**: A published JSON Schema for `addon.json`
  that IDEs can validate against, or at minimum a complete reference
  example with every optional field shown. The current docs require
  reading three separate pages to assemble one file.

---

### [AWS — Bedrock] — Model availability varies silently by region

- **What I tried**: Use `anthropic.claude-3-5-sonnet-20241022-v2:0`
  as the default model ID, since it's the most capable Claude model
  available on Bedrock and the one the system prompt was tuned against.
- **What happened**: Model availability on Bedrock is region-specific
  and requires explicit opt-in ("model access" in the Bedrock console)
  per account. A model ID that works in `us-east-1` may not be
  available in `us-west-2` or `eu-west-1`. There's no API call to
  check whether a specific model is enabled in the current region
  before attempting `InvokeModel` — the first indication is a
  `AccessDeniedException` at runtime, which looks identical to an IAM
  permissions error.
- **What would have helped**: A `bedrock:ListFoundationModels` response
  that distinguishes "model exists in this region" from "model exists
  and is enabled for your account" — or a more specific exception type
  for "model not enabled" vs. "IAM denied." The current error surface
  makes it hard to tell whether the fix is a console click or an IAM
  policy change.

---

### [AWS — Lambda / API Gateway] — SAM local doesn't emulate EventBridge

- **What I tried**: Test the Ring → EventBridge → Lambda path locally
  using `sam local invoke` before deploying.
- **What happened**: `sam local invoke` can invoke a Lambda function
  directly with a synthetic event payload, but it doesn't emulate the
  EventBridge rule evaluation or the event bus routing — you have to
  construct the full EventBridge envelope manually and pass it as
  `--event`. The envelope schema (outer wrapper with `source`,
  `detail-type`, `detail` as a JSON string, etc.) isn't shown in the
  SAM local docs; it's in the EventBridge developer guide under a
  different section. The `detail` field being a JSON-encoded string
  (not an object) is a common stumbling block — the Lambda receives it
  as a string and has to `JSON.parse` it, which isn't obvious from the
  SAM template alone.
- **What would have helped**: `sam local invoke` accepting an
  EventBridge rule ARN and a raw detail object, handling the envelope
  wrapping automatically — or a note in the SAM local docs linking to
  the EventBridge event format reference.

---

### [Fire TV] — PWA install prompt doesn't appear on Fire TV Stick

- **What I tried**: Deploy the dashboard as a PWA (manifest.json,
  service worker, HTTPS) so it could be installed as a home-screen app
  on a Fire TV Stick for the demo.
- **What happened**: Fire TV's Silk browser supports a subset of PWA
  features but doesn't surface the "Add to Home Screen" install prompt
  that Chrome/Edge show on desktop and Android. The PWA manifest is
  parsed (icons load, theme color applies) but the install affordance
  is absent. The workaround is to use the Fire TV's "Silk Browser
  Bookmarks" shortcut or sideload an APK wrapper — neither is as clean
  as a native install prompt.
- **What would have helped**: A Fire TV PWA compatibility matrix in
  the Fire TV developer docs — specifically which PWA manifest fields
  are supported, whether install prompts are planned, and what the
  recommended path is for a web-based dashboard that needs to run
  full-screen on a TV without sideloading.
