import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const fixture = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ db: () => ({ rpc: fixture.rpc }) }));
import { profileInput, saveElderProfile } from "../src/features/people/profile";
import {
  clearTelemetryScope,
  reconcileTelemetryScope,
} from "../src/features/devices/realtime";
const deviceId = "00000000-0000-4000-8000-000000000001";
const assignmentId = "00000000-0000-4000-8000-000000000002";
const personId = "00000000-0000-4000-8000-000000000003";
const values = {
  display_name: " Maria ",
  address: " Rua A, 10 ",
  allergy_status: "unknown",
  allergies: "",
  health_conditions: "",
  contact_name: "",
  contact_phone: "",
  consent_note: "Autorização informada pela pessoa",
  consent_confirmed: true,
};
describe("elderly care profile", () => {
  it("preserves unknown allergy status and normalizes optional fields", () => {
    expect(profileInput.parse(values)).toMatchObject({
      display_name: "Maria",
      address: "Rua A, 10",
      allergy_status: "unknown",
      allergies: null,
      health_conditions: null,
    });
  });
  it("requires consent and a name", () => {
    expect(
      profileInput.safeParse({
        ...values,
        display_name: " ",
        consent_confirmed: false,
      }).success,
    ).toBe(false);
  });
  it("requires details for reported allergies and rejects details for unknown status", () => {
    expect(
      profileInput.safeParse({ ...values, allergy_status: "reported" }).success,
    ).toBe(false);
    expect(
      profileInput.safeParse({ ...values, allergies: "Penicilina" }).success,
    ).toBe(false);
    expect(
      profileInput.parse({
        ...values,
        allergy_status: "reported",
        allergies: "Penicilina",
      }).allergies,
    ).toBe("Penicilina");
  });
  it("bounds addresses, health text and phone", () => {
    expect(
      profileInput.safeParse({ ...values, address: "a".repeat(1001) }).success,
    ).toBe(false);
    expect(
      profileInput.safeParse({ ...values, health_conditions: "a".repeat(3001) })
        .success,
    ).toBe(false);
    expect(
      profileInput.safeParse({ ...values, contact_phone: "abc" }).success,
    ).toBe(false);
  });
  it("saves against the expected assignment via RPC", async () => {
    fixture.rpc.mockResolvedValueOnce({
      data: {
        device_id: deviceId,
        person_id: personId,
        assignment_id: assignmentId,
      },
      error: null,
    });
    await expect(
      saveElderProfile(deviceId, assignmentId, values),
    ).resolves.toMatchObject({ person_id: personId });
    expect(fixture.rpc).toHaveBeenLastCalledWith("complete_device_profile", {
      p_device_id: deviceId,
      p_expected_assignment_id: assignmentId,
      p_data: profileInput.parse(values),
    });
  });
  it("explains concurrent reassignment without exposing backend text", async () => {
    fixture.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "private medical detail" },
    });
    await expect(
      saveElderProfile(deviceId, assignmentId, values),
    ).rejects.toThrow("vínculo mudou");
  });
  it("removes health cache when access is revoked or assignment changes", () => {
    const cache = new QueryClient();
    const key = ["elder-profile", "user", deviceId, personId, assignmentId];
    cache.setQueryData(key, { address: "private" });
    reconcileTelemetryScope(cache, "user", {
      deviceId,
      personId,
      assignmentId: "next",
    });
    expect(cache.getQueryData(key)).toBeUndefined();
    cache.setQueryData(key, { address: "private" });
    clearTelemetryScope(cache, "user", deviceId);
    expect(cache.getQueryData(key)).toBeUndefined();
    cache.clear();
  });
});
