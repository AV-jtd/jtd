---
name: STM SKU inline stages workflow
description: Клик по SKU раскрывает Chronograph-панель — шапка ИТОГО (старт→финиш, осталось дн, % прогресс, drift), roadmap-полоса как PMO Stripe, grid 12 этапов с датами/инициалами/drift, активный этап раскрывает inline TaskItem (шаги/комментарии). URL ?sku=<id>.
type: feature
---
В STM Mission Control (`/npd/stm`) клик по строке SKU не уводит в Гантт, а раскрывает Chronograph-панель в стиле PMO Stripe + NPD Stage-Gate.

## Архитектура данных
- 1 этап (gate) = 1 задача (`task_type='stm_stage'`, `stage_key=...`). 12 для flow=in, 3 для flow=out.
- Раскрытие сохраняется в URL `?sku=<group_id>`: переживает refresh, шарится ссылкой, авто-переключает вкладку in/out.

## Chronograph UI (StmExpandedRow)
1. **Шапка ИТОГО** — справа моноширно: ИТОГО (мин start_at → макс deadline), Осталось (днями, цвет от срочности: <0 danger, <7 warn, иначе accent), Прогресс %, Дрифт `↗+Nдн` (если есть), кнопка «Гантт».
2. **Roadmap strip** — тонкая полоса из 12 сегментов: готовые `bg-stm-fg/40`, активный `bg-stm-accent` со свечением (flex-[1.4]), просроченные `bg-stm-danger`, будущие `bg-stm-fg/5`.
3. **Grid 12 этапов** — каждая ячейка 1fr × 112px: индекс (01-12), статус-точка (success/danger/accent), drift `↗+Nд`, название этапа (`stage.short`), инициалы ответственного, deadline. Активный обведён `ring-stm-accent/40` + top-bar.
4. **Inline TaskItem** — клик по этапу раскрывает под grid'ом полный TaskItem (шаги/дедлайн/ответственный/комментарии). По умолчанию активен `currentStageKey` (первый незавершённый).

## Расчёты
- **daysLeft**: `Math.ceil((maxDeadline - today) / 86400000)`.
- **globalDrift**: сумма положительных drift'ов всех этапов.
- **drift на этап**: `(deadline - original_deadline) / 86400000`, отрицательные не показываем.
- **assignee initials**: первые буквы 2 слов из `profiles.display_name`. Один запрос batch'ем по `assigned_to[]`, кеш 60с.

## Файлы
- `src/modules/stm/components/StmExpandedRow.tsx` — Chronograph-панель.
- `src/modules/stm/components/StmMatrixRow.tsx` — горизонтальная сводка ячеек + раскрытие.
- `src/modules/stm/pages/StmMatrixView.tsx` — управление `?sku=` через searchParams.
