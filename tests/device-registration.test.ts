import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  results: [] as Array<{
    data: unknown;
    error: unknown;
    count?: number | null;
  }>,
  calls: [] as Array<[string, ...unknown[]]>,
  save: vi.fn(),
}));
vi.mock("../src/lib/supabase", () => ({
  db: () => ({
    from: (table: string) => {
      fixture.calls.push(["from", table]);
      const result = fixture.results.shift();
      const query: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result).then(resolve),
      };
      for (const method of ["select", "eq", "lt", "maybeSingle"])
        query[method] = (...args: unknown[]) => {
          fixture.calls.push([method, ...args]);
          return query;
        };
      return query;
    },
  }),
}));
vi.mock("../src/features/devices/api", () => ({
  PAGE_SIZE: 25,
  saveDevice: fixture.save,
}));
import { addDeviceByCode } from "../src/features/devices/registration";
const deviceId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  fixture.results = [];
  fixture.calls = [];
  fixture.save.mockReset();
});
describe("administrator adds a vest by its printed code", () => {
  it("normalizes code and registers without making up a person or measurements", async () => {
    fixture.results = [
      { data: null, error: null },
      { data: null, error: null, count: 0 },
    ];
    fixture.save.mockResolvedValue({ id: deviceId });
    expect(await addDeviceByCode(" sge-001 ")).toEqual({ deviceId, page: 0 });
    expect(fixture.save).toHaveBeenCalledWith(null, {
      code: "SGE-001",
      person_id: null,
      enabled: true,
      firmware_version: null,
    });
    expect(fixture.calls).toContainEqual(["eq", "code", "SGE-001"]);
  });
  it("selects an existing vest and finds its sorted page instead of creating a duplicate", async () => {
    fixture.results = [
      { data: { id: deviceId }, error: null },
      { data: null, error: null, count: 51 },
    ];
    expect(await addDeviceByCode("SGE-099")).toEqual({ deviceId, page: 2 });
    expect(fixture.save).not.toHaveBeenCalled();
    expect(fixture.calls).toContainEqual(["lt", "code", "SGE-099"]);
  });
  it("reconciles a concurrent duplicate insert without replacing the vest", async () => {
    fixture.results = [
      { data: null, error: null },
      { data: { id: deviceId }, error: null },
      { data: null, error: null, count: 25 },
    ];
    fixture.save.mockRejectedValue({
      code: "23505",
      message: "private schema detail",
    });
    expect(await addDeviceByCode("SGE-001")).toEqual({ deviceId, page: 1 });
  });
  it.each(["", "SGE-1", "OTHER-001"])(
    "rejects invalid code before requests: %s",
    async (code) => {
      await expect(addDeviceByCode(code)).rejects.toThrow("SGE-000");
      expect(fixture.calls).toEqual([]);
      expect(fixture.save).not.toHaveBeenCalled();
    },
  );
  it("keeps authorization failures private and does not claim success", async () => {
    fixture.results = [{ data: null, error: null }];
    fixture.save.mockRejectedValue({
      code: "42501",
      message: "private table secret",
    });
    await expect(addDeviceByCode("SGE-001")).rejects.toThrow("administrador");
  });
  it("does not return a false page when refresh fails after saving", async () => {
    fixture.results = [
      { data: { id: deviceId }, error: null },
      { data: null, error: { message: "private db" }, count: null },
    ];
    await expect(addDeviceByCode("SGE-001")).rejects.toThrow("atualizar");
    expect(fixture.save).not.toHaveBeenCalled();
  });
});
