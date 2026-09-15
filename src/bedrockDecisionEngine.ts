import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { store } from "./store";
import { Decision, HouseholdEvent } from "./types/domain";
import { decide as decideWithRules } from "./decisionEngine";
import { extractJson } from "./utils/extractJson";

/**
 * Bedrock-backed decision engine.
 *
 * Same signature and same output shape as decisionEngine.ts's
 * `decide()`, so tools.ts can point at either one via the
 * DECISION_ENGINE env var without any other code changing.
 *
 * Safety net: if the Bedrock call fails or times out — wrong IAM
 * permissions, model not enabled in this region, network blip during
 * a live demo — this falls back to the deterministic rule engine
 * instead of throwing. A slightly less nuanced correct decision beats
 * a crashed demo.
 */

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS ?? 4000);

const client = new BedrockRuntimeClient({ region: REGION });

const SYSTEM_PROMPT = `You are Guardian's decision engine for a household safety system.

You will be given a JSON object with:
- "event": the household event that just occurred
- "household": members, their routines, and vulnerability status
- "expectedVisitors": scheduled visitors who should not be treated as unknown
- "activeIncidents": any currently open incidents
- "policies": the household's safety policies, each with an id, a description, and a tier
- "recentEvents": recent events (most recent first) — use these to notice patterns. A single event may look benign on its own but be part of a concerning cluster (e.g. several unusual events across the house in a short window). When you see that, treat it as its own signal even if no single event matches a policy.

Decide how Guardian should respond. Rules:
- Any policy whose "notes" field contains "Hard constraint" is non-negotiable: if it applies, you MUST use its tier and MUST NOT propose the constrained action, regardless of how safe it seems.
- Prefer the least autonomous tier that adequately handles the situation: "inform" (act and tell the owner), "ask" (propose an action and wait for confirmation), "escalate" (contact family / take urgent action).
- Use household context (routines, expected visitors, vulnerability) to judge whether an event is expected or concerning.
- Keep "reasoning" to 1-2 plain sentences a household owner would actually want to hear, not a log line.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"tier": "inform" | "ask" | "escalate", "action": "<short_snake_case_action>", "reasoning": "<1-2 sentences>", "confidence": <0-100 integer>, "policyId": "<policy id or null>"}`;

export async function decide(event: HouseholdEvent): Promise<Decision> {
  try {
    const decision = await withTimeout(decideViaBedrock(event), TIMEOUT_MS);
    return decision;
  } catch (err) {
    console.error(
      "Bedrock decision engine failed, falling back to rule engine:",
      err instanceof Error ? err.message : err,
    );
    return decideWithRules(event);
  }
}

async function decideViaBedrock(event: HouseholdEvent): Promise<Decision> {
  const payload = {
    event,
    household: await store.listMembers(),
    expectedVisitors: await store.listVisitors(),
    activeIncidents: await store.activeIncidents(),
    policies: await store.listPolicies(),
    recentEvents: await store.recentEvents(15),
  };

  const response = await client.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [{ role: "user", content: [{ text: JSON.stringify(payload) }] }],
      inferenceConfig: { maxTokens: 500 },
    }),
  );

  const text: string =
    response.output?.message?.content?.[0]?.text ?? "";

  const jsonText = extractJson(text);
  const decision = JSON.parse(jsonText) as Decision;

  if (!decision.tier || !decision.action || !decision.reasoning) {
    throw new Error(`Malformed decision from Bedrock: ${text}`);
  }
  return decision;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Bedrock call exceeded ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
