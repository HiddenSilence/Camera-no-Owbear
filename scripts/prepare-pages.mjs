import fs from "node:fs/promises";

const siteUrl = "https://hiddensilence.github.io/Camera-no-Owbear";
const manifestPath = new URL("../dist/manifest.json", import.meta.url);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

manifest.homepage_url = siteUrl;
manifest.icon = `${siteUrl}/icon.svg`;
manifest.background_url = `${siteUrl}/background.html`;
manifest.action = {
  ...manifest.action,
  icon: `${siteUrl}/icon.svg`,
  popover: `${siteUrl}/`,
};

await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`GitHub Pages manifest preparado: ${siteUrl}/manifest.json`);
