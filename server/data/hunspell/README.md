# Ayaspell Arabic dictionary (Hunspell)

`ar.aff` and `ar.dic` are the Arabic Hunspell dictionary of the Ayaspell project
(<http://ayaspell.sourceforge.net/>, version 3.5), unchanged, as packaged by LibreOffice:
<https://github.com/LibreOffice/dictionaries/tree/master/ar> (commit 67032ee9, October 2026).

- Authors: Mohamed Kebdani (Hunspell-ar, 2006–2008) — see `AUTHORS.txt`.
- License: GPL 2.0 / LGPL 2.1 / MPL 1.1 tri-license — see `COPYING.txt`. These two files are data read
  by the server at run time; they are used under the MPL 1.1 / LGPL terms and are not modified.

## How the server uses them

`server/hunspell.ts` is a small checker written for this dictionary (no npm package: the Docker image
runs plain Bun without node_modules). It reads both files the first time a typed word is not on the
game's own lists (≈ 0.15–0.3 s, ≈ 15 MB of heap) and accepts a word when it is an entry, or an entry
with a prefix, a suffix, both, or two suffixes, as Hunspell's own rules allow. Letters are folded like
`norm()` in `src/shared/arabic.ts` (أ إ آ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي, no diacritics), so players'
spellings match. If the files are missing, the games go on with their lists alone.

Checked against real Hunspell (the hunspell-asm WebAssembly build of hunspell 1.7, exact spelling, no
folding): the 1,000,000 most frequent OpenSubtitles words, 100,000 one-letter mutations of them and
105,000 generated forms (with every kind of affix combination) plus 105,000 mutations — the two agree on
every word.

Used by «اسم ولد اسم بنت» (common-noun columns), «شبكة الكلمات», «حروف مبعثرة» and «كلمة السر»
(see each game for which prefixes it allows); `tools/hunspell-forms.ts` expands the dictionary into
the 5-letter forms merged into `../wordle-valid.txt` by `tools/wordle-dict.mjs`. Bots never use it.

To update: download `ar/ar.aff` and `ar/ar.dic` from the repository above into this folder, then run
the tests (`server/hunspell.test.ts`) and rebuild the «كلمة السر» list (see `tools/wordle-dict.mjs`).
