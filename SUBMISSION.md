# Guardian — Submission

**Track**: Alexa+ (primary) · AWS Builder + Open Source (mini challenges)

## The problem

Smart homes can detect a lot. Almost nothing decides what to do about
it. A Ring alert, a door sensor trip, a motion event — today these all
turn into the same thing: a push notification, dumped on the owner to
interpret and act on. That doesn't scale to a household with an
elderly parent, a kid coming home alone, or just a normal day where
most events are non-events.

## What Guardian is

Guardian is an AI agent that sits between your devices (Ring, Alexa+,
Fire TV) and reasons about what's actually happening before deciding
what to do — informing you, asking for confirmation, or escalating,
depending on context and the safety policies you've set. It never
takes an irreversible action (like unlocking a door) without explicit
authorization, no matter how confident it is.

## Why this is different from an alert pipe

Three things we built specifically to prove this isn't "event → push
notification with extra steps":

1. **It's context-aware, and it refuses regardless of tier.** The
   identical "unknown person at the front door" event resolves
   differently depending on household context — a scheduled visitor
   gets a simple notify (Scenario A), the vulnerable member being home
   gets an "should I check on her?" ask (Scenario C), an away owner
   with no one vulnerable home gets a plain notify + Fire TV alert
   (Scenario B). What's constant across all of them: Guardian never
   proposes unlocking the door, no matter which tier or which decision
   engine (rule-based or Bedrock) resolves the event. See
   `DEMO_SCRIPT.md`, Demo B.
2. **It reasons across events, not just about one.** Three
   individually-unremarkable events (motion, then door activity, then
   window activity) across different parts of the house in a short
   window trigger an escalation that none of them would alone — see
   `src/decisionEngine.ts`'s pattern detection, tested live.
3. **You can teach it new rules by voice**, and it compiles them into
   structured policy rather than storing your sentence as a string —
   see the `add_policy` tool and `src/policyCompiler.ts`.

## Architecture

```
Alexa+  ──MCP (Streamable HTTP)──►  Lambda (mcpHandler)  ──►  decide()  ──►  DynamoDB
Ring   ──EventBridge───────────►  Lambda (ringEventHandler) ──►  decide()  ──►  DynamoDB
Fire TV / browser  ──REST poll──►  same Lambda's /api/*     ──►  DynamoDB
                                          │
                                    Amazon Bedrock
                                  (Claude, via InvokeModel)
```

Two independent entry points — the synchronous MCP path Alexa+ uses,
and the asynchronous EventBridge path Ring uses — call the exact same
decision engine and read/write the exact same store. The reasoning and
the state are the product; MCP and EventBridge are just two doors into
it.

## AWS usage

- **Amazon Bedrock** (`bedrockDecisionEngine.ts`, `policyCompiler.ts`)
  — the actual reasoning: event + household context + policies in,
  a structured tiered decision out. Automatic fallback to a
  deterministic rule engine if the call fails or times out, so a
  Bedrock hiccup degrades gracefully instead of crashing the demo.
- **AWS Lambda** — both the MCP server (behind API Gateway) and the
  Ring event handler (behind EventBridge) run here.
- **Amazon DynamoDB** — six tables (members, visitors, policies,
  events, incidents, config), swappable in for an in-memory store via
  one env var so local dev never needs AWS credentials.
- **Amazon EventBridge** — decouples Ring event ingestion from
  processing; `source: "guardian.ring"` / `detail-type: "RingEvent"`.
- **Amazon CloudWatch** — a dashboard tracking invocations, errors, and
  p50/p99 latency (against Alexa+'s 500ms round-trip requirement).
- **IAM** — least privilege throughout: each Lambda's role is scoped
  to its own DynamoDB tables and `bedrock:InvokeModel` scoped to
  Anthropic model ARNs, not `bedrock:*`.

Full deploy: `sam build && sam deploy --guided` (see `template.yaml`
and the README).

## Open source

MIT-licensed. `CONTRIBUTING.md` documents the four real extension
points (new event source, new storage backend, new voice/chat front
end, new decision-engine backend) — each backed by an interface
(`IGuardianStore`, the `decide()` signature) that the reference
implementations (Ring, DynamoDB, Bedrock) already conform to, so
swapping any one of them is additive, not a rewrite.

## What's genuinely tested vs. what needs your AWS account

Tested and verified live (see README for the actual curl transcripts):
all 13 MCP tools, the refusal scenario, the pattern-escalation
scenario, the dashboard/MCP state consistency, and graceful failure
when Bedrock credentials are absent.

Not testable without a real AWS account / Alexa+ developer account
(sandboxed build environment has no AWS network access): the live
Bedrock reasoning quality, the actual `sam deploy`, and the Alexa+
voice round-trip. `template.yaml` and `addon-package/` are built to
deploy and register correctly, but "built to spec" and "confirmed
against Amazon's infrastructure" are different claims — the latter is
the next step, on real hardware.

## AWS/Amazon developer experience feedback

Five real friction points encountered during this build, documented in
full in `FRICTION_LOG.md`:

1. **Streamable HTTP transport** — the Alexa+ MCP Toolkit requires
   Streamable HTTP (not SSE), but the SDK docs for it lag behind the
   implementation. The correct constructor signature and session
   lifecycle had to be inferred from SDK source, not docs. A minimal
   working server example in the Toolkit pages would eliminate this.

2. **`addon.json` schema** — no published JSON Schema or complete
   reference example exists. Fields like `mediaAssets` icon sizes,
   carousel dimensions, and the `spokenForm` IPA field required
   reading three separate doc pages to assemble one file. A
   machine-readable schema would let IDEs catch errors before
   `alexa-ai deploy`.

3. **Bedrock model availability** — `AccessDeniedException` from
   `InvokeModel` is indistinguishable between "model not enabled for
   your account" and "IAM policy missing." A distinct exception type
   or a `ListFoundationModels` response that surfaces per-account
   enablement status would make the fix obvious without a console
   detour.

4. **SAM local + EventBridge** — `sam local invoke` doesn't emulate
   EventBridge rule routing; you have to hand-construct the full
   envelope (including `detail` as a JSON-encoded string, not an
   object). The envelope schema lives in the EventBridge guide, not
   the SAM local docs. A `--event-bridge-detail` flag that handles
   wrapping automatically would close this gap.

5. **Fire TV PWA install** — Silk browser parses the PWA manifest but
   doesn't surface an install prompt. The recommended path for a
   web-based TV dashboard (bookmark shortcut vs. APK wrapper vs.
   something else) isn't documented in the Fire TV developer docs.
   A PWA compatibility matrix for Silk would answer this without
   trial and error.
