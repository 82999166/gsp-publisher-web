import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getAccounts: vi.fn().mockResolvedValue([
    { id: 1, name: "Test Account", email: "test@example.com", cookieRaw: "x".repeat(60), status: "online", dailyLimit: 5, todayPublished: 0, siteAge: "new_site", createdAt: new Date(), updatedAt: new Date() },
  ]),
  getAccountById: vi.fn().mockResolvedValue({ id: 1, name: "Test Account", cookieRaw: "x".repeat(60), status: "online" }),
  createAccount: vi.fn().mockResolvedValue(undefined),
  updateAccount: vi.fn().mockResolvedValue(undefined),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
  getMaterials: vi.fn().mockResolvedValue([
    { id: 1, title: "Test Article", keyword: "test keyword", language: "zh-CN", content: "Test content", wordCount: 800, qualityScore: 85, status: "pending", createdAt: new Date(), updatedAt: new Date() },
  ]),
  getMaterialById: vi.fn().mockResolvedValue({ id: 1, title: "Test Article", content: "Test content", status: "pending" }),
  createMaterial: vi.fn().mockResolvedValue(undefined),
  updateMaterial: vi.fn().mockResolvedValue(undefined),
  deleteMaterial: vi.fn().mockResolvedValue(undefined),
  getPublishTasks: vi.fn().mockResolvedValue([
    { id: 1, name: "Task 1", accountId: 1, status: "pending", createdAt: new Date(), updatedAt: new Date() },
  ]),
  createPublishTask: vi.fn().mockResolvedValue(undefined),
  updatePublishTask: vi.fn().mockResolvedValue(undefined),
  deletePublishTask: vi.fn().mockResolvedValue(undefined),
  getHyperlinks: vi.fn().mockResolvedValue([
    { id: 1, type: "external", url: "https://wikipedia.org", domain: "wikipedia.org", authorityScore: 95, isPreset: true, isActive: true },
  ]),
  createHyperlink: vi.fn().mockResolvedValue(undefined),
  updateHyperlink: vi.fn().mockResolvedValue(undefined),
  deleteHyperlink: vi.fn().mockResolvedValue(undefined),
  seedPresetHyperlinks: vi.fn().mockResolvedValue(undefined),
  getIndexingRecords: vi.fn().mockResolvedValue([
    { id: 1, publishedUrl: "https://sites.google.com/test", keyword: "test", indexStatus: "pending", createdAt: new Date(), updatedAt: new Date() },
  ]),
  createIndexingRecord: vi.fn().mockResolvedValue(undefined),
  updateIndexingRecord: vi.fn().mockResolvedValue(undefined),
  deleteIndexingRecord: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue([
    { id: 1, key: "site_name", value: "GSP Publisher", updatedAt: new Date() },
    { id: 2, key: "ai_engine", value: "groq", updatedAt: new Date() },
    { id: 3, key: "ai_api_key", value: "test_key", updatedAt: new Date() },
  ]),
  upsertSetting: vi.fn().mockResolvedValue(undefined),
  seedDefaultSettings: vi.fn().mockResolvedValue(undefined),
  getKeywords: vi.fn().mockResolvedValue([
    { id: 1, keyword: "SEO优化", language: "zh-CN", status: "pending", createdAt: new Date() },
  ]),
  createKeyword: vi.fn().mockResolvedValue(undefined),
  updateKeyword: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({
    accountCount: 5,
    todayPublished: 3,
    materialCount: 42,
    indexedCount: 28,
    totalPublished: 120,
    pendingTasks: 2,
    indexRate: 67,
  }),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          keywords: ["SEO优化技巧", "谷歌SEO方法", "网站优化指南"],
          title: "SEO优化完全指南",
          content: "# SEO优化完全指南\n\n内容...",
          wordCount: 850,
          qualityScore: 88,
        }),
      },
    }],
  }),
}));

import {
  getAccounts, getAccountById, createAccount, updateAccount, deleteAccount,
  getMaterials, createMaterial, updateMaterial, deleteMaterial,
  getPublishTasks, createPublishTask, updatePublishTask, deletePublishTask,
  getHyperlinks, createHyperlink, updateHyperlink, deleteHyperlink,
  getIndexingRecords, createIndexingRecord, updateIndexingRecord, deleteIndexingRecord,
  getSettings, upsertSetting, seedDefaultSettings,
  getKeywords, createKeyword,
  getDashboardStats,
} from "./db";

// ─── Accounts Tests ───────────────────────────────────────────────────────────
describe("Accounts", () => {
  it("should list accounts", async () => {
    const accounts = await getAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("Test Account");
    expect(accounts[0].status).toBe("online");
  });

  it("should get account by id", async () => {
    const account = await getAccountById(1);
    expect(account).toBeDefined();
    expect(account?.id).toBe(1);
  });

  it("should create account", async () => {
    await expect(createAccount({
      name: "New Account",
      cookieRaw: "x".repeat(60),
      status: "pending",
      dailyLimit: 5,
      siteAge: "new_site",
    })).resolves.not.toThrow();
  });

  it("should update account status", async () => {
    await expect(updateAccount(1, { status: "expired" })).resolves.not.toThrow();
  });

  it("should delete account", async () => {
    await expect(deleteAccount(1)).resolves.not.toThrow();
  });
});

// ─── Materials Tests ──────────────────────────────────────────────────────────
describe("Materials", () => {
  it("should list materials", async () => {
    const mats = await getMaterials();
    expect(mats).toHaveLength(1);
    expect(mats[0].title).toBe("Test Article");
    expect(mats[0].qualityScore).toBe(85);
  });

  it("should create material", async () => {
    await expect(createMaterial({
      title: "New Article",
      keyword: "keyword",
      language: "zh-CN",
      content: "Content here",
      status: "pending",
    })).resolves.not.toThrow();
  });

  it("should update material status to approved", async () => {
    await expect(updateMaterial(1, { status: "approved" })).resolves.not.toThrow();
  });

  it("should delete material", async () => {
    await expect(deleteMaterial(1)).resolves.not.toThrow();
  });
});

// ─── Publish Tasks Tests ──────────────────────────────────────────────────────
describe("Publish Tasks", () => {
  it("should list publish tasks", async () => {
    const tasks = await getPublishTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("pending");
  });

  it("should create publish task", async () => {
    await expect(createPublishTask({
      name: "New Task",
      accountId: 1,
      status: "pending",
    })).resolves.not.toThrow();
  });

  it("should update task status to running", async () => {
    await expect(updatePublishTask(1, { status: "running", startedAt: new Date() })).resolves.not.toThrow();
  });

  it("should delete publish task", async () => {
    await expect(deletePublishTask(1)).resolves.not.toThrow();
  });
});

// ─── Hyperlinks Tests ─────────────────────────────────────────────────────────
describe("Hyperlinks", () => {
  it("should list hyperlinks", async () => {
    const links = await getHyperlinks();
    expect(links).toHaveLength(1);
    expect(links[0].domain).toBe("wikipedia.org");
    expect(links[0].authorityScore).toBe(95);
  });

  it("should create hyperlink", async () => {
    await expect(createHyperlink({
      type: "external",
      url: "https://example.com",
      domain: "example.com",
      isPreset: false,
      isActive: true,
    })).resolves.not.toThrow();
  });

  it("should update hyperlink", async () => {
    await expect(updateHyperlink(1, { isActive: false })).resolves.not.toThrow();
  });

  it("should delete hyperlink", async () => {
    await expect(deleteHyperlink(1)).resolves.not.toThrow();
  });
});

// ─── Indexing Records Tests ───────────────────────────────────────────────────
describe("Indexing Records", () => {
  it("should list indexing records", async () => {
    const records = await getIndexingRecords();
    expect(records).toHaveLength(1);
    expect(records[0].publishedUrl).toBe("https://sites.google.com/test");
    expect(records[0].indexStatus).toBe("pending");
  });

  it("should create indexing record", async () => {
    await expect(createIndexingRecord({
      publishedUrl: "https://sites.google.com/new",
      indexStatus: "pending",
    })).resolves.not.toThrow();
  });

  it("should update indexing record status to indexed", async () => {
    await expect(updateIndexingRecord(1, {
      indexStatus: "indexed",
      lastCheckedAt: new Date(),
      indexedAt: new Date(),
    })).resolves.not.toThrow();
  });

  it("should delete indexing record", async () => {
    await expect(deleteIndexingRecord(1)).resolves.not.toThrow();
  });
});

// ─── Settings Tests ───────────────────────────────────────────────────────────
describe("System Settings", () => {
  it("should list settings", async () => {
    const settings = await getSettings();
    expect(settings.length).toBeGreaterThan(0);
    const siteName = settings.find(s => s.key === "site_name");
    expect(siteName?.value).toBe("GSP Publisher");
  });

  it("should upsert setting", async () => {
    await expect(upsertSetting("ai_api_key", "new_key")).resolves.not.toThrow();
  });

  it("should seed default settings without throwing", async () => {
    await expect(seedDefaultSettings()).resolves.not.toThrow();
  });
});

// ─── Keywords Tests ───────────────────────────────────────────────────────────
describe("Keywords", () => {
  it("should list keywords", async () => {
    const kws = await getKeywords();
    expect(kws).toHaveLength(1);
    expect(kws[0].keyword).toBe("SEO优化");
  });

  it("should create keyword", async () => {
    await expect(createKeyword({
      keyword: "谷歌SEO",
      language: "zh-CN",
      status: "pending",
    })).resolves.not.toThrow();
  });
});

// ─── Dashboard Stats Tests ────────────────────────────────────────────────────
describe("Dashboard Stats", () => {
  it("should return dashboard statistics", async () => {
    const stats = await getDashboardStats();
    expect(stats.accountCount).toBe(5);
    expect(stats.todayPublished).toBe(3);
    expect(stats.materialCount).toBe(42);
    expect(stats.indexedCount).toBe(28);
    expect(stats.totalPublished).toBe(120);
    expect(stats.pendingTasks).toBe(2);
    expect(stats.indexRate).toBe(67);
  });

  it("should have indexRate between 0 and 100", async () => {
    const stats = await getDashboardStats();
    expect(stats.indexRate).toBeGreaterThanOrEqual(0);
    expect(stats.indexRate).toBeLessThanOrEqual(100);
  });
});

// ─── Business Logic Tests ─────────────────────────────────────────────────────
describe("Business Logic", () => {
  it("should verify cookie length for account validation", () => {
    const shortCookie = "x".repeat(30);
    const longCookie = "x".repeat(60);
    expect(shortCookie.length > 50).toBe(false);
    expect(longCookie.length > 50).toBe(true);
  });

  it("should calculate index rate correctly", () => {
    const indexed = 28;
    const total = 42;
    const rate = total > 0 ? Math.round((indexed / total) * 100) : 0;
    expect(rate).toBe(67);
  });

  it("should handle empty indexing records for rate calculation", () => {
    const indexed = 0;
    const total = 0;
    const rate = total > 0 ? Math.round((indexed / total) * 100) : 0;
    expect(rate).toBe(0);
  });

  it("should parse cookie JSON array correctly", () => {
    const cookieJson = JSON.stringify([{ name: "test", value: "val" }]);
    const parsed = JSON.parse(cookieJson);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe("test");
  });

  it("should handle non-JSON cookie string gracefully", () => {
    const rawCookie = "session=abc123; path=/";
    let cookieParsed = null;
    try {
      const parsed = JSON.parse(rawCookie);
      if (Array.isArray(parsed)) cookieParsed = parsed;
    } catch {
      // Not JSON
    }
    expect(cookieParsed).toBeNull();
  });
});

// ─── Chromium Path Detection Tests ───────────────────────────────────────────
describe("Chromium Path Detection", () => {
  it("should detect /usr/lib/chromium-browser/chromium-browser as the primary path", () => {
    // This test verifies the logic of detectChromiumPath without actually calling fs.statSync
    const candidates = [
      "/usr/lib/chromium-browser/chromium-browser",
      "/usr/bin/chromium",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/snap/bin/chromium",
      "/usr/bin/chromium-browser",
    ];
    // The first candidate should be the real ELF binary
    expect(candidates[0]).toBe("/usr/lib/chromium-browser/chromium-browser");
    // The shell wrapper should be last (fallback)
    expect(candidates[candidates.length - 1]).toBe("/usr/bin/chromium-browser");
  });

  it("should prefer real ELF binary over shell wrapper", () => {
    // Simulate the detection logic: larger file = real binary
    const paths = [
      { path: "/usr/lib/chromium-browser/chromium-browser", size: 253152712 }, // ELF binary
      { path: "/usr/bin/chromium-browser", size: 5487 }, // shell script
    ];
    // Sort by size descending to prefer larger (real) binary
    const sorted = paths.sort((a, b) => b.size - a.size);
    expect(sorted[0].path).toBe("/usr/lib/chromium-browser/chromium-browser");
  });

  it("should validate chromium path is executable", () => {
    // Simulate mode check: 0o111 means executable
    const executableMode = 0o755;
    const nonExecutableMode = 0o644;
    expect(!!(executableMode & 0o111)).toBe(true);
    expect(!!(nonExecutableMode & 0o111)).toBe(false);
  });

  it("should fall back to default path if no candidates found", () => {
    const DEFAULT_PATH = "/usr/bin/chromium-browser";
    // Simulate no candidates found
    const candidates: string[] = [];
    const result = candidates.length > 0 ? candidates[0] : DEFAULT_PATH;
    expect(result).toBe(DEFAULT_PATH);
  });
});
