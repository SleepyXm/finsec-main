import { Metadata } from "next";
import { Geist, Geist_Mono, Manrope, Familjen_Grotesk } from "next/font/google";
import "./globals.css";
import { UserProvider } from "./components/provider/userprovider";
import NavGate from "./components/NavGate";
import { Banner } from "./banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const familjenGrotesk = Familjen_Grotesk({
  variable: "--font-familjen-grotesk",
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
      <body className={`${familjenGrotesk.className} antialiased`}>
        <UserProvider>
          <NavGate />
          {children}
          <Banner />
        </UserProvider>
      </body>
    </html>
  );
}