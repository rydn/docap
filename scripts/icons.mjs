// Renders PWA icons from public/favicon.svg.
import sharp from 'sharp'
for (const size of [192, 512]) {
  await sharp('public/favicon.svg', { density: 600 }).resize(size, size).png().toFile(`public/icon-${size}.png`)
}
