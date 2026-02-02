import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";

/**
 * Slack notification Edge Function.
 * Posts alerts to a Slack webhook.
 * 
 * Usage: POST /slack-notify with body:
 * {
 *   channel?: string,      // Override default channel
 *   text: string,          // Fallback text
 *   blocks?: SlackBlock[], // Rich message blocks
 *   alerts?: AlertRecord[] // Or pass alerts directly to format them
 * }
 */

const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL");

interface AlertRecord {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  meta?: Record<string, unknown>;
  count?: number;
  created_at?: string;
}

function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "warning": return "🟡";
    case "info": return "🔵";
    default: return "⚪";
  }
}

function formatAlertBlocks(alerts: AlertRecord[]): any[] {
  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🚨 System Alerts (${alerts.length})`,
        emoji: true,
      },
    },
  ];

  for (const alert of alerts.slice(0, 10)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${severityEmoji(alert.severity)} *${alert.type}*\n${alert.message}${alert.count && alert.count > 1 ? ` (×${alert.count})` : ""}`,
      },
    });
  }

  if (alerts.length > 10) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_...and ${alerts.length - 10} more alerts_`,
        },
      ],
    });
  }

  blocks.push({ type: "divider" });

  return blocks;
}

serve(
  withCors(async (req: Request) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Auth check
    const agentHeader = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const expectedAgent = Deno.env.get("AGENT_TOKEN");

    if (!(expectedAgent && agentHeader === expectedAgent)) {
      return Errors.noAuth(requestId, req);
    }

    if (!SLACK_WEBHOOK_URL) {
      return new Response(
        JSON.stringify({ ok: false, error: "SLACK_WEBHOOK_URL not configured", requestId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return Errors.badJson(requestId, req);
    }

    // Build Slack payload
    let slackPayload: any = {};

    if (body.alerts && Array.isArray(body.alerts) && body.alerts.length > 0) {
      // Format alerts into Slack blocks
      slackPayload = {
        text: `🚨 ${body.alerts.length} system alert(s) detected`,
        blocks: formatAlertBlocks(body.alerts),
      };
    } else if (body.text) {
      slackPayload = {
        text: body.text,
        blocks: body.blocks,
      };
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing text or alerts in body", requestId }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (body.channel) {
      slackPayload.channel = body.channel;
    }

    // Send to Slack
    try {
      const slackRes = await fetch(SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });

      if (!slackRes.ok) {
        const errText = await slackRes.text();
        return new Response(
          JSON.stringify({ ok: false, error: `Slack error: ${errText}`, requestId }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, requestId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: `Slack request failed: ${err.message}`, requestId }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
);
