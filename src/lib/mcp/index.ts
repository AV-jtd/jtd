import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasks from "./tools/list_tasks";
import searchTasks from "./tools/search_tasks";
import getTask from "./tools/get_task";
import createTask from "./tools/create_task";
import completeTask from "./tools/complete_task";
import updateTaskDeadline from "./tools/update_task_deadline";
import listProjects from "./tools/list_projects";
import getProject from "./tools/get_project";
import listProtocols from "./tools/list_protocols";
import getProtocol from "./tools/get_protocol";
import listClients from "./tools/list_clients";
import getClient from "./tools/get_client";
import updateTask from "./tools/update_task";
import addComment from "./tools/add_comment";
import { withAudit } from "./tools/_audit";

// Издатель и адрес ресурса. Обе переменные подставляются Vite на сборке, то
// есть попадают в собранную функцию — читать окружение в рантайме не нужно.
//
// Раньше здесь собирался адрес облачного проекта Lovable
// (`https://<ref>.supabase.co/auth/v1`). Проект удалён, домен не резолвится, и
// коннектор из-за этого не поднимался вовсе. Теперь издатель — наш GoTrue;
// тот же адрес должен стоять в GOTRUE_JWT_ISSUER, иначе проверка токена не
// сойдётся (см. журнал, запись от 27.09 про документ обнаружения).
const AUTH_BASE = import.meta.env.VITE_SUPABASE_PROXY_URL ?? "https://justtodoit.ru/sb";
const PUBLIC_BASE = import.meta.env.VITE_SUPABASE_URL ?? "https://justtodoit.ru";

export default defineMcp({
  name: "justtodoit-mcp",
  title: "JustTODOit",
  version: "0.2.0",
  instructions:
    "Инструменты JustTODOit: задачи, проекты, протоколы встреч, CRM-клиенты. Все действия — от имени залогиненного пользователя, RLS применяется. Даты в ISO 8601. " +
    "Задачи из писем создавай с source (тема, отправитель, дата) — по нему потом сверяются письма с задачами через search_tasks. " +
    "Каждый вызов пишется в журнал обращений.",
  auth: auth.oauth.issuer({
    issuer: `${AUTH_BASE}/auth/v1`,
    // resource закрепляем явно. Без него библиотека берёт адрес из заголовка
    // Host запроса, а до функции он доходит от Kong как edge-runtime:9000 —
    // внутреннее docker-имя, по которому внешний клиент никуда не попадёт.
    // Сама библиотека это и советует: за прокси resource надо пинить, иначе
    // подменённый Host сдвинет объявленный адрес метаданных.
    resource: `${PUBLIC_BASE}/functions/v1/mcp`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listTasks, searchTasks, getTask, createTask, updateTask, completeTask, updateTaskDeadline, addComment,
    listProjects, getProject,
    listProtocols, getProtocol,
    listClients, getClient,
  ].map(withAudit),
  // По умолчанию библиотека шлёт метрики каждого вызова (инструмент, исход,
  // длительность, UUID пользователя) на api.lovable.dev — ключ LOVABLE_API_KEY
  // в окружении edge-runtime есть. От облака Lovable ушли; наружу это не нужно.
  metrics: false,
});