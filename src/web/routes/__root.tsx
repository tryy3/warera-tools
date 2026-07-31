import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Shell } from "../layout/Shell";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
