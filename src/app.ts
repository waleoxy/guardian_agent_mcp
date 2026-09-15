import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerGuardianTools } from "./tools";
import { store } from "./store";

/**
 * The Express app itself, with no listen() call — shared between
 * local dev (server.ts) and the Lambda entry point
 * (lambda/mcpHandler.ts via serverless-http). Keeping the app
 * definition separate from how it's run is what makes "works on my
 * laptop" and "works behind API Gateway" the same code path.
 */

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "guardian-mcp",
    version: "0.1.0",
  });
  registerGuardianTools(server);
  return server;
}

export const app = express();
// Normalise Content-Type before the MCP SDK sees it — some clients
// (PowerShell, API Gateway) append "; charset=utf-8" which causes the
// SDK's strict equality check to reject the request.
app.use((req, _res, next) => {
  if (req.headers["content-type"]?.startsWith("application/json")) {
    req.headers["content-type"] = "application/json";
  }
  next();
});
app.use(express.json());

// Stateless mode: a fresh McpServer + transport per request. Simple,
// and enough for a single-household hackathon demo. If you need
// multi-turn session state on the MCP layer itself later, switch to
// sessionIdGenerator + a session map (see MCP SDK docs).
app.post("/mcp", async (req, res) => {
  // serverless-http builds a fake IncomingMessage from the Lambda event
  // and only populates req.headers — rawHeaders stays []. @hono/node-server
  // reads rawHeaders when converting to a Web Standard Request, so it sees
  // no headers at all and the SDK's content-type check fails with 415.
  if (req.rawHeaders.length === 0 && req.headers) {
    req.rawHeaders = Object.entries(req.headers).flatMap(([k, v]) =>
      Array.isArray(v) ? v.flatMap((val) => [k, val]) : [k, String(v ?? "")]
    );
  }
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: randomUUID(),
      });
    }
  }
});

// --- Dashboard REST API -----------------------------------------------
// Separate from the MCP endpoint on purpose: the dashboard is a plain
// browser polling JSON, not an MCP client, so it gets a small
// conventional REST surface over the same store instead of having to
// speak JSON-RPC. Both this and the MCP tools read/write the same
// `store`, so they always agree.

app.get("/api/status", async (_req, res) => {
  const [members, activeIncidents, monitoringActive] = await Promise.all([
    store.listMembers(),
    store.activeIncidents(),
    store.getMonitoringActive(),
  ]);
  res.json({ monitoringActive, members, activeIncidents });
});

app.get("/api/policies", async (_req, res) => {
  res.json(await store.listPolicies());
});

app.get("/api/events", async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  res.json(await store.recentEvents(limit));
});

app.post("/api/incidents/:id/resolve", async (req, res) => {
  const incident = await store.updateIncident(req.params.id, {
    status: "resolved",
  });
  if (!incident) return res.status(404).json({ error: "not found" });
  res.json(incident);
});

app.post("/api/incidents/:id/escalate", async (req, res) => {
  const incident = await store.updateIncident(req.params.id, {
    status: "escalated",
  });
  if (!incident) return res.status(404).json({ error: "not found" });
  res.json(incident);
});

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/fire-tv", express.static(path.join(__dirname, "..", "fire-tv")));

app.get("/health", async (_req, res) => {
  try {
    // Probe the store — if tables are missing or Postgres is down this throws.
    await store.getMonitoringActive();
    res.json({
      status: "ok",
      service: "guardian-mcp",
      store: process.env.STORE_BACKEND ?? "memory",
      engine: process.env.DECISION_ENGINE ?? "rules",
    });
  } catch (err: any) {
    res.status(503).json({
      status: "error",
      service: "guardian-mcp",
      store: process.env.STORE_BACKEND ?? "memory",
      error: err?.message ?? String(err),
    });
  }
});
