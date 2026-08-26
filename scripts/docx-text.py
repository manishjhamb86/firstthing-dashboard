#!/usr/bin/env python3
"""
Text out of a .docx, for the one-time backfill.

A .docx is a ZIP of XML, so this needs no library and no model: paragraphs
are <w:p>, runs are <w:t>, and table cells are just paragraphs inside
<w:tc>. Tabs and cell boundaries become tabs so a printed table survives as
something columnar rather than a run-on line.
"""
import re, sys, zipfile

def text(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        parts = [n for n in z.namelist()
                 if re.fullmatch(r"word/(document|header\d*|footer\d*)\.xml", n)]
        out = []
        for name in sorted(parts):
            xml = z.read(name).decode("utf-8", "replace")
            for para in re.findall(r"<w:p[ >].*?</w:p>|<w:p/>", xml, re.S):
                # Walk the runs in document order so a tab between two text
                # runs lands between them. Matching them separately loses the
                # ordering and leaks the markup of whichever did not match.
                line = "".join(
                    m.group(1) if m.group(1) is not None else "\t"
                    for m in re.finditer(r"<w:t[^>]*>(.*?)</w:t>|<w:tab\s*/>", para, re.S)
                )
                line = (line.replace("&amp;", "&").replace("&lt;", "<")
                            .replace("&gt;", ">").replace("&quot;", '"')
                            .replace("&apos;", "'"))
                if line.strip():
                    out.append(line)
        return "\n".join(out)

if __name__ == "__main__":
    print(text(sys.argv[1]))
