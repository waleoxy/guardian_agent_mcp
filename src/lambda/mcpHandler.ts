import serverlessHttp from "serverless-http";
import { app } from "../app";

/**
 * Deploys the exact same Express app (MCP endpoint + dashboard REST
 * API + dashboard static files) behind API Gateway. This is the
 * public HTTPS endpoint Alexa+ needs — see template.yaml for the
 * API Gateway + Lambda wiring, and README "Deploying" for the
 * `sam deploy` flow.
 *
 * Kept separate from ringEventHandler.ts: this Lambda serves
 * synchronous HTTP request/response (Alexa+ MCP calls, dashboard
 * polling); that one is an async EventBridge target. Different
 * triggers, different concurrency/timeout tuning, so they're
 * deployed as two functions even though both import the same
 * decision/store layer.
 */
export const handler = serverlessHttp(app);
