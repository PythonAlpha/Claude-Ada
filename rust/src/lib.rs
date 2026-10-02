//! profile_core: the logic behind the profile site, compiled to WebAssembly.
//!
//! - fuzzy_score: ranks the "Things I like" list while you type
//! - Board: keeps the Top five votes and the order
//! - Confetti: the physics for the cap toss (JS only draws what Rust computes)
//! - typed: the typewriter effect for the tagline
//! - diploma_line: writes your own diploma
//! - pick_index: picks the next "Tell me something" line

use std::f32::consts::PI;
use wasm_bindgen::prelude::*;

// ---------- helpers ----------

fn fnv1a(s: &str) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for b in s.as_bytes() {
        h ^= *b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

struct Rng(u32);

impl Rng {
    fn new(seed: u32) -> Rng {
        Rng(if seed == 0 { 0x9E37_79B9 } else { seed })
    }
    fn next_u32(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
    fn next_f32(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / 16_777_216.0
    }
}

#[wasm_bindgen]
pub fn engine_name() -> String {
    format!("profile_core {} (Rust)", env!("CARGO_PKG_VERSION"))
}

// ---------- search ----------

/// Subsequence match. 0 means no match. Consecutive letters and
/// letters at the start of a word score higher.
#[wasm_bindgen]
pub fn fuzzy_score(query: &str, text: &str) -> u32 {
    let q: Vec<char> = query
        .to_lowercase()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if q.is_empty() {
        return 1;
    }
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let mut score: u32 = 0;
    let mut ti: usize = 0;
    let mut prev: Option<usize> = None;
    for qc in q.iter() {
        let mut found = false;
        while ti < t.len() {
            if t[ti] == *qc {
                score += 10;
                if let Some(p) = prev {
                    if p + 1 == ti {
                        score += 15;
                    }
                }
                if ti == 0 || !t[ti - 1].is_alphanumeric() {
                    score += 20;
                }
                prev = Some(ti);
                ti += 1;
                found = true;
                break;
            }
            ti += 1;
        }
        if !found {
            return 0;
        }
    }
    score
}

// ---------- votes ----------

#[wasm_bindgen]
pub struct Board {
    votes: Vec<u32>,
}

#[wasm_bindgen]
impl Board {
    #[wasm_bindgen(constructor)]
    pub fn new(n: u32) -> Board {
        Board {
            votes: vec![0; n as usize],
        }
    }

    pub fn vote(&mut self, idx: u32) -> u32 {
        match self.votes.get_mut(idx as usize) {
            Some(v) => {
                *v = v.saturating_add(1);
                *v
            }
            None => 0,
        }
    }

    pub fn count(&self, idx: u32) -> u32 {
        self.votes.get(idx as usize).copied().unwrap_or(0)
    }

    pub fn total(&self) -> u32 {
        self.votes.iter().fold(0u32, |a, b| a.saturating_add(*b))
    }

    /// Share of all votes, 0 to 100.
    pub fn share(&self, idx: u32) -> f32 {
        let total = self.total();
        if total == 0 {
            return 0.0;
        }
        self.count(idx) as f32 * 100.0 / total as f32
    }

    /// Item indexes, most votes first. Ties keep their original order.
    pub fn order(&self) -> Vec<u32> {
        let mut idx: Vec<u32> = (0..self.votes.len() as u32).collect();
        idx.sort_by(|a, b| {
            self.votes[*b as usize]
                .cmp(&self.votes[*a as usize])
                .then(a.cmp(b))
        });
        idx
    }

    pub fn reset(&mut self) {
        for v in self.votes.iter_mut() {
            *v = 0;
        }
    }

    pub fn serialize(&self) -> String {
        self.votes
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<String>>()
            .join(",")
    }

    pub fn load(&mut self, s: &str) {
        for (i, part) in s.split(',').enumerate() {
            if i >= self.votes.len() {
                break;
            }
            if let Ok(v) = part.trim().parse::<u32>() {
                self.votes[i] = v;
            }
        }
    }
}

// ---------- confetti ----------

#[derive(Clone, Copy)]
struct Piece {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    rot: f32,
    vr: f32,
    hue: f32,
    size: f32,
    kind: f32,
    life: f32,
}

const HUES: [f32; 5] = [42.0, 318.0, 215.0, 160.0, 8.0];
const MAX_PIECES: usize = 700;

#[wasm_bindgen]
pub struct Confetti {
    pieces: Vec<Piece>,
    rng: Rng,
    w: f32,
    h: f32,
}

#[wasm_bindgen]
impl Confetti {
    #[wasm_bindgen(constructor)]
    pub fn new(w: f32, h: f32, seed: u32) -> Confetti {
        Confetti {
            pieces: Vec::new(),
            rng: Rng::new(seed),
            w,
            h,
        }
    }

    pub fn resize(&mut self, w: f32, h: f32) {
        self.w = w;
        self.h = h;
    }

    pub fn burst(&mut self, cx: f32, cy: f32, count: u32) {
        for _ in 0..count {
            if self.pieces.len() >= MAX_PIECES {
                break;
            }
            let angle = -PI * (0.1 + 0.8 * self.rng.next_f32());
            let speed = 350.0 + 650.0 * self.rng.next_f32();
            let hue_i = (self.rng.next_u32() % HUES.len() as u32) as usize;
            let rot = self.rng.next_f32() * 2.0 * PI;
            let vr = (self.rng.next_f32() - 0.5) * 14.0;
            let jitter = (self.rng.next_f32() - 0.5) * 16.0;
            let size = 8.0 + self.rng.next_f32() * 8.0;
            let kind = (self.rng.next_u32() % 3) as f32;
            self.pieces.push(Piece {
                x: cx,
                y: cy,
                vx: angle.cos() * speed,
                vy: angle.sin() * speed,
                rot,
                vr,
                hue: HUES[hue_i] + jitter,
                size,
                kind,
                life: 1.0,
            });
        }
    }

    pub fn step(&mut self, dt: f32) {
        let h = self.h;
        for p in self.pieces.iter_mut() {
            p.vy += 1100.0 * dt;
            p.vx *= (1.0 - 1.6 * dt).max(0.0);
            p.vy *= (1.0 - 1.8 * dt).max(0.0);
            p.vx += p.rot.sin() * 90.0 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            p.life -= 0.28 * dt;
        }
        self.pieces.retain(|p| p.life > 0.0 && p.y < h + 40.0);
    }

    /// Seven numbers per piece: x, y, rotation, hue, size, kind (0 square, 1 dot, 2 cap), alpha.
    pub fn data(&self) -> Vec<f32> {
        let mut out: Vec<f32> = Vec::with_capacity(self.pieces.len() * 7);
        for p in self.pieces.iter() {
            let alpha = (p.life / 0.3).clamp(0.0, 1.0);
            out.extend_from_slice(&[p.x, p.y, p.rot, p.hue, p.size, p.kind, alpha]);
        }
        out
    }

    pub fn count(&self) -> u32 {
        self.pieces.len() as u32
    }
}

// ---------- text ----------

/// The part of `text` that has been typed after `elapsed_ms`.
#[wasm_bindgen]
pub fn typed(text: &str, elapsed_ms: f64, chars_per_sec: f64) -> String {
    let n = (elapsed_ms.max(0.0) / 1000.0 * chars_per_sec) as usize;
    text.chars().take(n).collect()
}

const DEGREES: [&str; 6] = [
    "Bachelor of Everything Ever Written",
    "Master of Tidy Explanations",
    "Doctor of Good Questions",
    "Bachelor of Rubber-Duck Debugging",
    "Master of Gentle Corrections",
    "Doctor of Tea and Marginalia",
];

const HONOURS: [&str; 4] = [
    "with distinction",
    "with honours",
    "with high curiosity",
    "magna cum laude, roughly",
];

/// Same name, same diploma, every time.
#[wasm_bindgen]
pub fn diploma_line(name: &str) -> String {
    let clean: String = name.trim().chars().take(40).collect();
    if clean.is_empty() {
        return String::new();
    }
    let h = fnv1a(&clean.to_lowercase());
    let degree = DEGREES[(h as usize) % DEGREES.len()];
    let honour = HONOURS[((h >> 8) as usize) % HONOURS.len()];
    format!("{} is hereby awarded the {}, {}.", clean, degree, honour)
}

/// A random index below n that differs from `avoid` (when n > 1).
#[wasm_bindgen]
pub fn pick_index(seed: u32, n: u32, avoid: u32) -> u32 {
    if n <= 1 {
        return 0;
    }
    let mut rng = Rng::new(seed);
    rng.next_u32();
    let mut i = rng.next_u32() % n;
    if i == avoid {
        i = (i + 1) % n;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fuzzy_matches_subsequences() {
        assert!(fuzzy_score("tea", "Tea going cold") > fuzzy_score("tgc", "Tea going cold") / 2);
        assert_eq!(fuzzy_score("zzz", "Tea going cold"), 0);
        assert_eq!(fuzzy_score("", "anything"), 1);
    }

    #[test]
    fn board_orders_by_votes() {
        let mut b = Board::new(3);
        b.vote(2);
        b.vote(2);
        b.vote(1);
        assert_eq!(b.order(), vec![2, 1, 0]);
        assert_eq!(b.serialize(), "0,1,2");
    }

    #[test]
    fn diploma_is_stable() {
        assert_eq!(diploma_line("Sam"), diploma_line("  Sam "));
        assert!(diploma_line("Sam").ends_with(&diploma_line("sam")[3..]));
        assert_eq!(diploma_line("   "), "");
    }

    #[test]
    fn typed_grows() {
        assert_eq!(typed("hello", 0.0, 10.0), "");
        assert_eq!(typed("hello", 200.0, 10.0), "he");
        assert_eq!(typed("hello", 9000.0, 10.0), "hello");
    }
}
