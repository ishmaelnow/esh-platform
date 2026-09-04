import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name: "ESH Platform Admin", short_name: "ESH Admin", start_url: "/", display: "standalone", background_color: "#f6f8fb", theme_color: "#123b5d", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] }; }
