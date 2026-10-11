import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'assets');
const images = [
  ['sally-kids-hero.png', 'sally-kids-hero', [{ width: 1600, suffix: '1600' }, { width: 900, suffix: '900' }]],
  ['sally-kids-play.png', 'sally-kids-play', [{ width: 1200, suffix: '1200' }, { width: 720, suffix: '720' }]],
  ['sally-kids-school.png', 'sally-kids-school', [{ width: 1200, suffix: '1200' }, { width: 720, suffix: '720' }]],
];

for (const [source, name, variants] of images) {
  const input = path.join(output, source);
  for (const variant of variants) {
    const resized = sharp(input).resize({ width: variant.width, withoutEnlargement: true });
    await Promise.all([
      resized.clone().webp({ quality: 82, effort: 5 }).toFile(path.join(output, `${name}-${variant.suffix}.webp`)),
      resized.clone().avif({ quality: 58, effort: 5 }).toFile(path.join(output, `${name}-${variant.suffix}.avif`)),
    ]);
  }
}
console.log('Generated responsive Sally Kids WebP/AVIF assets.');
