import { useState, useCallback, useMemo, useRef } from "react";
import { Plus, GripVertical, Trash2, BarChart3, Type, Hash, Link2, Minus, Table2, ChevronDown, ChevronRight, Pencil, Copy, Columns, Maximize2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasks } from "@/hooks/useTasks";
import { ReportBlock, ReportBlockType } from "@/hooks/useReports";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip, PieChart, Pie, LineChart, Line, Legend } from "recharts";
import { useNavigate } from "react-router-dom";

interface ReportEditorProps {
  blocks: ReportBlock[];
  onChange: (blocks: ReportBlock[]) => void;
  readOnly?: boolean;
}

const BLOCK_TYPES: { type: ReportBlockType; label: string; icon: React.ReactNode }[] = [
  { type: "kpi", label: "KPI-карточка", icon: <Hash className="h-3.5 w-3.5" /> },
  { type: "chart", label: "График", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { type: "text", label: "Текст", icon: <Type className="h-3.5 w-3.5" /> },
  { type: "table", label: "Таблица", icon: <Table2 className="h-3.5 w-3.5" /> },
  { type: "project_link", label: "Ссылка на проект", icon: <Link2 className="h-3.5 w-3.5" /> },
  { type: "divider", label: "Разделитель", icon: <Minus className="h-3.5 w-3.5" /> },
];

function genId() {
  return crypto.randomUUID();
}

function defaultBlockData(type: ReportBlockType): Record<string, any> {
  switch (type) {
    case "kpi":
      return { label: "KPI", value: "0", suffix: "%", trend: "", color: "#3b82f6" };
    case "chart":
      return {
        chartType: "bar",
        title: "График",
        data: [
          { name: "Q1", value: 100 },
          { name: "Q2", value: 150 },
          { name: "Q3", value: 120 },
          { name: "Q4", value: 200 },
        ],
        color: "#3b82f6",
      };
    case "text":
      return { content: "" };
    case "table":
      return {
        title: "Таблица",
        columns: ["Название", "Значение"],
        rows: [["Пример", "100"]],
      };
    case "project_link":
      return { projectId: "", note: "" };
    case "divider":
      return {};
    default:
      return {};
  }
}

// ─── Sortable Block Wrapper ───
function SortableBlock({ block, onUpdate, onRemove, onDuplicate, onToggleWidth, readOnly }: {
  block: ReportBlock;
  onUpdate: (data: Record<string, any>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleWidth: () => void;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border border-border/50 bg-card transition-all",
        isDragging && "opacity-50 shadow-lg z-50",
        block.width === "half" ? "col-span-1" : "col-span-2"
      )}
    >
      {!readOnly && (
        <div className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
          {...attributes} {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {!readOnly && (
        <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Дублировать" onClick={onDuplicate}>
            <Copy className="h-3 w-3 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" title={block.width === "half" ? "На всю ширину" : "Половина"} onClick={onToggleWidth}>
            {block.width === "half" ? <Maximize2 className="h-3 w-3 text-muted-foreground" /> : <Columns className="h-3 w-3 text-muted-foreground" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      )}
      <div className="p-4">
        <BlockContent block={block} onUpdate={onUpdate} readOnly={readOnly} />
      </div>
    </div>
  );
}

// ─── Block Content Renderer ───
function BlockContent({ block, onUpdate, readOnly }: {
  block: ReportBlock;
  onUpdate: (data: Record<string, any>) => void;
  readOnly?: boolean;
}) {
  switch (block.type) {
    case "kpi":
      return <KpiBlock data={block.data} onUpdate={onUpdate} readOnly={readOnly} />;
    case "chart":
      return <ChartBlock data={block.data} onUpdate={onUpdate} readOnly={readOnly} />;
    case "text":
      return <TextBlock data={block.data} onUpdate={onUpdate} readOnly={readOnly} />;
    case "table":
      return <TableBlock data={block.data} onUpdate={onUpdate} readOnly={readOnly} />;
    case "project_link":
      return <ProjectLinkBlock data={block.data} onUpdate={onUpdate} readOnly={readOnly} />;
    case "divider":
      return <div className="border-t border-border/50 my-2" />;
    default:
      return <div className="text-xs text-muted-foreground">Неизвестный блок</div>;
  }
}

// ─── KPI Block ───
function KpiBlock({ data, onUpdate, readOnly }: { data: Record<string, any>; onUpdate: (d: any) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);

  if (readOnly || !editing) {
    return (
      <div
        className="text-center cursor-pointer"
        onClick={() => !readOnly && setEditing(true)}
      >
        <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">
          {data.label || "KPI"}
        </div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-3xl font-bold tabular-nums" style={{ color: data.color || "hsl(var(--primary))" }}>
            {data.value || "0"}
          </span>
          {data.suffix && <span className="text-lg text-muted-foreground">{data.suffix}</span>}
        </div>
        {data.trend && (
          <div className={cn("text-xs mt-1", data.trend.startsWith("+") ? "text-emerald-600" : data.trend.startsWith("-") ? "text-destructive" : "text-muted-foreground")}>
            {data.trend}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input value={data.label || ""} placeholder="Название KPI" className="h-7 text-xs" onChange={e => onUpdate({ ...data, label: e.target.value })} />
      <div className="flex gap-2">
        <Input value={data.value || ""} placeholder="Значение" className="h-7 text-xs flex-1" onChange={e => onUpdate({ ...data, value: e.target.value })} />
        <Input value={data.suffix || ""} placeholder="%" className="h-7 text-xs w-12" onChange={e => onUpdate({ ...data, suffix: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <Input value={data.trend || ""} placeholder="+12% vs Q1" className="h-7 text-xs flex-1" onChange={e => onUpdate({ ...data, trend: e.target.value })} />
        <input type="color" value={data.color || "#3b82f6"} className="h-7 w-8 rounded border cursor-pointer" onChange={e => onUpdate({ ...data, color: e.target.value })} />
      </div>
      <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(false)}>Готово</Button>
    </div>
  );
}

// ─── Chart Block ───
function ChartBlock({ data, onUpdate, readOnly }: { data: Record<string, any>; onUpdate: (d: any) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const chartData = data.data || [];
  const chartType = data.chartType || "bar";
  const color = data.color || "#3b82f6";
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

  const chart = (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === "bar" ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        ) : chartType === "line" ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
              {chartData.map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );

  if (readOnly || !editing) {
    return (
      <div className="cursor-pointer" onClick={() => !readOnly && setEditing(true)}>
        {data.title && <div className="text-xs font-medium text-foreground mb-2">{data.title}</div>}
        {chart}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input value={data.title || ""} placeholder="Название графика" className="h-7 text-xs" onChange={e => onUpdate({ ...data, title: e.target.value })} />
      <Select value={chartType} onValueChange={v => onUpdate({ ...data, chartType: v })}>
        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="bar">Столбцы</SelectItem>
          <SelectItem value="line">Линия</SelectItem>
          <SelectItem value="pie">Круговая</SelectItem>
        </SelectContent>
      </Select>
      {chart}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {chartData.map((item: any, i: number) => (
          <div key={i} className="flex gap-1 items-center">
            <Input value={item.name} className="h-6 text-[10px] flex-1" onChange={e => {
              const nd = [...chartData]; nd[i] = { ...nd[i], name: e.target.value }; onUpdate({ ...data, data: nd });
            }} />
            <Input type="number" value={item.value} className="h-6 text-[10px] w-20" onChange={e => {
              const nd = [...chartData]; nd[i] = { ...nd[i], value: Number(e.target.value) }; onUpdate({ ...data, data: nd });
            }} />
            <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => {
              onUpdate({ ...data, data: chartData.filter((_: any, j: number) => j !== i) });
            }}><Trash2 className="h-2.5 w-2.5" /></Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => {
          onUpdate({ ...data, data: [...chartData, { name: `Item ${chartData.length + 1}`, value: 0 }] });
        }}><Plus className="h-3 w-3 mr-1" /> Точка</Button>
        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(false)}>Готово</Button>
      </div>
    </div>
  );
}

// ─── Text Block ───
function TextBlock({ data, onUpdate, readOnly }: { data: Record<string, any>; onUpdate: (d: any) => void; readOnly?: boolean }) {
  if (readOnly) {
    return <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{data.content || ""}</div>;
  }
  return (
    <Textarea
      value={data.content || ""}
      onChange={e => onUpdate({ ...data, content: e.target.value })}
      placeholder="Введите текст..."
      className="min-h-[60px] text-sm border-0 p-0 focus-visible:ring-0 resize-none"
    />
  );
}

// ─── Table Block ───
function TableBlock({ data, onUpdate, readOnly }: { data: Record<string, any>; onUpdate: (d: any) => void; readOnly?: boolean }) {
  const columns: string[] = data.columns || ["Название", "Значение"];
  const rows: string[][] = data.rows || [];

  return (
    <div>
      {data.title && <div className="text-xs font-medium text-foreground mb-2">{data.title}</div>}
      <div className="overflow-x-auto rounded-md border border-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30">
              {columns.map((col, i) => (
                <th key={i} className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                  {readOnly ? col : (
                    <Input value={col} className="h-5 text-[10px] border-0 p-0 bg-transparent" onChange={e => {
                      const nc = [...columns]; nc[i] = e.target.value; onUpdate({ ...data, columns: nc });
                    }} />
                  )}
                </th>
              ))}
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-border/30">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1">
                    {readOnly ? cell : (
                      <Input value={cell} className="h-5 text-[10px] border-0 p-0 bg-transparent" onChange={e => {
                        const nr = rows.map(r => [...r]); nr[ri][ci] = e.target.value; onUpdate({ ...data, rows: nr });
                      }} />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td className="px-1">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                      onUpdate({ ...data, rows: rows.filter((_, i) => i !== ri) });
                    }}><Trash2 className="h-2.5 w-2.5" /></Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => {
            onUpdate({ ...data, rows: [...rows, columns.map(() => "")] });
          }}><Plus className="h-3 w-3 mr-1" /> Строка</Button>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => {
            onUpdate({
              ...data,
              columns: [...columns, `Кол. ${columns.length + 1}`],
              rows: rows.map(r => [...r, ""]),
            });
          }}><Plus className="h-3 w-3 mr-1" /> Столбец</Button>
        </div>
      )}
    </div>
  );
}

// ─── Project Link Block ───
function ProjectLinkBlock({ data, onUpdate, readOnly }: { data: Record<string, any>; onUpdate: (d: any) => void; readOnly?: boolean }) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const navigate = useNavigate();

  const project = groups.find(g => g.id === data.projectId);
  const projectTasks = allTasks.filter(t => t.group_id === data.projectId);
  const done = projectTasks.filter(t => t.is_completed).length;
  const pct = projectTasks.length > 0 ? Math.round((done / projectTasks.length) * 100) : 0;

  if (readOnly && !project) return null;

  if (readOnly || data.projectId) {
    return (
      <div className="flex items-center gap-3">
        {project ? (
          <>
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: project.color || "hsl(var(--primary))" }}
            >
              {project.icon && project.icon !== "list" ? project.icon : project.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <button
                className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block text-left"
                onClick={() => navigate(`/pmo/project/${project.id}`)}
              >
                {project.name}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">{pct}% · {done}/{projectTasks.length}</span>
              </div>
              {data.note && <p className="text-[11px] text-muted-foreground mt-1">{data.note}</p>}
            </div>
            {!readOnly && (
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onUpdate({ ...data, projectId: "" })}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Проект не найден</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select value={data.projectId || ""} onValueChange={v => onUpdate({ ...data, projectId: v })}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Выберите проект" /></SelectTrigger>
        <SelectContent>
          {groups.filter(g => !g.parent_id).map(g => (
            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={data.note || ""} placeholder="Комментарий (опционально)" className="h-7 text-xs" onChange={e => onUpdate({ ...data, note: e.target.value })} />
    </div>
  );
}

// ─── Main Editor ───
export default function ReportEditor({ blocks, onChange, readOnly }: ReportEditorProps) {
  const [showMenu, setShowMenu] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }, [blocks, onChange]);

  const addBlock = (type: ReportBlockType) => {
    const newBlock: ReportBlock = {
      id: genId(),
      type,
      data: defaultBlockData(type),
      width: type === "kpi" ? "half" : "full",
    };
    onChange([...blocks, newBlock]);
    setShowMenu(false);
  };

  const updateBlock = (id: string, data: Record<string, any>) => {
    onChange(blocks.map(b => b.id === id ? { ...b, data } : b));
  };

  const removeBlock = (id: string) => {
    onChange(blocks.filter(b => b.id !== id));
  };

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="grid grid-cols-2 gap-3">
            {blocks.map(block => (
              <SortableBlock
                key={block.id}
                block={block}
                onUpdate={data => updateBlock(block.id, data)}
                onRemove={() => removeBlock(block.id)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {blocks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Пустой отчёт</p>
          <p className="text-xs mt-1">Добавьте блоки: KPI, графики, таблицы, текст</p>
        </div>
      )}

      {!readOnly && (
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed h-9 text-xs gap-2"
            onClick={() => setShowMenu(!showMenu)}
          >
            <Plus className="h-3.5 w-3.5" /> Добавить блок
          </Button>
          {showMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-lg shadow-lg p-2 grid grid-cols-3 gap-1 z-20 animate-fade-in">
              {BLOCK_TYPES.map(bt => (
                <button
                  key={bt.type}
                  onClick={() => addBlock(bt.type)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
                >
                  <span className="text-muted-foreground">{bt.icon}</span>
                  <span className="text-xs text-foreground">{bt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
