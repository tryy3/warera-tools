import type { AppConfig } from "../config/env";
import { createServerLogger } from "./createServerLogger";
import type { Logger } from "./types";

export type { Logger } from "./types";

export function createLogger(config: AppConfig): Logger {
  return createServerLogger(config);
}
