import "dotenv/config";
import { app } from "./app";

// Local-dev / long-running-server entry point. For the Lambda +
// API Gateway deployment, see lambda/mcpHandler.ts instead — it
// wraps the same `app` with serverless-http rather than calling
// listen().

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(PORT, () => {
  console.log(`Guardian MCP server listening on http://localhost:${PORT}/mcp`);
});
