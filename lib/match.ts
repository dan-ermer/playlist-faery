import "server-only";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claude, FALLBACK_OPTIONS, MODEL } from "@/lib/claude";
import { PermanentError } from "@/lib/errors";
import { albumTracks, filter, searchAlbums, searchTracks, type SpotifyTrack } from "@/lib/spotify";
import { runStep, type StepResult } from "@/lib/step";
import { supabaseAdmin } from "@/lib/supabase";

type Item = {
  id: string;
  position: number;
  raw_text: string;
  artist: string | null;
  title: string | null;
  album: string | null;
};

type Kind = "song" | "artist" | "album" | "playlist" | "unknown";

type Candidates = { item: Item; kind: Kind; tracks: SpotifyTrack[] };

function kindOf(item: Item, listType: string | null): Kind {
  if (listType === "playlist_link") return "playlist";
  if (item.title) return "song";
  if (item.album) return "album";
  if (item.artist) return "artist";
  return "unknown";
}

function dedupe(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => !seen.has(t.id) && seen.add(t.id));
}

// Spotify searches for one item. Code gathers candidates; Claude chooses.
async function gatherCandidates(item: Item, kind: Kind): Promise<SpotifyTrack[]> {
  const { artist, title, album } = item;
  switch (kind) {
    case "song": {
      const tracks = await searchTracks(filter.track(title!, artist));
      // Field filters are strict; a plain search catches typos and swapped artist/title.
      if (tracks.length < 3) tracks.push(...(await searchTracks([title, artist].filter(Boolean).join(" "))));
      return dedupe(tracks).slice(0, 10);
    }
    case "artist": {
      // Two pages of the artist's tracks, roughly in popularity order.
      const q = filter.artist(artist!);
      return dedupe([...(await searchTracks(q)), ...(await searchTracks(q, 10))]);
    }
    case "album": {
      let albums = await searchAlbums(filter.album(album!, artist));
      if (albums.length === 0) albums = await searchAlbums([album, artist].filter(Boolean).join(" "));
      // The top two versions (e.g. original and deluxe); Claude picks the track and version.
      const tracks: SpotifyTrack[] = [];
      for (const a of albums.slice(0, 2)) tracks.push(...(await albumTracks(a)));
      return dedupe(tracks);
    }
    default:
      return [];
  }
}

const Picks = z.object({
  picks: z.array(
    z.object({
      position: z.number().describe("The item's position number."),
      candidate: z.string().nullable().describe('Chosen candidate ref like "c4", or null if none fits.'),
      note: z
        .string()
        .nullable()
        .describe("Why nothing fits (when candidate is null), or a doubt worth flagging to Dan; else null."),
    }),
  ),
});

const SYSTEM = `You choose Spotify tracks for a playlist built from someone's social media post. For each numbered item you get what the poster wrote, how it was parsed, and candidate tracks found by Spotify search (each with a ref like "c4"). Choose exactly one candidate ref per item, or null if none fits.

Pick rules by item kind:
- song: the poster named a specific song. Choose that song by that artist, preferring the original studio recording. Avoid remixes, live versions, demos, karaoke, covers and "extended" versions unless the poster asked for one; remastered versions are fine. If the same recording appears on several releases, any is fine.
- artist: the poster named only an artist. Choose one track that represents them well but is a little unpredictable: a well-loved song, not necessarily their single biggest hit. Candidates are in rough popularity order, so the first few are their best-known; feel free to go a bit deeper. Avoid intros, interludes, skits, remixes and live versions.
- album: the poster named an album. Choose one standout track from that album, not always the lead single or opening track. Avoid interludes, bonus tracks, remixes and demos.

Always:
- Make sure the artist is right. Search can return different artists with the same or similar name, or tracks that only feature the artist; use the album names and your music knowledge to tell them apart.
- Never choose the same song twice in one playlist.
- If no candidate is a good fit, return null with a short note saying why (e.g. "Only remixes found" or "Not on Spotify"). An honest null is better than a wrong song.
- Add a note on a chosen track only when you have a real doubt worth flagging.`;

function describe(c: Candidates, refs: Map<string, SpotifyTrack>): string {
  const { item, kind } = c;
  const parsed = [
    item.artist && `artist: ${item.artist}`,
    item.title && `song: ${item.title}`,
    item.album && `album: ${item.album}`,
  ]
    .filter(Boolean)
    .join("; ");
  const lines = [`Item ${item.position} (${kind}) wrote: ${JSON.stringify(item.raw_text)} -> ${parsed}`];
  if (c.tracks.length === 0) lines.push("  (no candidates found)");
  for (const t of c.tracks) {
    const ref = `c${refs.size + 1}`;
    refs.set(ref, t);
    const year = t.album.release_date.slice(0, 4);
    lines.push(
      `  ${ref}: "${t.name}" by ${t.artists.map((a) => a.name).join(", ")}; ` +
        `${t.album.album_type} "${t.album.name}" (${year})${t.track_number ? `, track ${t.track_number}` : ""}`,
    );
  }
  return lines.join("\n");
}

type ItemResult = { spotify_track_id: string | null; spotify_uri: string | null; matched: boolean; match_note: string | null };

async function chooseWithClaude(candidates: Candidates[]): Promise<Map<number, ItemResult>> {
  const refs = new Map<string, SpotifyTrack>();
  const prompt = candidates.map((c) => describe(c, refs)).join("\n\n");

  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Picks) },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    ...FALLBACK_OPTIONS,
  });
  if (response.stop_reason === "refusal") {
    throw new PermanentError(`Claude declined to pick tracks (${response.stop_details?.category ?? "no category"})`);
  }
  if (!response.parsed_output) throw new Error("Claude returned no track picks");

  const results = new Map<number, ItemResult>();
  for (const pick of response.parsed_output.picks) {
    const track = pick.candidate ? refs.get(pick.candidate) : undefined;
    results.set(pick.position, {
      spotify_track_id: track?.id ?? null,
      spotify_uri: track?.uri ?? null,
      matched: !!track,
      match_note: track ? pick.note : (pick.note ?? (pick.candidate ? `Unknown candidate ${pick.candidate}` : "No match chosen")),
    });
  }
  return results;
}

// Runs async work over a list a few at a time, to stay under Spotify's rate limit.
async function mapLimited<T, R>(list: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

const NOT_SEARCHABLE: Partial<Record<Kind, string>> = {
  playlist: "Recreating a shared playlist isn't built yet",
  unknown: "Nothing to search for (no artist, song or album was parsed)",
};

// Match step: parsed -> matched.
// Finds a Spotify track for every item and records it on the item. Items with
// no good match keep matched = false and a match_note saying why; they are
// never dropped. Re-running overwrites the previous picks.
export function matchPost(postId: string): Promise<StepResult> {
  return runStep<{ list_type: string | null }>(
    "match", postId, "parsed", "matched", "list_type",
    async (post) => {
      const db = supabaseAdmin();
      const { data: items, error } = await db
        .from("post_items")
        .select("id, position, raw_text, artist, title, album")
        .eq("post_id", post.id)
        .order("position")
        .returns<Item[]>();
      if (error) throw new Error(`Could not load items: ${error.message}`);
      if (!items?.length) throw new PermanentError("Post has no items to match");

      const candidates = await mapLimited(items, 3, async (item) => {
        const kind = kindOf(item, post.list_type);
        return { item, kind, tracks: NOT_SEARCHABLE[kind] ? [] : await gatherCandidates(item, kind) };
      });

      const searchable = candidates.filter((c) => !NOT_SEARCHABLE[c.kind]);
      const picks = searchable.length ? await chooseWithClaude(searchable) : new Map<number, ItemResult>();

      let matchedCount = 0;
      for (const c of candidates) {
        const result: ItemResult = picks.get(c.item.position) ?? {
          spotify_track_id: null,
          spotify_uri: null,
          matched: false,
          match_note: NOT_SEARCHABLE[c.kind] ?? "No pick returned for this item",
        };
        if (result.matched) matchedCount++;
        const { error: upError } = await db.from("post_items").update(result).eq("id", c.item.id);
        if (upError) throw new Error(`Could not save match for item ${c.item.position}: ${upError.message}`);
      }

      if (matchedCount === 0) throw new PermanentError("None of the items could be matched on Spotify");
      console.log("[match] matched", { postId, matched: matchedCount, total: items.length });
      return {};
    },
  );
}
