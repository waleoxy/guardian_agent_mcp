# Contributing to Guardian

Guardian was built for the Amazon Developer Hackathon 2026 (Alexa+
track), but the reasoning/storage split underneath the Amazon-specific
parts is intentionally general — a household or building safety agent
that reasons about events against policy, regardless of which voice
assistant or camera vendor sits on top.

## Where to extend

**Adding a new event source** (not Ring): you don't touch the decision
engine or the store. Write an adapter that calls `decide()` with a
`HouseholdEvent` in the shape defined in `src/types/domain.ts`, the same
way `src/lambda/ringEventHandler.ts` does for Ring. See that file as
the reference adapter — it's ~50 lines and has no Ring-specific logic
beyond reading the incoming payload shape.

**Adding a new storage backend** (not DynamoDB): implement
`IGuardianStore` from `src/store/types.ts` and wire it into
`src/store/index.ts`'s `STORE_BACKEND` switch. `src/store/dynamoStore.ts`
is the reference implementation — every method maps to one DynamoDB
access pattern, deliberately un-clever.

**Adding a new voice/chat front end** (not Alexa+): any MCP-compatible
client works against `src/tools.ts` as-is — the tools don't know
they're being called by Alexa+ specifically. If your front end isn't
MCP-based, `src/app.ts`'s `/api/*` REST routes are a second, simpler
integration surface already in use by the dashboard.

**Adding a new decision engine backend** (not Bedrock): implement a
function with the same signature as `decide()` in
`src/decisionEngine.ts` (`(event: HouseholdEvent) => Promise<Decision>`)
and wire it into `src/decide.ts`'s `DECISION_ENGINE` switch, the same
way `src/bedrockDecisionEngine.ts` does. Keep the automatic-fallback
pattern if your engine calls anything that can fail at demo time — see
`bedrockDecisionEngine.ts`'s `withTimeout` + fallback-to-rules for the
reference approach.

## Design principles to preserve

These came out of real trade-offs made during the build — please don't
casually undo them in a PR:

1. **Observation sources never reason.** Ring, or any future camera/
   sensor integration, only ever calls `report_event` / `decide()`. If
   you find yourself adding conditional logic to an adapter file
   ("if it's after 10pm, escalate..."), that logic belongs in a
   `Policy` or in the decision engine, not the adapter.
2. **Every autonomous-capable decision engine needs a safe fallback.**
   `decisionEngine.ts` (rules) has none because it has nothing to fall
   back from. Anything built on a live model call — see
   `bedrockDecisionEngine.ts` — must degrade to something deterministic
   rather than throwing during a live demo or, worse, a real incident.
3. **Hard constraints are absolute.** A policy with `"Hard constraint"`
   in its `notes` overrides tier/confidence from any engine, rules or
   model-based. Don't add a code path that lets a decision engine talk
   its way around one.

## Local dev

```bash
npm install
npm run build
npm start        # zero AWS dependency: MemoryStore + rule engine
npx tsc --noEmit # typecheck before opening a PR
npm test         # vitest — decision engine scenarios A, B (+regression), D, and the fallback path
```

CI (`.github/workflows/ci.yml`) runs typecheck + build + test on every
push/PR. The decision-engine test suite exists specifically because
two real bugs were found by writing it (an expected-visitor arriving
in their scheduled window incorrectly triggered the hard-constraint
refusal; a catch-all policy was silently matching every event and
making the intended default unreachable) — both fixed, both now
covered by a regression test. More coverage here is the single highest
-value contribution this repo can take right now.
