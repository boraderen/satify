import { FormulaWorkbench } from "@/components/FormulaWorkbench";

export default function SatPage() {
  return (
    <main className="page-shell problem-page">
      <FormulaWorkbench mode="sat" />
    </main>
  );
}
