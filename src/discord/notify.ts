import type { Logger } from "../logging/logger";

export type NotifyOptions = {
  title: string;
  body: string;
  severity?: "info" | "warn" | "error";
};

export type CreateDiscordNotifierOptions = {
  webhookUrl: string | undefined;
  logger: Logger;
  fetchImpl?: typeof fetch;
};

function formatContent({ title, body }: NotifyOptions): string {
  return `**${title}**\n${body}`;
}

export function createDiscordNotifier(options: CreateDiscordNotifierOptions) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  async function notify(payload: NotifyOptions): Promise<void> {
    if (!options.webhookUrl) {
      options.logger.warn("discord webhook URL not configured; skipping notification");
      return;
    }

    const response = await fetchImpl(options.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: formatContent(payload) }),
    });

    if (!response.ok) {
      options.logger.error({ status: response.status }, "discord webhook request failed");
    }
  }

  return { notify };
}
