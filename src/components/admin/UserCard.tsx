import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { UserCheck, UserX, Building2, HardHat, Briefcase, Pencil, Check, X, Mail, Trash2, History, ShieldCheck, Crown, Undo2, AlertTriangle, KeyRound } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import { UserExtraDeptsPicker } from "./UserExtraDeptsPicker";
import type { AdminUser, Department, ContractorLite, ClientLite } from "./types";

interface Props {
  user: AdminUser;
  isProtectedAdmin: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  departments: Department[];
  contractors: ContractorLite[];
  clients: ClientLite[];
  /** ID доп. (не-primary) отделов пользователя из user_departments. */
  extraDeptIds: string[];
  editingNameId: string | null;
  editingNameValue: string;
  onStartEditName: (u: AdminUser) => void;
  onChangeNameValue: (v: string) => void;
  onSaveName: (id: string) => void;
  onCancelEditName: () => void;
  onApprove: (id: string, approve: boolean) => void;
  onDepartmentChange: (id: string, dept: string | null) => void;
  onToggleHead: (id: string) => void;
  onUpdateField: (id: string, patch: Partial<AdminUser>) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (id: string) => void;
  onShowHistory: (u: AdminUser) => void;
  onEditCredentials: (u: AdminUser) => void;
}

export function UserCard({
  user: u, isProtectedAdmin, selected, onToggleSelect,
  departments, contractors, clients, extraDeptIds,
  editingNameId, editingNameValue, onStartEditName, onChangeNameValue, onSaveName, onCancelEditName,
  onApprove, onDepartmentChange, onToggleHead, onUpdateField, onDelete, onRestore, onHardDelete, onShowHistory,
  onEditCredentials,
}: Props) {
  const userDept = u.department_id ? departments.find(d => d.id === u.department_id) : null;
  const isHead = !!(userDept && userDept.head_user_id === u.id);
  const canBeHead = !!u.department_id;
  const isDeleted = !!u.deleted_at;
  return (
    <div className={`p-3 rounded-lg border ${
      isDeleted
        ? "border-destructive/30 bg-destructive/5 opacity-80"
        : u.is_approved
          ? "border-border"
          : "border-border bg-muted/30"
    } ${selected ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-start gap-3 flex-wrap">
        {!isDeleted && <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(u.id)}
          className="mt-1.5 shrink-0"
          aria-label="Выбрать"
        />}
        <UserAvatar id={u.id} name={u.display_name} email={u.email} size={36} />

        <div className="min-w-[200px] flex-1">
          {/* Name + edit */}
          {editingNameId === u.id ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={editingNameValue}
                onChange={(e) => onChangeNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onSaveName(u.id); }
                  if (e.key === "Escape") { e.preventDefault(); onCancelEditName(); }
                }}
                className="h-7 text-sm font-medium w-full max-w-[280px]"
                placeholder="ФИО"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => onSaveName(u.id)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={onCancelEditName}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group/name min-w-0">
              <p className="text-sm font-medium truncate min-w-0">
                {u.display_name || <span className="text-muted-foreground italic">Без имени</span>}
              </p>
              {isProtectedAdmin && (
                <Badge variant="outline" className="h-5 text-[10px] gap-0.5 border-primary/40 text-primary shrink-0">
                  <ShieldCheck className="h-2.5 w-2.5" /> admin
                </Badge>
              )}
              <button
                onClick={() => onStartEditName(u)}
                className="p-1 rounded hover:bg-muted opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0"
                aria-label="Редактировать имя"
              >
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
            {u.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{u.email}</span>
              </div>
            )}
            {u.telegram_username && <p>@{u.telegram_username}</p>}
            <p>Зарегистрирован: {new Date(u.created_at).toLocaleDateString("ru-RU")}</p>
            {isDeleted && (
              <p className="text-destructive font-medium flex items-center gap-1 mt-1">
                <Trash2 className="h-3 w-3" />
                Удалён: {new Date(u.deleted_at!).toLocaleString("ru-RU")}
              </p>
            )}
          </div>
        </div>

        {/* Action column */}
        {isDeleted ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRestore(u.id)}
              className="h-8 gap-1 text-xs"
              title="Восстановить пользователя"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Восстановить
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onShowHistory(u)} title="История изменений">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Удалить навсегда (необратимо)"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить пользователя навсегда?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Аккаунт <strong>{u.display_name || u.email}</strong> и все его данные будут удалены{" "}
                    <strong>необратимо</strong>. Восстановить будет невозможно. Это действие имеет смысл,
                    только если пользователь точно не вернётся и его данные больше не нужны.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onHardDelete(u.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Удалить навсегда
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
        <div className="flex items-center gap-1.5 flex-wrap justify-end ml-auto">
          <Select
            value={u.department_id ?? "__none"}
            onValueChange={(v) => onDepartmentChange(u.id, v === "__none" ? null : v)}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <Building2 className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Отдел" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" className="text-xs text-muted-foreground">— Без отдела —</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <UserExtraDeptsPicker
            userId={u.id}
            departments={departments}
            primaryDeptId={u.department_id ?? null}
            extraDeptIds={extraDeptIds}
          />

          <Button
            size="icon"
            variant={isHead ? "default" : "ghost"}
            className={`h-8 w-8 ${isHead ? "bg-amber-500 hover:bg-amber-500/90 text-white" : "text-muted-foreground hover:text-amber-600"}`}
            disabled={!canBeHead}
            onClick={() => onToggleHead(u.id)}
            title={
              !canBeHead
                ? "Сначала назначьте отдел"
                : isHead
                  ? `Снять с роли главы «${userDept?.name}»`
                  : `Назначить главой отдела «${userDept?.name}»`
            }
          >
            <Crown className="h-3.5 w-3.5" />
          </Button>

          {u.is_approved ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() => onApprove(u.id, false)}
              disabled={isProtectedAdmin}
              title={isProtectedAdmin ? "Нельзя деактивировать администратора" : "Деактивировать"}
              className="h-8 w-8"
            >
              <UserX className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => onApprove(u.id, true)} className="h-8 gap-1 text-xs">
              <UserCheck className="h-3.5 w-3.5" />
              Одобрить
            </Button>
          )}

          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onShowHistory(u)} title="История изменений">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onEditCredentials(u)}
            title="Изменить email / Telegram / пароль"
          >
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={isProtectedAdmin}
                title={isProtectedAdmin ? "Нельзя удалить администратора" : "Удалить аккаунт"}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
                <AlertDialogDescription>
                  Аккаунт <strong>{u.display_name || u.email}</strong> будет помечен удалённым.
                  Он перестанет видеть приложение и не сможет войти, но все его данные сохранятся.
                  Восстановить можно в разделе «Удалённые пользователи».
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(u.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        )}
      </div>

      {/* Extra fields */}
      {!isDeleted && <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/40 pl-[60px]">
        <Input
          key={`org-${u.id}-${u.organization ?? ""}`}
          defaultValue={u.organization ?? ""}
          placeholder="Организация"
          className="h-8 w-[180px] text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== (u.organization ?? null)) onUpdateField(u.id, { organization: v });
          }}
        />
        <Select
          value={u.contractor_id ?? "__none"}
          onValueChange={(v) => onUpdateField(u.id, { contractor_id: v === "__none" ? null : v })}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <HardHat className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Подрядчик" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" className="text-xs text-muted-foreground">— Не задан —</SelectItem>
            {contractors.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={u.client_id ?? "__none"}
          onValueChange={(v) => onUpdateField(u.id, { client_id: v === "__none" ? null : v })}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <Briefcase className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Клиент CRM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none" className="text-xs text-muted-foreground">— Не задан —</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>}
    </div>
  );
}
