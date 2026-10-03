import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = { title: "Privacy · Playlist Faery" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="October 2, 2026">
      <p>
        Playlist Faery turns lists of songs, artists and albums that people share publicly on social media into
        Spotify playlists, credits the person who posted them, and lists those playlists on playlistfaery.com. This
        page explains what information that involves and what you can do about it.
      </p>

      <h2>Visiting this website</h2>
      <p>
        You don&apos;t need an account to browse playlistfaery.com, and we don&apos;t use analytics, advertising or
        tracking cookies. Our hosting provider (Vercel) keeps standard server logs, such as IP addresses, for a short
        time to run and secure the site.
      </p>

      <h2>Posts we turn into playlists</h2>
      <p>
        The person who runs Playlist Faery picks individual public posts by hand. For each one we keep:
      </p>
      <ul>
        <li>the post&apos;s link, the poster&apos;s public handle, the date it was posted and its public text;</li>
        <li>the post&apos;s public image or a screenshot of it, when the list is in a picture;</li>
        <li>the songs, artists or albums we read from it and the Spotify tracks we matched.</li>
      </ul>
      <p>
        We use this only to build the playlist, credit the poster by handle, show the playlist on this site and, in
        future, reply to the original post with a link. We don&apos;t collect anything else about posters, contact
        them other than by replying publicly, or sell or share their information.
      </p>

      <h2>Threads and other Meta services</h2>
      <p>
        Playlist Faery uses the Threads API, logged in only as its own account (@playlistfaery), to publish posts and
        replies and to find the public posts it replies to. We store the access tokens for that account securely and
        use Threads data only for these purposes. If the @playlistfaery account removes the app&apos;s access, or Meta
        sends a data deletion request, we delete the stored tokens.
      </p>

      <h2>Services we rely on</h2>
      <p>
        To do this work, information passes through: Resend (receiving and sending email), Supabase (our database),
        Vercel (hosting), Anthropic&apos;s Claude (reading posts and choosing tracks), Spotify (creating playlists) and
        Meta&apos;s Threads API. Each handles the data under its own privacy terms.
      </p>

      <h2>How long we keep things</h2>
      <p>
        We keep a playlist&apos;s record for as long as the playlist is listed here. Posts we don&apos;t turn into
        playlists stay in our records so we can avoid processing them twice; you can ask us to delete them.
      </p>

      <h2>Your choices</h2>
      <p>
        If one of your posts was turned into a playlist and you&apos;d like the credit changed, the playlist taken down
        or your information deleted, email <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a> with
        the link to your post. We&apos;ll remove it from this site, delete the playlist and our record of your post,
        usually within a week.
      </p>

      <h2>Children</h2>
      <p>Playlist Faery isn&apos;t aimed at children under 13, and we don&apos;t knowingly process their information.</p>

      <h2>Changes and contact</h2>
      <p>
        If we change this page, we&apos;ll update the date above. Questions:{" "}
        <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a>.
      </p>
    </LegalPage>
  );
}
