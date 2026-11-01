// pdf.js runs its parser in a worker; serve the matching worker file from /public.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = "node_modules/pdfjs-dist/build/pdf.worker.min.js";
if (existsSync(src)) {
  mkdirSync("public", { recursive: true });
  copyFileSync(src, "public/pdf.worker.min.js");
}
