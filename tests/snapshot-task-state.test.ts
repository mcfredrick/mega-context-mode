import { describe, it, expect } from "vitest";
import { renderTaskState, type StoredEvent } from "../src/session/snapshot.js";

function makeTaskEvent(data: string): StoredEvent {
  return { type: "task", category: "task", data, priority: 1 };
}

describe("renderTaskState — task completion filtering", () => {
  it("returns empty for no events", () => {
    expect(renderTaskState([])).toBe("");
  });

  it("renders pending tasks (no updates)", () => {
    const events = [
      makeTaskEvent(JSON.stringify({ subject: "Fix auth bug" })),
      makeTaskEvent(JSON.stringify({ subject: "Add tests" })),
    ];
    const result = renderTaskState(events);
    expect(result).toContain("Fix auth bug");
    expect(result).toContain("Add tests");
    expect(result).toContain("<task_state>");
  });

  it("filters out completed tasks", () => {
    const events = [
      makeTaskEvent(JSON.stringify({ subject: "Fix auth bug" })),
      makeTaskEvent(JSON.stringify({ subject: "Add tests" })),
      makeTaskEvent(JSON.stringify({ taskId: "1", status: "completed" })),
      makeTaskEvent(JSON.stringify({ taskId: "2", status: "completed" })),
    ];
    const result = renderTaskState(events);
    expect(result).toBe("");
  });

  it("keeps in-progress tasks, filters completed", () => {
    const events = [
      makeTaskEvent(JSON.stringify({ subject: "Fix auth bug" })),
      makeTaskEvent(JSON.stringify({ subject: "Add tests" })),
      makeTaskEvent(JSON.stringify({ subject: "Update docs" })),
      makeTaskEvent(JSON.stringify({ taskId: "1", status: "completed" })),
      makeTaskEvent(JSON.stringify({ taskId: "2", status: "in_progress" })),
    ];
    const result = renderTaskState(events);
    expect(result).not.toContain("Fix auth bug");
    expect(result).toContain("Add tests");
    expect(result).toContain("Update docs");
  });

  it("handles mixed create/update event order", () => {
    const events = [
      makeTaskEvent(JSON.stringify({ subject: "Task A" })),
      makeTaskEvent(JSON.stringify({ taskId: "1", status: "in_progress" })),
      makeTaskEvent(JSON.stringify({ subject: "Task B" })),
      makeTaskEvent(JSON.stringify({ taskId: "1", status: "completed" })),
      makeTaskEvent(JSON.stringify({ taskId: "2", status: "in_progress" })),
    ];
    const result = renderTaskState(events);
    expect(result).not.toContain("Task A");
    expect(result).toContain("Task B");
  });

  it("uses last status when task is updated multiple times", () => {
    const events = [
      makeTaskEvent(JSON.stringify({ subject: "Deploy fix" })),
      makeTaskEvent(JSON.stringify({ taskId: "1", status: "in_progress" })),
      makeTaskEvent(JSON.stringify({ taskId: "1", status: "completed" })),
    ];
    const result = renderTaskState(events);
    expect(result).toBe("");
  });

  it("handles non-JSON task data gracefully", () => {
    const events = [
      makeTaskEvent("some plain text task"),
      makeTaskEvent(JSON.stringify({ subject: "Real task" })),
    ];
    const result = renderTaskState(events);
    expect(result).toContain("Real task");
  });

  it("renders only creates with no matching updates as pending", () => {
    const events = [
      makeTaskEvent(JSON.stringify({ subject: "Task 1" })),
      makeTaskEvent(JSON.stringify({ subject: "Task 2" })),
      makeTaskEvent(JSON.stringify({ subject: "Task 3" })),
    ];
    const result = renderTaskState(events);
    expect(result).toContain("Task 1");
    expect(result).toContain("Task 2");
    expect(result).toContain("Task 3");
  });
});
