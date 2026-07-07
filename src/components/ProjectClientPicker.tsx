import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskMutations, type TaskGroup } from "@/hooks/useTasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Button } from "@/components/ui/button";
import ClientAvatar from "@/components/ClientAvatar";
import { Building2, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientRow {
  id: string;
  name: string;
  logo_url: string | null;
}

/**
 * Привязка проекта к CRM-клиенту прямо из настроек проекта.
 * При привязке: логотип клиента показывается на проекте (ProjectIcon),
 * проект появляется в «Комнате клиента», задачи наследуют клиента.
 */
export default function ProjectClientPicker({ group }: { group: TaskGroup }) {
  const { user } = useAuth();
  const { linkGroupClient } = useTaskMutations();
  const [open, setOpen] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, logo_url")
        .order("name");
      if (error) throw error;
      return (data as ClientRow[]) || [];
    },
    enabled: !!user && open,
    staleTime: 1000 * 60 * 5,
  });

  const currentId = (group as any).client_id as string | null;
  const currentName =
    (group as any).client_name ?? clients.find((c) => c.id === currentId)?.name ?? null;
  const currentLogo =
    (group as any).client_logo_url ?? clients.find((c) => c.id === currentId)?.logo_url ?? null;

  const select = (client_id: string | null) => {
    linkGroupClient.mutate({ id: group.id, client_id });
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Building2 className="h-3 w-3" /> Клиент
      </p>
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 justify-start gap-2 text-xs font-normal max-w-[240px]"
            >
              {currentId ? (
                <>
                  <ClientAvatar client={{ name: currentName || "", logo_url: currentLogo }} size="sm" />
                  <span className="truncate">{currentName || "Клиент"}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Не привязан</span>
              )}
              <ChevronDown className="h-3 w-3 opacity-50 ml-auto shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <PopoverSearchList<ClientRow>
              items={clients}
              searchKey={(c) => c.name}
              placeholder="Поиск клиента..."
              emptyText="Клиенты не найдены"
              renderItem={(c) => (
                <button
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted transition-colors",
                    c.id === currentId && "bg-primary/10",
                  )}
                >
                  <ClientAvatar client={c} size="sm" />
                  <span className="truncate">{c.name}</span>
                </button>
              )}
            />
          </PopoverContent>
        </Popover>
        {currentId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => select(null)}
            title="Отвязать клиента"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
