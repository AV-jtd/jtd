import type ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

// Lazy-load ExcelJS only when actually needed (drops ~290KB from initial bundle)
let _exceljsPromise: Promise<any> | null = null;
const loadExcelJS = (): Promise<any> => {
  if (!_exceljsPromise) {
    _exceljsPromise = import("exceljs").then((m: any) => m.default ?? m);
  }
  return _exceljsPromise;
};

// ─── Types ───

interface CrmExportRow {
  client: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  territory: string;
  retail_type: string;
  rank: string;
  manager: string;
  project: string;
  stage: string;
  deadline: string;
  tags: string;
}

const HEADERS: { key: keyof CrmExportRow; label: string; width: number }[] = [
  { key: "client", label: "Клиент", width: 28 },
  { key: "contact", label: "Контактное лицо", width: 22 },
  { key: "phone", label: "Телефон", width: 18 },
  { key: "email", label: "Email", width: 24 },
  { key: "city", label: "Город", width: 16 },
  { key: "territory", label: "Территория", width: 16 },
  { key: "retail_type", label: "Тип розницы", width: 16 },
  { key: "rank", label: "Ранг", width: 12 },
  { key: "manager", label: "Менеджер", width: 20 },
  { key: "project", label: "Проект", width: 22 },
  { key: "stage", label: "Этап воронки", width: 20 },
  { key: "deadline", label: "Дедлайн", width: 14 },
  { key: "tags", label: "Теги", width: 24 },
];

const SUBTASK_STAGE_MAP: Record<string, string> = {
  "Отправить презентацию и КП": "Отправить КП",
  "Отправить образцы": "Отправить образцы",
  "Получить обратную связь": "Получить ОС",
  "Получить ОС": "Получить ОС",
  "Проведены переговоры": "Переговоры",
  "Старт отгрузок": "Старт отгрузок",
};

const FILL_HEADER = {
  type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" },
} as ExcelJS.FillPattern;
const FONT_HEADER: Partial<ExcelJS.Font> = {
  bold: true, color: { argb: "FFFFFFFF" }, size: 11,
};
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE2E8F0" } },
  left: { style: "thin", color: { argb: "FFE2E8F0" } },
  bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
  right: { style: "thin", color: { argb: "FFE2E8F0" } },
};

function getTaskStage(subtasks: { title: string; is_completed: boolean; position: number }[]): string {
  if (!subtasks || subtasks.length === 0) return "Входящие";
  const sorted = [...subtasks].sort((a, b) => a.position - b.position);
  const mapped = sorted.filter((s) => SUBTASK_STAGE_MAP[s.title]);
  if (mapped.length === 0) return "Входящие";
  const allDone = mapped.every((s) => s.is_completed);
  if (allDone) return "Завершено";
  const first = mapped.find((s) => !s.is_completed);
  return first ? (SUBTASK_STAGE_MAP[first.title] || "Входящие") : "Входящие";
}

// ─── Export ───

export async function exportCrmToExcel(taskIds: string[]): Promise<Blob> {
  if (taskIds.length === 0) throw new Error("Нет задач для экспорта");

  // Fetch tasks with subtasks, tags, clients
  const { data: tasks = [] } = await supabase
    .from("tasks")
    .select("id, title, deadline, client_id, assigned_to, group_id, task_tags(tag_id), subtasks(id, title, is_completed, position)")
    .in("id", taskIds);

  const clientIds = tasks.map((t: any) => t.client_id).filter(Boolean) as string[];
  const { data: clients = [] } = clientIds.length > 0
    ? await supabase.from("clients").select("id, name, contact_name, phone, email, city, manager_id, territory_tag_id, retail_type_tag_id, rank_tag_id").in("id", clientIds)
    : { data: [] };

  const assigneeIds = tasks.map((t: any) => t.assigned_to).filter(Boolean) as string[];
  const managerIds = (clients as any[]).map(c => c.manager_id).filter(Boolean) as string[];
  const allProfileIds = [...new Set([...assigneeIds, ...managerIds])];
  const { data: profiles = [] } = allProfileIds.length > 0
    ? await supabase.from("profiles").select("id, display_name, email").in("id", allProfileIds)
    : { data: [] };

  const tagIds = new Set<string>();
  (tasks as any[]).forEach(t => t.task_tags?.forEach((tt: any) => tagIds.add(tt.tag_id)));
  const dimensionTagIds = (clients as any[]).flatMap(c => [c.territory_tag_id, c.retail_type_tag_id, c.rank_tag_id].filter(Boolean));
  dimensionTagIds.forEach(id => tagIds.add(id));
  const { data: tags = [] } = tagIds.size > 0
    ? await supabase.from("tags").select("id, name").in("id", [...tagIds])
    : { data: [] };

  const { data: groups = [] } = await supabase.from("task_groups").select("id, name");

  const tagMap = new Map((tags as any[]).map(t => [t.id, t.name]));
  const profileMap = new Map((profiles as any[]).map(p => [p.id, p.display_name || p.email || p.id]));
  const clientMap = new Map((clients as any[]).map(c => [c.id, c]));
  const groupMap = new Map((groups as any[]).map(g => [g.id, g.name]));

  // Build rows
  const rows: CrmExportRow[] = (tasks as any[]).map(t => {
    const client = t.client_id ? clientMap.get(t.client_id) : null;
    const taskTagNames = (t.task_tags || [])
      .map((tt: any) => tagMap.get(tt.tag_id))
      .filter(Boolean)
      .join("; ");

    return {
      client: client?.name || t.title,
      contact: client?.contact_name || "",
      phone: client?.phone || "",
      email: client?.email || "",
      city: client?.city || "",
      territory: client?.territory_tag_id ? (tagMap.get(client.territory_tag_id) || "") : "",
      retail_type: client?.retail_type_tag_id ? (tagMap.get(client.retail_type_tag_id) || "") : "",
      rank: client?.rank_tag_id ? (tagMap.get(client.rank_tag_id) || "") : "",
      manager: client?.manager_id ? (profileMap.get(client.manager_id) || "") : "",
      project: t.group_id ? (groupMap.get(t.group_id) || "") : "",
      stage: getTaskStage(t.subtasks || []),
      deadline: t.deadline ? new Date(t.deadline).toISOString().split("T")[0] : "",
      tags: taskTagNames,
    };
  });

  // Create workbook (load exceljs runtime on demand)
  const ExcelJSModule = await loadExcelJS();
  const wb = new ExcelJSModule.Workbook();
  wb.creator = "JustTODOit";
  const ws = wb.addWorksheet("CRM");

  const headerRow = ws.addRow(HEADERS.map(h => h.label));
  headerRow.font = FONT_HEADER;
  headerRow.fill = FILL_HEADER;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 28;
  headerRow.eachCell(cell => { cell.border = BORDER_THIN; });
  HEADERS.forEach((h, i) => { ws.getColumn(i + 1).width = h.width; });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach(row => {
    const values = HEADERS.map(h => row[h.key] || "");
    const excelRow = ws.addRow(values);
    excelRow.alignment = { vertical: "top", wrapText: true };
    excelRow.eachCell(cell => { cell.border = BORDER_THIN; });
  });

  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + HEADERS.length)}1` };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ─── Template ───

export async function downloadCrmTemplate() {
  const ExcelJSModule = await loadExcelJS();
  const wb = new ExcelJSModule.Workbook();
  const ws = wb.addWorksheet("CRM Шаблон");

  const templateHeaders = ["Клиент", "Контактное лицо", "Телефон", "Email", "Город", "Территория", "Тип розницы", "Ранг", "Менеджер", "Проект", "Дедлайн", "Теги"];
  const headerRow = ws.addRow(templateHeaders);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  });

  ws.columns = [
    { width: 28 }, { width: 22 }, { width: 18 }, { width: 24 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 },
    { width: 20 }, { width: 22 }, { width: 14 }, { width: 24 },
  ];

  ws.addRow(["ООО Ромашка", "Иванов Иван", "+7 999 123 4567", "ivanov@example.com", "Москва", "Центр", "Супермаркет", "A", "Петрова", "Новые клиенты", "2026-04-01", "crm"]);
  ws.addRow(["АО Берёзка", "Сидоров Пётр", "+7 999 765 4321", "", "Казань", "Волга", "Дискаунтер", "B", "", "", "", "продажи"]);
  ws.addRow(["ИП Ветров", "", "", "vetrov@mail.ru", "Сочи", "", "", "C", "Козлов", "", "2026-05-15", ""]);

  wb.xlsx.writeBuffer().then(buf => {
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CRM_Шаблон.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function downloadExcel(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : filename + ".xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
