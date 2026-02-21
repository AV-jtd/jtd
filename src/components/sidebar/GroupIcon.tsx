import type { TaskGroup } from "@/hooks/useTasks";

export default function GroupIcon({ group }: { group: TaskGroup }) {
  if (group.icon && group.icon !== "list") {
    return <span className="text-sm leading-none">{group.icon}</span>;
  }
  return (
    <div
      className="h-3 w-3 rounded"
      style={{ backgroundColor: group.color || "#3b82f6" }}
    />
  );
}
