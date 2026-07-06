// Диспетчер для self-hosted edge-runtime (--main-service /home/deno/functions/main).
// Каждый запрос вида /functions/v1/<name>/... приходит сюда одним потоком;
// нужно самим поднять воркер под конкретную функцию по имени из пути.
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const serviceName = pathParts[0];

  if (!serviceName) {
    return new Response(JSON.stringify({ msg: "missing function name in request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const servicePath = `/home/deno/functions/${serviceName}`;

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.entries(envVarsObj);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 256,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (e) {
    return new Response(JSON.stringify({ msg: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
