import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
// Explicit allowlist: SQL, tests, credentials and git history never ship.
for (const name of ['index.html', 'admin.html', 'product.html', 'checkout.html', 'styles.css', 'admin.css', 'admin-auth.css', 'product-editor.css', 'commerce.css', 'script.js', 'admin.js', 'admin-auth.js', 'product-model.js', 'product-editor.js', 'commerce.js', 'commerce-ui.js', 'product.js', 'checkout.js', 'store-data.js', 'supabase-config.js', 'supabase-sync.js', 'supabase-storefront.js', 'assets']) {
  await cp(resolve(root, name), resolve(output, name), { recursive: true });
}
await build({
  entryPoints: [resolve(root, 'src/supabase-client.js')],
  outfile: resolve(output, 'supabase-client.js'),
  bundle: true, minify: true, platform: 'browser', target: ['es2022'],
  format: 'iife', legalComments: 'none'
});
if (process.env.SUPABASE_URL || process.env.SUPABASE_PUBLISHABLE_KEY) {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey } = process.env;
  if (!url || !publishableKey?.startsWith('sb_publishable_')) throw new Error('Provide both SUPABASE_URL and a publishable (never secret) key.');
  if (!/^https:\/\/[\w-]+\.supabase\.co$/.test(url)) throw new Error('Invalid Supabase project URL');
  await writeFile(resolve(output, 'supabase-config.js'), `window.CrocsSupabaseConfig = Object.freeze(${JSON.stringify({ url, publishableKey, stateId: 'default' })});\n`);
}
console.log('Built static storefront and Supabase-backed admin in dist/.');
