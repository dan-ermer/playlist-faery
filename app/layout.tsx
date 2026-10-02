import type { Metadata } from "next";
import { Geist, IM_Fell_English } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Old-timey printing type for the name and playlist titles ("Faery" on purpose).
const fell = IM_Fell_English({
  variable: "--font-fell",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://playlistfaery.com"),
  title: "Playlist Faery",
  description:
    "Playlists freed from social media posts. When someone lists their favorite songs on Threads, X or Instagram, Playlist Faery turns it into a Spotify playlist and credits them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fell.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
