import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───

interface ExportRow {
  type: string;
  project: string;
  subproject: string;
  title: string;
  description: string;
  start_at: string;
  deadline: string;
  original_deadline: string;
  priority: string;
  status: string;
  assigned_to: string;
  tags: string;
  subtasks: string;
  recurrence: string;
}

export interface ImportPreview {
  projectName: string;
  subprojects: string[];
  taskCount: number;
  rows: ExportRow[];
}

const HEADERS: { key: keyof ExportRow; label: string; width: number }[] = [
  { key: "type", label: "Тип", width: 12 },
  { key: "project", label: "Проект", width: 24 },
  { key: "subproject", label: "Подпроект", width: 20 },
  { key: "title", label: "Задача", width: 36 },
  { key: "description", label: "Описание", width: 40 },
  { key: "start_at", label: "Старт", width: 14 },
  { key: "deadline", label: "Дедлайн", width: 14 },
  { key: "original_deadline", label: "Исх. дедлайн", width: 14 },
  { key: "priority", label: "Приоритет", width: 12 },
  { key: "status", label: "Статус", width: 12 },
  { key: "assigned_to", label: "Ответственный", width: 20 },
  { key: "tags", label: "Теги", width: 24 },
  { key: "subtasks", label: "Подзадачи", width: 40 },
  { key: "recurrence", label: "Повтор", width: 14 },
];

// ─── Color helpers ───

const FILL_HEADER: ExcelJS.FillPattern = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};
const FONT_HEADER: Partial<ExcelJS.Font> = {
  bold: true, color: { argb: "FFFFFFFF" }, size: 11,
};
const FILL_PROJECT: ExcelJS.FillPattern = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FFE2E8F0" },
};
const FILL_SUBPROJECT: ExcelJS.FillPattern = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};
const FILL_DONE: ExcelJS.FillPattern = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FFDCFCE7" },
};
const FILL_OVERDUE: ExcelJS.FillPattern = {
  type: "pattern", pattern: "solid",
  fgColor: { argb: "FFFEE2E2" },
};

const priorityFill = (p: string): ExcelJS.FillPattern | undefined => {
  if (p === "3") return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  if (p === "2") return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  if (p === "1") return { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  return undefined;
};

const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

// ─── Export ───

export interface ExportOptions {
  columns?: string[];
  statusFilter?: "all" | "active" | "done";
  priorityFilter?: "all" | "1" | "2" | "3";
  includeSubtasks?: boolean;
}

export async function exportProjectToExcel(groupId: string, options?: ExportOptions): Promise<Blob> {
  const { data: group } = await supabase.from("task_groups").select("*").eq("id", groupId).single();
  if (!group) throw new Error("Проект не найден");

  const { data: subgroups = [] } = await supabase.from("task_groups").select("*").eq("parent_id", groupId);
  const allGroupIds = [groupId, ...subgroups.map(s => s.id)];
  const { data: tasks = [] } = await supabase.from("tasks").select("*, subtasks(*), task_tags(tag_id)").in("group_id", allGroupIds).order("position");

  const tagIds = new Set<string>();
  tasks.forEach(t => (t as any).task_tags?.forEach((tt: any) => tagIds.add(tt.tag_id)));
  const { data: tags = [] } = await supabase.from("tags").select("id, name").in("id", Array.from(tagIds));
  const tagMap = new Map(tags.map(t => [t.id, t.name]));

  const assigneeIds = new Set<string>();
  tasks.forEach(t => { if (t.assigned_to) assigneeIds.add(t.assigned_to); });
  const { data: profiles = [] } = await supabase.from("profiles").select("id, display_name, email").in("id", Array.from(assigneeIds));
  const profileMap = new Map(profiles.map(p => [p.id, p.display_name || p.email || p.id]));
  const subgroupMap = new Map(subgroups.map(s => [s.id, s.name]));

  // Build rows
  const rows: ExportRow[] = [];
  rows.push({
    type: "project", project: group.name, subproject: "", title: "",
    description: group.description || "", start_at: "", deadline: "", original_deadline: "",
    priority: "", status: "", assigned_to: "", tags: "", subtasks: "", recurrence: "",
  });
  subgroups.forEach(sg => {
    rows.push({
      type: "subproject", project: group.name, subproject: sg.name, title: "",
      description: sg.description || "", deadline: "", original_deadline: "",
      priority: "", status: "", assigned_to: "", tags: "", subtasks: "", recurrence: "",
    });
  });
  tasks.forEach(t => {
    const taskTags = (t as any).task_tags?.map((tt: any) => tagMap.get(tt.tag_id)).filter(Boolean).join("; ") || "";
    const subtaskList = (t as any).subtasks
      ?.sort((a: any, b: any) => a.position - b.position)
      .map((s: any) => `${s.is_completed ? "✓" : "○"} ${s.title}`)
      .join("; ") || "";
    rows.push({
      type: "task", project: group.name,
      subproject: t.group_id !== groupId ? (subgroupMap.get(t.group_id!) || "") : "",
      title: t.title, description: t.description || "",
      deadline: t.deadline ? new Date(t.deadline).toISOString().split("T")[0] : "",
      original_deadline: t.original_deadline ? new Date(t.original_deadline).toISOString().split("T")[0] : "",
      priority: t.priority != null ? String(t.priority) : "",
      status: t.is_completed ? "done" : "active",
      assigned_to: t.assigned_to ? (profileMap.get(t.assigned_to) || "") : "",
      tags: taskTags, subtasks: subtaskList, recurrence: t.recurrence || "",
    });
  });

  // Apply filters from options
  const selectedColumns = options?.columns;
  const statusFilter = options?.statusFilter || "all";
  const priorityFilter = options?.priorityFilter || "all";
  const includeSubtasks = options?.includeSubtasks !== false;

  // Filter task rows by status/priority
  const filteredRows = rows.filter(row => {
    if (row.type !== "task") return true; // keep project/subproject rows
    if (statusFilter === "active" && row.status === "done") return false;
    if (statusFilter === "done" && row.status !== "done") return false;
    if (priorityFilter !== "all" && row.priority && row.priority !== priorityFilter) return false;
    return true;
  });

  // Clear subtasks column if not included
  if (!includeSubtasks) {
    filteredRows.forEach(r => { r.subtasks = ""; });
  }

  // Select columns
  const activeHeaders = selectedColumns
    ? HEADERS.filter(h => selectedColumns.includes(h.key))
    : HEADERS;

  // Create workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lovable";
  const ws = wb.addWorksheet(group.name.slice(0, 31));

  // Header row
  const headerRow = ws.addRow(activeHeaders.map(h => h.label));
  headerRow.font = FONT_HEADER;
  headerRow.fill = FILL_HEADER;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 28;
  headerRow.eachCell(cell => { cell.border = BORDER_THIN; });

  // Set column widths
  activeHeaders.forEach((h, i) => { ws.getColumn(i + 1).width = h.width; });

  // Freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  const now = new Date();
  filteredRows.forEach(row => {
    const values = activeHeaders.map(h => row[h.key] || "");
    const excelRow = ws.addRow(values);
    excelRow.alignment = { vertical: "top", wrapText: true };
    excelRow.eachCell(cell => { cell.border = BORDER_THIN; });

    if (row.type === "project") {
      excelRow.fill = FILL_PROJECT;
      excelRow.font = { bold: true, size: 11 };
    } else if (row.type === "subproject") {
      excelRow.fill = FILL_SUBPROJECT;
      excelRow.font = { bold: true, size: 10 };
    } else {
      // Status coloring
      const statusIdx = activeHeaders.findIndex(h => h.key === "status");
      const deadlineIdx = activeHeaders.findIndex(h => h.key === "deadline");
      const priorityIdx = activeHeaders.findIndex(h => h.key === "priority");

      if (statusIdx >= 0 && row.status === "done") {
        excelRow.getCell(statusIdx + 1).fill = FILL_DONE;
        excelRow.getCell(statusIdx + 1).font = { color: { argb: "FF16A34A" } };
      } else if (deadlineIdx >= 0 && row.deadline) {
        const dl = new Date(row.deadline);
        if (dl < now) {
          excelRow.getCell(deadlineIdx + 1).fill = FILL_OVERDUE;
          excelRow.getCell(deadlineIdx + 1).font = { color: { argb: "FFDC2626" } };
        }
      }
      if (priorityIdx >= 0) {
        const pFill = priorityFill(row.priority);
        if (pFill) excelRow.getCell(priorityIdx + 1).fill = pFill;
      }
    }
  });

  // Data validation dropdowns
  const typeIdx = activeHeaders.findIndex(h => h.key === "type");
  const statusColIdx = activeHeaders.findIndex(h => h.key === "status");
  const priorityColIdx = activeHeaders.findIndex(h => h.key === "priority");

  if (typeIdx >= 0) {
    ws.getColumn(typeIdx + 1).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"project,subproject,task"'] };
      }
    });
  }
  if (statusColIdx >= 0) {
    ws.getColumn(statusColIdx + 1).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"active,done"'] };
      }
    });
  }
  if (priorityColIdx >= 0) {
    ws.getColumn(priorityColIdx + 1).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) {
        cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"1,2,3"'] };
      }
    });
  }

  // Auto-filter
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + activeHeaders.length)}1` };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadExcel(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import ───

export async function parseExcelForPreview(file: File): Promise<ImportPreview> {
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) throw new Error("Файл пуст или содержит только заголовки");

  // Read header
  const headerRow = ws.getRow(1);
  const headerMap = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => {
    const val = String(cell.value || "").trim().toLowerCase();
    // Map Russian labels back to keys
    const labelToKey: Record<string, string> = {
      "тип": "type", "проект": "project", "подпроект": "subproject",
      "задача": "title", "описание": "description", "дедлайн": "deadline",
      "исх. дедлайн": "original_deadline", "приоритет": "priority",
      "статус": "status", "ответственный": "assigned_to", "теги": "tags",
      "подзадачи": "subtasks", "повтор": "recurrence",
    };
    const key = labelToKey[val] || val;
    headerMap.set(key, colNumber);
  });

  const getField = (row: ExcelJS.Row, key: keyof ExportRow): string => {
    const col = headerMap.get(key);
    if (!col) return "";
    const val = row.getCell(col).value;
    if (val == null) return "";
    if (val instanceof Date) return val.toISOString().split("T")[0];
    return String(val).trim();
  };

  const rows: ExportRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push({
      type: getField(row, "type") || "task",
      project: getField(row, "project"),
      subproject: getField(row, "subproject"),
      title: getField(row, "title"),
      description: getField(row, "description"),
      deadline: getField(row, "deadline"),
      original_deadline: getField(row, "original_deadline"),
      priority: getField(row, "priority"),
      status: getField(row, "status"),
      assigned_to: getField(row, "assigned_to"),
      tags: getField(row, "tags"),
      subtasks: getField(row, "subtasks"),
      recurrence: getField(row, "recurrence"),
    });
  });

  const projectRow = rows.find(r => r.type === "project");
  const projectName = projectRow?.project || rows[0]?.project || "Импортированный проект";
  const subprojects = [...new Set(rows.filter(r => r.type === "subproject").map(r => r.subproject).filter(Boolean))];
  const taskCount = rows.filter(r => r.type === "task").length;

  return { projectName, subprojects, taskCount, rows };
}

// Re-export the import function from projectCsv (same logic, same row format)
export { importCsvToProject as importRowsToProject } from "@/lib/projectCsv";
