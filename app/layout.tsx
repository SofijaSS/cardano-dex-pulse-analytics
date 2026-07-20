import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const themeScript = `
  (() => {
    try {
      const preference = localStorage.getItem("cardano-dex-pulse:theme") || "auto";
      const dark = preference === "dark" || (preference === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    } catch {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    }
  })();
`;

// Vinext's client router uses a few APIs that are missing in older iPhone
// Safari releases. Run these tiny standards-compatible fallbacks before any
// module script so the app can hydrate instead of failing on a blank screen.
const browserCompatibilityScript = `
  (() => {
    if (!Object.hasOwn) {
      Object.defineProperty(Object, "hasOwn", {
        configurable: true,
        writable: true,
        value: (object, property) => Object.prototype.hasOwnProperty.call(object, property),
      });
    }
    if (!Array.prototype.at) {
      Object.defineProperty(Array.prototype, "at", {
        configurable: true,
        writable: true,
        value(index) {
          const length = this.length >>> 0;
          const position = Math.trunc(Number(index) || 0);
          const resolved = position < 0 ? length + position : position;
          return resolved < 0 || resolved >= length ? undefined : this[resolved];
        },
      });
    }
    if (!String.prototype.replaceAll) {
      Object.defineProperty(String.prototype, "replaceAll", {
        configurable: true,
        writable: true,
        value(search, replacement) {
          if (search instanceof RegExp) {
            if (!search.global) throw new TypeError("replaceAll requires a global RegExp");
            return this.replace(search, replacement);
          }
          return this.split(String(search)).join(replacement);
        },
      });
    }
    if (!globalThis.structuredClone) {
      globalThis.structuredClone = (value) => {
        if (value instanceof Error) {
          const clonedError = new Error(value.message);
          clonedError.name = value.name;
          clonedError.stack = value.stack;
          return clonedError;
        }
        return JSON.parse(JSON.stringify(value));
      };
    }
  })();
`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host") ||
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ||
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: "Cardano DEX Pulse | Source-reconciled volume analytics",
    description:
      "Native-first Cardano DEX volume, TVL and WingRiders reporting with transparent DefiLlama comparison.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "Cardano DEX Pulse",
      description: "Native-first volume intelligence with source disagreement kept visible.",
      type: "website",
      images: [{ url: socialImage, width: 1731, height: 909, alt: "Cardano DEX Pulse analytics" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Cardano DEX Pulse",
      description: "Native-first volume intelligence with source disagreement kept visible.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: browserCompatibilityScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
