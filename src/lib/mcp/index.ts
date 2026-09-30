import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasks from "./tools/list_tasks";
import searchTasks from "./tools/search_tasks";
import getTask from "./tools/get_task";
import createTask from "./tools/create_task";
import completeTask from "./tools/complete_task";
import updateTaskDeadline from "./tools/update_task_deadline";
import listProjects from "./tools/list_projects";
import getProject from "./tools/get_project";
import getProjectSchedule from "./tools/get_project_schedule";
import createMilestone from "./tools/create_milestone";
import updateMilestone from "./tools/update_milestone";
import linkTasks from "./tools/link_tasks";
import unlinkTasks from "./tools/unlink_tasks";
import previewShift from "./tools/preview_shift";
import moveTask from "./tools/move_task";
import upsertPlan from "./tools/upsert_plan";
import createProject from "./tools/create_project";
import applyPlanTemplate from "./tools/apply_plan_template";
import getBaseline from "./tools/get_baseline";
import lockBaseline from "./tools/lock_baseline";
import unlockBaseline from "./tools/unlock_baseline";
import listMembers from "./tools/list_members";
import getWorkload from "./tools/get_workload";
import deletePlanItems from "./tools/delete_plan_items";
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
    "Про сроки и зависимости проекта спрашивай get_project_schedule — вехи, задачи с началом и концом, связи между ними и запас по срокам приходят одним вызовом. На вопрос «что держит дату проекта» отвечай по critical_path и полю critical, на «есть ли люфт» — по float_days; отрицательный запас значит, что связь уже нарушена. " +
    "Вехи заводятся и переносятся через create_milestone и update_milestone; плановая и фактическая даты — разные вещи, перенос плана не значит достижение. " +
    "Связи «что за чем идёт» создаются через link_tasks и снимаются через unlink_tasks; после создания связи преемники автоматически сдвигаются вперёд — сдвинутое приходит в ответе, о нём стоит сказать человеку. " +
    "Перенос сроков: preview_shift показывает, что потянется за задачей, без записи; move_task применяет. Сначала покажи человеку preview_shift и получи согласие — сдвиг задевает чужие сроки, о которых уже договорились. Правка срока одной задачи без хвоста — это update_task. Дни везде календарные. " +
    "Разложить протокол или письмо в план целиком — upsert_plan: задачи, вехи и связи за один вызов. По умолчанию он ничего не пишет, а возвращает разложенный план; покажи его человеку и запиши с apply=true только после согласия. " +
    "«Сделай план по примеру проекта такого-то» — apply_plan_template: берёт форму проекта-образца (промежутки между задачами и связи) и раскладывает от новой даты; правки из сообщения («приёмку в апреле») передавай в overrides, они двигают и то, что стоит за элементом. Как и upsert_plan, без apply=true не пишет ничего. Новый проект под план — create_project. " +
    "Базовый план: get_baseline говорит, идёт ещё планирование (правки сроков сдвигом не считаются) или план утверждён (каждая правка — отклонение в портфеле). Спрашивай перед переносом сроков и говори человеку, запишется ли сдвиг. Фиксация — lock_baseline: она обнуляет накопленные отклонения безвозвратно, поэтому сначала покажи последствия (без apply=true он их только считает). Снять — unlock_baseline. " +
    "Кого поставить исполнителем — list_members; кого перегрузили планом — get_workload (это число одновременных задач, а не часы: оценок трудоёмкости в системе нет, так и говори). Убрать задачи или вехи, чтобы переразложить план, — delete_plan_items: удаление настоящее, корзины нет, поэтому без apply=true он только перечисляет, что исчезнет. " +
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
    listProjects, getProject, getProjectSchedule, createMilestone, updateMilestone, linkTasks, unlinkTasks, previewShift, moveTask, upsertPlan, createProject, applyPlanTemplate, getBaseline, lockBaseline, unlockBaseline, listMembers, getWorkload, deletePlanItems,
    listProtocols, getProtocol,
    listClients, getClient,
  ].map(withAudit),
  // По умолчанию библиотека шлёт метрики каждого вызова (инструмент, исход,
  // длительность, UUID пользователя) на api.lovable.dev — ключ LOVABLE_API_KEY
  // в окружении edge-runtime есть. От облака Lovable ушли; наружу это не нужно.
  metrics: false,
});