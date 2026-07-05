import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  return new Response("JTD Edge Runtime OK", { status: 200 });
});
