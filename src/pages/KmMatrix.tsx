import ModuleLayout from "@/components/ModuleLayout";
import KmMatrixView from "@/modules/kmbrand/pages/KmMatrixView";

export default function KmMatrix() {
  return (
    <ModuleLayout moduleContext="npd">
      <KmMatrixView />
    </ModuleLayout>
  );
}
