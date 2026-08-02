import type { JobDefinition } from "../types";

export const exampleHeartbeatJob: JobDefinition = {
  id: "example-heartbeat",
  name: "Example Heartbeat",
  description: "Logs a heartbeat to prove the scheduler wiring",
  defaultCron: "0 * * * * *", // every minute at second 0
  async run({ logger }) {
    logger.debug({ jobId: "example-heartbeat" }, "heartbeat");
    return "ok";
  },
};
