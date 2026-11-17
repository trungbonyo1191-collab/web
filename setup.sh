#!/usr/bin/env bash
# Tải thư viện về vendor/ từ npm (đã pin version + lockfile có hash toàn vẹn) và build Tailwind.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p vendor .build
(cd .build && npm init -y >/dev/null && npm i --save-exact \
  pdfjs-dist@3.11.174 pdf-lib@1.17.1 jszip@3.10.1 docx@8.5.0 \
  https://cdn.sheetjs.com/xlsx-0.20.1/xlsx-0.20.1.tgz tailwindcss@3.4.17)
N=.build/node_modules
cp $N/pdfjs-dist/build/pdf.min.js $N/pdfjs-dist/build/pdf.worker.min.js vendor/
cp $N/pdf-lib/dist/pdf-lib.min.js $N/jszip/dist/jszip.min.js $N/xlsx/dist/xlsx.full.min.js vendor/
cp $N/docx/build/index.umd.js vendor/docx.umd.js
printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > .build/input.css
$N/.bin/tailwindcss -i .build/input.css -o vendor/tailwind.css --content './index.html,./app.js' --minify
echo "Xong. Chạy thử: npx serve ."
