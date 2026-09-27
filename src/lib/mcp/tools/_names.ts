import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Подстановка имён вместо голых идентификаторов, общая для инструментов,
 * возвращающих списки задач.
 *
 * Зачем: без этого инструмент отдаёт только UUID проекта, клиента и
 * ответственного. Замер 27.09: первые 50 задач владельца относятся к 18
 * проектам и 13 исполнителям — то есть на вопрос «кто сорвал срок» модели
 * пришлось бы сделать около тридцати дополнительных вызовов. Три пакетных
 * запроса здесь дешевле и не заставляют её угадывать.
 *
 * Запросы идут с токеном пользователя, поэтому политики доступа применяются:
 * имя, которое человеку видеть нельзя, сюда не попадёт.
 */

type Row = {
  group_id?: string | null;
  client_id?: string | null;
  assigned_to?: string | null;
};

export type NameMaps = {
  project: Map<string, string | null>;
  client: Map<string, string | null>;
  person: Map<string, string | null>;
};

export async function resolveNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  rows: Row[],
): Promise<NameMaps> {
  const ids = (key: keyof Row) =>
    [...new Set(rows.map((r) => r[key]).filter((v): v is string => !!v))];

  const groupIds = ids("group_id");
  const clientIds = ids("client_id");
  const userIds = ids("assigned_to");

  const [groups, clients, profiles] = await Promise.all([
    groupIds.length
      ? supabase.from("task_groups").select("id,name").in("id", groupIds)
      : Promise.resolve({ data: [] }),
    clientIds.length
      ? supabase.from("clients").select("id,name").in("id", clientIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id,display_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const list = <T>(r: { data: T[] | null }) => r.data ?? [];

  return {
    project: new Map(
      list<{ id: string; name: string | null }>(groups as { data: { id: string; name: string | null }[] | null })
        .map((g) => [g.id, g.name]),
    ),
    client: new Map(
      list<{ id: string; name: string | null }>(clients as { data: { id: string; name: string | null }[] | null })
        .map((c) => [c.id, c.name]),
    ),
    person: new Map(
      list<{ id: string; display_name: string | null }>(profiles as { data: { id: string; display_name: string | null }[] | null })
        .map((p) => [p.id, p.display_name]),
    ),
  };
}

/** Одна строка задачи в том виде, в котором её отдают инструменты. */
export function shapeTask(
  t: {
    id: string; title: string | null; deadline: string | null;
    is_completed: boolean | null; is_important: boolean | null; priority: string | number | null;
    group_id: string | null; client_id: string | null; assigned_to: string | null;
  },
  names: NameMaps,
) {
  return {
    id: t.id,
    title: t.title,
    deadline: t.deadline,
    is_completed: t.is_completed,
    is_important: t.is_important,
    priority: t.priority,
    project_id: t.group_id,
    project_name: t.group_id ? names.project.get(t.group_id) ?? null : null,
    client_id: t.client_id,
    client_name: t.client_id ? names.client.get(t.client_id) ?? null : null,
    assigned_to: t.assigned_to,
    assigned_to_name: t.assigned_to ? names.person.get(t.assigned_to) ?? null : null,
  };
}
