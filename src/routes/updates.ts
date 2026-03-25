import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

export async function updatesRoutes(app: FastifyInstance) {
  // GET /api/updates/latest
  // Sparkle-compatible JSON endpoint consumed by the macOS app's built-in
  // update checker. Returns the current latest version metadata.
  app.get("/latest", async (_request, reply) => {
    const version = config.APP_LATEST_VERSION;
    const baseUrl = config.APP_DOWNLOAD_BASE_URL ?? "";

    return reply.send({
      version,
      releaseNotesUrl: config.APP_RELEASE_NOTES_URL ?? null,
      downloadUrl: baseUrl ? `${baseUrl}/Kerwan-${version}.dmg` : null,
      minimumSystemVersion: "13.0",
      publishedAt: new Date().toISOString(),
    });
  });

  // GET /api/updates/appcast.xml
  // Standard Sparkle RSS appcast XML. The macOS app's Info.plist points here.
  app.get("/appcast.xml", async (_request, reply) => {
    const version = config.APP_LATEST_VERSION;
    const baseUrl = config.APP_DOWNLOAD_BASE_URL ?? "";
    const downloadUrl = baseUrl ? `${baseUrl}/Kerwan-${version}.dmg` : "";
    const releaseNotesLink = config.APP_RELEASE_NOTES_URL
      ? `<sparkle:releaseNotesLink>${config.APP_RELEASE_NOTES_URL}</sparkle:releaseNotesLink>`
      : "";
    const enclosure = downloadUrl
      ? `<enclosure url="${downloadUrl}" type="application/octet-stream" />`
      : "";

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Kerwan Changelog</title>
    <link>${config.APP_URL}</link>
    <description>Most recent changes to Kerwan</description>
    <language>en</language>
    <item>
      <title>Version ${version}</title>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <sparkle:version>${version}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion>
      ${releaseNotesLink}
      ${enclosure}
    </item>
  </channel>
</rss>`;

    return reply
      .header("Content-Type", "application/xml; charset=utf-8")
      .send(xml);
  });
}
