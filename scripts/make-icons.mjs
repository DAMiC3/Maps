// Render public/icon.svg to the PNG sizes phones need for home-screen install.
// Run: node scripts/make-icons.mjs
import sharp from "sharp";

const sizes = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
for (const [name, size] of Object.entries(sizes)) {
  await sharp("public/icon.svg").resize(size, size).png().toFile(`public/${name}`);
  console.log(`public/${name}`);
}
