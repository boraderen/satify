import { GraphProblemWorkbench } from "@/components/GraphProblemWorkbench";

export default function VertexCoverPage() {
  return (
    <main className="page-shell problem-page">
      <GraphProblemWorkbench mode="vertex-cover" />
    </main>
  );
}
