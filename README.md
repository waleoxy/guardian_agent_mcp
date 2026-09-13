# Guardian MCP

The Alexa+ MCP server for Guardian — an AI household safety agent that
reasons about events, context, and policy before acting, rather than
just forwarding alerts.

## Architecture

```
Alexa+  ──(MCP tools/call)──►  src/server.ts  ──►  src/tools.ts  ──►  decide()  ──►  store
Ring   ──(EventBridge)────►  src/lambda/ringEventHandler.ts  ──►  decide()  ──►  store
Dashboard (browser)  ──(REST poll)──►  src/server.ts /api/*  ──►  store
```

Two independent entry points — the synchronous MCP path (Alexa+ voice
turns) and the asynchronous event path (Ring → EventBridge → Lambda) —
both call the exact same `decide()` function and read/write the exact
same `store`. That's deliberate: the reasoning and the state are the
product; MCP and EventBridge are just two doors into it.

## What's in this repo

- `src/types/domain.ts` — household/event/policy/incident data model
- `src/store/` — storage layer, swappable:
  - `types.ts` — `IGuardianStore` interface everything else codes against
  - `memoryStore.ts` — in-memory, seeded, zero AWS dependency (default)
  - `dynamoStore.ts` — real DynamoDB implementation
  - `index.ts` — picks the backend via `STORE_BACKEND` env var
  - `seedData.ts` — the demo household, shared by both backends
- `src/decisionEngine.ts` — rule-based decision engine (deterministic, no
  AWS), including pattern-of-events escalation (Scenario D: no single
  event is alarming, but a cluster of unusual events in a short window is)
- `src/bedrockDecisionEngine.ts` — Bedrock-backed decision engine, with
  automatic fallback to the rule engine if the Bedrock call fails or times out
- `src/decide.ts` — picks the engine via `DECISION_ENGINE` env var
- `src/policyCompiler.ts` — Guardian Rules: turns a plain-language rule
  ("if Mom doesn't respond after two attempts, notify me") into a
  structured `Policy` via Bedrock — no rule-based fallback here, since
  guessing a wrong structured policy is worse than reporting it couldn't
  parse the rule
- `src/tools.ts` — the 13 MCP tools Alexa+ calls
- `src/app.ts` — the Express app (MCP endpoint, dashboard REST API,
  dashboard static files) — no `listen()` call, shared by local dev and Lambda
- `src/server.ts` — local-dev entry point (`app.listen()`)
- `src/lambda/mcpHandler.ts` — wraps the same app for Lambda + API
  Gateway via `serverless-http` — this is what Alexa+ actually talks to once deployed
- `src/lambda/ringEventHandler.ts` — EventBridge-triggered Lambda for
  the Ring ingestion path
- `src/scripts/seedDynamo.ts` — populates DynamoDB tables with the demo household
- `public/index.html` — the dashboard (house status, active incidents,
  Contact/Escalate buttons) — this is your Fire TV screen; cast the
  browser tab if you don't build a native app
- `template.yaml` — AWS SAM: both Lambdas, all 6 DynamoDB tables, the
  EventBridge rule, least-privilege IAM, and a CloudWatch dashboard
- `addon-package/addon.json` — the Alexa+ add-on manifest, built to
  Amazon's real MCP Toolkit schema, with placeholders for what only you can provide
- `src/__tests__/decisionEngine.test.ts` — automated tests for all four
  demo scenarios (A/B/C/D) plus the fallback path and two regression
  guards for real bugs the tests themselves caught (see below)
- `src/__tests__/store.test.ts` — regression test for a bug in
  `addEvent`'s timestamp handling, found via live testing rather than
  the existing suite (see below)
- `.github/workflows/ci.yml` — typecheck + build + test on every push/PR
- `infra/*.sh` — raw AWS CLI fallback if you need to provision outside of SAM

## Run it locally (zero AWS dependency)

```bash
npm install
npm run build
npm start
# Guardian MCP server listening on http://localhost:3000/mcp
```

- Dashboard: open `http://localhost:3000/`
- Health check: `GET /health`

This runs entirely on `MemoryStore` + the rule-based decision engine —
no AWS credentials needed to develop against it.

## Try the reasoning pipeline directly

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "report_event",
      "arguments": { "source": "ring", "type": "person_detected", "location": "front_door" }
    }
  }'
```

This is the "unknown visitor at the door" scenario from the demo
script. With the seeded household (Mary home and marked vulnerable),
it returns a `tier: "ask"` decision asking whether Mary needs
anything — Scenario C from the design doc — and the reasoning always
includes "I won't unlock the door without your confirmation" no matter
which tier resolves the event. No Alexa+ or real Ring device required
to see it work.

Call `initialize` then `tools/list` first if you want the full tool
catalog and schemas (any MCP client, or curl with an
`Accept: application/json, text/event-stream` header, works).

## Turning on Bedrock

```bash
export DECISION_ENGINE=bedrock
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
npm start
```

If the Bedrock call fails for any reason (permissions, model not
enabled in-region, network blip mid-demo), it automatically falls back
to the rule engine and logs why — the demo doesn't crash, it just
gets slightly less nuanced for that one decision.

## Teaching Guardian a new rule (Guardian Rules)

```bash
curl -s -X POST http://localhost:3000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": {
      "name": "add_policy",
      "arguments": { "rule": "If someone knocks after 10pm, always wake me even if it seems minor" }
    }
  }'
```

Requires `DECISION_ENGINE=bedrock` (or just Bedrock credentials present
— the compiler always uses Bedrock, there's no rule-based fallback for
this one). Without credentials it fails loudly and explains why,
rather than crashing or silently guessing.

## Bugs and gaps found along the way

Worth documenting honestly rather than glossing over:

1. **The hard constraint was too broad.** `p-never-auto-unlock` matched
   *any* `person_detected` event, so a scheduled visitor (e.g. the
   cleaner, arriving in their normal Monday window) would incorrectly
   trigger the same "I won't unlock the door" refusal as a genuinely
   unknown visitor — Scenario A from the design doc was never actually
   achievable. Fixed by adding an expected-visitor context check that
   runs first. *(Found by writing tests.)*
2. **A catch-all policy was silently matching everything.**
   `p-quiet-hours` had an empty `appliesTo`, which the original
   `matches()` function treated as "matches any event" — meaning it
   won before the intended hardcoded default ever ran, making that
   default dead code. Fixed by requiring policies to specify at least
   one criterion to auto-match. *(Found by writing tests.)*
3. **Scenarios B and C didn't exist, and the "refusal" demo was
   tier-mislabeled.** The original build only ever implemented
   Scenario A (expected visitor) and D (pattern escalation) — B (owner
   away → simple notify) and C (vulnerable member home → ask if
   assistance is needed) were never coded. Worse: the "AI refuses an
   unsafe action" demo moment was hardcoded to `tier: "escalate"` at
   95% confidence, which doesn't match the design doc's own transcript
   for that exact situation ("I'll notify you and continue
   monitoring" — restrained, not urgent) and contradicts the Bedrock
   engine's own system prompt, which explicitly says to use escalate
   sparingly. Fixed by implementing `checkVulnerableMemberHome` (C) and
   `checkOwnerAway` (B) as real context checks, and folding the
   never-auto-unlock constraint into normal policy resolution so its
   *tier* follows context (inform/ask) while the refusal language
   itself stays constant across every tier. *(Found by a direct
   question — "did we only have A and D, is there B and C" — not by
   the test suite. The lesson: passing tests only prove the code does
   what the tests assume it should; they don't catch a scenario that
   was never implemented or a demo that was confidently mislabeled.)*

All three are now regression-tested in `decisionEngine.test.ts`.

4. **Adding the `timestamp` override itself introduced a new bug.**
   `tools.ts`'s `{ source, type, location, timestamp }` object literal
   always creates an own `timestamp` property — `undefined` when the
   caller omits it, but present nonetheless. `addEvent`'s object spread
   was ordered `{ timestamp: computedDefault, ...input }`, so that
   explicit `undefined` silently overwrote the computed default —
   every event created without an explicit timestamp ended up with
   *no* timestamp at all, which broke Scenario D's pattern detection
   (it filters by timestamp). Caught by live-testing all four
   scenarios end to end after the B/C fix, not by the existing test
   suite — every existing test happened to always pass an explicit
   timestamp. Fixed by reordering the spread so `id`/`timestamp` are
   always assigned *after* the spread, and added a targeted regression
   test (`store.test.ts`) that reproduces the exact input shape
   `tools.ts` produces — verified to fail against the old code before
   confirming the fix.

## Deploying (Lambda + API Gateway + DynamoDB + EventBridge)

Everything is wired in `template.yaml` (AWS SAM). One-time setup: install
the [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).

```bash
npm run build
sam build
sam deploy --guided
```

`sam deploy --guided` will prompt for a stack name and region, then
create:

- **`McpFunction`** — the MCP server (Lambda + HTTP API), the public
  HTTPS endpoint Alexa+ talks to
- **`RingEventFunction`** — the Ring ingestion Lambda, subscribed to
  an EventBridge rule matching `source: "guardian.ring"`
- 6 DynamoDB tables (members, visitors, policies, events, incidents, config)
- A CloudWatch dashboard (`guardian-agent`) with invocation/error/latency
  widgets — including p50/p99 latency against Alexa+'s 500ms requirement
- IAM roles scoped to exactly what each function needs (DynamoDB CRUD
  on its own tables, `bedrock:InvokeModel` scoped to Anthropic models —
  not `bedrock:*`)

Start with `DecisionEngine=rules` (the default parameter) to confirm the
whole pipeline works with zero Bedrock dependency, then redeploy with
`DecisionEngine=bedrock` once you've confirmed model access:

```bash
sam deploy --parameter-overrides DecisionEngine=bedrock
```

After deploy, seed the tables (same demo household as local dev):

```bash
npm run seed:dynamo
```

The stack output `McpEndpoint` is the URL you need for the next step.

## Registering with Alexa+

Confirmed against Amazon's current MCP Toolkit docs — Alexa+ requires
Streamable HTTP (which this server already uses) and a remote HTTPS URL.

```bash
alexa-ai configure                # LWA OAuth, one-time
alexa-ai new mcp --name "Guardian" --locale en-US \
  --mcp-server-url "<McpEndpoint output from sam deploy>"
```

This generates `addon-package/addon.json` — a version is already in
this repo, built to the real schema, with placeholders (`REPLACE_WITH_*`)
for what only you can provide: hosted icons/carousel image, and your
privacy policy / terms URLs. Fill those in, then:

```bash
alexa-ai deploy
```

This deploys to the development stage and returns an Add-on ID you can
test immediately in the web simulator or on a real device — no
certification/submission needed for demo purposes.

**Note on auth**: Amazon's checklist requires OAuth 2.1 + PKCE for
account-linking add-ons. Guardian doesn't do account linking (it's a
single-household agent, not a third-party service brokering user
accounts), so this shouldn't block development-stage testing — but
revisit `mcp-toolkit-authentication.html` in Amazon's docs before
submitting for certification.

## Wiring in real Ring events

The EventBridge rule and Lambda subscription are already created by
`sam deploy` (see above) — nothing further to provision. Point your
Ring webhook/poller at a small adapter that calls EventBridge
`PutEvents` with `Source: "guardian.ring"`, `DetailType: "RingEvent"`,
and a `Detail` of `{ eventType, location }`. Keep Ring as the
observation source only — all reasoning stays in the decision engine,
per the product's core design principle (Ring produces observations,
Guardian produces decisions).

For quick manual testing without a real Ring device:

```bash
aws events put-events --entries '[{
  "Source": "guardian.ring",
  "DetailType": "RingEvent",
  "Detail": "{\"eventType\":\"person_detected\",\"location\":\"front_door\"}"
}]'
```

`infra/dynamodb-tables.sh` and `infra/eventbridge-rule.sh` are kept as
a raw-CLI fallback if you ever need to provision outside of SAM (e.g.
debugging a single resource) — normal path is `sam deploy`.

## Docs

- [`SUBMISSION.md`](./SUBMISSION.md) — judge-facing writeup: problem, differentiation, architecture, AWS usage
- [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — both demos, timed, mapped to actual tool calls
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — the extension points that make this reusable beyond Guardian specifically
- [`FRICTION_LOG.md`](./FRICTION_LOG.md) — template + one real entry, for the Open Source and general judging bonus
- [`LICENSE`](./LICENSE) — MIT

## Store listing assets

`addon-package/media/` has a generated icon set (all 6 required sizes)
and a carousel image, styled to match the dashboard — real files, not
placeholders, ready to upload to wherever you host static assets
(S3+CloudFront, GitHub Pages, etc.). Regenerate them with
`python3 brand-assets/generate_icons.py` and
`python3 brand-assets/generate_carousel.py` if you want to tweak the
look (both are plain PIL, no network dependency).

`addon-package/legal/privacy-policy.md` and `terms-of-use.md` are
drafts scoped to exactly what this codebase actually collects and
does — not generic boilerplate. Replace the bracketed placeholders,
get them reviewed, host them, then point `addon.json`'s
`privacyPolicyUrl` / `termsOfUseUrl` at the hosted versions.

## Build order status

1. ✅ MCP server + rule-based decision engine (zero AWS deps, tested)
2. ✅ Bedrock decision engine with automatic fallback
3. ✅ DynamoDB store, swappable via `STORE_BACKEND` env var
4. ✅ Ring → EventBridge → Lambda ingestion path
5. ✅ Dashboard (Fire TV screen)
6. ✅ Pattern-of-events escalation (Scenario D)
7. ✅ NL policy compiler (Guardian Rules)
8. ✅ SAM deployment (Lambda + API Gateway + DynamoDB + EventBridge + CloudWatch)
9. ✅ `addon.json` built to Amazon's real MCP Toolkit schema
10. ✅ Open-source packaging: LICENSE, CONTRIBUTING.md (real extension points, not boilerplate), FRICTION_LOG.md
11. ✅ Demo script, timed and mapped to tested tool calls, with a backup-video plan
12. ✅ Store listing assets (generated icon set + carousel image) and privacy policy / terms drafts scoped to what the code actually does
13. ✅ Judge-facing submission writeup (`SUBMISSION.md`)
14. **You**: `sam deploy --guided`, host the assets in
    `addon-package/media/`, get the legal drafts reviewed and hosted,
    fill in `addon.json`'s remaining URLs, `alexa-ai deploy`, rehearse
    both demos on real hardware, record backup takes, fill in the
    friction log and the AWS-feedback section of `SUBMISSION.md` as you go
