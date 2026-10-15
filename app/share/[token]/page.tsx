import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CopyButton } from "@/app/_components/copy-button";
import { InstagramShare } from "@/app/_components/instagram-share";
import { postForToken } from "@/lib/approval";
import { faeryPostText, instagramCaption, replyText, threadsComposeUrl, xComposeUrl, xPostId } from "@/lib/share-text";
import { PLATFORM_NAMES } from "@/lib/sources";
import { supabaseAdmin } from "@/lib/supabase";
import styles from "./share.module.css";

// Dan's private share kit for one playlist, reached with the post's approval
// token (the approve page lands here). Ready-made text, copy buttons and links
// that open the post or a pre-filled composer; Dan presses Post himself.
export const metadata: Metadata = { title: "Share kit · Playlist Faery", robots: { index: false, follow: false } };

export default async function ShareKit({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const found = await postForToken(token);
  if (!found) {
    return <Frame><p className={styles.sub}>This share link isn&apos;t valid.</p></Frame>;
  }
  const { data: post } = await supabaseAdmin()
    .from("posts")
    .select("status, playlist_title, playlist_name, author_handle, source_platform, source_url, post_text, spotify_playlist_url")
    .eq("id", found.id)
    .single();
  if (!post?.spotify_playlist_url) {
    const why =
      post?.status === "rejected" ? "This post was rejected, so there's no playlist to share."
      : post?.status === "awaiting_approval" ? "Approve the post first; its playlist is created when you do."
      : "The playlist is still being created. Refresh in a minute.";
    return <Frame><p className={styles.sub}>{why}</p></Frame>;
  }

  const reply = replyText(post);
  const announce = faeryPostText(post);
  const caption = instagramCaption(post);
  const card = (format: "feed" | "story") => `/share/${token}/card/${format}`;
  const platform = post.source_platform as string | null;
  const where = PLATFORM_NAMES[platform ?? ""];
  const xId = platform === "x" ? xPostId(post.source_url) : null;

  return (
    <Frame>
      <section className={styles.card}>
        <h1 className={styles.title}>{post.playlist_title ?? "Your playlist"}</h1>
        <p className={styles.sub}>{post.playlist_name}</p>
        <div className={styles.actions}>
          <a className={`${styles.btn} ${styles.primary}`} href={post.spotify_playlist_url}>★ Open in Spotify</a>
        </div>
      </section>

      {post.source_url && (
        <section className={styles.card}>
          <h2 className={styles.h2}>1. Reply on the original post</h2>
          <p className={styles.hint}>
            {xId
              ? "“Reply on X” opens X with this reply already written. Just press Reply."
              : `Copy the text, open the post${where ? ` on ${where}` : ""}, and paste it as a reply.`}
          </p>
          <p className={styles.text}>{reply}</p>
          <div className={styles.actions}>
            {xId ? (
              <a className={`${styles.btn} ${styles.lime}`} href={xComposeUrl(reply, xId)}>Reply on X</a>
            ) : (
              <>
                <CopyButton text={reply} className={`${styles.btn} ${styles.lime}`} />
                <a className={styles.btn} href={post.source_url}>Open the post</a>
              </>
            )}
          </div>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.h2}>{post.source_url ? "2." : "1."} Announce it on your feed</h2>
        <p className={styles.hint}>The Threads and X buttons open a post with this text filled in; nothing goes out until you press Post.</p>
        <p className={styles.text}>{announce}</p>
        <div className={styles.actions}>
          <CopyButton text={announce} className={`${styles.btn} ${styles.lime}`} />
          <a className={styles.btn} href={threadsComposeUrl(announce)}>Post on Threads</a>
          <a className={styles.btn} href={xComposeUrl(announce)}>Post on X</a>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.h2}>{post.source_url ? "3." : "2."} Post on Instagram</h2>
        <p className={styles.hint}>
          Instagram needs a picture, so here&apos;s one in two sizes. Each button copies the text you&apos;ll need, then
          opens your phone&apos;s share menu with the picture: choose Instagram, then Feed or Story.
          <br />
          <b>Feed:</b> paste the caption below. Captions can&apos;t hold tappable links, so it says &ldquo;link in
          bio&rdquo; (your bio link should be playlistfaery.com).
          <br />
          <b>Story:</b> the playlist link is copied. Add a Link sticker, paste it, and place it in the empty space at the
          bottom.
        </p>
        <div className={styles.previews}>
          <Image src={card("feed")} alt="Square share picture for the feed" width={1080} height={1080} unoptimized />
          <Image src={card("story")} alt="Tall share picture for a Story" width={1080} height={1920} unoptimized />
        </div>
        <p className={styles.text}>{caption}</p>
        <div className={styles.actions}>
          <InstagramShare
            feedImage={card("feed")}
            storyImage={card("story")}
            caption={caption}
            playlistUrl={post.spotify_playlist_url}
            className={`${styles.btn} ${styles.lime}`}
          />
          <CopyButton text={caption} className={styles.btn} />
        </div>
      </section>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.wrap}>
      <Link href="/" className={styles.home}>PLAYLIST FAERY</Link>
      {children}
    </main>
  );
}
