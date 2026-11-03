import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Torchbearer",
  description: "Capture, map and teach expert judgment with a voice agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${roboto.variable} h-full antialiased`}>
      <body className="flex h-full flex-col overflow-hidden font-sans">
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
