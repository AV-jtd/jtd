import type { TaskGroup } from "@/hooks/useTasks";
import ProjectIcon from "@/components/ProjectIcon";

export default function GroupIcon({ group }: { group: TaskGroup }) {
  return <ProjectIcon group={group} size="sm" />;
}
