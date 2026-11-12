import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import { createWeeklyAnalysisHandler } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_ANON_KEY")!;
const caller = (token: string) =>
  createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(12000) }),
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
Deno.serve(
  createWeeklyAnalysisHandler({
    apiKey: Deno.env.get("NVIDIA_API_KEY"),
    model: Deno.env.get("NVIDIA_MODEL"),
    authorize: async (token, args) => {
      const client = caller(token);
      const { data: user, error: authError } = await client.auth.getUser(token);
      if (authError || !user.user) return null;
      const { data, error } = await client.rpc("demo_weekly_analysis", {
        p_device_id: args.device_id,
        p_expected_assignment_id: args.assignment_id,
        p_start: args.start,
      });
      return error || !data?.report ? null : { report: data.report };
    },
    reserve: async (token, args) => {
      const { data, error } = await caller(token).rpc(
        "reserve_weekly_ai_request",
        {
          p_device_id: args.device_id,
          p_expected_assignment_id: args.assignment_id,
        },
      );
      return !error && data === true;
    },
    reauthorize: async (token, args) => {
      const { error } = await caller(token).rpc("demo_weekly_analysis", {
        p_device_id: args.device_id,
        p_expected_assignment_id: args.assignment_id,
        p_start: args.start,
      });
      return !error;
    },
  }),
);
