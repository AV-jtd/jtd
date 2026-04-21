import ModuleLayout from "@/components/ModuleLayout";
import StmMatrixView from "@/modules/stm/pages/StmMatrixView";

export default function StmMatrix() {
  return (
    <ModuleLayout moduleContext="npd">
      <StmMatrixView />
    </ModuleLayout>
  );
}