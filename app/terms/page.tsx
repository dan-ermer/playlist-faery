import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = { title: "Terms · Playlist Faery" };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="October 2, 2026">
      <p>
        These terms cover your use of playlistfaery.com and the playlists and posts published by Playlist Faery
        (@playlistfaery). By using them, you agree to these terms.
      </p>

      <h2>What Playlist Faery does</h2>
      <p>
        Playlist Faery turns lists of music that people share publicly on social media into Spotify playlists. Every
        playlist credits the person whose post it came from and links back to the original post. It&apos;s a free,
        non-commercial project run by one person.
      </p>

      <h2>Credit and ownership</h2>
      <p>
        The music belongs to its artists and rights holders, and is played through Spotify under Spotify&apos;s terms.
        The original posts belong to the people who wrote them. Playlist Faery only selects tracks; it doesn&apos;t
        claim ownership of the music, the posts or the posters&apos; names.
      </p>

      <h2>Takedowns and corrections</h2>
      <p>
        If you posted a list that became a playlist and you&apos;d like it changed or removed, or you think something
        here infringes your rights, email <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a> with a
        link to the post or playlist. We&apos;ll correct or remove it, usually within a week.
      </p>

      <h2>Other services</h2>
      <p>
        Playlist Faery isn&apos;t affiliated with or endorsed by Spotify, Meta, Threads, Instagram or X. Your use of
        those services is governed by their own terms.
      </p>

      <h2>No guarantees</h2>
      <p>
        Playlist Faery is provided as is. Track choices are made automatically and may not always match what the
        poster meant, and playlists or this site may change or go away. To the extent the law allows, we aren&apos;t
        liable for any loss arising from using them.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If we change these terms, we&apos;ll update the date above. Questions:{" "}
        <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a>.
      </p>
    </LegalPage>
  );
}
