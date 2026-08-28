#!/usr/bin/env python3
"""Pull a demo report's daily reading tables out of the document itself.

No model in the loop: these tables are a Date row followed by a
Consumption row, and reading them with a parser means the figures a
benchmark rests on trace to the document rather than to one response
nobody can replay (INV-02).

Every block is checked against the average the report itself prints. A
block whose days do not reproduce that average is refused, not guessed
at — the document is the authority and disagreeing with it silently is
how a wrong number reaches a bill.

    python3 scripts/demo-readings.py <file> [--demo N] [--phase-year YYYY]
"""
from __future__ import annotations
import re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent

MONTHS = {m: i + 1 for i, m in enumerate(
    "jan feb mar apr may jun jul aug sep oct nov dec".split())}

# A date cell: 14/Dec, 24/04, 3/8, "29 Jan" — day first, always. Reports
# from different years use different separators; none of them writes the
# month first, which is what makes day-first safe to assume here.
DATE = re.compile(r"^(\d{1,2})\s*[/ ]\s*([A-Za-z]{3,9}|\d{1,2})$")
NUM = re.compile(r"^-?\d+(?:\.\d+)?$")
LABEL = re.compile(r"^(average|avg|total)$", re.I)


def text_of(path: Path) -> str:
    tool = "docx-text.py" if path.suffix.lower() == ".docx" else "pdf-text.py"
    out = subprocess.run([sys.executable, str(HERE / tool), str(path)],
                         capture_output=True, text=True, check=True)
    return out.stdout


def month_of(tok: str) -> int | None:
    if tok.isdigit():
        m = int(tok)
        return m if 1 <= m <= 12 else None
    return MONTHS.get(tok[:3].lower())


HEADER_DATE = re.compile(
    r"Date:\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})", re.I)


def header_date(text: str):
    """The report's own date, used only when a table's prose omits the year."""
    m = HEADER_DATE.search(text)
    return (month_of(m.group(2)), int(m.group(3))) if m else (None, None)


def parse(text: str):
    """Yield {demo, phase, days: [(month, day, kwh)], stated} per block."""
    lines = [re.sub(r"<[^>]+>", " ", ln).strip() for ln in text.splitlines()]
    lines = [re.sub(r"\s+", " ", ln) for ln in lines]

    demo, phase, year = 1, None, None
    explicit_demo = False
    emitted = False
    i = 0
    while i < len(lines):
        ln = lines[i]

        m = re.search(r"\bDemo\s*-?\s*(\d)\b", ln)
        if m:
            demo = int(m.group(1))
            explicit_demo = True
        elif HEADER_DATE.search(ln) and emitted and not explicit_demo:
            # Amrapali Princely Estate's file is two reports and a combined
            # summary in one document, 40 lights then 100, with no marker
            # anywhere but the second letterhead.
            demo += 1
            phase = None

        if re.search(r"pre[- ]?installation|before installation", ln, re.I):
            phase = "pre"
            y = re.search(r"(20\d{2})", ln)
            if y:
                year = int(y.group(1))
        elif re.search(r"after installation|post[- ]?installation", ln, re.I):
            phase = "post"

        # A "Date" row opens a block. ATS Greens Paradiso's report heads its
        # before table "Average daily energy consumption over five days is
        # 18.71 kWh" and names no phase at all, so a table reached before the
        # after-installation heading is a before table — which is what every
        # one of these reports means by putting it first.
        if re.fullmatch(r"date", ln, re.I) and phase is None:
            phase = "pre"
        if re.fullmatch(r"date", ln, re.I) and phase:
            i += 1
            cells: list[str] = []
            while i < len(lines) and (DATE.match(lines[i]) or LABEL.match(lines[i])):
                cells.append(lines[i]); i += 1
            # The next non-empty line names the value row; skip it.
            while i < len(lines) and not lines[i]:
                i += 1
            if i < len(lines) and re.search(r"consumption", lines[i], re.I):
                i += 1
            vals: list[str] = []
            while i < len(lines) and len(vals) < len(cells):
                if NUM.match(lines[i]):
                    vals.append(lines[i])
                elif lines[i]:
                    break
                i += 1
            if len(vals) == len(cells) and cells:
                days, stated = [], None
                for cell, val in zip(cells, vals):
                    if LABEL.match(cell):
                        stated = float(val)
                        continue
                    d, mo = DATE.match(cell).groups()
                    mon = month_of(mo)
                    if mon is None:
                        raise SystemExit(f"unreadable month in {cell!r}")
                    days.append((mon, int(d), float(val)))
                if days:
                    emitted = True
                    yield {"demo": demo, "phase": phase, "days": days,
                           "stated": stated, "year": year}
            continue
        i += 1


def merge_split_tables(blocks):
    """A wide table is printed as two stacked halves; it is still one table.

    Aditya Urban Casa's lift lobby prints 15 pre-install days as 8 then 7,
    and only the second half carries the Average cell — so read apart, the
    first half has nothing to check against and the second disagrees with
    the report. Merged, the 15 days reproduce the printed 1.81 exactly.
    """
    out = []
    for b in blocks:
        prev = out[-1] if out else None
        same = prev and prev["demo"] == b["demo"] and prev["phase"] == b["phase"]
        # Either half may hold the Average cell: Urban Casa's lift lobby puts
        # it in the second, Amrapali Princely Estate's second demo in the
        # first. A half with no average of its own is a continuation.
        if same and (prev["stated"] is None or b["stated"] is None):
            prev["days"].extend(b["days"])
            if prev["stated"] is None:
                prev["stated"] = b["stated"]
            continue
        out.append(b)
    return out


def resolve_years(blocks, fallback=(None, None)):
    """The tables print day and month; the year is in the prose above.

    Some reports state it in the range they quote ("14-19 Dec 2025"); others
    only in the letterhead date. Falling back to the letterhead means
    allowing that the report is written after the readings it describes, so
    a report dated January about December's demo belongs to the year before.
    """
    base = next((b["year"] for b in blocks if b["year"]), None)
    first_month = blocks[0]["days"][0][0]
    if base is None:
        head_month, head_year = fallback
        if head_year is None:
            raise SystemExit("no year in the report's prose or its letterhead")
        base = head_year - 1 if head_month and first_month > head_month else head_year
    for b in blocks:
        # A demo that runs across new year: the month goes backwards.
        b["resolved"] = base + (1 if b["days"][0][0] < first_month else 0)
    return blocks


def main() -> None:
    args = sys.argv[1:]
    path = Path(args[0]).expanduser()
    opt = {}
    for j, a in enumerate(args):
        if a.startswith("--") and j + 1 < len(args) and not args[j + 1].startswith("--"):
            opt[a] = args[j + 1]
    text = text_of(path)
    blocks = resolve_years(merge_split_tables(list(parse(text))), header_date(text))
    if not blocks:
        raise SystemExit(f"no reading tables found in {path.name}")

    rows = []
    bad = []
    for b in blocks:
        mean = sum(d[2] for d in b["days"]) / len(b["days"])
        ok = b["stated"] is None or abs(mean - b["stated"]) < 0.0101
        first, last = b["days"][0], b["days"][-1]
        if not ok:
            bad.append(f"demo {b['demo']} {b['phase']}: its own days average "
                       f"{mean:.4f} but the report prints {b['stated']}")
        print(f"demo {b['demo']} {b['phase']:4} {len(b['days']):3} days "
              f"{b['resolved']}-{first[0]:02d}-{first[1]:02d}..{last[0]:02d}-{last[1]:02d} "
              f"mean {mean:.4f} stated {b['stated']} {'OK' if ok else '*** DISAGREES ***'}",
              file=sys.stderr)
        for mo, d, kwh in b["days"]:
            rows.append((b["demo"], b["phase"], f"{b['resolved']}-{mo:02d}-{d:02d}", kwh))

    if "--csv" in args:
        society = opt.get("--society", "")
        circuit = opt.get("--circuit", "")
        for demo, phase, iso, kwh in rows:
            print(f"{society},{circuit},{demo},{phase},{iso},{kwh}")
    for b in bad:
        print(f"  ! {path.name}: {b}", file=sys.stderr)


if __name__ == "__main__":
    main()
