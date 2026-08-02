import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { PlayerSelectionProvider } from "./player/PlayerSelectionContext";
import { createAppQueryClient } from "./query/client";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });
const queryClient = createAppQueryClient();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PlayerSelectionProvider>
        <RouterProvider router={router} />
      </PlayerSelectionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
