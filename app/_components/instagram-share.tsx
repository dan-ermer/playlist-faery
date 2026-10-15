"use client";

import { useEffect, useState } from "react";

type Props = {
  feedImage: string; // URL of the square share card
  storyImage: string; // URL of the tall share card
  caption: string; // pasted under a feed post
  playlistUrl: string; // pasted into a Story's link sticker
  className: string;
};

// Instagram has no pre-filled compose link, so these buttons copy the text,
// then open the phone's share menu with the card image (pick Instagram there).
// Where sharing images isn't supported (most desktop browsers), they save the
// image instead. Dan still presses Share in Instagram himself.
export function InstagramShare({ feedImage, storyImage, caption, playlistUrl, className }: Props) {
  const [files, setFiles] = useState<{ feed?: File; story?: File }>({});
  const [status, setStatus] = useState<string | null>(null);

  // Load both images up front: the share menu must open right after the tap,
  // with no download in between, or the phone refuses to open it.
  useEffect(() => {
    const load = async (url: string, name: string) =>
      new File([await (await fetch(url)).blob()], name, { type: "image/png" });
    Promise.all([load(feedImage, "playlist-faery.png"), load(storyImage, "playlist-faery-story.png")])
      .then(([feed, story]) => setFiles({ feed, story }))
      .catch(() => setStatus("Couldn't load the images. Refresh to try again."));
  }, [feedImage, storyImage]);

  const share = async (kind: "feed" | "story") => {
    const file = files[kind];
    const text = kind === "feed" ? caption : playlistUrl;
    // Not awaited: the share menu has to open within the same tap.
    // If copying fails, the text is still shown on the page to copy by hand.
    navigator.clipboard?.writeText(text).catch(() => {});
    const copied =
      kind === "feed" ? "Caption copied: paste it in Instagram." : "Playlist link copied: add a Link sticker and paste it.";
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        setStatus(copied);
      } catch {
        setStatus(null); // closed the share menu
      }
    } else {
      // No image sharing here (e.g. a computer): save the image instead.
      const a = document.createElement("a");
      a.href = kind === "feed" ? feedImage : storyImage;
      a.download = kind === "feed" ? "playlist-faery.png" : "playlist-faery-story.png";
      a.click();
      setStatus(`Image saved. ${copied}`);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={!files.feed && !status} onClick={() => share("feed")}>
        Share to feed
      </button>
      <button type="button" className={className} disabled={!files.story && !status} onClick={() => share("story")}>
        Share to Story
      </button>
      {status && <p style={{ flexBasis: "100%", margin: 0, fontSize: 13, fontWeight: 700 }}>✓ {status}</p>}
    </>
  );
}
