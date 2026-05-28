import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, LayoutGrid, User, FolderKanban, Loader2 } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import { Button } from "@/components/ui/button";
import { useKanbanBoards } from "@/hooks/useKanbanBoards";
import { useTaskGroups } from "@/hooks/useTasks";
import { CreateBoardDialog } from "@/components/kanban/CreateBoardDialog";

export default function KanbanPage() {
  const { data: boards = [], isLoading } = useKanbanBoards();
  const { data: groups = [] } = useTaskGroups();
  const [createOpen, setCreateOpen] = useState(false);

  const groupMap = new Map(groups.map((g) => [g.id, g] as const));
  const personal = boards.filter((b) => b.board_type === "personal");
  const project = boards.filter((b) => b.board_type === "project");

  return (
    <ModuleLayout moduleContext="tasks">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Канбан-доски</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Личные и проектные доски с ручной сортировкой задач
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Новая доска
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : boards.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="space-y-8">
            {personal.length > 0 && (
              <Section title="Личные" icon={<User className="h-4 w-4" />}>
                {personal.map((b) => (
                  <BoardCard key={b.id} id={b.id} name={b.name} subtitle="Личная" />
                ))}
              </Section>
            )}
            {project.length > 0 && (
              <Section title="Проектные" icon={<FolderKanban className="h-4 w-4" />}>
                {project.map((b) => (
                  <BoardCard
                    key={b.id}
                    id={b.id}
                    name={b.name}
                    subtitle={b.group_id ? groupMap.get(b.group_id)?.name ?? "Проект" : "Проект"}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
      <CreateBoardDialog open={createOpen} onOpenChange={setCreateOpen} />
    </ModuleLayout>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function BoardCard({ id, name, subtitle }: { id: string; name: string; subtitle: string }) {
  return (
    <Link
      to={`/kanban/${id}`}
      className="group block rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LayoutGrid className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <LayoutGrid className="mx-auto h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">Досок пока нет</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Создайте личную доску для своих задач или проектную для команды.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <Plus className="h-4 w-4" /> Создать первую доску
      </Button>
    </div>
  );
}