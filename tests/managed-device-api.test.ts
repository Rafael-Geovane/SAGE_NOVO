import { beforeEach, describe, it, expect, vi } from "vitest";
const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  abort: vi.fn(),
  result: { data: null as unknown, error: null as unknown },
}));
vi.mock("../src/lib/supabase", () => ({ db: () => ({ rpc: f.rpc }) }));
import {
  lookupConnectedDevice,
  emitSimulatedReading,
} from "../src/features/devices/managed";
const device = "00000000-0000-4000-8000-000000000067",
  assignment = "00000000-0000-4000-8000-000000000001",
  message = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  f.rpc.mockReset();
  f.abort.mockReset();
  f.result = { data: null, error: null };
  f.rpc.mockImplementation(() => {
    const q = {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(f.result).then(resolve),
      abortSignal: (signal: AbortSignal) => {
        f.abort(signal);
        return q;
      },
    };
    return q;
  });
});
describe("managed vest RPC boundaries", () => {
  it("normalizes the code and accepts only the server's authorized result", async () => {
    f.result.data = { device_id: device, page: 1, configure_profile: true };
    expect(await lookupConnectedDevice(" SGE - 067 ")).toEqual({
      deviceId: device,
      page: 1,
      configureProfile: true,
    });
    expect(f.rpc).toHaveBeenLastCalledWith("lookup_connected_device", {
      p_code: "SGE-067",
    });
  });
  it("treats an unauthorized code as absent without granting access", async () => {
    expect(await lookupConnectedDevice("SGE-067")).toBeNull();
  });
  it("rejects invalid success and keeps backend details private", async () => {
    f.result.data = { device_id: device, configure_profile: true };
    await expect(lookupConnectedDevice("SGE-067")).rejects.toThrow(
      "confirmar o vínculo",
    );
    f.result.error = { message: "private credential" };
    await expect(lookupConnectedDevice("SGE-067")).rejects.toThrow(
      "Confira a conexão",
    );
  });
  it("sends only device, assignment and request identity, retaining cancellation", async () => {
    f.result.data = {
      status: 200,
      accepted: true,
      duplicate: false,
      received_at: "2026-10-30T15:00:00Z",
    };
    const controller = new AbortController();
    await emitSimulatedReading(device, assignment, message, controller.signal);
    expect(f.rpc).toHaveBeenLastCalledWith("emit_simulated_reading", {
      p_device_id: device,
      p_expected_assignment_id: assignment,
      p_message_id: message,
      p_scenario: "normal",
    });
    expect(f.abort).toHaveBeenCalledWith(controller.signal);
  });
  it("stops on rejected receipts and does not accept an unconfirmed write", async () => {
    f.result.data = { status: 429 };
    await expect(
      emitSimulatedReading(device, assignment, message),
    ).rejects.toThrow("pausados");
    f.result.data = { status: 200, accepted: false };
    await expect(
      emitSimulatedReading(device, assignment, message),
    ).rejects.toThrow("pausados");
  });
});
