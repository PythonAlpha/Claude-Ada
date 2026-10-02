#!/usr/bin/env bash
# Builds the Rust engine to WebAssembly into ./pkg
set -euo pipefail
cd "$(dirname "$0")"
command -v wasm-pack >/dev/null || { echo "wasm-pack not found. Install Rust (https://rustup.rs), then: cargo install wasm-pack"; exit 1; }
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
(cd rust && cargo test --quiet)
wasm-pack build rust --target web --release --out-dir ../pkg --out-name profile_core
echo "Done. Now run ./serve.sh and open http://localhost:8000"
