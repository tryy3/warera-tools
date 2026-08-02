import { createBrowserLogger } from "../logging/createBrowserLogger";

export const webLogger = createBrowserLogger(import.meta.env.DEV ? "DEBUG" : "WARN");
