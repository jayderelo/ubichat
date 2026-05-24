import { VisualizeScreen } from "#/components/visualize-screen.tsx";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/visualize")({
  component: VisualizeRoute,
});

function VisualizeRoute() {
  return <VisualizeScreen />;
}

