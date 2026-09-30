import { describe, expect, it } from "vitest";
import { attachmentsByRole, helpAttachmentKey, parseHelpReport, parseTriage, routeHelp, statusAfterReporterReply } from "@/lib/help-report";

const ID = "3f2c8a10-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("helpAttachmentKey", () => {
  it("keys an attachment under the report's private prefix", () => {
    expect(helpAttachmentKey(ID, 0, "image/jpeg")).toBe(`Help/${ID}/0.jpg`);
    expect(helpAttachmentKey(ID, 1, "audio/mp4")).toBe(`Help/${ID}/1.m4a`);
    expect(helpAttachmentKey(ID, 2, "audio/webm;codecs=opus")).toBe(`Help/${ID}/2.webm`);
  });
  it("refuses a bad id, too many attachments, or a file that is not a photo or voice note", () => {
    expect(helpAttachmentKey("x", 0, "image/jpeg")).toEqual({ error: expect.any(String) });
    expect(helpAttachmentKey(ID, 6, "image/jpeg")).toEqual({ error: expect.any(String) });
    expect(helpAttachmentKey(ID, 0, "application/pdf")).toEqual({ error: expect.any(String) });
  });
});

describe("parseHelpReport", () => {
  const base = { description: "Save button does nothing", page: "/field/work", attachments: ["screenshot", "photo"], photoKeys: [`Help/${ID}/0.jpg`, `Help/${ID}/1.jpg`] };
  it("accepts a report and splits its attachments by role", () => {
    const r = parseHelpReport(ID, base);
    if ("error" in r) throw new Error(r.error);
    expect(attachmentsByRole(r)).toEqual({ screenshotKey: `Help/${ID}/0.jpg`, voiceKey: null, photoKeys: [`Help/${ID}/1.jpg`] });
  });
  it("refuses keys that belong to another report", () => {
    expect(parseHelpReport(ID, { ...base, photoKeys: [`Help/other/0.jpg`, `Help/${ID}/1.jpg`] })).toEqual({ error: expect.any(String) });
  });
  it("needs something said — typed, or a voice note", () => {
    expect(parseHelpReport(ID, { ...base, description: " " })).toEqual({ error: expect.any(String) });
    const voice = parseHelpReport(ID, { description: "", page: "/field", attachments: ["voice"], photoKeys: [`Help/${ID}/0.m4a`] });
    expect("error" in voice).toBe(false);
  });
  it("refuses a report from outside the field app, and more than four photos", () => {
    expect(parseHelpReport(ID, { ...base, page: "/admin" })).toEqual({ error: expect.any(String) });
    const five = Array.from({ length: 5 }, (_, i) => `Help/${ID}/${i}.jpg`);
    expect(parseHelpReport(ID, { ...base, attachments: five.map(() => "photo"), photoKeys: five })).toEqual({ error: expect.any(String) });
  });
});

describe("parseTriage", () => {
  it("accepts a well-formed reading", () => {
    expect(parseTriage({ category: "blocker", title: "Water leakage in basement", reply: "Operations has been told.", transcript: "", answered: false })).toMatchObject({ category: "blocker", answered: false });
  });
  it("refuses an unknown category or an empty reply", () => {
    expect(parseTriage({ category: "urgent", reply: "x" })).toEqual({ error: expect.any(String) });
    expect(parseTriage({ category: "bug", reply: "" })).toEqual({ error: expect.any(String) });
  });
  it("only a question can count as answered", () => {
    expect(parseTriage({ category: "bug", reply: "x", answered: true })).toMatchObject({ answered: false });
  });
});

describe("routeHelp", () => {
  const base = { reporterId: "r", taskAssignerId: "boss", bugReceiverIds: ["dev"], operationsIds: ["ops1", "ops2"], answered: false };
  it("a blocker goes to whoever assigned the task, and operations", () => {
    expect(routeHelp({ ...base, category: "blocker" })).toEqual({ status: "open", notify: ["boss", "ops1", "ops2"] });
  });
  it("a blocker with no task goes to operations", () => {
    expect(routeHelp({ ...base, category: "blocker", taskAssignerId: null }).notify).toEqual(["ops1", "ops2"]);
  });
  it("a bug goes to the bug receivers, or operations when there are none", () => {
    expect(routeHelp({ ...base, category: "bug" }).notify).toEqual(["dev"]);
    expect(routeHelp({ ...base, category: "bug", bugReceiverIds: [] }).notify).toEqual(["ops1", "ops2"]);
  });
  it("an answered question notifies nobody; an unanswered one goes to operations", () => {
    expect(routeHelp({ ...base, category: "question", answered: true })).toEqual({ status: "answered", notify: [] });
    expect(routeHelp({ ...base, category: "question" }).status).toBe("open");
  });
  it("never notifies the reporter, and an unread report goes to operations", () => {
    expect(routeHelp({ ...base, category: "blocker", taskAssignerId: "r", operationsIds: ["r", "ops1"] }).notify).toEqual(["ops1"]);
    expect(routeHelp({ ...base, category: null })).toEqual({ status: "open", notify: ["ops1", "ops2"] });
  });
  it("a reply from the reporter reopens an answered or resolved report", () => {
    expect(statusAfterReporterReply("answered")).toBe("open");
    expect(statusAfterReporterReply("resolved")).toBe("open");
    expect(statusAfterReporterReply("in_progress")).toBe("in_progress");
  });
});
