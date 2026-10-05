/**
 * Временные id оптимистичных записей (`temp-…`) — у задачи, подзадачи,
 * сообщения, пока сервер их не сохранил. В запросы к базе их отправлять нельзя:
 * колонка uuid, и PostgREST отвергает весь запрос целиком («invalid input
 * syntax for type uuid») — вместе с настоящими id из той же пачки. Так было
 * ~17 раз в сутки (реакции, «есть обсуждение», участники; найдено 27.09,
 * исправлено 06.10.2026).
 */
export const isPersistedId = (id: string | null | undefined): id is string =>
  !!id && !id.startsWith("temp-");

export const persistedIds = (ids: readonly (string | null | undefined)[]): string[] =>
  ids.filter(isPersistedId);
