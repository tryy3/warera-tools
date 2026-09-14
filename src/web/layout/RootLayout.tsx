import { Outlet } from "@tanstack/react-router";
import { Shell } from "./Shell";

export function RootLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
