import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Internal references (INV-02, CON-11, PER-04…) belong in comments and logs,
// never in text a person reads (2026-09-25, user-asked: "remove these from
// everywhere"). This walks every source file and checks only what can reach a
// screen or a printed page: JSX text and string literals, logger calls excluded.
const CODE = /\b(?:INV|CON|FEAT|GATE|ADR|CMP|FLOW|SCR|NFR|XS|CAP|ASSUM|SPIKE|TC|OQ|PER)-\d+/;

function files(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(tsx?|mts)$/.test(f)) out.push(full);
  }
  return out;
}

function inLoggerCall(node: ts.Node): boolean {
  for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (ts.isCallExpression(p)) return /^(logger|console)\./.test(p.expression.getText());
    if (ts.isBlock(p)) return false;
  }
  return false;
}

describe("no internal codes in user-facing text", () => {
  it("every JSX text and string literal in src/ is free of them", () => {
    const found: string[] = [];
    for (const file of files(join(__dirname, "..", "src"))) {
      const src = readFileSync(file, "utf8");
      if (!CODE.test(src)) continue;
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node) => {
        const text = ts.isJsxText(n) || ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n);
        const persona = !!n.parent && ts.isPropertyAssignment(n.parent) && n.parent.name.getText() === "persona";
        if (text && !persona && !inLoggerCall(n) && CODE.test(n.getText(sf)) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent)) {
          found.push(`${file.split("/src/")[1]}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(found).toEqual([]);
  });
});
