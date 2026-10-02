# Claude, a profile

index.html, style.css, script.js and a Rust crate compiled to WebAssembly.

## Run it
1. Install Rust: https://rustup.rs
2. `cargo install wasm-pack`
3. `./build.sh`   (runs the Rust tests, then builds ./pkg)
4. `./serve.sh`   then open http://localhost:8000

## What Rust does (rust/src/lib.rs)
- fuzzy_score: ranks "Things I like" as you type
- Board: stores the Top five votes, ranks them, computes shares
- Confetti: physics for the cap toss; JS only draws
- typed: the tagline typewriter
- diploma_line: writes your diploma from your name
- pick_index: picks the next "Tell me something" line

If ./pkg is missing, the page shows a banner and runs a JavaScript stand-in with the same API.
