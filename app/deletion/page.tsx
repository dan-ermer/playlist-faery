import type { Metadata } from "next";
import { LegalPage } from "@/app/_components/legal-page";

export const metadata: Metadata = { title: "Data deletion · Playlist Faery" };

// Status page Meta links people to after a data deletion request.
export default async function Deletion({ searchParams }: PageProps<"/deletion">) {
  const code = (await searchParams).code;
  return (
    <LegalPage title="Data deletion">
      {typeof code === "string" && /^[0-9a-f]{16}$/.test(code) ? (
        <p>
          Request <strong>{code}</strong> is complete. Playlist Faery deletes the Threads data it holds for an
          account (its stored login) as soon as the request arrives.
        </p>
      ) : (
        <p>
          Playlist Faery deletes the Threads data it holds for an account as soon as Meta sends a deletion request.
        </p>
      )}
      <p>
        To have a playlist made from one of your posts removed, along with our record of the post, email{" "}
        <a href="mailto:hello@playlistfaery.com">hello@playlistfaery.com</a> with its link. See our{" "}
        <a href="/privacy">privacy page</a> for details.
      </p>
    </LegalPage>
  );
}
