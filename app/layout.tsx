import type { Metadata } from "next";
import { Bungee, Bungee_Shade, Chewy } from "next/font/google";
import "./globals.css";

// "Extruded Arcade ✦ Poof!" type: Bungee for headings and labels, Bungee Shade
// for the wordmark only, Chewy for stickers; body text is system Verdana.
const bungee = Bungee({ variable: "--font-bungee", weight: "400", subsets: ["latin"] });
const bungeeShade = Bungee_Shade({ variable: "--font-bungee-shade", weight: "400", subsets: ["latin"] });
const chewy = Chewy({ variable: "--font-chewy", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://playlistfaery.com"),
  title: "Playlist Faery",
  description:
    "Playlists freed from social media posts. When someone lists their favorite songs on Threads, X or Instagram, Playlist Faery turns it into a Spotify playlist and credits them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bungee.variable} ${bungeeShade.variable} ${chewy.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
