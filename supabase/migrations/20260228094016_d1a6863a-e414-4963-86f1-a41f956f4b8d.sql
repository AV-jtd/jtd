
-- Add parent_id to tag_categories for nesting
ALTER TABLE public.tag_categories
ADD COLUMN parent_id uuid REFERENCES public.tag_categories(id) ON DELETE CASCADE DEFAULT NULL;

-- Update seed_onboarding_data to create default tag folders
CREATE OR REPLACE FUNCTION public.seed_onboarding_data(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_id uuid;
  _subproject_id uuid;
  _task1_id uuid;
  _task2_id uuid;
  _task3_id uuid;
  _task4_id uuid;
  _task5_id uuid;
  _task6_id uuid;
  _cat_crm uuid;
  _cat_marketing uuid;
  _cat_npd uuid;
  _cat_projects uuid;
  _cat_other uuid;
BEGIN
  -- === Default tag categories (folders) ===
  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'CRM / Продажи', 0, _user_id, '#ef4444')
  RETURNING id INTO _cat_crm;

  INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
    ('Клиенты', 0, _user_id, '#ef4444', _cat_crm),
    ('Территории', 1, _user_id, '#ef4444', _cat_crm),
    ('Статусы / Этапы', 2, _user_id, '#ef4444', _cat_crm),
    ('Проекты', 3, _user_id, '#ef4444', _cat_crm);

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'Маркетинг', 1, _user_id, '#f59e0b')
  RETURNING id INTO _cat_marketing;

  INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
    ('ФЗ', 0, _user_id, '#f59e0b', _cat_marketing),
    ('АА', 1, _user_id, '#f59e0b', _cat_marketing),
    ('КМ', 2, _user_id, '#f59e0b', _cat_marketing),
    ('ФС', 3, _user_id, '#f59e0b', _cat_marketing),
    ('Проекты', 4, _user_id, '#f59e0b', _cat_marketing);

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'NPD', 2, _user_id, '#8b5cf6')
  RETURNING id INTO _cat_npd;

  INSERT INTO public.tag_categories (name, position, user_id, color, parent_id) VALUES
    ('ФЗ', 0, _user_id, '#8b5cf6', _cat_npd),
    ('АА', 1, _user_id, '#8b5cf6', _cat_npd),
    ('КМ', 2, _user_id, '#8b5cf6', _cat_npd),
    ('Этапы', 3, _user_id, '#8b5cf6', _cat_npd);

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'Проекты', 3, _user_id, '#3b82f6')
  RETURNING id INTO _cat_projects;

  INSERT INTO public.tag_categories (id, name, position, user_id, color) VALUES
    (gen_random_uuid(), 'Другое', 4, _user_id, '#6b7280')
  RETURNING id INTO _cat_other;

  -- === Onboarding project ===
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, description)
  VALUES (
    gen_random_uuid(), '🚀 Добро пожаловать в JustTODOit', '🚀', '#3b82f6', _user_id, 0,
    'Это ваш первый проект! Здесь вы узнаете основные возможности приложения. Выполняйте задачи по порядку.'
  )
  RETURNING id INTO _project_id;

  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '📖 Изучи возможности', '📖', '#8b5cf6', _user_id, 0, _project_id,
    'Подпроект с продвинутыми функциями. Проекты могут содержать подпроекты для лучшей организации.'
  )
  RETURNING id INTO _subproject_id;

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important, priority)
  VALUES (gen_random_uuid(), 'Создай свою первую задачу',
    'Нажми кнопку «+» внизу списка задач, чтобы создать новую задачу. Попробуй добавить описание и отметить задачу как важную ⭐',
    _user_id, _project_id, 0, true, 1)
  RETURNING id INTO _task1_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task1_id, 'Нажми + чтобы создать задачу', 0),
    (_task1_id, 'Добавь описание к задаче', 1),
    (_task1_id, 'Отметь задачу как важную ⭐', 2);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, deadline, priority)
  VALUES (gen_random_uuid(), 'Попробуй установить дедлайн',
    'Открой задачу и установи дату дедлайна. Задачи с приближающимся сроком будут подсвечены. Также попробуй календарь 📅 в боковом меню!',
    _user_id, _project_id, 1, now() + interval '3 days', 2)
  RETURNING id INTO _task2_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task2_id, 'Открой задачу и найди поле дедлайна', 0),
    (_task2_id, 'Перейди в раздел Календарь в меню', 1);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), 'Напиши сообщение в чате проекта',
    'Открой чат проекта (иконка 💬 в заголовке) и напиши первое сообщение. Чат работает в реальном времени и синхронизируется с Telegram!',
    _user_id, _project_id, 2, 3)
  RETURNING id INTO _task3_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task3_id, 'Открой чат проекта', 0),
    (_task3_id, 'Напиши приветственное сообщение', 1),
    (_task3_id, 'Попробуй чат внутри задачи', 2);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (gen_random_uuid(), '🏷️ Освой систему тегов',
    'Теги помогают группировать задачи по темам и фильтровать их. Создай тег в боковом меню, затем присвой его задаче или проекту. Теги видны всей команде!',
    _user_id, _subproject_id, 0)
  RETURNING id INTO _task4_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task4_id, 'Создай тег в разделе «Теги» в боковом меню', 0),
    (_task4_id, 'Создай категорию для группировки тегов', 1),
    (_task4_id, 'Присвой тег любой задаче', 2),
    (_task4_id, 'Присвой тег проекту через панель деталей', 3),
    (_task4_id, 'Отфильтруй задачи по тегу в боковом меню', 4);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (gen_random_uuid(), '👥 Делегируй задачу коллеге',
    'Пригласи участника в проект и назначь ему задачу. Ты также можешь назначать ответственных за отдельные шаги задачи и устанавливать им дедлайны.',
    _user_id, _subproject_id, 1)
  RETURNING id INTO _task5_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task5_id, 'Пригласи коллегу в проект (кнопка в деталях проекта)', 0),
    (_task5_id, 'Создай задачу и назначь ответственного', 1),
    (_task5_id, 'Назначь ответственного за шаг внутри задачи', 2),
    (_task5_id, 'Установи дедлайн для шага', 3);

  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (gen_random_uuid(), '📊 Изучи дашборд и команды',
    'Дашборд покажет общую картину по всем задачам. А раздел «Команды» позволяет объединять участников и управлять ролями (директор, менеджер, участник).',
    _user_id, _subproject_id, 2)
  RETURNING id INTO _task6_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task6_id, 'Открой Дашборд в боковом меню', 0),
    (_task6_id, 'Создай команду в разделе Сообщество', 1),
    (_task6_id, 'Поделись кодом приглашения с коллегой', 2);

  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (_project_id, _user_id,
    '👋 Добро пожаловать в JustTODOit! Это чат вашего первого проекта. Здесь вы можете обсуждать задачи с командой. Сообщения синхронизируются с Telegram в реальном времени. Удачной работы! 🎉',
    'web');
END;
$function$;
