import { build, context } from "esbuild";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(siteRoot);

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const dev = process.argv.includes("--serve");
const outputDirectory = resolve(siteRoot, "dist");
if (dirname(outputDirectory) !== siteRoot)
  throw new Error("Output must stay inside the website directory");
await rm(outputDirectory, { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await cp("public", "dist", { recursive: true });
const options = {
  entryPoints: ["src/main.tsx"],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: "dist/assets",
  minify: !dev,
  target: ["es2022"],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL || "",
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_ANON_KEY || "",
    ),
    "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
  },
  logLevel: "info",
};
const html = (await readFile("index.html", "utf8")).replace(
  '<script type="module" src="/src/main.tsx"></script>',
  '<script src="/config.js"></script><link rel="stylesheet" href="/assets/main.css"/><script type="module" src="/assets/main.js"></script>',
);
await writeFile("dist/index.html", html);
// Real files make deep links work even on static hosts without an SPA fallback.
// In development the SPA fallback preserves callback/query parameters. Esbuild's
// directory redirect otherwise drops ?code= and ?tab= when adding a trailing /.
if (!dev)
  for (const route of [
    "account",
    "account/login",
    "account/signup",
    "account/reset-password",
    "account/recovery",
    "link",
    "party",
    "covers",
    "community-collections",
    "news",
    "docs",
    "faq",
    "support",
    "contact",
    "privacy-policy",
    "terms",
    "account-deletion",
  ]) {
    await mkdir(`dist/${route}`, { recursive: true });
    await writeFile(`dist/${route}/index.html`, html);
  }
await writeFile("dist/404.html", html);
if (dev) {
  const ctx = await context(options);
  await ctx.watch();
  const server = await ctx.serve({
    servedir: "dist",
    host: "127.0.0.1",
    port: 5173,
    fallback: "dist/index.html",
  });
  console.log(`Local: http://127.0.0.1:${server.port}/`);
  process.on("SIGINT", async () => {
    await ctx.dispose();
    process.exit(0);
  });
} else {
  await build(options);
}
