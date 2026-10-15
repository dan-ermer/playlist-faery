import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { Crown } from "@/app/_components/crown";
import { postForToken } from "@/lib/approval";
import { getCatalogEntry } from "@/lib/catalog";
import { idHash, magicWord } from "@/lib/magic";
import { PLATFORM_NAMES } from "@/lib/sources";

// A picture of one playlist in the catalog's arcade style, for Dan to post on
// Instagram by hand (Instagram feed posts need an image, and it has no
// pre-filled compose link). "feed" is square; "story" is tall, with room at
// the bottom for the link sticker Dan adds in Instagram.
// Reached with the post's approval token, like the share kit.

const SIZES = { feed: { width: 1080, height: 1080 }, story: { width: 1080, height: 1920 } } as const;
type Format = keyof typeof SIZES;

const INK = "#111";
const TILE_COLORS = ["#ff4fb8", "#9be22d", "#6fd3ff", "#b48cff"];

// The catalog's polka dots (pink and sky, offset). An SVG tile, because the
// image renderer draws radial-gradient dots too small.
const DOTS =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><circle cx="18" cy="18" r="5" fill="#ff4fb8"/><circle cx="54" cy="54" r="5" fill="#6fd3ff"/></svg>',
  );

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

export async function GET(_req: Request, { params }: RouteContext<"/share/[token]/card/[format]">) {
  const { token, format } = await params;
  if (!(format in SIZES)) return new Response("Unknown format", { status: 404 });
  const found = await postForToken(token);
  const entry = found && (await getCatalogEntry(found.id));
  if (!entry) return new Response("No playlist yet", { status: 404 });

  const story = (format as Format) === "story";
  const where = PLATFORM_NAMES[entry.platform ?? ""];
  const credit = entry.handle ? `wished upon @${entry.handle}${where ? ` from ${where}` : ""}` : "wished upon a post";
  const shown = entry.artists.slice(0, story ? 10 : 6);
  const more = entry.artists.length - shown.length;
  const artists = shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
  const titleSize = entry.title.length <= 18 ? 76 : entry.title.length <= 36 ? 62 : 48;

  const [bungee, shade, chewy] = await Promise.all([
    font("Bungee-Regular.ttf"),
    font("BungeeShade-Regular.ttf"),
    font("Chewy-Regular.ttf"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: story ? "150px 80px 120px" : "64px 72px",
          gap: story ? 70 : 46,
          backgroundColor: "#eaffc9",
          backgroundImage: `url("${DOTS}")`,
          backgroundSize: "72px 72px",
          backgroundRepeat: "repeat",
          fontFamily: "Chewy",
          color: INK,
        }}
      >
        {/* Wordmark banner with the crown hanging off its left edge */}
        <div
          style={{
            display: "flex",
            position: "relative",
            alignItems: "center",
            background: "#ff4fb8",
            border: `6px solid ${INK}`,
            boxShadow: `14px 14px 0 ${INK}`,
            padding: "26px 30px 26px 220px",
            transform: "rotate(-2deg)",
            fontFamily: "Bungee Shade",
            fontSize: 74,
            lineHeight: 1,
          }}
        >
          <div style={{ display: "flex", position: "absolute", left: 20, top: -40, transform: "rotate(-10deg)" }}>
            <Crown width={190} />
          </div>
          PLAYLIST FAERY
        </div>

        {/* The playlist tile */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            flexGrow: story ? 0 : 1,
            gap: story ? 40 : 28,
            background: TILE_COLORS[idHash(entry.id) % TILE_COLORS.length],
            border: `6px solid ${INK}`,
            boxShadow: `16px 16px 0 ${INK}`,
            padding: story ? "70px 56px 56px" : "52px 50px 44px",
          }}
        >
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: -34,
              right: -18,
              background: "#ffe14d",
              border: `5px solid ${INK}`,
              borderRadius: 999,
              padding: "4px 26px",
              fontSize: 46,
              boxShadow: `5px 5px 0 ${INK}`,
              transform: "rotate(6deg)",
            }}
          >
            {/* Chewy has no ★ or ✦, so the image drops them */}
            {magicWord(entry.id).replace(/^[★✦]\s*/, "")}
          </div>
          <div style={{ display: "flex", fontFamily: "Bungee", fontSize: story ? titleSize + 8 : titleSize, lineHeight: 1.12, paddingRight: 70 }}>
            {entry.title}
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: "#fff", border: `4px solid ${INK}`, padding: "6px 16px", fontSize: 38 }}>
              {credit}
            </div>
          </div>
          <div style={{ display: "flex", flexGrow: 1, fontSize: story ? 50 : 42, lineHeight: 1.3 }}>{artists}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", background: INK, color: "#fff", fontFamily: "Bungee", fontSize: 34, padding: "8px 16px" }}>
              {entry.trackCount} {entry.trackCount === 1 ? "TRACK" : "TRACKS"}
            </div>
            <div style={{ display: "flex", fontFamily: "Bungee", fontSize: 34 }}>ON SPOTIFY</div>
          </div>
        </div>

        {/* Story: space for Instagram's link sticker. Feed: the site, where every playlist lives. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: story ? "flex-start" : "center",
            flexGrow: story ? 1 : 0,
            gap: 20,
            fontSize: story ? 56 : 40,
          }}
        >
          {story ? (
            <div style={{ display: "flex", background: "#fff", border: `5px solid ${INK}`, boxShadow: `8px 8px 0 ${INK}`, padding: "10px 30px", transform: "rotate(-2deg)" }}>
              Tap the link to listen!
            </div>
          ) : (
            <div style={{ display: "flex", fontFamily: "Bungee", fontSize: 36 }}>playlistfaery.com</div>
          )}
        </div>
        {story && <div style={{ display: "flex", justifyContent: "center", fontFamily: "Bungee", fontSize: 36 }}>playlistfaery.com</div>}
      </div>
    ),
    {
      ...SIZES[format as Format],
      fonts: [
        { name: "Bungee", data: bungee, weight: 400, style: "normal" },
        { name: "Bungee Shade", data: shade, weight: 400, style: "normal" },
        { name: "Chewy", data: chewy, weight: 400, style: "normal" },
      ],
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="playlist-faery-${format}.png"`,
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
