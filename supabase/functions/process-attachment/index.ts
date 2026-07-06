import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_PREFIXES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

// Magic bytes for common file types
const MAGIC_BYTES: [Uint8Array, string][] = [
  [new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"],
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png"],
  [new Uint8Array([0x47, 0x49, 0x46]), "image/gif"],
  [new Uint8Array([0x52, 0x49, 0x46, 0x46]), "image/webp"], // RIFF header
  [new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf"],
  [new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/zip"], // docx/xlsx/pptx
];

function detectMime(header: Uint8Array): string | null {
  for (const [magic, mime] of MAGIC_BYTES) {
    if (header.length >= magic.length && magic.every((b, i) => header[i] === b)) {
      return mime;
    }
  }
  // Check for text
  const isText = header.slice(0, 512).every(
    (b) => (b >= 0x20 && b <= 0x7e) || b === 0x0a || b === 0x0d || b === 0x09
  );
  if (isText) return "text/plain";
  return null;
}

function isAllowedMime(detectedMime: string, declaredMime: string): boolean {
  // ZIP-based formats (docx, xlsx, pptx) all have zip magic bytes
  if (detectedMime === "application/zip") {
    return [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ].includes(declaredMime);
  }
  return ALLOWED_MIME_PREFIXES.includes(detectedMime);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const { fileUrls, taskTitle } = await req.json();

    if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No file URLs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validationResults: { url: string; valid: boolean; error?: string; mime?: string; size?: number }[] = [];

    // Validate each file
    for (const url of fileUrls) {
      try {
        const resp = await fetch(url, { method: "GET" });
        if (!resp.ok) {
          validationResults.push({ url, valid: false, error: "Файл недоступен" });
          continue;
        }

        const blob = await resp.blob();
        const size = blob.size;

        if (size > MAX_FILE_SIZE) {
          validationResults.push({
            url,
            valid: false,
            error: `Файл превышает лимит 10 МБ (${(size / 1024 / 1024).toFixed(1)} МБ)`,
            size,
          });
          continue;
        }

        // Check magic bytes
        const headerBytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
        const detectedMime = detectMime(headerBytes);
        const declaredMime = resp.headers.get("content-type") || "";

        if (!detectedMime || !isAllowedMime(detectedMime, declaredMime)) {
          validationResults.push({
            url,
            valid: false,
            error: "Недопустимый тип файла",
            mime: detectedMime || "unknown",
          });
          continue;
        }

        validationResults.push({ url, valid: true, mime: detectedMime, size });
      } catch (e) {
        validationResults.push({ url, valid: false, error: "Ошибка проверки файла" });
      }
    }

    const allValid = validationResults.every((r) => r.valid);
    const invalidFiles = validationResults.filter((r) => !r.valid);

    if (!allValid) {
      return new Response(
        JSON.stringify({
          valid: false,
          errors: invalidFiles.map((f) => f.error),
          details: validationResults,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate AI summary
    let summary: string | null = null;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    if (OPENROUTER_API_KEY && fileUrls.length > 0) {
      try {
        const imageUrls = validationResults
          .filter((r) => r.mime?.startsWith("image/"))
          .map((r) => r.url);

        const fileDescriptions = validationResults.map((r) => {
          const fileName = decodeURIComponent(r.url.split("/").pop() || "файл");
          const sizeMb = r.size ? (r.size / 1024 / 1024).toFixed(2) : "?";
          return `- ${fileName} (${r.mime}, ${sizeMb} МБ)`;
        });

        const messages: any[] = [
          {
            role: "system",
            content:
              "Ты — ИИ-помощник в системе управления задачами. Создай краткое резюме (2-3 предложения) прикреплённых файлов к результату выполнения задачи. Будь конкретен: что изображено на скриншотах, какой тип документа. Отвечай на русском.",
          },
        ];

        // Build user message with images if any
        const contentParts: any[] = [];
        contentParts.push({
          type: "text",
          text: `Задача: «${taskTitle || "Без названия"}»\n\nПрикреплённые файлы:\n${fileDescriptions.join("\n")}\n\nСоздай краткое описание вложений.`,
        });

        for (const imgUrl of imageUrls.slice(0, 3)) {
          contentParts.push({
            type: "image_url",
            image_url: { url: imgUrl },
          });
        }

        messages.push({ role: "user", content: contentParts });

        const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages,
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          summary = aiData.choices?.[0]?.message?.content || null;
        } else {
          const errText = await aiResp.text();
          console.error("AI summary error:", aiResp.status, errText);
        }
      } catch (e) {
        console.error("AI summary generation failed:", e);
      }
    }

    return new Response(
      JSON.stringify({ valid: true, summary, details: validationResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-attachment error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
