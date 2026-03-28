import { useState } from "react";
import { useStructuredSections, useWikiMutations } from "@/hooks/useWiki";
import { useTasks, useGroupMembers, useAvailableUsers } from "@/hooks/useTasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Target, AlertTriangle, Link2, Users, TrendingUp, Clock,
  CheckCircle2, Edit3, Save, X, Hash, Sparkles, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInDays, startOfDay, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SECTIONS = [
  { key: "description", label: "Описание", icon: FileText, placeholder: "Опишите проект..." },
  { key: "goals", label: "Цели", icon: Target, placeholder: "Перечислите цели проекта (по одной на строку)..." },
  { key: "risks", label: "Риски", icon: AlertTriangle, placeholder: "Опишите риски (по одному на строку)..." },
  { key: "resources", label: "Ресурсы и ссылки", icon: Link2, placeholder: "Добавьте ссылки (по одной на строку)..." },
];

interface StructuredOverviewProps {
  groupId: string;
  groupName: string;
  compact?: boolean;
  groupDescription?: string;
}

export default function StructuredOverview({ groupId, groupName, compact, groupDescription }: StructuredOverviewProps) {
  const { data: sections = [] } = useStructuredSections(groupId);
  const { upsertSection } = useWikiMutations(groupId);
  const { data: tasks = [] } = useTasks(groupId);
  const { data: members = [] } = useGroupMembers(groupId);
  const { data: users = [] } = useAvailableUsers();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [fillingKey, setFillingKey] = useState<string | null>(null);

  const sectionMap = Object.fromEntries(sections.map(s => [s.section_key, s.content]));

  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);
  const progress = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const today = startOfDay(new Date());
  const overdue = activeTasks.filter(t => t.deadline && new Date(t.deadline) < today);
  const nearDeadline = activeTasks.filter(t => {
    if (!t.deadline) return false;
    const d = differenceInDays(new Date(t.deadline), today);
    return d >= 0 && d <= 7;
  });

  const getProfileName = (uid: string) => users.find(u => u.id === uid)?.display_name || uid.slice(0, 8);

  const startEdit = (key: string) => {
    setEditingKey(key);
    setEditDraft(sectionMap[key] || "");
  };

  const saveEdit = () => {
    if (!editingKey) return;
    upsertSection.mutate({ sectionKey: editingKey, content: editDraft });
    setEditingKey(null);
  };

  const handleAutofill = async (sectionKey: string) => {
    setFillingKey(sectionKey);
    try {
      const tasksInfo = tasks.slice(0, 30).map(t =>
        `- ${t.title}${t.is_completed ? " ✅" : ""}${t.deadline ? ` (срок: ${format(new Date(t.deadline), "dd.MM.yyyy")})` : ""}${t.assigned_to ? ` → ${getProfileName(t.assigned_to)}` : ""}`
      ).join("\n");

      const membersInfo = members.map(m => getProfileName(m.user_id)).join(", ");

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: "",
          action: "wiki_autofill",
          context: {
            sectionKey,
            projectName: groupName,
            projectDescription: groupDescription || "",
            tasksInfo,
            membersInfo,
            existingContent: sectionMap[sectionKey] || "",
          },
        },
      });

      if (error) throw error;
      if (data?.content) {
        // Open in edit mode with generated content
        setEditingKey(sectionKey);
        setEditDraft(data.content);
        toast.success("ИИ сгенерировал контент — проверьте и сохраните");
      } else {
        toast.error("ИИ не смог сгенерировать контент");
      }
    } catch (e: any) {
      console.error("Autofill error:", e);
      toast.error("Ошибка автозаполнения");
    } finally {
      setFillingKey(null);
    }
  };

  const getTimeStatus = () => {
    if (tasks.length > 0 && completedTasks.length === tasks.length) return { label: "Завершено", color: "bg-green-500/10 text-green-600 border-green-500/20" };
    if (overdue.length > 0) return { label: "Просрочено", color: "bg-red-500/10 text-red-600 border-red-500/20" };
    if (nearDeadline.length > 2) return { label: "Смещение", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" };
    return { label: "В графике", color: "bg-green-500/10 text-green-600 border-green-500/20" };
  };
  const timeStatus = getTimeStatus();

  return (
    <ScrollArea className={compact ? "h-[400px]" : "h-[calc(85vh-120px)]"}>
      <div className="p-4 space-y-4">
        {/* Header with status */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{groupName}</h2>
          <Badge className={timeStatus.color}>{timeStatus.label}</Badge>
        </div>

        {/* Dashboard metrics */}
        <Card className="border-primary/20">
          <CardContent className="p-3">
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: TrendingUp, label: "Прогресс", value: `${progress}%`, sub: `${completedTasks.length} из ${tasks.length}` },
                { icon: Clock, label: "Срочные", value: String(nearDeadline.length), sub: "до 7 дней" },
                { icon: AlertTriangle, label: "Просрочено", value: String(overdue.length), sub: "задач" },
                { icon: Users, label: "Команда", value: String(members.length), sub: "участников" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <m.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">{m.value}</div>
                    <div className="text-[10px] text-muted-foreground">{m.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <Progress value={progress} className="h-1.5 mt-3" />
          </CardContent>
        </Card>

        {/* Editable sections */}
        <div className="grid grid-cols-2 gap-3">
          {SECTIONS.map(sec => (
            <Card key={sec.key} className="group">
              <CardHeader className="pb-2 p-3">
                <CardTitle className="text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <sec.icon className="h-3.5 w-3.5" /> {sec.label}
                  </span>
                  <div className="flex gap-0.5">
                    {/* AI autofill button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleAutofill(sec.key)}
                      disabled={fillingKey === sec.key}
                      title="Заполнить с помощью ИИ"
                    >
                      {fillingKey === sec.key ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <Sparkles className="h-3 w-3 text-primary" />
                      )}
                    </Button>
                    {editingKey === sec.key ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={saveEdit}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingKey(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => startEdit(sec.key)}>
                        <Edit3 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {editingKey === sec.key ? (
                  <Textarea
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="text-xs min-h-[80px] resize-none"
                    placeholder={sec.placeholder}
                  />
                ) : (
                  <div
                    onClick={() => startEdit(sec.key)}
                    className="text-xs text-muted-foreground cursor-pointer hover:text-foreground min-h-[40px] transition-colors whitespace-pre-wrap"
                  >
                    {sectionMap[sec.key] || (
                      <span className="italic">Нажмите чтобы добавить...</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Key tasks from DB */}
        {(overdue.length > 0 || nearDeadline.length > 0) && (
          <Card>
            <CardHeader className="pb-2 p-3">
              <CardTitle className="text-xs flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" /> Требуют внимания
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1">
              {[...overdue, ...nearDeadline].slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 text-xs">
                  <CheckCircle2 className={`h-3 w-3 shrink-0 ${overdue.includes(t) ? "text-red-500" : "text-yellow-500"}`} />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.assigned_to && (
                    <span className="text-muted-foreground shrink-0">{getProfileName(t.assigned_to)}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
