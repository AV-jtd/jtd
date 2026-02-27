
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
BEGIN
  -- 1. Main onboarding project
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, description)
  VALUES (
    gen_random_uuid(), '🚀 Добро пожаловать в JustTODOit', '🚀', '#3b82f6', _user_id, 0,
    'Это ваш первый проект! Здесь вы узнаете основные возможности приложения. Выполняйте задачи по порядку.'
  )
  RETURNING id INTO _project_id;

  -- 2. Subproject
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '📖 Изучи возможности', '📖', '#8b5cf6', _user_id, 0, _project_id,
    'Подпроект с продвинутыми функциями. Проекты могут содержать подпроекты для лучшей организации.'
  )
  RETURNING id INTO _subproject_id;

  -- 3. Task 1: Create first task
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important, priority)
  VALUES (
    gen_random_uuid(),
    'Создай свою первую задачу',
    'Нажми кнопку «+» внизу списка задач, чтобы создать новую задачу. Попробуй добавить описание и отметить задачу как важную ⭐',
    _user_id, _project_id, 0, true, 1
  )
  RETURNING id INTO _task1_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task1_id, 'Нажми + чтобы создать задачу', 0),
    (_task1_id, 'Добавь описание к задаче', 1),
    (_task1_id, 'Отметь задачу как важную ⭐', 2);

  -- 4. Task 2: Deadlines
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, deadline, priority)
  VALUES (
    gen_random_uuid(),
    'Попробуй установить дедлайн',
    'Открой задачу и установи дату дедлайна. Задачи с приближающимся сроком будут подсвечены. Также попробуй календарь 📅 в боковом меню!',
    _user_id, _project_id, 1,
    now() + interval '3 days', 2
  )
  RETURNING id INTO _task2_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task2_id, 'Открой задачу и найди поле дедлайна', 0),
    (_task2_id, 'Перейди в раздел Календарь в меню', 1);

  -- 5. Task 3: Chat
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (
    gen_random_uuid(),
    'Напиши сообщение в чате проекта',
    'Открой чат проекта (иконка 💬 в заголовке) и напиши первое сообщение. Чат работает в реальном времени и синхронизируется с Telegram!',
    _user_id, _project_id, 2, 3
  )
  RETURNING id INTO _task3_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task3_id, 'Открой чат проекта', 0),
    (_task3_id, 'Напиши приветственное сообщение', 1),
    (_task3_id, 'Попробуй чат внутри задачи', 2);

  -- 6. Task 4: Tags (in subproject)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (
    gen_random_uuid(),
    '🏷️ Освой систему тегов',
    'Теги помогают группировать задачи по темам и фильтровать их. Создай тег в боковом меню, затем присвой его задаче или проекту. Теги видны всей команде!',
    _user_id, _subproject_id, 0
  )
  RETURNING id INTO _task4_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task4_id, 'Создай тег в разделе «Теги» в боковом меню', 0),
    (_task4_id, 'Создай категорию для группировки тегов', 1),
    (_task4_id, 'Присвой тег любой задаче', 2),
    (_task4_id, 'Присвой тег проекту через панель деталей', 3),
    (_task4_id, 'Отфильтруй задачи по тегу в боковом меню', 4);

  -- 7. Task 5: Delegation (in subproject)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (
    gen_random_uuid(),
    '👥 Делегируй задачу коллеге',
    'Пригласи участника в проект и назначь ему задачу. Ты также можешь назначать ответственных за отдельные шаги задачи и устанавливать им дедлайны.',
    _user_id, _subproject_id, 1
  )
  RETURNING id INTO _task5_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task5_id, 'Пригласи коллегу в проект (кнопка в деталях проекта)', 0),
    (_task5_id, 'Создай задачу и назначь ответственного', 1),
    (_task5_id, 'Назначь ответственного за шаг внутри задачи', 2),
    (_task5_id, 'Установи дедлайн для шага', 3);

  -- 8. Task 6: Team & Dashboard (in subproject)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (
    gen_random_uuid(),
    '📊 Изучи дашборд и команды',
    'Дашборд покажет общую картину по всем задачам. А раздел «Команды» позволяет объединять участников и управлять ролями (директор, менеджер, участник).',
    _user_id, _subproject_id, 2
  )
  RETURNING id INTO _task6_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task6_id, 'Открой Дашборд в боковом меню', 0),
    (_task6_id, 'Создай команду в разделе Сообщество', 1),
    (_task6_id, 'Поделись кодом приглашения с коллегой', 2);

  -- 9. Welcome message in project chat
  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (
    _project_id, _user_id,
    '👋 Добро пожаловать в JustTODOit! Это чат вашего первого проекта. Здесь вы можете обсуждать задачи с командой. Сообщения синхронизируются с Telegram в реальном времени. Удачной работы! 🎉',
    'web'
  );
END;
$function$;
