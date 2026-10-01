/**
 * Единый реестр инструментов и подсказок — один список на оба входа.
 *
 * Зачем. Инструменты писались для коннектора (Claude в Cowork), но внутри
 * приложения у ассистента было своих два: создать задачу и спланировать проект.
 * То есть в чате приложения нельзя было попросить то, что получалось через
 * коннектор, — и догонять пришлось бы вторым набором, который разойдётся с
 * первым. Здесь список один: и функция MCP, и внутренний ассистент берут его
 * отсюда.
 *
 * Подсказки (`TOOL_INSTRUCTIONS`) тоже общие: это не описание сервера, а правила
 * работы с инструментами — «сначала покажи предпросмотр», «дни календарные»,
 * «без apply=true не пишется ничего». Разойдись они между двумя входами, и один
 * и тот же запрос в приложении и в Cowork вёл бы себя по-разному.
 */

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
import getAttention from "./tools/get_attention";
import createProtocol from "./tools/create_protocol";
import publishProtocol from "./tools/publish_protocol";
import listProtocols from "./tools/list_protocols";
import getProtocol from "./tools/get_protocol";
import listClients from "./tools/list_clients";
import getClient from "./tools/get_client";
import updateTask from "./tools/update_task";
import addComment from "./tools/add_comment";

/** Правила работы с инструментами. Общие для функции MCP и внутреннего ассистента. */
export const TOOL_INSTRUCTIONS =
    "Инструменты JustTODOit: задачи, проекты, протоколы встреч, CRM-клиенты. Все действия — от имени залогиненного пользователя, RLS применяется. Даты в ISO 8601. " +
    "«Что горит», «что на этой неделе», «что у меня без сроков» — это get_attention: он отвечает сразу по всем проектам, называть проект не нужно. Начинай с него, когда вопрос без имени проекта. " +
    "Протокол совещания оформляется через create_protocol: он создаётся ЧЕРНОВИКОМ — исполнители его не видят и уведомлений не получают. Покажи протокол человеку и опубликуй через publish_protocol только после сверки; публикация видна людям и неотзывна, поэтому без apply=true она лишь перечисляет, что станет видно. " +
    "Задачи из писем создавай с source (тема, отправитель, дата) — по нему потом сверяются письма с задачами через search_tasks. " +
    "У проекта есть work_mode: flow — операционный поток поручений (вехи, связи и критический путь к нему не применяются: разбирай по просроченному, висякам и людям), plan — проект с планом, null — признак не задан, тогда не угадывай, а скажи об этом. " +
    "Про сроки и зависимости проекта спрашивай get_project_schedule — вехи, задачи с началом и концом, связи между ними и запас по срокам приходят одним вызовом. На вопрос «что держит дату проекта» отвечай по critical_path и полю critical, на «есть ли люфт» — по float_days; отрицательный запас значит, что связь уже нарушена. " +
    "Вехи заводятся и переносятся через create_milestone и update_milestone; плановая и фактическая даты — разные вещи, перенос плана не значит достижение. " +
    "Связи «что за чем идёт» создаются через link_tasks и снимаются через unlink_tasks; после создания связи преемники автоматически сдвигаются вперёд — сдвинутое приходит в ответе, о нём стоит сказать человеку. " +
    "Перенос сроков: preview_shift показывает, что потянется за задачей, без записи; move_task применяет. Сначала покажи человеку preview_shift и получи согласие — сдвиг задевает чужие сроки, о которых уже договорились. Правка срока одной задачи без хвоста — это update_task. Дни везде календарные. " +
    "Разложить протокол или письмо в план целиком — upsert_plan: задачи, вехи и связи за один вызов. По умолчанию он ничего не пишет, а возвращает разложенный план; покажи его человеку и запиши с apply=true только после согласия. " +
    "Массовые правки в одном проекте — исполнитель, срок, начало у нескольких задач, связи — делай одним upsert_plan с id существующих задач (title передавай текущий), а не серией update_task или link_tasks: каждый вызов записи человек подтверждает в клиенте отдельно, и двадцать вызовов — это двадцать подтверждений. update_task — для одной-двух задач. " +
    "«Сделай план по примеру проекта такого-то» — apply_plan_template: берёт форму проекта-образца (промежутки между задачами и связи) и раскладывает от новой даты; правки из сообщения («приёмку в апреле») передавай в overrides, они двигают и то, что стоит за элементом. Как и upsert_plan, без apply=true не пишет ничего. Новый проект под план — create_project. " +
    "Базовый план: get_baseline говорит, идёт ещё планирование (правки сроков сдвигом не считаются) или план утверждён (каждая правка — отклонение в портфеле). Спрашивай перед переносом сроков и говори человеку, запишется ли сдвиг. Фиксация — lock_baseline: она обнуляет накопленные отклонения безвозвратно, поэтому сначала покажи последствия (без apply=true он их только считает). Снять — unlock_baseline. " +
    "Кого поставить исполнителем — list_members; кого перегрузили планом — get_workload (это число одновременных задач, а не часы: оценок трудоёмкости в системе нет, так и говори). Убрать задачи или вехи, чтобы переразложить план, — delete_plan_items: удаление настоящее, корзины нет, поэтому без apply=true он только перечисляет, что исчезнет. " +
    "Каждый вызов пишется в журнал обращений.";

/**
 * Все инструменты, без обёрток. Журнал обращений (`withAudit`) навешивает
 * вызывающая сторона: он нужен обоим входам, но контекст у них разный.
 */
export const ALL_TOOLS = [
    getAttention, listTasks, searchTasks, getTask, createTask, updateTask, completeTask, updateTaskDeadline, addComment,
    listProjects, getProject, getProjectSchedule, createMilestone, updateMilestone, linkTasks, unlinkTasks, previewShift, moveTask, upsertPlan, createProject, applyPlanTemplate, getBaseline, lockBaseline, unlockBaseline, listMembers, getWorkload, deletePlanItems,
    listProtocols, getProtocol, createProtocol, publishProtocol,
    listClients, getClient,
  ];
