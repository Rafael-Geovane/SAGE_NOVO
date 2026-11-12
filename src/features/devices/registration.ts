import { z } from "zod";
import { db } from "../../lib/supabase";
import { PAGE_SIZE, saveDevice } from "./api";
import { pairingInput } from "./pairing";

const failure = (error: unknown) =>
  new Error(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42501"
      ? "Somente um administrador pode cadastrar um colete. Confira sua conta."
      : "Não foi possível adicionar o colete. Confira a conexão e tente novamente.",
  );

async function findDevice(code: string) {
  const { data, error } = await db()
    .from("devices")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error) throw failure(error);
  return data;
}

// Existing RLS and audited inserts remain authoritative; no new grants or bypass.
export async function addDeviceByCode(input: string) {
  const code = pairingInput.shape.code.parse(input);
  let device;
  try {
    device = await findDevice(code);
  } catch (error) {
    throw failure(error);
  }
  if (!device) {
    try {
      device = await saveDevice(null, {
        code,
        person_id: null,
        enabled: true,
        firmware_version: null,
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        try {
          device = await findDevice(code);
        } catch {
          throw failure(null);
        }
      } else throw failure(error);
    }
  }
  const id = z.uuid().safeParse(device?.id);
  if (!id.success) throw failure(null);
  let result;
  try {
    result = await db()
      .from("devices")
      .select("id", { count: "exact", head: true })
      .lt("code", code);
  } catch {
    throw new Error(
      "Não foi possível atualizar a lista. Tente adicionar o mesmo código novamente.",
    );
  }
  if (
    result.error ||
    result.count === null ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0
  )
    throw new Error(
      "Não foi possível atualizar a lista. Tente adicionar o mesmo código novamente.",
    );
  return { deviceId: id.data, page: Math.floor(result.count / PAGE_SIZE) };
}
