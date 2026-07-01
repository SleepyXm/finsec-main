import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { UserProvider } from "./provider/userprovider";
import NavGate from "./components/NavGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "200"] });

export const metadata: Metadata = {
  title: "FinSec",
  description: "Next generation financial money printer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.className} antialiased`}>
        <UserProvider>
          <NavGate />
          {children}
        </UserProvider>
      </body>
    </html>
  );
}