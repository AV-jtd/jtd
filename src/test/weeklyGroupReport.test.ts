import { describe, it, expect } from "vitest";
import { buildWeeklyGroupReport, shortDay } from "../../supabase/functions/_shared/weeklyGroupReport";

// Пятница 02.10.2026, 08:00 МСК — момент пятничного отчёта.
const dayStart = new Date("2026-10-01T21:00:00Z"); // начало 02.10 по Москве
const dueBy = new Date("2026-10-09T20:59:59Z"); // конец пт 09.10 по Москве
const weekAgo = new Date("2026-09-25T05:00:00Z");
const daysAgo = (n: number) => new Date(dayStart.getTime() - n * 86400000 + 3600000).toISOString();
const daysAhead = (n: number) => new Date(dayStart.getTime() + n * 86400000 + 3600000).toISOString();

let seq = 0;
const task = (p: Partial<{ title: string; deadline: string | null; assigned_to: string | null; is_completed: boolean; completed_at: string | null }>) => ({
  id: `t${++seq}`,
  title: p.title ?? `задача ${seq}`,
  is_completed: p.is_completed ?? false,
  deadline: p.deadline ?? null,
  assigned_to: p.assigned_to ?? null,
  completed_at: p.completed_at ?? null,
});

const people = {
  a: { name: "Александра Комарова", telegram_username: "aleksandra_komarovna" },
  m: { name: "Мария Дудорова", telegram_username: "@maryd708" },
  n: { name: "Без Телеграма", telegram_username: null },
  q: { name: "Тихоня", telegram_username: "quiet" },
};

const base = { projectName: "Продажи мечты", projectUrl: "https://justtodoit.ru/?group=x", people, dayStart, dueBy, weekAgo };

describe("shortDay", () => {
  it("день недели и дата по Москве", () => {
    expect(shortDay(dueBy)).toBe("пт 09.10");
  });
});

describe("buildWeeklyGroupReport — задания по людям", () => {
  it("блок человека: имя, @ник, просроченные с числом дней, самые давние сверху", () => {
    const text = buildWeeklyGroupReport({
      ...base,
      tasks: [
        task({ title: "свежая", deadline: daysAgo(3), assigned_to: "a" }),
        task({ title: "давняя", deadline: daysAgo(107), assigned_to: "a" }),
      ],
    });
    expect(text).toContain("<b>Продажи мечты — задания до пт 09.10</b>");
    expect(text).toContain("👤 <b>Александра Комарова @aleksandra_komarovna</b>");
    expect(text).toContain("⚠️ Просрочено 2:");
    expect(text.indexOf("давняя (107 дн.)")).toBeLessThan(text.indexOf("свежая (3 дн.)"));
  });

  it("больше пяти — пять и «… и ещё N»", () => {
    const tasks = Array.from({ length: 8 }, (_, k) => task({ deadline: daysAgo(10 + k), assigned_to: "a" }));
    const text = buildWeeklyGroupReport({ ...base, tasks });
    expect(text).toContain("⚠️ Просрочено 8:");
    expect(text).toContain("… и ещё 3");
  });

  it("срок на неделе — отдельной строкой «До пт 09.10» с днём", () => {
    const text = buildWeeklyGroupReport({ ...base, tasks: [task({ title: "КП Дикси", deadline: daysAhead(3), assigned_to: "m" })] });
    expect(text).toContain("👤 <b>Мария Дудорова @maryd708</b>");
    expect(text).toContain("📅 До пт 09.10:");
    expect(text).toContain("• КП Дикси — пн 05.10");
  });

  it("у кого ничего не горит — того в отчёте нет; без ника — просто имя", () => {
    const text = buildWeeklyGroupReport({
      ...base,
      tasks: [
        task({ deadline: daysAgo(5), assigned_to: "n" }),
        task({ deadline: daysAhead(30), assigned_to: "q" }), // срок далеко
        task({ deadline: null, assigned_to: "q" }), // без срока
      ],
    });
    expect(text).toContain("👤 <b>Без Телеграма</b>");
    expect(text).not.toContain("Тихоня");
  });

  it("сначала тот, у кого больше просрочки", () => {
    const text = buildWeeklyGroupReport({
      ...base,
      tasks: [
        task({ deadline: daysAgo(5), assigned_to: "m" }),
        task({ deadline: daysAgo(5), assigned_to: "a" }),
        task({ deadline: daysAgo(6), assigned_to: "a" }),
      ],
    });
    expect(text.indexOf("Александра")).toBeLessThan(text.indexOf("Мария"));
  });
});

describe("buildWeeklyGroupReport — остальное", () => {
  it("ничьи задачи — отдельным блоком с просьбой назначить", () => {
    const text = buildWeeklyGroupReport({
      ...base,
      tasks: [task({ title: "КиБ статусы", deadline: daysAgo(138) }), task({ title: "Чижик", deadline: daysAhead(2) })],
    });
    expect(text).toContain("<b>Без исполнителя — назначить до пт 09.10:</b>");
    expect(text).toContain("• КиБ статусы (просрочено 138 дн.)");
    expect(text).toContain("• Чижик (срок вс 04.10)");
  });

  it("закрытое за неделю — по именам; старое закрытие не считается", () => {
    const text = buildWeeklyGroupReport({
      ...base,
      tasks: [
        task({ is_completed: true, completed_at: daysAgo(2), assigned_to: "m" }),
        task({ is_completed: true, completed_at: daysAgo(3), assigned_to: "m" }),
        task({ is_completed: true, completed_at: daysAgo(30), assigned_to: "a" }),
      ],
    });
    expect(text).toContain("✅ За неделю закрыли: Мария Дудорова — 2");
    expect(text).not.toContain("Александра Комарова — 1");
  });

  it("итоговая строка и изменение просрочки к прошлой неделе", () => {
    const tasks = [task({ deadline: daysAgo(5), assigned_to: "a" }), task({ deadline: daysAhead(40), assigned_to: "a" })];
    expect(buildWeeklyGroupReport({ ...base, tasks, prevOverdue: 5 })).toContain(
      "<i>Открыто 2 · просрочено 1 (−4 за неделю) · вперёд расписано 1</i>",
    );
    expect(buildWeeklyGroupReport({ ...base, tasks })).toContain("<i>Открыто 2 · просрочено 1 · вперёд расписано 1</i>");
  });

  it("ничего не горит — так и пишет", () => {
    const text = buildWeeklyGroupReport({ ...base, tasks: [task({ deadline: daysAhead(40), assigned_to: "a" })] });
    expect(text).toContain("Просроченного и горящего на неделе нет 👍");
    expect(text).not.toContain("По каждой задаче в JTD");
  });

  it("HTML в названиях экранируется — иначе Telegram отвергнет сообщение", () => {
    const text = buildWeeklyGroupReport({ ...base, tasks: [task({ title: "КП <срочно> & цена", deadline: daysAgo(2), assigned_to: "a" })] });
    expect(text).toContain("КП &lt;срочно&gt; &amp; цена");
  });
});
