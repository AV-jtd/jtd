import ModuleLayout from "@/components/ModuleLayout";
import NpdSwimlaneMatrix from "@/modules/npd/pages/NpdSwimlaneMatrix";

export default function NpdMatrix() {
  return (
    <ModuleLayout moduleContext="npd">
      <NpdSwimlaneMatrix />
    </ModuleLayout>
  );
}
