import type { JobDefinition } from "../types";
import { runPricePoll } from "./run";

export const pricePollJob: JobDefinition = {
  id: "price-poll",
  name: "Price Poll",
  description:
    "Fetches itemTrading.getPrices and top-10 tradingOrder.getTopOrders; appends to price history",
  defaultCron: "0 0 * * * *", // hourly at :00
  defaultEnabled: true,
  async run({ db, logger, warera }) {
    const result = await runPricePoll({ db, warera, logger });
    return `poll #${result.pollId}: ${result.itemCount} items (${result.status})`;
  },
};
