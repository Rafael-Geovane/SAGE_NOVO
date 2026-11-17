import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { createPresenceHandler } from "./handler.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  createPresenceHandler({
    store: async (packet, hash) => {
      const { data, error } = await client
        .rpc("record_esp_presence", {
          p_code: packet.device_code,
          p_token_hash: hash,
          p_boot_id: packet.boot_id,
          p_sequence: packet.sequence,
          p_attached: packet.attached,
        })
        .abortSignal(AbortSignal.timeout(5000));
      if (error) return { status: 503 };
      return data;
    },
  }),
);
