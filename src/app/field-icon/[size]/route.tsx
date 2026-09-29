import { ImageResponse } from "next/og";

// The field app's home-screen icon, drawn from the approved FT monogram
// (src/app/icon.svg, docs/product/brand/). Chrome's install criteria want PNGs
// at 192 and 512; generating them here keeps one source for the mark rather
// than a set of exported files that drift from it.
//
// Deliberately NOT under /field: the manifest's icons are fetched by the
// browser without the session, and /field is behind sign-in.

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 36 36 L 36 67 M 36 36 L 67 36 M 36 52 L 53 52" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M 60 36 L 60 67 M 60 28 L 60 36" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" fill="none"/>
  <circle cx="60" cy="23" r="8.5" fill="#B8E23F"/>
</svg>`;

const TILE = "#2E9E68";
const SIZES = new Set([192, 512]);

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });

  // "any" is the rounded tile exactly as the favicon draws it. "maskable" is
  // full-bleed — Android crops it to its own shape — with the mark kept inside
  // the central safe zone.
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const src = `data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`;
  const markSize = Math.round(size * (maskable ? 0.72 : 0.88));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? TILE : "transparent",
        }}
      >
        <div
          style={{
            width: maskable ? size : Math.round(size * 0.88),
            height: maskable ? size : Math.round(size * 0.88),
            borderRadius: maskable ? 0 : Math.round(size * 0.2),
            background: TILE,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered by ImageResponse, not the browser */}
          <img src={src} width={markSize} height={markSize} alt="" />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
