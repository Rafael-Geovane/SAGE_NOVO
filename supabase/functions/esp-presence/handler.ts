type Packet = {
  device_code: string;
  boot_id: string;
  sequence: number;
  attached: boolean;
};
type Dependencies = {
  store: (
    packet: Packet,
    tokenHash: string,
  ) => Promise<{
    status: number;
    accepted?: boolean;
    attached?: boolean;
    received_at?: string;
    error?: string;
  }>;
};
export function createPresenceHandler(deps: Dependencies) {
  return async (req: Request) => {
    const respond = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    if (req.method !== "POST")
      return respond(405, { error: "method_not_allowed" });
    const token = req.headers.get("X-Device-Token") ?? "";
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(token) || /^sb(p)?_/i.test(token))
      return respond(401, { error: "unauthorized" });
    if (
      req.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      return respond(415, { error: "json_required" });
    let packet: Packet;
    try {
      if (!req.body) throw new Error();
      const reader = req.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      const timeout = setTimeout(() => void reader.cancel(), 5000);
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 1024) throw new Error();
          chunks.push(part.value);
        }
      } finally {
        clearTimeout(timeout);
        void reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      packet = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !packet ||
        !/^SGE-\d{3}$/.test(packet.device_code) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          packet.boot_id,
        ) ||
        !Number.isSafeInteger(packet.sequence) ||
        packet.sequence < 1 ||
        typeof packet.attached !== "boolean" ||
        Object.keys(packet).some(
          (key) =>
            !["device_code", "boot_id", "sequence", "attached"].includes(key),
        )
      )
        throw new Error();
    } catch {
      return respond(400, { error: "invalid_payload" });
    }
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(token),
      );
      const hash = [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      const stored = await deps.store(packet, hash);
      if (
        stored.status === 200 &&
        stored.accepted === true &&
        typeof stored.attached === "boolean" &&
        typeof stored.received_at === "string"
      )
        return respond(200, {
          accepted: true,
          attached: stored.attached,
          received_at: stored.received_at,
        });
      const allowed: Record<number, string> = {
        400: "invalid_payload",
        401: "unauthorized",
        403: "device_disabled",
        409: "stale_presence",
        429: "rate_limited",
      };
      return allowed[stored.status]
        ? respond(stored.status, { error: allowed[stored.status] })
        : respond(503, { error: "temporarily_unavailable" });
    } catch {
      return respond(503, { error: "temporarily_unavailable" });
    }
  };
}
