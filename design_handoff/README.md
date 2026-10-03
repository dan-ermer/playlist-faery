# Handoff: Playlist Faery — "Extruded Arcade ✦ Poof!" restyle

## Overview
Restyle of the existing playlistfaery.com home page (the list of playlists "freed" from social posts) in a dimensional early-90s / cartoon-fairy look: chunky color blocks, thick black outlines, hard stepped 3D extrusion shadows, polka-dot background, a big gold crown on the wordmark, and "Poof!" stickers on each playlist tile.

## About the design files
The files here are **design references made in HTML**. They show the intended look and behavior; they are not production code. Recreate them in the site's existing codebase and framework, using its patterns. Keep all existing data, routes, links, and behavior. **This is a visual restyle only.**

- `reference.html`: open it in a browser. It's a plain static mock of the home page with 4 sample tiles.
- `Playlistfery Retro Directions.dc.html`: the full exploration canvas. **Option 2c** is the chosen direction. It needs the design tool's runtime, so use `reference.html` for implementation.

## Fidelity
**High fidelity.** Use these exact colors, fonts, border widths and shadows.

## Content mapping (existing site → new design)
- Hero: keep "Playlist Faery" and "Freeing playlists trapped in social media posts", plus the intro paragraph.
- Count line: "25 playlists, newest first" becomes "♛ {n} wishes granted" on the left and "Newest first" on the right. Keep the real count.
- Each playlist tile shows:
  - Title
  - "wished by @handle on Platform · Date", linked to the original post when the site has a URL
  - Artist preview ("A, B, C and N more")
  - "{n} tracks"
  - "★ Listen", linked to the Spotify playlist
- The whole tile can be the Spotify link, or keep separate links. Make sure both links stay keyboard-reachable.
- Footer: keep it as is, styled with Verdana and #111 text. "Every playlist credits the person whose post it came from" can be a Chewy sticker.

## Layout
- Page background: polka dots on lime cream (see tokens).
- Content column: max-width about 960px, centered, 24px side padding, 16px top padding. The prototype frame is 620px wide; scale proportionally.
- Vertical rhythm: 20px gap between hero, count line and grid.
- Grid: `repeat(auto-fill, minmax(260px, 1fr))` with a 26px gap. Use 1 column below about 560px and 2–3 columns on desktop.

## Components

### Wordmark banner
- Full width of the content column.
- Background #ff4fb8, border 3px solid #111.
- Padding 18px 22px 18px 150px. The large left padding makes room for the crown.
- Font: Bungee Shade 60px, line-height 1, color #111, text "PLAYLIST FAERY". Use clamp() to shrink it on mobile (about 34px minimum), and shrink the left padding with it.
- Extrusion: `box-shadow: 1px 1px 0 #111, 2px 2px 0 #111, … 8px 8px 0 #111` (8 stacked 1px steps).
- `transform: rotate(-2deg)`.
- Crown: the "♛" glyph, absolutely positioned at top -17px, left 21px. Font-size 160px, line-height 1, color #ffe14d, `-webkit-text-stroke: 4px #111`, `text-shadow: 6px 6px 0 #111`, `rotate(-10deg)`. Use an SVG crown if the glyph renders inconsistently across platforms; keep it gold with a thick black outline and offset shadow.

### Tagline sticker
- Chewy 21px on #9be22d.
- Border 3px solid #111, padding 4px 12px.
- `box-shadow: 4px 4px 0 #111`, `rotate(1deg)`.
- Sits under the banner, left-aligned, with 14px gap plus 6px margin-top.

### Buttons
Style any primary or secondary actions the site has like this.
- Font: Bungee 15px, padding 10px 20px, border 3px solid #111.
- Shadow: `2px 2px 0 #111, 4px 4px 0 #111, 6px 6px 0 #111`.
- Primary: background #ff4fb8, white text, `text-shadow: 2px 2px 0 #111`.
- Secondary: background #fff, text #111.
- Active (pressed): `transform: translate(6px,6px); box-shadow: none`. Transition 80ms.

### Count line
- Flex row with space-between, border-bottom 3px solid #111, padding-bottom 6px.
- Left: Bungee 15px. Right: Verdana 12px bold.

### Playlist tile
- Background rotates through #ff4fb8, #9be22d, #6fd3ff, #b48cff (index mod 4).
- Border 3px solid #111, padding 14px 12px 12px.
- Flex column with 10px gap. Tiles in a row should match heights.
- Shadow: 8-step extrusion `1px 1px 0 #111 … 8px 8px 0 #111`.
- Hover: `translate(-2px,-2px)` and a 10-step extrusion. Transition 100ms.
- Active: `translate(8px,8px)`, shadow none.
- Focus-visible: same as hover, plus `outline: 3px dashed #111; outline-offset: 4px`.
- Contents, top to bottom:
  1. "★ Poof!" sticker: absolute at top -14px, right -10px. Background #ffe14d, border 3px solid #111, radius 999px, padding 2px 10px. Chewy 16px, `box-shadow: 2px 2px 0 #111`. Rotation rotates through -6°, 5°, -4°, 7° (index mod 4).
  2. Title: Bungee 17px, line-height 1.15, #111, padding-right 30px so it clears the sticker, `text-wrap: pretty`.
  3. Credit chip: Verdana 11px bold. Background #fff, border 2px solid #111, padding 3px 6px, shrink-wraps to its text. Format: "wished by @handle on Instagram · Oct 1, 2026". The handle links to the post.
  4. Artists: Verdana 12px, line-height 1.45. Use flex: 1 so the footer row aligns across tiles.
  5. Footer row (space-between):
     - Left: "{n} tracks" in Bungee 12px, white on #111, padding 3px 7px.
     - Right: "★ Listen" in Verdana 12px bold. This is the Spotify link.

## Design tokens
- Ink: #111
- Pink: #ff4fb8
- Lime: #9be22d
- Sky: #6fd3ff
- Gold: #ffe14d
- Lavender: #b48cff
- Paper: #fff
- Page background: color #eaffc9 with
  `background-image: radial-gradient(#ff4fb8 2px, transparent 2.2px), radial-gradient(#6fd3ff 2px, transparent 2.2px); background-size: 30px 30px; background-position: 0 0, 15px 15px;`
- Fonts (Google Fonts):
  - Bungee: headings, labels and buttons
  - Bungee Shade: wordmark only
  - Chewy: stickers and taglines
  - Verdana (system): body text, credits and meta
- Borders: 3px #111 on blocks; 2px on small chips.
- Radius: 0 everywhere except stickers (999px).
- Shadows: always hard and offset down-right, never blurred. Extrusion is n stacked 1px steps:
  - Tiles and wordmark: 8 steps
  - Buttons: 3 steps of 2px
  - Stickers: 2px 2px
  - Tagline: 4px 4px
- Motion: 80–100ms transforms. Pressing translates the element into its shadow. Respect `prefers-reduced-motion` by dropping the transitions.

## Accessibility
- Text on pink, lime, sky and lavender is #111 (passes AA).
- White-on-pink is only used for the Bungee button label, which has a black text-shadow.
- Keep visible focus styles.

## Assets
None. No images; the crown is a text glyph.

## Files
- `reference.html`: static implementation reference
- `Playlistfery Retro Directions.dc.html`: full exploration; option 2c is the one
