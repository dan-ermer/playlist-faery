// The sticker on each playlist: a magic word, picked from the playlist's id so
// it keeps its word (and tile color) everywhere: catalog cards and share images.
// Kept short (about 9 letters) so the sticker stays on the corner, clear of the title.
export const MAGIC_WORDS = [
  "★ Poof!", "✦ Ta-da!", "Presto!", "Shazam!", "Voilà!", "Alakazam!",
  "Kazaam!", "✦ Zing!", "Bibbidi!", "★ Zap!", "Sparkle!", "Huzzah!",
];

export function idHash(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function magicWord(id: string): string {
  return MAGIC_WORDS[idHash(id) % MAGIC_WORDS.length];
}
