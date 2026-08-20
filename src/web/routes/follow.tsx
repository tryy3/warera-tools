import { createFileRoute } from "@tanstack/react-router";
import { FollowPage } from "../features/follow/FollowPage";

export const Route = createFileRoute("/follow")({
  component: FollowPage,
});
