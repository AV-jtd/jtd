import ModuleLayout from "@/components/ModuleLayout";
import NpdBoard from "@/modules/npd/pages/NpdBoard";
import { useState } from "react";

export default function NpdLayout() {
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

  return (
    <ModuleLayout moduleContext="npd">
      <NpdBoard projectFilter={projectFilter} onProjectFilterChange={setProjectFilter} />
    </ModuleLayout>
  );
}
