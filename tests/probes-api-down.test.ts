import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";

// The probes must not depend on the Task API (a regression guard: they may pass before the feature exists).
describe("probes with the Task API unreachable", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TASKBOARD4_API_URL", "http://127.0.0.1:1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("AC-001.11 /api/ready and /api/health still answer 200", async () => {
    expect((await ready()).status).toBe(200);
    expect((await health()).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
