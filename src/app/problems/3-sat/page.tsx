import { FormulaWorkbench } from "@/components/FormulaWorkbench";

export default function ThreeSatPage() {
  return (
    <main className="page-shell problem-page">
      <FormulaWorkbench mode="3sat" />
    </main>
  );
}
