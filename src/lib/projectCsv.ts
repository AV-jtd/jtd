import { supabase } from "@/integrations/supabase/client";

// --- CSV Export ---

interface ExportRow {
  type: string;
  project: string;
  subproject: string;
  title: string;
  description: string;
  deadline: string;
  original_deadline: string;
  priority: string;
  status: string;
  assigned_to: string;
  tags: string;
  subtasks: string;
  recurrence: string;
}

const CSV_HEADERS: (keyof ExportRow)[] = [
  "type", "project", "subproject", "title", "description",
  "deadline", "original_deadline", "priority", "status",
  "assigned_to", "tags", "subtasks", "recurrence",
];

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function rowToCsv(row: ExportRow): string {
  return CSV_HEADERS.map(h => escapeCsv(row[h] || "")).join(",");
}

export async function exportProjectToCsv(groupId: string): Promise<string> {
  // Fetch group
  const { data: group } = await supabase.from("task_groups").select("*").eq("id", groupId).single();
  if (!group) throw new Error("Проект не найден");

  // Fetch subgroups
  const { data: subgroups = [] } = await supabase.from("task_groups").select("*").eq("parent_id", groupId);

  const allGroupIds = [groupId, ...subgroups.map(s => s.id)];

  // Fetch tasks for all groups
  const { data: tasks = [] } = await supabase.from("tasks").select("*, subtasks(*), task_tags(tag_id)").in("group_id", allGroupIds).order("position");

  // Fetch tags
  const tagIds = new Set<string>();
  tasks.forEach(t => (t as any).task_tags?.forEach((tt: any) => tagIds.add(tt.tag_id)));
  const { data: tags = [] } = await supabase.from("tags").select("id, name").in("id", Array.from(tagIds));
  const tagMap = new Map(tags.map(t => [t.id, t.name]));

  // Fetch profiles for assigned_to
  const assigneeIds = new Set<string>();
  tasks.forEach(t => { if (t.assigned_to) assigneeIds.add(t.assigned_to); });
  const { data: profiles = [] } = await supabase.from("profiles").select("id, display_name, email").in("id", Array.from(assigneeIds));
  const profileMap = new Map(profiles.map(p => [p.id, p.display_name || p.email || p.id]));

  const subgroupMap = new Map(subgroups.map(s => [s.id, s.name]));

  const rows: ExportRow[] = [];

  // Project header row
  rows.push({
    type: "project",
    project: group.name,
    subproject: "",
    title: "",
    description: group.description || "",
    deadline: "", original_deadline: "", priority: "",
    status: "", assigned_to: "", tags: "", subtasks: "", recurrence: "",
  });

  // Subproject header rows
  subgroups.forEach(sg => {
    rows.push({
      type: "subproject",
      project: group.name,
      subproject: sg.name,
      title: "",
      description: sg.description || "",
      deadline: "", original_deadline: "", priority: "",
      status: "", assigned_to: "", tags: "", subtasks: "", recurrence: "",
    });
  });

  // Tasks
  tasks.forEach(t => {
    const taskTags = (t as any).task_tags?.map((tt: any) => tagMap.get(tt.tag_id)).filter(Boolean).join("; ") || "";
    const subtaskList = (t as any).subtasks
      ?.sort((a: any, b: any) => a.position - b.position)
      .map((s: any) => `${s.is_completed ? "✓" : "○"} ${s.title}`)
      .join("; ") || "";

    rows.push({
      type: "task",
      project: group.name,
      subproject: t.group_id !== groupId ? (subgroupMap.get(t.group_id!) || "") : "",
      title: t.title,
      description: t.description || "",
      deadline: t.deadline ? new Date(t.deadline).toISOString().split("T")[0] : "",
      original_deadline: t.original_deadline ? new Date(t.original_deadline).toISOString().split("T")[0] : "",
      priority: t.priority != null ? String(t.priority) : "",
      status: t.is_completed ? "done" : "active",
      assigned_to: t.assigned_to ? (profileMap.get(t.assigned_to) || "") : "",
      tags: taskTags,
      subtasks: subtaskList,
      recurrence: t.recurrence || "",
    });
  });

  const csv = [CSV_HEADERS.join(","), ...rows.map(rowToCsv)].join("\n");
  return csv;
}

export function downloadCsv(csv: string, filename: string) {
  const bom = "\uFEFF"; // UTF-8 BOM for Excel
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- CSV Import ---

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export interface ImportPreview {
  projectName: string;
  subprojects: string[];
  taskCount: number;
  rows: ExportRow[];
}

export function parseCsvForPreview(csvText: string): ImportPreview {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("Файл пуст или содержит только заголовки");

  // Parse header
  const headerLine = parseCsvLine(lines[0]);
  const headerMap = new Map<string, number>();
  headerLine.forEach((h, i) => headerMap.set(h.trim().toLowerCase(), i));

  const getField = (fields: string[], key: keyof ExportRow): string => {
    const idx = headerMap.get(key);
    return idx !== undefined && idx < fields.length ? fields[idx].trim() : "";
  };

  const rows: ExportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    rows.push({
      type: getField(fields, "type") || "task",
      project: getField(fields, "project"),
      subproject: getField(fields, "subproject"),
      title: getField(fields, "title"),
      description: getField(fields, "description"),
      deadline: getField(fields, "deadline"),
      original_deadline: getField(fields, "original_deadline"),
      priority: getField(fields, "priority"),
      status: getField(fields, "status"),
      assigned_to: getField(fields, "assigned_to"),
      tags: getField(fields, "tags"),
      subtasks: getField(fields, "subtasks"),
      recurrence: getField(fields, "recurrence"),
    });
  }

  const projectRow = rows.find(r => r.type === "project");
  const projectName = projectRow?.project || rows[0]?.project || "Импортированный проект";
  const subprojects = [...new Set(rows.filter(r => r.type === "subproject").map(r => r.subproject).filter(Boolean))];
  const taskCount = rows.filter(r => r.type === "task").length;

  return { projectName, subprojects, taskCount, rows };
}

export async function importCsvToProject(
  userId: string,
  rows: ExportRow[],
  targetGroupId?: string,
): Promise<{ groupId: string; taskCount: number }> {
  const projectRow = rows.find(r => r.type === "project");
  let groupId = targetGroupId;

  // Create project if not targeting existing
  if (!groupId) {
    const projectName = projectRow?.project || "Импортированный проект";
    const { data: newGroup, error } = await supabase.from("task_groups").insert({
      name: projectName,
      user_id: userId,
      description: projectRow?.description || null,
    }).select().single();
    if (error || !newGroup) throw new Error("Не удалось создать проект: " + (error?.message || ""));
    groupId = newGroup.id;
  }

  // Create subprojects
  const subprojectNames = [...new Set(rows.filter(r => r.type === "subproject").map(r => r.subproject).filter(Boolean))];
  const subgroupMap = new Map<string, string>();

  for (const name of subprojectNames) {
    const subRow = rows.find(r => r.type === "subproject" && r.subproject === name);
    const { data: sg, error } = await supabase.from("task_groups").insert({
      name,
      user_id: userId,
      parent_id: groupId,
      description: subRow?.description || null,
    }).select().single();
    if (sg) subgroupMap.set(name, sg.id);
  }

  // Resolve tags — find or create
  const allTagNames = new Set<string>();
  rows.filter(r => r.type === "task" && r.tags).forEach(r => {
    r.tags.split(";").map(t => t.trim()).filter(Boolean).forEach(t => allTagNames.add(t));
  });

  const { data: existingTags = [] } = await supabase.from("tags").select("id, name").eq("user_id", userId);
  const tagNameToId = new Map(existingTags.map(t => [t.name.toLowerCase(), t.id]));

  for (const tagName of allTagNames) {
    if (!tagNameToId.has(tagName.toLowerCase())) {
      const { data: newTag } = await supabase.from("tags").insert({ name: tagName, user_id: userId }).select().single();
      if (newTag) tagNameToId.set(tagName.toLowerCase(), newTag.id);
    }
  }

  // Create tasks
  const taskRows = rows.filter(r => r.type === "task");
  let created = 0;

  for (const row of taskRows) {
    const taskGroupId = row.subproject && subgroupMap.has(row.subproject) ? subgroupMap.get(row.subproject)! : groupId;

    const { data: task, error } = await supabase.from("tasks").insert({
      title: row.title || "Без названия",
      description: row.description || null,
      deadline: row.deadline || null,
      original_deadline: row.original_deadline || null,
      priority: row.priority ? parseInt(row.priority) : null,
      is_completed: row.status === "done",
      completed_at: row.status === "done" ? new Date().toISOString() : null,
      recurrence: row.recurrence || null,
      group_id: taskGroupId,
      user_id: userId,
      position: created,
    }).select().single();

    if (!task) continue;
    created++;

    // Create task_tags
    const rowTags = row.tags ? row.tags.split(";").map(t => t.trim()).filter(Boolean) : [];
    for (const tagName of rowTags) {
      const tagId = tagNameToId.get(tagName.toLowerCase());
      if (tagId) {
        await supabase.from("task_tags").insert({ task_id: task.id, tag_id: tagId });
      }
    }

    // Create subtasks
    if (row.subtasks) {
      const subtaskItems = row.subtasks.split(";").map(s => s.trim()).filter(Boolean);
      for (let si = 0; si < subtaskItems.length; si++) {
        let text = subtaskItems[si];
        let completed = false;
        if (text.startsWith("✓ ")) { completed = true; text = text.slice(2); }
        else if (text.startsWith("○ ")) { text = text.slice(2); }
        await supabase.from("subtasks").insert({
          task_id: task.id,
          title: text,
          is_completed: completed,
          position: si,
        });
      }
    }
  }

  return { groupId: groupId!, taskCount: created };
}
