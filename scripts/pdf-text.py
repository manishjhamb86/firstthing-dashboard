#!/usr/bin/env python3
"""
Minimal PDF text extraction, for the one-time backfill.

Only handles what these documents actually are: uncompressed or
FlateDecode content streams with ordinary text operators. That covers the
savings reports and the invoices, which are generated from Word and Excel.
It does NOT handle scanned pages — the agreements have no fonts at all, only
images, and those go through the model instead.

Written rather than installed because pdftotext is not on this machine and
adding it needs a sudo the job does not otherwise require.
"""
import base64, re, sys, zlib

def streams(data: bytes):
    """
    Every stream, decoded as far as it can be.

    Filters are chained and vary by producer: Zoho's invoices are plain
    FlateDecode, while the ones from xhtml2pdf are ASCII85 first and then
    Flate. Applying 85 before inflating costs nothing when it does not apply
    and is the difference between text and line noise when it does.
    """
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end < 0:
            continue
        raw = data[start:end].rstrip(b"\r\n")
        body = raw.strip()
        # The end-of-data marker is what identifies ASCII85 here. xhtml2pdf
        # writes the trailing "~>" without the leading "<~", so keying off the
        # start of the stream misses it entirely.
        if body.endswith(b"~>"):
            try:
                raw = base64.a85decode(
                    body[2:-2] if body.startswith(b"<~") else body[:-2],
                    adobe=False,
                    ignorechars=b" \t\r\n\v\f",
                )
            except Exception:
                pass
        try:
            yield zlib.decompress(raw)
        except zlib.error:
            yield raw            # already plain, or a filter we do not handle

def unescape(s: bytes) -> str:
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == 0x5C and i + 1 < len(s):        # backslash
            nxt = s[i + 1 : i + 2]
            mapped = {b"n": "\n", b"r": "\r", b"t": "\t", b"b": "", b"f": "",
                      b"(": "(", b")": ")", b"\\": "\\"}.get(nxt)
            if mapped is not None:
                out.append(mapped); i += 2; continue
            oct_ = re.match(rb"[0-7]{1,3}", s[i + 1 :])
            if oct_:
                out.append(chr(int(oct_.group(), 8))); i += 1 + len(oct_.group()); continue
            i += 1; continue
        out.append(chr(c)); i += 1
    return "".join(out)

def to_unicode(data: bytes) -> dict:
    """
    Glyph code -> character, from the fonts' own ToUnicode CMaps.

    These files use subset fonts whose codes are not ASCII — "Crafted" comes
    out as "&UDIWHG" if the codes are read literally. The CMap is how the
    document itself says what each code means, so it is read rather than an
    offset guessed at. Maps from every font are merged: a subset's codes are
    assigned in order of first use, so two fonts in one document generally
    agree, and where they do not the first wins rather than the last.
    """
    cmap = {}
    for s in streams(data):
        if b"beginbfchar" not in s and b"beginbfrange" not in s:
            continue
        for block in re.findall(rb"beginbfchar(.*?)endbfchar", s, re.S):
            for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
                cmap.setdefault(int(src, 16), chr(int(dst[:4], 16)))
        for block in re.findall(rb"beginbfrange(.*?)endbfrange", s, re.S):
            for lo, hi, dst in re.findall(
                rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
                base = int(dst[:4], 16)
                for i in range(int(lo, 16), int(hi, 16) + 1):
                    cmap.setdefault(i, chr(base + i - int(lo, 16)))
    return cmap


def decode(raw: str, cmap: dict) -> str:
    """Two-byte glyph codes through the CMap; plain bytes when there is none."""
    if not cmap:
        return raw
    b = raw.encode("latin-1", "replace")
    if len(b) % 2:
        b += b"\x00"
    return "".join(cmap.get(int.from_bytes(b[i : i + 2], "big"), "") for i in range(0, len(b), 2))


def text_of(content: bytes) -> str:
    lines = []
    # Tj / ' / " show one string; TJ shows an array of strings and kerns.
    for m in re.finditer(rb"\[((?:[^\[\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|\")", content, re.S):
        if m.group(1) is not None:
            parts = re.findall(rb"\(((?:[^()\\]|\\.)*)\)", m.group(1), re.S)
            lines.append("".join(unescape(p) for p in parts))
        else:
            lines.append(unescape(m.group(2)))
    return lines

def extract(path: str) -> str:
    data = open(path, "rb").read()
    cmap = to_unicode(data)
    out = []
    for s in streams(data):
        if b"TJ" not in s and b"Tj" not in s:
            continue
        out.extend(decode(line, cmap) for line in text_of(s))
    return "\n".join(l for l in out if l.strip())

if __name__ == "__main__":
    print(extract(sys.argv[1]))
