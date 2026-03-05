import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSessionDirective, writeSessionEventsFile, groupEvents } from "../hooks/session-directive.mjs";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeEvent(category, data, type = category) {
  return { type, category, data, priority: 1, created_at: new Date().toISOString() };
}

describe("buildSessionDirective — task completion filtering", () => {
  it("excludes completed tasks from session guide", () => {
    const events = [
      makeEvent("prompt", "Fix the auth bug"),
      makeEvent("task", JSON.stringify({ subject: "Fix auth bug" })),
      makeEvent("task", JSON.stringify({ subject: "Add tests" })),
      makeEvent("task", JSON.stringify({ taskId: "1", status: "completed" })),
      makeEvent("task", JSON.stringify({ taskId: "2", status: "completed" })),
    ];
    const { grouped, lastPrompt, fileNames } = groupEvents(events);
    const result = buildSessionDirective("compact", { grouped, lastPrompt, fileNames });

    expect(result).not.toContain("## Pending Tasks");
    expect(result).not.toContain("Fix auth bug");
    expect(result).not.toContain("Add tests");
  });

  it("shows only pending/in-progress tasks", () => {
    const events = [
      makeEvent("task", JSON.stringify({ subject: "Task A" })),
      makeEvent("task", JSON.stringify({ subject: "Task B" })),
      makeEvent("task", JSON.stringify({ subject: "Task C" })),
      makeEvent("task", JSON.stringify({ taskId: "1", status: "completed" })),
      makeEvent("task", JSON.stringify({ taskId: "2", status: "in_progress" })),
    ];
    const { grouped, lastPrompt, fileNames } = groupEvents(events);
    const result = buildSessionDirective("compact", { grouped, lastPrompt, fileNames });

    expect(result).toContain("## Pending Tasks");
    expect(result).not.toContain("Task A");
    expect(result).toContain("Task B");
    expect(result).toContain("Task C");
  });

  it("uses heading 'Pending Tasks' not 'Tasks'", () => {
    const events = [
      makeEvent("task", JSON.stringify({ subject: "Incomplete task" })),
    ];
    const { grouped, lastPrompt, fileNames } = groupEvents(events);
    const result = buildSessionDirective("compact", { grouped, lastPrompt, fileNames });

    expect(result).toContain("## Pending Tasks");
    expect(result).not.toMatch(/## Tasks\n/);
  });

  it("handles all tasks completed — no task section", () => {
    const events = [
      makeEvent("task", JSON.stringify({ subject: "Done task" })),
      makeEvent("task", JSON.stringify({ taskId: "1", status: "completed" })),
    ];
    const { grouped, lastPrompt, fileNames } = groupEvents(events);
    const result = buildSessionDirective("compact", { grouped, lastPrompt, fileNames });

    expect(result).not.toContain("Pending Tasks");
    expect(result).not.toContain("Done task");
  });
});

describe("writeSessionEventsFile — status-aware task sections", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("splits tasks into In Progress and Completed sections", () => {
    const events = [
      makeEvent("task", JSON.stringify({ subject: "Pending task" })),
      makeEvent("task", JSON.stringify({ subject: "Done task" })),
      makeEvent("task", JSON.stringify({ taskId: "1", status: "in_progress" })),
      makeEvent("task", JSON.stringify({ taskId: "2", status: "completed" })),
    ];
    const eventsPath = join(tmpDir, "events.md");
    writeSessionEventsFile(events, eventsPath);
    const content = readFileSync(eventsPath, "utf-8");

    expect(content).toContain("## Tasks In Progress");
    expect(content).toContain("- Pending task");
    expect(content).toContain("## Tasks Completed");
    expect(content).toContain("- Done task");
  });

  it("only shows In Progress section when no tasks completed", () => {
    const events = [
      makeEvent("task", JSON.stringify({ subject: "Task A" })),
      makeEvent("task", JSON.stringify({ subject: "Task B" })),
    ];
    const eventsPath = join(tmpDir, "events.md");
    writeSessionEventsFile(events, eventsPath);
    const content = readFileSync(eventsPath, "utf-8");

    expect(content).toContain("## Tasks In Progress");
    expect(content).not.toContain("## Tasks Completed");
  });

  it("only shows Completed section when all tasks done", () => {
    const events = [
      makeEvent("task", JSON.stringify({ subject: "Task A" })),
      makeEvent("task", JSON.stringify({ taskId: "1", status: "completed" })),
    ];
    const eventsPath = join(tmpDir, "events.md");
    writeSessionEventsFile(events, eventsPath);
    const content = readFileSync(eventsPath, "utf-8");

    expect(content).not.toContain("## Tasks In Progress");
    expect(content).toContain("## Tasks Completed");
    expect(content).toContain("- Task A");
  });
});
