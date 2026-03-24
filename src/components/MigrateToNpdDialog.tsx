import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, CheckCircle2, Layers, Folder, Tag, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useTaskGroups, useTasks, useTaskMutations } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const NPD_GATES = [
  { key: "gate0", tagName: "Gate 0: Идея и Стратегия", label: "Gate 0: Идея" },
  { key: "gate1", tagName: "Gate 1: Концепция и Экономика", label: "Gate 1: Концепция" },
  { key: "gate2", tagName: "Gate 2: Разработка и Валидация", label: "Gate 2: Разработка" },
  { key: "gate3", tagName: "Gate 3: Подготовка к запуску", label: "Gate 3: Подготовка" },
  { key: "gate4", tagName: "Gate 4: Запуск", label: "Gate 4: Запуск" },
  { key: "gate5", tagName: "Gate 5: Анализ запуска", label: "Gate 5: Анализ" },
];

const NPD_STREAMS = [
  "Продакт", "Реклама", "RnD", "СКК", "Производство", "Закупки", "Продажи", "Покупка оборудования",
];

interface MigrateToNpdDialogProps {
  trigger: React.ReactNode;
  /** If provided, pre-selects this project */
  groupId?: string;
  onSuccess?: () => void;
}

type SubMapping = { subId: string; subName: string; streamName: string };

export default function MigrateToNpdDialog({ trigger, groupId, onSuccess }: MigrateToNpdDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: allGroups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"select" | "mapping" | "migrating" | "done">("select");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(groupId || null);
  const [gateKey, setGateKey] = useState<string>("gate0");
  const [subMappings, setSubMappings] = useState<SubMapping[]>([]);
  const [migrating, setMigrating] = useState(false);

  // Fetch NPD tag data (gate & stream tags)
  const { data: npdTags } = useQuery({
    queryKey: ["npd-tags-for-migrate", user?.id],
    queryFn: async () => {
      if (!user) return { gateTags: [], streamTags: [] };
      const gateNames = NPD_GATES.map(g => g.tagName);
      const { data: gates } = await supabase.from("tags").select("id, name").in("name", gateNames);
      const { data: streams } = await supabase.from("tags").select("id, name").in("name", NPD_STREAMS);
      return {
        gateTags: (gates || []) as { id: string; name: string }[],
        streamTags: (streams || []) as { id: string; name: string }[],
      };
    },
    enabled: !!user && open,
  });

  // Standard (non-NPD) projects without parent
  const standardProjects = useMemo(() =>
    allGroups.filter(g => (g as any).project_type !== "npd" && (g as any).project_type !== "crm" && !g.parent_id),
    [allGroups]
  );

  const selectedProject = allGroups.find(g => g.id === selectedProjectId);
  const subprojects = useMemo(() =>
    allGroups.filter(g => g.parent_id === selectedProjectId),
    [allGroups, selectedProjectId]
  );

  // Tasks directly in project (not in subprojects)
  const directTasks = useMemo(() =>
    allTasks.filter(t => t.group_id === selectedProjectId),
    [allTasks, selectedProjectId]
  );

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    const subs = allGroups.filter(g => g.parent_id === id);
    // Auto-map subprojects to streams by name similarity
    setSubMappings(subs.map(s => {
      const normalName = s.name.replace(/^.*\/\s*/, "").trim().toLowerCase();
      const bestMatch = NPD_STREAMS.find(st => normalName.includes(st.toLowerCase())) || "skip";
      return { subId: s.id, subName: s.name.replace(/^.*\/\s*/, "").trim(), streamName: bestMatch };
    }));
    setStep("mapping");
  };

  const updateSubMapping = (subId: string, streamName: string) => {
    setSubMappings(prev => prev.map(m => m.subId === subId ? { ...m, streamName } : m));
  };

  const handleMigrate = async () => {
    if (!user || !selectedProjectId) return;
    setMigrating(true);
    setStep("migrating");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) throw new Error("Сессия истекла");

      // 1. Change project_type to 'npd'
      await supabase.from("task_groups").update({ project_type: "npd" } as any).eq("id", selectedProjectId);

      // 2. Assign gate tag to project
      const gateTag = npdTags?.gateTags.find(t => t.name === NPD_GATES.find(g => g.key === gateKey)?.tagName);
      if (gateTag) {
        await supabase.from("group_tags" as any).upsert(
          { group_id: selectedProjectId, tag_id: gateTag.id },
          { onConflict: "group_id,tag_id" }
        );
      }

      // 3. Map subprojects to streams
      const mappedSubs = subMappings.filter(m => m.streamName !== "skip");
      for (const mapping of mappedSubs) {
        // Update subproject type to npd
        await supabase.from("task_groups").update({ project_type: "npd" } as any).eq("id", mapping.subId);

        // Assign stream tag
        const streamTag = npdTags?.streamTags.find(t => t.name === mapping.streamName);
        if (streamTag) {
          await supabase.from("group_tags" as any).upsert(
            { group_id: mapping.subId, tag_id: streamTag.id },
            { onConflict: "group_id,tag_id" }
          );
        }

        // Assign gate tag to subproject
        if (gateTag) {
          await supabase.from("group_tags" as any).upsert(
            { group_id: mapping.subId, tag_id: gateTag.id },
            { onConflict: "group_id,tag_id" }
          );
        }
      }

      // 4. Create missing stream subprojects for unmapped streams
      const mappedStreams = new Set(mappedSubs.map(m => m.streamName));
      const missingStreams = NPD_STREAMS.filter(s => !mappedStreams.has(s));

      if (missingStreams.length > 0) {
        const newSubs = missingStreams.map((name, idx) => ({
          name,
          user_id: currentUserId,
          project_type: "npd" as const,
          icon: "📋",
          color: "#8b5cf6",
          parent_id: selectedProjectId,
          position: subprojects.length + idx,
        }));

        const { data: created } = await supabase
          .from("task_groups")
          .insert(newSubs)
          .select("id, name");

        if (created) {
          const inserts: { group_id: string; tag_id: string }[] = [];
          for (const sub of created) {
            const streamTag = npdTags?.streamTags.find(t => t.name === sub.name);
            if (streamTag) inserts.push({ group_id: sub.id, tag_id: streamTag.id });
            if (gateTag) inserts.push({ group_id: sub.id, tag_id: gateTag.id });
          }
          if (inserts.length > 0) {
            await supabase.from("group_tags" as any).insert(inserts);
          }
        }
      }

      // 5. Update subprojects that were skipped → keep as npd type anyway
      const skippedSubs = subMappings.filter(m => m.streamName === "skip");
      for (const s of skippedSubs) {
        await supabase.from("task_groups").update({ project_type: "npd" } as any).eq("id", s.subId);
      }

      setStep("done");
      toast.success("Проект переведён в NPD");
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["npd-group-tags"] });
      qc.invalidateQueries({ queryKey: ["all_group_tags"] });
      qc.invalidateQueries({ queryKey: ["tags"] });

      setTimeout(() => {
        setOpen(false);
        resetState();
        onSuccess?.();
      }, 1200);
    } catch (e: any) {
      toast.error("Ошибка миграции: " + e.message);
      setStep("mapping");
    } finally {
      setMigrating(false);
    }
  };

  const resetState = () => {
    setStep(groupId ? "mapping" : "select");
    setSelectedProjectId(groupId || null);
    setGateKey("gate0");
    setSubMappings([]);
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && groupId) {
      handleSelectProject(groupId);
    }
    if (!v) resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            {step === "select" ? "Перевести проект в NPD" :
             step === "mapping" ? "Маппинг стримов и гейта" :
             step === "migrating" ? "Миграция..." : "Готово!"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Select project */}
        {step === "select" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Выберите проект для перевода в NPD. Подпроекты будут сопоставлены со стримами.
            </p>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {standardProjects.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                    Нет подходящих проектов
                  </p>
                )}
                {standardProjects.map(g => {
                  const subs = allGroups.filter(c => c.parent_id === g.id);
                  const taskCount = allTasks.filter(t => t.group_id === g.id || subs.some(s => s.id === t.group_id)).length;
                  return (
                    <button
                      key={g.id}
                      onClick={() => handleSelectProject(g.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <span className="text-base leading-none">{g.icon && g.icon !== "list" ? g.icon : "📁"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {subs.length > 0 ? `${subs.length} подпроектов · ` : ""}{taskCount} задач
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === "mapping" && selectedProject && (
          <div className="space-y-4">
            {/* Project info */}
            <div className="bg-muted rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium flex items-center gap-2">
                <span>{selectedProject.icon && selectedProject.icon !== "list" ? selectedProject.icon : "📁"}</span>
                {selectedProject.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {subprojects.length} подпроектов · {directTasks.length} задач в корне
              </p>
            </div>

            {/* Gate selection */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Начальный гейт</p>
              <Select value={gateKey} onValueChange={setGateKey}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NPD_GATES.map(g => (
                    <SelectItem key={g.key} value={g.key} className="text-xs">{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subproject → Stream mapping */}
            {subMappings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Подпроекты → Стримы NPD
                </p>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-2">
                    {subMappings.map(m => (
                      <div key={m.subId} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate font-medium text-foreground" title={m.subName}>
                          {m.subName}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <Select value={m.streamName} onValueChange={(v) => updateSubMapping(m.subId, v)}>
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip" className="text-xs text-muted-foreground">— Без стрима —</SelectItem>
                            {NPD_STREAMS.map(s => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {m.streamName !== "skip" && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {subMappings.length === 0 && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                У проекта нет подпроектов. Будут автоматически созданы стримы NPD ({NPD_STREAMS.length} шт.)
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setStep("select"); setSelectedProjectId(null); }} className="flex-1">
                {groupId ? "Отмена" : "Назад"}
              </Button>
              <Button size="sm" onClick={handleMigrate} disabled={migrating} className="flex-1 gap-1.5">
                {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                Перевести в NPD
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Migrating */}
        {step === "migrating" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Миграция проекта...</p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">Проект переведён в NPD!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
