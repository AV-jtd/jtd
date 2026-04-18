import ModuleLayout from "@/components/ModuleLayout";
import ProtocolsList from "@/modules/protocols/pages/ProtocolsList";

export default function ProtocolsLayout() {
  return (
    <ModuleLayout moduleContext="pmo">
      <ProtocolsList />
    </ModuleLayout>
  );
}
