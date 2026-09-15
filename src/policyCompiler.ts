import { randomUUID } from "crypto";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { Policy } from "./types/domain";

/**
 * Turns something like "If Mom doesn't respond after two attempts,
 * notify me" into a structured Policy. This is the stretch feature
 * that demonstrates agentic reasoning on the *input* side, not just
 * the decision side — Guardian Rules from the design doc.
 *
 * No rule-based fallback here on purpose: if this fails, the right
 * behavior is telling the user their rule wasn't understood, not
 * silently guessing a structured policy that doesn't match what they
 * said. Compare to decide(), where a safe default (rule engine) is
 * always better than no decision.
 */

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-5-sonnet-20241022-v2:0";
const REGION = process.env.AWS_REGION ?? "us-east-1";

const client = new BedrockRuntimeClient({ region: REGION });

const SYSTEM_PROMPT = `You convert a household owner's plain-language safety rule into a structured policy for a home-monitoring agent called Guardian.

Output ONLY a JSON object, no other text, in exactly this shape:
{
  "description": "<the rule, cleaned up but in the owner's voice>",
  "appliesTo": { "eventType": "<snake_case event type or omit>", "location": "<snake_case location or omit>" },
  "tier": "inform" | "ask" | "escalate",
  "isHardConstraint": true | false
}

Guidance:
- "inform": Guardian can act and just tell the owner afterward. Use for low-stakes, clearly-safe rules.
- "ask": Guardian proposes an action and waits for confirmation. Use for anything involving contacting people or starting a workflow.
- "escalate": urgent, contact-family-now territory. Use sparingly.
- isHardConstraint: true only for rules that forbid an action outright ("never", "don't ever", "only I can"). Hard constraints override everything else Guardian would otherwise decide.
- If the rule doesn't map to a specific event type or location (e.g. "don't wake me unless it's urgent"), omit that field from appliesTo rather than guessing one.
- If the input isn't actually a safety/monitoring rule, or is too vague to act on, respond with: {"error": "<short explanation>"}`;

export interface CompiledPolicyResult {
  ok: true;
  policy: Policy;
}
export interface CompiledPolicyError {
  ok: false;
  error: string;
}

export async function compilePolicy(
  naturalLanguageRule: string,
): Promise<CompiledPolicyResult | CompiledPolicyError> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: naturalLanguageRule }],
  });

  let response;
  try {
    response = await client.send(
      new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body,
      }),
    );
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    const hint = msg.includes("AccessDenied")
      ? " — check that the model is enabled in your account/region and that bedrock:InvokeModel is in your IAM policy"
      : "";
    return { ok: false, error: `Bedrock call failed: ${msg}${hint}` };
  }

  const raw = new TextDecoder().decode(response.body);
  const parsed = JSON.parse(raw);
  const text: string = parsed.content?.[0]?.text ?? "";

  let result: any;
  try {
    result = JSON.parse(extractJson(text));
  } catch {
    return { ok: false, error: `Model returned non-JSON: ${text.slice(0, 200)}` };
  }

  if (result.error) {
    return { ok: false, error: result.error };
  }

  if (!result.description || !result.tier) {
    return {
      ok: false,
      error: `Model returned an incomplete policy: ${text}`,
    };
  }

  const policy: Policy = {
    id: `p-${randomUUID().slice(0, 8)}`,
    description: result.description,
    appliesTo: result.appliesTo ?? {},
    tier: result.tier,
    notes: result.isHardConstraint
      ? "Hard constraint: added via natural-language rule compilation."
      : undefined,
  };

  return { ok: true, policy };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text;
}
