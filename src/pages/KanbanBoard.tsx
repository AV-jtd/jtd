import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import { Button } from "@/components/ui/button";
import { KanbanBoardCanvas } from "@/components/kanban/KanbanBoardCanvas";

export default function KanbanBoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  if (!boardId) return null;
  return (
    <ModuleLayout moduleContext="tasks">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center border-b border-border bg-background/95 px-4 py-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/kanban">
              <ArrowLeft className="h-4 w-4" /> К списку досок
            </Link>
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <KanbanBoardCanvas boardId={boardId} showHeader />
        </div>
      </div>
    </ModuleLayout>
  );
}