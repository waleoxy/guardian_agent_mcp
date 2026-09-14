/**
 * Guardian Ring Simulator
 *
 * Simulates a Ring device installation by sending events to EventBridge
 * in the exact shape that ringEventHandler.ts expects.
 *
 * Two modes:
 *   --scenario <id>   Fire a pre-scripted event sequence (non-interactive)
 *   (no flag)         Interactive menu — pick device + event type
 *
 * Usage:
 *   npm run ring:simulate                     # interactive
 *   npm run ring:simulate -- --scenario scenario-d  # Scenario D
 *
 * Required env vars (same as the rest of Guardian):
 *   AWS_REGION        e.g. us-east-1
 *   EVENT_BUS_NAME    defaults to "default" if not set
 *
 * For local dev without AWS: set RING_SIMULATOR_DRY_RUN=true and events
 * are logged to stdout instead of sent to EventBridge — zero AWS dependency.
 */

import "dotenv/config";
import * as readline from "readline";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { RING_DEVICES, type RingDevice } from "./devices";
import { SCENARIOS, type Scenario } from "./scenarios";

// ─── Configuration ────────────────────────────────────────────────────────────

const REGION = process.env.AWS_REGION ?? "us-east-1";
const EVENT_BUS = process.env.EVENT_BUS_NAME ?? "default";
const DRY_RUN = process.env.RING_SIMULATOR_DRY_RUN === "true";

// ─── EventBridge client ───────────────────────────────────────────────────────

// Lazily instantiated — only created on first real send, never in dry-run.
let eb: EventBridgeClient | null = null;
function getEb(): EventBridgeClient {
  if (!eb) eb = new EventBridgeClient({ region: REGION });
  return eb;
}

// ─── Core: send one Ring event ────────────────────────────────────────────────

/**
 * Sends a single Ring event to EventBridge.
 *
 * The shape here must match exactly what ringEventHandler.ts expects:
 *   Source:     "guardian.ring"
 *   DetailType: "RingEvent"
 *   Detail:     JSON string of { eventType, location, deviceId, timestamp }
 *
 * That's the contract between the simulator (or a real Ring adapter) and
 * the Lambda handler. If you ever change ringEventHandler.ts's RingEventDetail
 * interface, update this function too.
 */
async function putEvent(
  deviceId: string,
  eventType: string,
  location: string,
  timestamp?: string,
): Promise<void> {
  const detail = {
    eventType,
    location,
    deviceId,
    timestamp: timestamp ?? new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Would send to EventBridge:");
    console.log(
      JSON.stringify(
        { Source: "guardian.ring", DetailType: "RingEvent", Detail: detail },
        null,
        2,
      ),
    );
    return;
  }

  await getEb().send(
    new PutEventsCommand({
      Entries: [
        {
          Source: "guardian.ring",
          DetailType: "RingEvent",
          Detail: JSON.stringify(detail),
          EventBusName: EVENT_BUS,
        },
      ],
    }),
  );

  console.log(`✓ Sent: ${eventType} @ ${location} (device: ${deviceId})`);
}

// ─── Scenario mode ────────────────────────────────────────────────────────────

/**
 * Fires all events in a scenario in sequence, respecting each event's
 * delayMs. The delay simulates realistic timing gaps between events —
 * important for Scenario D where the pattern detection window matters.
 *
 * In the simulator we use short delays (seconds) to keep the demo snappy.
 * The timestamp overrides on each event tell the decision engine what
 * "time of day" to reason about, independently of wall-clock time.
 */
async function runScenario(scenario: Scenario): Promise<void> {
  console.log(`\n▶ Running: ${scenario.label}`);
  console.log(`  ${scenario.description}\n`);

  for (const ev of scenario.events) {
    if (ev.delayMs > 0) {
      console.log(`  ⏱  Waiting ${ev.delayMs}ms...`);
      await new Promise((r) => setTimeout(r, ev.delayMs));
    }
    await putEvent(
      ev.deviceId,
      ev.eventType,
      ev.location,
      ev.timestampOverride,
    );
  }

  console.log("\n✅ Scenario complete.");
}

// ─── Interactive mode ─────────────────────────────────────────────────────────

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function runInteractive(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n🔔 Guardian Ring Simulator");
  console.log("─────────────────────────────────────────");
  if (DRY_RUN) console.log("  MODE: DRY RUN (no EventBridge calls)\n");

  // ── Choose mode ──
  console.log("Choose mode:");
  console.log("  1) Fire a single event (pick device + type)");
  console.log("  2) Run a pre-scripted scenario");
  const mode = (await prompt(rl, "\nEnter 1 or 2: ")).trim();

  if (mode === "2") {
    // ── Scenario picker ──
    console.log("\nAvailable scenarios:");
    SCENARIOS.forEach((s, i) => console.log(`  ${i + 1}) ${s.label}`));
    const idx = parseInt(await prompt(rl, "\nEnter number: "), 10) - 1;
    const scenario = SCENARIOS[idx];
    if (!scenario) {
      console.log("Invalid selection.");
      rl.close();
      return;
    }
    rl.close();
    await runScenario(scenario);
    return;
  }

  // ── Single event: pick device ──
  console.log("\nAvailable Ring devices:");
  RING_DEVICES.forEach((d, i) =>
    console.log(`  ${i + 1}) ${d.label} (${d.location})`),
  );
  const devIdx = parseInt(await prompt(rl, "\nEnter device number: "), 10) - 1;
  const device: RingDevice | undefined = RING_DEVICES[devIdx];
  if (!device) {
    console.log("Invalid selection.");
    rl.close();
    return;
  }

  // ── Pick event type ──
  console.log(`\nEvent types for ${device.label}:`);
  device.eventTypes.forEach((t, i) => console.log(`  ${i + 1}) ${t}`));
  const evIdx = parseInt(await prompt(rl, "\nEnter event number: "), 10) - 1;
  const eventType = device.eventTypes[evIdx];
  if (!eventType) {
    console.log("Invalid selection.");
    rl.close();
    return;
  }

  rl.close();
  await putEvent(device.id, eventType, device.location);
  console.log("\n✅ Event sent.");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scenarioFlag = args.indexOf("--scenario");

  if (scenarioFlag !== -1) {
    // Non-interactive: --scenario <id>
    const scenarioId = args[scenarioFlag + 1];
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) {
      console.error(`Unknown scenario: "${scenarioId}"`);
      console.error("Available:", SCENARIOS.map((s) => s.id).join(", "));
      process.exit(1);
    }
    await runScenario(scenario);
  } else {
    await runInteractive();
  }
}

main().catch((err) => {
  console.error("Simulator error:", err);
  process.exit(1);
});
