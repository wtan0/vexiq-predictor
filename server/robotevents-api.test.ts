import { describe, it, expect } from "vitest";

/**
 * Integration test: validates that ROBOTEVENTS_API_KEY is set and
 * can successfully call the RobotEvents v2 API.
 *
 * This test is skipped if the key is not present (CI without secrets).
 */
describe("RobotEvents API key", () => {
  const apiKey = process.env.ROBOTEVENTS_API_KEY;

  it("should be present in the environment", () => {
    expect(apiKey).toBeTruthy();
    expect(typeof apiKey).toBe("string");
    expect((apiKey as string).length).toBeGreaterThan(10);
  });

  it("should authenticate successfully against the RobotEvents v2 API", async () => {
    if (!apiKey) {
      console.warn("ROBOTEVENTS_API_KEY not set — skipping live API test");
      return;
    }

    const resp = await fetch(
      "https://www.robotevents.com/api/v2/programs?per_page=1",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }
    );

    expect(resp.status).toBe(200);
    const data = (await resp.json()) as { data?: unknown[] };
    expect(Array.isArray(data.data)).toBe(true);
  }, 15000);
});
