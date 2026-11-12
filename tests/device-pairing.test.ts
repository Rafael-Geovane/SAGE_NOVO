import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ db: () => ({ rpc: fixture.rpc }) }));
import {
  connectDevice,
  issueDeviceActivation,
  pairingInput,
} from "../src/features/devices/pairing";

const deviceId = "00000000-0000-4000-8000-000000000001";
const activationCode = "a".repeat(32);
beforeEach(() => fixture.rpc.mockReset());

describe("customer device connection", () => {
  it("normalizes the printed code and activation key", () => {
    expect(pairingInput.shape.code.parse(" SGE - 067 ")).toBe("SGE-067");
    expect(
      pairingInput.parse({
        code: " sge-001 ",
        activationCode: "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA",
      }),
    ).toEqual({ code: "SGE-001", activationCode });
  });
  it.each([
    { code: "SGE-1", activationCode },
    { code: "SGE-001", activationCode: "" },
    { code: "SGE-001", activationCode: "a".repeat(31) },
  ])("rejects incomplete proof before sending a request", async (input) => {
    await expect(connectDevice(input)).rejects.toThrow();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
  it("connects only the authenticated caller and returns the device page", async () => {
    fixture.rpc.mockResolvedValue({
      data: { status: "connected", device_id: deviceId, page: 2 },
      error: null,
    });
    expect(
      await connectDevice({
        code: "sge-001",
        activationCode,
        caregiver_id: "another-user",
      } as { code: string; activationCode: string }),
    ).toEqual({ deviceId, page: 2 });
    expect(fixture.rpc).toHaveBeenCalledWith("connect_device", {
      p_code: "SGE-001",
      p_activation_code: activationCode,
    });
  });
  it("accepts an idempotent retry after the first response was lost", async () => {
    fixture.rpc.mockResolvedValue({
      data: { status: "already_connected", device_id: deviceId, page: 0 },
      error: null,
    });
    expect(await connectDevice({ code: "SGE-001", activationCode })).toEqual({
      deviceId,
      page: 0,
    });
  });
  it("does not expose whether a different customer's vest exists", async () => {
    fixture.rpc.mockResolvedValue({ data: { status: "invalid" }, error: null });
    await expect(
      connectDevice({ code: "SGE-001", activationCode }),
    ).rejects.toThrow("Confira os códigos");
  });
  it("reports the rate limit with a retry instruction", async () => {
    fixture.rpc.mockResolvedValue({
      data: { status: "rate_limited" },
      error: null,
    });
    await expect(
      connectDevice({ code: "SGE-001", activationCode }),
    ).rejects.toThrow("15 minutos");
  });
  it("reports a missing backend migration without leaking a backend error", async () => {
    fixture.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "private schema details" },
    });
    await expect(
      connectDevice({ code: "SGE-001", activationCode }),
    ).rejects.toThrow("ainda não está disponível");
  });
  it("does not treat an incomplete success response as a connection", async () => {
    fixture.rpc.mockResolvedValue({
      data: { status: "connected", device_id: deviceId },
      error: null,
    });
    await expect(
      connectDevice({ code: "SGE-001", activationCode }),
    ).rejects.toThrow();
  });
  it("requests an activation key without sending or accepting a device ingest token", async () => {
    const expiresAt = "2026-10-27T12:00:00Z";
    fixture.rpc.mockResolvedValue({
      data: {
        code: "SGE-001",
        activation_code: activationCode,
        expires_at: expiresAt,
      },
      error: null,
    });
    expect(await issueDeviceActivation(deviceId)).toEqual({
      code: "SGE-001",
      activationCode,
      expiresAt,
    });
    expect(fixture.rpc).toHaveBeenCalledWith("issue_device_pairing_code", {
      p_device_id: deviceId,
    });
  });
});
