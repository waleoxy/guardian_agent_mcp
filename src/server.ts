import "dotenv/config";
import { app } from "./app";

// ── Startup validation ────────────────────────────────────────────────────────
// Fail loudly before accepting any traffic if required env vars are absent.
// A clear startup error is far easier to debug than a cryptic AWS SDK
// exception on the first request.

const errors: string[] = [];

if (process.env.STORE_BACKEND === "dynamo") {
  if (!process.env.AWS_REGION)
    errors.push("AWS_REGION is required when STORE_BACKEND=dynamo");
}

if (process.env.STORE_BACKEND === "postgres") {
  if (!process.env.DATABASE_URL)
    errors.push("DATABASE_URL is required when STORE_BACKEND=postgres");
}

if (process.env.DECISION_ENGINE === "bedrock") {
  if (!process.env.AWS_REGION)
    errors.push("AWS_REGION is required when DECISION_ENGINE=bedrock");
}

if (errors.length > 0) {
  console.error("\n❌ Guardian startup failed — missing required configuration:");
  errors.forEach((e) => console.error(`   • ${e}`));
  console.error("\nSee .env.example for the full configuration reference.\n");
  process.exit(1);
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const engine = process.env.DECISION_ENGINE ?? "rules";
const backend = process.env.STORE_BACKEND ?? "memory";

app.listen(PORT, () => {
  console.log(`Guardian MCP server listening on http://localhost:${PORT}/mcp`);
  console.log(`  decision engine : ${engine}`);
  console.log(`  store backend   : ${backend}`);
  if (backend === "memory")
    console.log(
      "  ⚠  memory store: data is lost on restart. " +
        "Set STORE_BACKEND=dynamo or postgres for persistence.",
    );
  if (engine === "rules" && backend === "memory")
    console.log(
      "  ℹ  add_policy requires DECISION_ENGINE=bedrock — " +
        "the Rules tab will show an error until Bedrock is configured.",
    );
});
