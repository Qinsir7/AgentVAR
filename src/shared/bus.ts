import { EventEmitter } from "node:events";

/**
 * In-process event bus. Everything the agents do is published here so the
 * dashboard (SSE) and the MCP server can observe the full adjudication flow.
 */
export interface BusMessage {
  type:
    | "match-event"
    | "review-opened"
    | "testimony"
    | "cross-examination"
    | "ruling"
    | "receipt"
    | "payout"
    | "juror-update"
    | "log";
  payload: unknown;
  timestamp: number;
}

class Bus extends EventEmitter {
  publish(type: BusMessage["type"], payload: unknown) {
    const msg: BusMessage = { type, payload, timestamp: Date.now() };
    this.emit("message", msg);
  }
}

export const bus = new Bus();
bus.setMaxListeners(100);
