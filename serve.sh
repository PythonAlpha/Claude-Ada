#!/usr/bin/env bash
# WebAssembly needs http://, not file://
cd "$(dirname "$0")"
echo "Open http://localhost:8000"
python3 -m http.server 8000
