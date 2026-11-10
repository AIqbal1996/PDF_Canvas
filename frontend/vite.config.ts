import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PDFJS_DIST_DIR = path.resolve(ROOT_DIR, "node_modules/pdfjs-dist");

function localPdfJsAssetsPlugin(): Plugin {
  const mountDirs: Record<string, PathAndMime> = {
    "/pdfjs/cmaps/": { dir: path.join(PDFJS_DIST_DIR, "cmaps"), extMime: ".bcmap" },
    "/pdfjs/standard_fonts/": { dir: path.join(PDFJS_DIST_DIR, "standard_fonts"), extMime: ".pfb" },
  };

  interface PathAndMime {
    dir: string;
    extMime: string;
  }

  const serveLocalAsset = (
    reqUrl: string | undefined,
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (data?: unknown) => void },
    next: () => void
  ) => {
    if (!reqUrl) {
      next();
      return;
    }
    const cleanUrl = reqUrl.split("?")[0];
    for (const [prefix, meta] of Object.entries(mountDirs)) {
      if (cleanUrl.startsWith(prefix)) {
        const rel = decodeURIComponent(cleanUrl.slice(prefix.length));
        const baseResolved = path.resolve(meta.dir);
        const candidate = path.resolve(baseResolved, rel);
        if (
          !candidate.startsWith(baseResolved + path.sep) ||
          !fs.existsSync(candidate) ||
          !fs.statSync(candidate).isFile()
        ) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const ext = path.extname(candidate).toLowerCase();
        const mime =
          ext === ".bcmap" || ext === meta.extMime
            ? "application/octet-stream"
            : ext === ".ttf"
            ? "font/ttf"
            : "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        fs.createReadStream(candidate).pipe(res as unknown as NodeJS.WritableStream);
        return;
      }
    }
    next();
  };

  return {
    name: "local-pdfjs-offline-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => serveLocalAsset(req.url, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => serveLocalAsset(req.url, res, next));
    },
    closeBundle() {
      const distRoot = path.resolve(ROOT_DIR, "dist/pdfjs");
      for (const folder of ["cmaps", "standard_fonts"]) {
        const src = path.join(PDFJS_DIST_DIR, folder);
        const dst = path.join(distRoot, folder);
        if (fs.existsSync(src)) {
          fs.mkdirSync(dst, { recursive: true });
          fs.cpSync(src, dst, { recursive: true });
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), localPdfJsAssetsPlugin()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
