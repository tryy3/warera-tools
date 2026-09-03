import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { ShellPlayerBar } from "./ShellPlayerBar";

type ShellProps = {
  children: ReactNode;
};

const tabs = [
  { to: "/", label: "Dashboard" },
  { to: "/jobs", label: "Jobs" },
  { to: "/trpc-batch", label: "tRPC Batch" },
  { to: "/calculator", label: "Calculator" },
  { to: "/companies", label: "Companies" },
  { to: "/growth", label: "Growth" },
  { to: "/skills", label: "Skills" },
  { to: "/market", label: "Market" },
  { to: "/equipment", label: "Equipment" },
  { to: "/countries", label: "Countries" },
  { to: "/follow", label: "Follow" },
  { to: "/mu", label: "MU" },
] as const;

export function Shell({ children }: ShellProps) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-6 border-b border-border bg-card px-5 py-3">
        <div className="font-semibold tracking-wide">Warera</div>
        <NavigationMenu viewport={false}>
          <NavigationMenuList className="gap-1">
            {tabs.map((tab) => (
              <NavigationMenuItem key={tab.to}>
                <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                  <Link
                    to={tab.to}
                    className={navigationMenuTriggerStyle()}
                    activeOptions={tab.to === "/" ? { exact: true } : undefined}
                    activeProps={{
                      className: cn(
                        navigationMenuTriggerStyle(),
                        "bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary focus:bg-primary/15 focus:text-primary",
                      ),
                    }}
                  >
                    {tab.label}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
        <ShellPlayerBar />
      </header>
      <main className="flex-1 p-5">{children}</main>
    </div>
  );
}
