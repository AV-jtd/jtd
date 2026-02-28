
CREATE OR REPLACE FUNCTION public.seed_onboarding_data(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_id uuid;
  _subproject_id uuid;
  _gtd_project_id uuid;
  _gtd_sub1_id uuid;
  _gtd_sub2_id uuid;
  _task1_id uuid;
  _task2_id uuid;
  _task3_id uuid;
  _task4_id uuid;
  _task5_id uuid;
  _task6_id uuid;
  _gtd_t1_id uuid;
  _gtd_t2_id uuid;
  _gtd_t3_id uuid;
  _gtd_t4_id uuid;
  _gtd_t5_id uuid;
  _gtd_t6_id uuid;
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

  -- === Onboarding project (existing) ===
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

  -- === GTD Methodology project ===
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, description)
  VALUES (
    gen_random_uuid(), '🧠 GTD — Getting Things Done', '🧠', '#10b981', _user_id, 1,
    'Методология личной продуктивности Дэвида Аллена. Принцип: «Ваш мозг — для генерации идей, а не для их хранения». Пройдите 5 шагов GTD и внедрите систему в свою работу.'
  )
  RETURNING id INTO _gtd_project_id;

  -- Sub-project: 5 шагов GTD
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '🔄 5 шагов GTD', '🔄', '#10b981', _user_id, 0, _gtd_project_id,
    'Пять ключевых шагов методологии GTD: Собрать → Уточнить → Организовать → Пересмотреть → Действовать. Каждая задача — один шаг с практическими упражнениями.'
  )
  RETURNING id INTO _gtd_sub1_id;

  -- Sub-project: Быстрый чек-лист внедрения
  INSERT INTO public.task_groups (id, name, icon, color, user_id, position, parent_id, description)
  VALUES (
    gen_random_uuid(), '✅ Чек-лист внедрения GTD', '✅', '#f59e0b', _user_id, 1, _gtd_project_id,
    'Практический чек-лист для быстрого старта с GTD. GTD — не про идеальную организацию, а про снижение ментального шума. Даже 20% внедрения дают заметный прирост фокуса.'
  )
  RETURNING id INTO _gtd_sub2_id;

  -- Step 1: Capture (Собрать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important, priority)
  VALUES (gen_random_uuid(), '📥 Шаг 1: Capture — Собери всё',
    E'Первый шаг GTD — выгрузить ВСЕ задачи, идеи и обязательства из головы во внешнюю систему.\n\n🎯 Цель: ваш мозг должен быть пустым от «надо не забыть».\n\n💡 Совет: не оценивай и не сортируй на этом этапе — просто записывай всё подряд. Потратьте 15-20 минут на «мозговой дамп».',
    _user_id, _gtd_sub1_id, 0, true, 1)
  RETURNING id INTO _gtd_t1_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t1_id, 'Открой проект и создай 10+ задач — всё что в голове', 0),
    (_gtd_t1_id, 'Добавь рабочие задачи, которые висят в голове', 1),
    (_gtd_t1_id, 'Добавь личные дела и бытовые задачи', 2),
    (_gtd_t1_id, 'Запиши идеи «когда-нибудь» — не фильтруй!', 3),
    (_gtd_t1_id, 'Проверь почту/мессенджеры — нет ли забытых дел?', 4);

  -- Step 2: Clarify (Уточнить)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), '🔍 Шаг 2: Clarify — Уточни каждый элемент',
    E'Для каждой записанной задачи ответь на вопрос: «Требует ли это действия?»\n\n• Если НЕТ → удали, отложи в «Когда-нибудь» или сохрани как справку\n• Если ДА → определи конкретное следующее физическое действие\n\n⚠️ Важно: не «запустить проект», а «написать ТЗ для дизайнера». Задача должна быть конкретным действием, которое можно выполнить за один подход.',
    _user_id, _gtd_sub1_id, 1, 2)
  RETURNING id INTO _gtd_t2_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t2_id, 'Пройди по каждой задаче из шага 1', 0),
    (_gtd_t2_id, 'Переформулируй абстрактные задачи в конкретные действия', 1),
    (_gtd_t2_id, 'Задачи < 2 мин — выполни сразу (правило двух минут)', 2),
    (_gtd_t2_id, 'Удали или отложи то, что не требует действия', 3);

  -- Step 3: Organize (Организовать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), '📂 Шаг 3: Organize — Организуй по контекстам',
    E'Распредели задачи по проектам, контекстам и срокам в JustTODOit:\n\n• 🏷️ Теги = контексты GTD (@офис, @телефон, @компьютер, @магазин)\n• 📁 Проекты = любой результат, требующий 2+ действий\n• 📅 Дедлайны = задачи, привязанные к дате\n• ⭐ Важное = приоритетные задачи на сегодня',
    _user_id, _gtd_sub1_id, 2, 3)
  RETURNING id INTO _gtd_t3_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t3_id, 'Создай теги-контексты: @офис, @дом, @телефон, @онлайн', 0),
    (_gtd_t3_id, 'Присвой контекстные теги своим задачам', 1),
    (_gtd_t3_id, 'Сгруппируй связанные задачи в проекты', 2),
    (_gtd_t3_id, 'Установи дедлайны для привязанных к дате задач', 3),
    (_gtd_t3_id, 'Отметь ⭐ задачи, которые нужно сделать сегодня', 4);

  -- Step 4: Reflect (Пересматривать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority, deadline)
  VALUES (gen_random_uuid(), '🔄 Шаг 4: Reflect — Еженедельный обзор',
    E'Еженедельный обзор — сердце GTD. Без него система разваливается.\n\nВыдели 30-60 минут в конце недели:\n1. Очисти инбокс (все входящие обработаны)\n2. Пройди по каждому проекту — актуальны ли задачи?\n3. Обнови дедлайны и приоритеты\n4. Добавь новые задачи, которые появились за неделю\n5. Загляни в Дашборд — общая картина по всем проектам\n\n💡 Совет: поставь повторяющееся напоминание на пятницу!',
    _user_id, _gtd_sub1_id, 3, 2, now() + interval '5 days')
  RETURNING id INTO _gtd_t4_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t4_id, 'Запланируй 30-60 мин на еженедельный обзор', 0),
    (_gtd_t4_id, 'Открой Дашборд и оцени общую картину', 1),
    (_gtd_t4_id, 'Пройди по каждому проекту — обнови статусы', 2),
    (_gtd_t4_id, 'Проверь просроченные задачи — перенеси или удали', 3),
    (_gtd_t4_id, 'Добавь новые задачи из головы', 4);

  -- Step 5: Engage (Действовать)
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, priority)
  VALUES (gen_random_uuid(), '⚡ Шаг 5: Engage — Действуй осознанно',
    E'Выбирай задачу для выполнения по 4 критериям:\n\n1. 📍 Контекст — где ты сейчас? Фильтруй по тегу-контексту\n2. ⏰ Время — сколько есть? Выбери задачу по размеру\n3. ⚡ Энергия — как себя чувствуешь? Сложные задачи — на пике\n4. 🎯 Приоритет — что важнее всего?\n\n✅ Главный результат GTD: снижение когнитивной нагрузки, повышение фокуса и контроль над рабочим потоком без стресса.',
    _user_id, _gtd_sub1_id, 4, 1)
  RETURNING id INTO _gtd_t5_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t5_id, 'Отфильтруй задачи по текущему контексту (тегу)', 0),
    (_gtd_t5_id, 'Выбери задачу подходящую по времени и энергии', 1),
    (_gtd_t5_id, 'Выполни её и отметь как завершённую ✅', 2),
    (_gtd_t5_id, 'Повтори цикл — выбери следующую задачу', 3);

  -- Checklist task
  INSERT INTO public.tasks (id, title, description, user_id, group_id, position, is_important)
  VALUES (gen_random_uuid(), '🎯 Быстрый старт: внедри GTD за 5 шагов',
    E'Не гонитесь за идеальным инструментом — начните с простого. Даже 20% внедрения GTD дают заметный прирост фокуса и контроля.\n\n🧠 Финальный совет: GTD — не про идеальную организацию, а про снижение ментального шума.',
    _user_id, _gtd_sub2_id, 0, true)
  RETURNING id INTO _gtd_t6_id;
  INSERT INTO public.subtasks (task_id, title, position) VALUES
    (_gtd_t6_id, '✅ Выбери один инбокс для всех входящих (JustTODOit!)', 0),
    (_gtd_t6_id, '✅ Проведи еженедельный обзор (30-60 мин)', 1),
    (_gtd_t6_id, '✅ Для каждой задачи определи одно «следующее действие»', 2),
    (_gtd_t6_id, '✅ Используй теги как контексты (@офис, @дом)', 3),
    (_gtd_t6_id, '✅ Интегрируй систему с календарём (раздел 📅)', 4);

  -- Welcome message
  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (_project_id, _user_id,
    '👋 Добро пожаловать в JustTODOit! Это чат вашего первого проекта. Здесь вы можете обсуждать задачи с командой. Сообщения синхронизируются с Telegram в реальном времени. Удачной работы! 🎉',
    'web');

  -- GTD welcome message
  INSERT INTO public.group_messages (group_id, user_id, content, source)
  VALUES (_gtd_project_id, _user_id,
    '🧠 Добро пожаловать в проект GTD! Здесь вы освоите методологию Getting Things Done Дэвида Аллена. Пройдите 5 шагов по порядку — от сбора всех задач до осознанного выполнения. Главный принцип: ваш мозг — для генерации идей, а не для их хранения! 🚀',
    'web');
END;
$$;
