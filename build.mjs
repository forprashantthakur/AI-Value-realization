import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shim = (f) => path.join(root, "demo-site/shims", f);
const redirect = {
  name: "demo-redirects",
  setup(b) {
    const map = [
      [/^next\/link$/, shim("next-link.tsx")],
      [/^next\/navigation$/, shim("next-navigation.ts")],
      [/^next\/cache$/, shim("next-cache.ts")],
      [/^next\/server$/, shim("next-server.ts")],
      [/^next\/headers$/, shim("empty.ts")],
      [/^server-only$/, shim("empty.ts")],
      [/auth\/session$/, shim("session.ts")],
      [/\/prisma-repository$/, shim("prisma-stub.ts")],
      [/\/print-button$/, shim("print-button.tsx")],
    ];
    for (const [re, to] of map) b.onResolve({ filter: re }, () => ({ path: to }));
  },
};
await build({
  entryPoints: [path.join(root, "demo-site/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  outfile: path.join(root, "demo-site/dist/app.js"),
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [redirect],
  define: { "process.env.NODE_ENV": '"production"', "process.env.DATA_SOURCE": '"memory"', "process.env.DATABASE_URL": "undefined", "process.env.ADVISOR_LLM_PROVIDER": "undefined" },
  banner: { js: "var process=globalThis.process||{env:{}};" },
  logLevel: "warning",
  legalComments: "none",
});
console.log("bundle ok");
