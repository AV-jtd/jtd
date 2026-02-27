
-- Function to seed onboarding data for new users
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
BEGIN
  -- 1. Create main onboarding project
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, description)
  VALUES (
    gen_random_uuid(), '🚀 Добро пожаловать в JustTODOit', '🚀', '#3b82f6', _user_id, 0,
    'Это ваш первый проект! Здесь вы узнаете основные возможности приложения. Выполняйте задачи по порядку.'
  )
  RETURNING id INTO _project_id;

  -- 2. Create subproject
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '📖 Изучи возможности', '📖', '#8b5cf6', _user_id, 0, _project_id,
    'Подпроект с продвинутыми функциями. Проекты могут содержать подпроекты для лучшей организации.'
  )
  RETURNING id INTO _subproject_id;

  -- 3. Task 1: Create first task (in main project)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important, priority)
  VALUES (
    gen_random_uuid(),
    'Создай свою первую задачу',
    'Нажми кнопку «+» внизу списка задач, чтобы создать новую задачу. Попробуй добавить описание и отметить задачу как важную ⭐',
    _user_id, _project_id, 0, true, 1
  )
  RETURNING id INTO _task1_id;

  -- Subtasks for task 1
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

  -- 5. Task 3: Chat (in main project)
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

  -- 6. Task 4: Tags & delegation (in subproject)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position)
  VALUES (
    gen_random_uuid(),
    'Изучи теги и делегирование',
    'Теги помогают группировать задачи по темам. А функция делегирования позволяет назначать задачи другим участникам команды.',
    _user_id, _subproject_id, 0
  )
  RETURNING id INTO _task4_id;

  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_task4_id, 'Создай свой первый тег в боковом меню', 0),
    (_task4_id, 'Присвой тег задаче', 1),
    (_task4_id, 'Пригласи коллегу в проект', 2);

  -- 7. Welcome message in project chat
  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (
    _project_id, _user_id,
    '👋 Добро пожаловать в JustTODOit! Это чат вашего первого проекта. Здесь вы можете обсуждать задачи с командой. Сообщения синхронизируются с Telegram в реальном времени. Удачной работы! 🎉',
    'web'
  );
END;
$function$;

-- Update handle_new_user to call onboarding seeder
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, telegram_username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NULLIF(TRIM(BOTH FROM LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data->>'telegram_username', ''), '@', ''))), '')
  );

  -- Seed onboarding project structure
  PERFORM public.seed_onboarding_data(NEW.id);

  RETURN NEW;
END;
$function$;
