import { memo, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ConfirmDelete from "@/components/ConfirmDelete";
import { useTaskMutations } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { COLOR_PRESETS, presetColor } from "@/components/sidebar/colorPresets";

export interface FolderRowProps {
  id: string;
  name: string;
  color: string | null;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Header row for a project folder. Manages its own rename + color picker
 * state so the surrounding tree doesn't re-render on every keystroke.
 */
function FolderRowImpl({ id, name, color, count, expanded, onToggle }: FolderRowProps) {
  const { renameProjectFolder, deleteProjectFolder, updateFolderColor } = useTaskMutations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const save = () => {
    if (draft.trim() && draft.trim() !== name) {
      renameProjectFolder.mutate({ id, name: draft.trim() });
    }
    setEditing(false);
  };

  return (
    <div className="group flex items-center gap-2 px-3 py-2 md:py-1.5 rounded-lg text-sm text-sidebar-fg/70 hover:bg-sidebar-hover cursor-pointer transition-colors">
      <span onClick={onToggle} className="shrink-0 p-1 -m-1 md:p-0 md:m-0">
        {expanded ? <ChevronDown className="h-4 w-4 md:h-3 md:w-3" /> : <ChevronRight className="h-4 w-4 md:h-3 md:w-3" />}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <span onClick={(e) => e.stopPropagation()} className="shrink-0 cursor-pointer hover:opacity-80 p-1 -m-1 md:p-0 md:m-0">
            <FolderOpen className="h-4 w-4 md:h-3.5 md:w-3.5" style={{ color: color || "#6366f1" }} />
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3" side="right" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs font-medium text-muted-foreground mb-2">Цвет папки</p>
          <div className="flex gap-1.5 flex-wrap">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.hue}
                onClick={() => updateFolderColor.mutate({ id, color: presetColor(p.hue) })}
                className={cn("h-5 w-5 rounded-full transition-transform hover:scale-110 border border-border/50")}
                style={{ backgroundColor: presetColor(p.hue) }}
                title={p.label}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {editing ? (
        <input
          autoFocus
          enterKeyHint="done"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-sm text-sidebar-fg outline-none min-w-0"
        />
      ) : (
        <span
          className="truncate flex-1 text-left"
          onClick={onToggle}
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraft(name); }}
        >
          {name}
        </span>
      )}
      <span className="text-[11px] md:text-[10px] text-sidebar-fg/50 md:text-sidebar-fg/40 tabular-nums">{count}</span>
      <ConfirmDelete title="Удалить папку?" description="Проекты останутся, но потеряют привязку к папке." onConfirm={() => deleteProjectFolder.mutate(id)}>
        <span onClick={(e) => e.stopPropagation()} className="p-1.5 md:p-0.5 opacity-60 md:opacity-0 md:group-hover:opacity-60 hover:!opacity-100 cursor-pointer">
          <Trash2 className="h-4 w-4 md:h-3 md:w-3" />
        </span>
      </ConfirmDelete>
    </div>
  );
}

export default memo(FolderRowImpl);