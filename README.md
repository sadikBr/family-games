# ألعاب العائلة — Family Games

A party-games app for family night. **Every player uses their own phone.** One person creates a room, everyone else joins with a 4-digit code, and the host picks the game.

| Game | | How it works on several phones |
|---|---|---|
| **الدخيل** (Imposter) | 3+ | Each phone shows the secret word, except the imposter's. Voting happens on the phones, and a caught imposter gets 25 s for one last guess. Play several rounds (set in the lobby) for a podium at the end. |
| **اسم ولد اسم بنت** | 2+ | A random letter is drawn and everyone fills 7 boxes on their own phone (boy, girl, animal, plant, thing, country, profession). Answers must start with the letter itself — «الرباط» doesn't count for ر. The first to finish hits «ستوب» (or, with «ستوب» off in the settings, everyone writes until the timer ends). Answers are checked against an Arabic dictionary (≈450k words from the Hunspell dictionary and everyday usage, plus curated names, cities and Moroccan words — `server/dictionary.ts`, built by `tools/names-dict.mjs`): a «؟» shows under a box while you write, and with the strict check (default; also «تنبيه فقط» or off) an unknown word is wrong unless most of the other players vote to keep it. The family then reviews the answers together and votes on wrong ones. A unique answer = 10, a shared one = 5 — also when spelled slightly differently («زيمبابوي» / «زمبابوي»). |
| **روندا** | 2–4 | Family rules: 4 cards each, no cards dealt to the table. Take matching cards plus the sequence that follows. دقة +1, مسّة +1, روندا 1 / ترينكا 5 (announced automatically), cards over 20 count. First to 41. |
| **الكانزة** | 2–4 | Play a card and take 1–2 table cards so the three add up to exactly 15. Scoring: every card = 1, gold = its number, 1 of gold = 20. |
| **التريس** | 4 | Two teams with partners sitting opposite, 10 cards each, follow suit, no trumps. 3 > 2 > 1 > 12 > 11 > 10 > 7…4. 1 = 1 pt, 3/2/figures = ⅓, last trick = 1. First to 31. |
| **الكونكان** | 2–4 | Spanish-deck rummy: draw, lay down sets (3–4 same number) or runs (3+ same suit), add to melds, discard. First to empty their hand wins the hand. Others count their cards (figures = 10). 100 = out. |
| **البلوط** (Saudi Baloot) | 4 | Two partnerships of two, 32-card French deck. Bidding «صن» / «حكم» / «أشكل» / «بس» in two rounds around the face-up card, the Saudi follow / trump rules, projects (سرا، خمسين، مية، أربعمية) and «بلوت», doubling (دبل، ثري، فور، قهوة), خسرانة and كبوت, a «لنا / لهم» score sheet to 152 (or 100). Bots bid and play. |
| **أونو فليب** (UNO FLIP) | 2–10 | Every card has a light side and a dark side. You see the active side of your own cards; everyone else sees the other side, so you know a bit about their hands. A Flip card turns the whole game over to the dark side (+5, Skip Everyone, Wild Draw Color). Say «أونو» with one card left or get caught for +2. Round winner scores the others' cards; first to 250 (adjustable) wins. |
| **أربعة في صف** (Connect Four) | 2 | Drop discs; four in a row wins. Bot opponent (casual or strong), wins are counted across games. |
| **الشطرنج** (Chess) | 2 | Full rules (castling, en passant, promotion, mate, stalemate, 50-move, repetition, insufficient material). Bot opponent. The rules engine is checked against standard perft counts. |
| **الكذّاب** (Cheat / Liar) | 2–6 | Spanish deck: play 1–4 cards face down claiming a rank; anyone can shout «كذّاب!». First to empty their hand wins. |
| **موجة** (Wavelength) | 2–12 | One player gives a clue for a secret point on a scale (بارد ↔ ساخن…); the others turn a dial. Closer = more points. |
| **كلمة السر** (Arabic Wordle) | 1–12 | Everyone races to find the same 5-letter word in 6 tries, with an Arabic on-screen keyboard. Guesses must be real words (a list of ~105k words built from the Ayaspell Hunspell dictionary and OpenSubtitles word frequencies — see `tools/wordle-dict.mjs`). |
| **الخربقة** (Kharbga) | 2 | The traditional Moroccan game on a 7×7 board: place two pieces per turn, then move one square and capture by sandwiching an enemy piece; captures chain. Simplified: a blocked player passes, and 80 moves without a capture ends the game on piece count. |
| **معركة السفن** (Battleship) | 2 | Each phone hides its own fleet (shuffle until you like it). Fire at the other sea; a hit lets you fire again. Bot hunts with parity and follows up hits. |
| **إكس أو** (Tic-tac-toe) | 2 | Boards from 3×3 to 9×9 (4×4–5×5: four in a row; 6×6 and up: five). X and O swap every game; wins are counted across games. On 3×3 the strong bot never loses; on bigger boards it plays by threats. |
| **سودوكو** (Sudoku) | 1–12 | Everyone races through the same puzzle (easy / medium / hard, always one solution). Wrong numbers are refused and count as mistakes. 300 / 200 / 150… points, −20 per mistake. |
| **معلومات عامة** (general quiz) | 2–12 | Timed multiple-choice questions: Morocco, geography, science, sport, animals, mixed. |
| **الذاكرة** (Memory) | 2–6 | Turn over two cards; a pair is yours and you play again. 16–30 cards using the app's own illustrations. |
| **حروف** (Huroof) | 2–12 | Two teams, a 5×5 grid of letter hexagons. Pick a letter; the first to press the buzzer types the answer to an Islamic question that starts with that letter (spelling slips are forgiven). Wrong → the other team gets the buzzer. Red joins right ↔ left, green top ↔ bottom. |
| **مسابقة إسلامية** (quiz) | 2–12 | Timed multiple-choice questions on Quran, prophets, seerah, companions, worship, Hajj, history and places. Faster right answers score more. |
| **من هو؟** (who is it?) | 2–12 | Clues about a prophet, companion, place or historical figure appear one by one; earlier = more points. Pick from options (one guess), or turn on «اكتب الاسم» to type the name (slips and short forms like «عمر» are accepted; a miss lets you try again at the next clue). |
| **من أي سورة؟** (which surah?) | 2–12 | A verse is shown (Uthmani text) — pick its surah. Levels: Juz' Amma, Qaf–an-Nas, the whole Quran. |
| **رحلة الحج** (Hajj journey) | 2–6 | Dice race along the Hajj rites; you stop at every station, where a card explains the ritual. The first pilgrim at a station opens its question for everyone (right answers earn a provision card, the fastest steps forward). Provision cards (التلبية +2, الدليل pass a station, ماء زمزم roll again, الصدقة help a friend, الصبر cancels a delay) are played before rolling. |
| **سلّم الحسنات** (snakes & ladders) | 2–6 | Ladders are good deeds, snakes are bad habits; each one shows a short card. |
| **ملك العقار** (property trading) | 2–6 | An original Monopoly-style game on a board of Moroccan cities and train stations. Buy, collect rent, build houses and hotels evenly on full colour sets, mortgage, trade with other players, draw «حظ» and «صندوق العائلة» cards. A property nobody buys goes to a 7-second auction for everyone. Ends when one player is left, or after the round limit (15 by default; richest net worth wins). Start cash and rounds are set in the lobby. |
| **لودو** (Ludo) | 2–4 | Each phone moves its own pieces on the shared board. A 6 brings a piece out and rolls again; landing on others sends them home (stars and start squares are safe); exact roll to finish. A single possible move is played for you. Options: keep playing for 2nd and 3rd place, and a quick game with two pieces each. |
| **الضامة** (Checkers) | 2 | 8×8 board, compulsory and chained captures (the longest capture is compulsory; can be switched off). Flying kings and backward captures can be switched off in the lobby. Play a friend or a bot. |
| **الكلمات السرية** (Codenames) | 4+ | Two teams. Only each team's spymaster sees on their phone which of the 25 Arabic words are theirs; they give a one-word clue and a number, the team points and reveals. Avoid the black word. Past clues stay listed. |
| **ارسم وخمّن** (Draw & Guess) | 2–12 | The drawer picks one of three words and draws on their phone; the drawing appears live on every phone and everyone types guesses. Faster = more points; letters are revealed near the end. |
| **على راسك** (Heads Up) | 2+ | The guesser holds the phone to their forehead (tilt down = correct, tilt up = skip). Everyone else sees the word on their own phone and can tap / . |
| **ممنوع تقول** (Taboo) | 4+ | Red vs Blue. The describer and the **other** team see the card. Team-mates see only "guess!" and the other team has a buzzer. |
| **البطاطا الحارة** (Hot Potato) | 3+ | A virtual potato jumps from phone to phone. Say a word from the topic, then throw it before it explodes at a random moment. |
| **الذئب** (Werewolf) | 5+ | The narrator's phone shows every role plus a step-by-step night/day script. Each player sees only their own role (wolves also see their pack). Roles (chosen in the lobby): wolf, big bad wolf (a second victim while no wolf has died), white wolf (kills a wolf every other night, wins alone), villager, seer, doctor, guard (not the same player twice in a row), witch (one heal, one poison), hunter, tanner (wins if voted out), plus an elected mayor whose vote counts double. |
| **المراحل العشر** (Phase-10-style rummy) | 2–6 | Our own 108-card deck (1–12 in four colours, جوكر, تخطَّ). Complete 10 phases of sets, runs and colours in order; lay down, add to groups, discard; a skip makes a chosen player miss a turn. Short game: the 5 even phases. Bots play. |
| **شبكة الكلمات** (Arabic word tiles) | 2–4 | A 15×15 board where words run right to left and top to bottom. 100 Arabic tiles with frequency-based points, premium squares, +50 for using all 7. Every word is checked against the Arabic dictionary; «ال» + a word counts. Turn timer and bot level in the lobby; bots only play everyday words (`server/data/common-words.txt`). |
| **تمثيل صامت** (Charades) | 4–12 | Two teams. The actor's phone shows a word or phrase (323, by category and difficulty) to act out silently; the other team sees it too, to keep it fair. «صح» / «تخطَّ», turn timer, limited free skips. |
| **الجاسوس** (The spy) | 3–10 | Everyone but the spy (1–2) sees the same place and a role there (50 places). Ask each other questions in a suggested order; accuse someone (majority vote), or the spy reveals and guesses the place. Rounds with points and a podium. |
| **الرسم المتسلسل** (Telestrations) | 3–12 | Everyone picks (or writes) a phrase; the books then go round: draw the previous phrase, guess the previous drawing, draw that guess… Each phone only sees the page before its own. Then every book is revealed page by page to everyone, and the family votes for «أفضل رسمة» and «أطرف تخمين». |
| **كلمة واحدة** (Just One) | 3–10 | Co-op: one guesser, everyone else writes a one-word clue for the secret word. Identical or near-identical clues cancel each other before the guesser sees them. 13 cards (or 7), a rating at the end. 545 everyday words with associations, so bots can give clues and guess. |
| **ماذا قال الناس؟** (Family survey) | 2–12 | Two teams. Guess the most common answers to questions for Moroccan families (216 questions; the answers are the game's own estimates, not a poll). Buzzer face-off, the team in control answers in turn, 3 ✗ and the other team can steal. The last rounds count ×2 and ×3. Bots play. |
| **المربعات** (Dots and boxes) | 2–4 | Grids from 3×3 to 6×6; touch between two dots to draw a line, and closing a box scores it and gives another turn. Bots: easy, medium, hard (plays the chain endgame). |
| **المنقلة** (Mancala, Kalah rules) | 2 | 6 pits and a store each, 3–6 seeds per pit. A last seed in your store means play again; a last seed in an empty pit on your side captures the opposite pit. Bots up to a 9-move search. |
| **المستوطنون** (Catan-style, official base rules) | 3–4 | 19 land hexes, number tokens and 9 harbours (beginner layout or random with 6/8 never touching). Snake-order setup, production, the robber and the 7 (everyone over 7 cards discards half on their own phone), 25 development cards, longest road and largest army, bank trades 4:1 / 3:1 / 2:1 and player-to-player offers accepted on each phone. First to 10 points on their own turn wins (8/12 in the settings). Bots play and trade. |
| **المدن والطرق** (Carcassonne-style, official base rules) | 2–5 | The 72 base tiles; each tile must match its neighbours. One follower per turn on a road, city, monastery or field; completed features score during the game, everything else (and farmers, 3 per completed city) at the end. The board pans and zooms; only legal spots and rotations are offered. Bots play. |
| **القطع الملونة** (Blokus-style) | 2–4 | 21 polyomino pieces each; every new piece must touch your colour corner-to-corner only, never side-to-side. Rotate, flip, preview (green = allowed), place. 14×14 for two, 20×20 for 3–4. Bots play. |
| **فك الشيفرة** (Mastermind-style) | 1–6 | Everyone races to crack the same hidden code (4–5 slots, 6 or 8 colours, each with its own shape). ● right colour and place, ○ right colour elsewhere. You see others' clues but not their colours. |
| **حروف مبعثرة** (Boggle-style) | 1–12 | Everyone gets the same letter grid; swipe adjacent letters to make words (3+ letters, no «ال»), checked against the dictionary. Longer words score more; words found by two players cancel (can be switched off). |
| **من القائل؟** | 1–12 | Words the Quran quotes from someone — a prophet, an angel, a righteous woman, even the ant or the hoopoe. Pick who said it; the surah and verse are shown after. |
| **مسابقة التجويد** | 1–12 | A verse in Uthmani script with one word coloured: pick its tajweed rule (Hafs ʿan ʿAsim). Topics: nun sakinah and tanween, mim sakinah, madd, qalqalah, the lam of Allah, sun/moon letters, or all. |
| **كلمة قرآنية** | 1–12 | Wordle with five-letter words from the Quran (prophets, surahs, places, names of Allah, well-known Quranic words). After each round, a verse containing the word. |
| **أسماء الله الحسنى** | 1–6 | The 99 names (the well-known list narrated by at-Tirmidhi) with short meanings: match a name to its meaning, or play memory with name/meaning cards. |
| **رتّب الخطوات** | 1–12 | Put steps in order: wudu, salah, umrah, the Hijri months, the battles of the Prophet ﷺ… Points for each step in the right place, plus speed for a perfect order. |
| **أين المكان؟** | 1–12 | Place cities and sites of the Muslim world on a map; points by real distance. Whole map, or zoomed rounds on the Maghreb and al-Andalus or the Mashriq. |
| **قصص الأنبياء** | 1–8 | Cooperative: a prophet's story told chapter by chapter as in the Quran, with the surah. After each chapter the family votes on a question; every wrong answer puts out a lantern. |
| **ابنِ المسجد** | 1–8 | Cooperative: answer Islamic questions together to build a Moroccan mosque piece by piece, from the foundation to the minaret, before the rounds run out. |

## Playing together

- **Tournaments:** «بطولة» in the waiting room plays several games in a row with a family leaderboard (see [البطولات](#البطولات-tournaments)).
- **Home screen:** join a room or go back to the last one, «مجموعاتي» (see [المجموعات](#المجموعات-groups)), «لعبة اليوم» (a different game each day), «لعبتم مؤخراً», and every game with search, a «كم عددكم؟» player-count filter (bot games count as playable with fewer people) and category chips. Tap the star on a game to keep it in «المفضلة» (saved on the phone).
- **Invite:** tap the room code (or «ادعُ أحداً» in the room menu) to share a link that opens the app on the join screen with the code filled in.
- **Room menu** (the people icon at the top of every room): who is connected, mute, and for the host: remove a player or go back to the waiting room.
- **Your turn:** your phone plays a sound and vibrates when it becomes your move, in every turn-based game.
- **Turn bar:** under the header of every game, «دورك!» (yellow) or «دور سارة» with their avatar, from the game's `turnOf`; hidden while everyone plays at once. Under it, the last move in one sentence («ورقة من ماما: 7 كؤوس»), sent by the game with `ctx.say?.()` — never hidden information, and never a verb that agrees with the player (we don't know their gender): «شراء لبابا: …», «كلمة من سلمى: …».
- **Bot speed:** the room leaves a pause after someone else's move (and between two steps of a bot's own turn) so everyone sees what happened. The host picks «بطيئة / عادية / سريعة» in the waiting room or the room menu, also mid-game (`PACE` in `server/room.ts`). Answers and votes that race a timer are not slowed down.
- **Each game has its own look:** the room glows in the game's colour (the colour of its card on the home screen) and its emblem sits in the header; shared pieces pick the colour up through `useAccent()` (`src/ui/accent.tsx`). Players are shown with the shared `PlayerStrip` chips (`src/games/player-strip.tsx`), finals follow the same order (result → podium → scores → play again), and the waiting room is the game's cover with seats to fill.
- **Animations stay gentle:** short fades and small growth (`src/ui/motion.ts`), no bounces or zooms from nothing.
- **Someone's phone drops:** after 20 s a bot plays for them until they come back (marked «البوت يلعب عنه»). If the host drops, the host role passes to someone else after 15 s. In روندا، الكانزة and التريس, a player who leaves is replaced by a bot so the table stays full.
- **Two-player games** alternate who starts and keep a running score for the room; you can resign.
- **Questions don't repeat** between games in the same room (quiz, who is it, which surah, Hajj, Huroof) until the pool runs out.

## المجموعات (groups)

Save the family once, then start a room with everyone in one tap — no code to share each time.

- **Make a group:** on the home screen, «مجموعاتي» → «أنشئ مجموعة للعائلة» (or «مجموعة جديدة»), give it a name. The group screen shows a 6-letter code (no 0/O or 1/I, case doesn't matter) and «شارك رابط الدعوة», which shares `familygames://group?code=XXXXXX`. Opening the link on a phone with the app adds that phone to the group (after choosing a name on a first launch); typing the code in «انضم إلى مجموعة» does the same. No accounts: a member is a phone (its player id).
- **«لنلعب»:** any member presses it (home card or group screen). The server opens a normal room, with the group's last game, and puts the caller in it:
  - members with the app open get an invitation over whatever screen they are on («دعوة من سارة» — «ادخل» / «لاحقاً»), with a chime and a buzz;
  - members whose app is closed get a push notification («ألعاب العائلة — دعوة من سارة: «العائلة» تلعب الآن — ادخل!»); tapping it opens the room;
  - the group card switches to «يلعبون الآن — ادخل», so anyone can still join later.
  One call per group per minute: pressing again just joins the live room.
- **Waiting room:** at the top, «بانتظار «العائلة»» lists every member — in the room ✓, app open (on another screen), or app closed (notified). The game can't start until everyone is in («اكتمل الجمع!»), but the caller or the host can press «ابدأ بالموجودين» to go on without the missing ones; picking the game and settings is allowed meanwhile. Someone arriving later joins normally.
- **Presence:** the app stays connected while it is open (not only in a room), so the server knows who has it open; on a phone it disconnects when sent to the background outside a room, so that person gets a notification instead of an invitation nobody sees.
- **Limits:** 20 groups per phone, 30 members per group, names up to 30 characters. Any member can rename the group; only its creator can remove members (when the creator leaves, the longest-standing member takes over); the last member to leave deletes it.

**Storage.** Rooms stay in memory, but groups, members and push tokens are saved in a small SQLite file (`bun:sqlite`, WAL), `family-games.db`, in:

| Variable | Meaning |
|---|---|
| `DATA_DIR` | folder for the database (wins if set) |
| `RAILWAY_VOLUME_MOUNT_PATH` | set by Railway when a volume is attached — used when `DATA_DIR` is not set |
| *(neither)* | `./data` — fine on a computer; the server logs a warning, because a host without a volume starts empty after each redeploy and the groups are lost |

On Railway: open the `family-games` service → **Settings → Volumes → Add volume**, mount path `/data`. Railway then sets `RAILWAY_VOLUME_MOUNT_PATH=/data` and redeploys; the groups survive every later `railway up`.

**Push notifications** (`expo-notifications`, sent through the Expo push service by `server/groups.ts`):

- Configured: the Firebase project `family-games-f2665` gives Android its push tokens — its `google-services.json` sits at the repo root and is referenced by `expo.android.googleServicesFile` in `app.json`; the FCM V1 service-account key is uploaded to the Expo project's credentials (expo.dev → project → Credentials → Android → FCM V1). Never commit a service-account key (`.gitignore` covers it).
- The app asks for notification permission once, after the first group create / join, with a one-line explanation first; Android shows the `group-calls` channel (high importance, default sound; small icon `assets/images/notification-icon.png`). Push needs a real build (`eas build`), not Expo Go, and doesn't exist on the web — the in-app invitation works everywhere.
- Without a push token (permission refused, no Google services, an old build) everything still works; those phones only get invitations while the app is open.
- Optional `EXPO_ACCESS_TOKEN` server variable: only if «enhanced push security» is turned on in the Expo project; it is then sent as a Bearer token.
- Tokens Expo reports as `DeviceNotRegistered` are dropped; failures are logged and never slow the server.

Code: `server/db.ts` (SQLite + migrations), `server/groups.ts` (presence, messages, «لنلعب», push), `Room.group` in `server/room.ts` (waiting list, «ابدأ بالموجودين»); `src/app/group.tsx`, `src/groups/` (home cards, forms, invitation sheet, waiting panel), `src/lib/push.native.ts`; tests in `server/groups.test.ts`.

## البطولات (tournaments)

One evening, several games in a row, a running family leaderboard and a final champion. In the waiting room the host switches «لعبة واحدة | بطولة» (everyone sees the set-up) and picks a format:

- **«دوري» (league):** 3–10 games in order (repeats allowed): «أضف لعبة» opens the game grid, «اختيار عشوائي» fills the list with short games playable with the people here, each row can move up / down or go; tapping a row shows that game's settings below (each game is played with its own lobby settings). Every finished game gives points by place — **1st 5, 2nd 3, 3rd 2, 4th 1, everyone else who finished 1**; players sharing a place get its points in full; co-op games give everyone 3 if the family won, 1 if it lost. Between games, «الترتيب بعد اللعبة 2 من 5» shows the table (the last game's points fade in) and the next game; the host taps «ابدأ اللعبة التالية» (or «تخطَّ اللعبة»). Champion: the best total; a tie goes to the most first places, then the title is shared.
- **«خروج المغلوب» (knockout):** a bracket of duels between the people present at the start (2–16, random draw, byes for the top seeds when the count isn't a power of two), on a game two people can play (X/O, chess, Connect 4, Dama, mancala…; optionally «لعبة مختلفة لكل دور»). Each duel starts the game with just its two players — the others watch («أنت تتفرّج»). A draw is played again (twice at most), then the higher seed goes on; someone who left the room loses their duel. The bracket screen shows every round and «التالي: ماما ضد بابا».
- **Bots** can fill seats in league games but are never ranked: no points, no titles, never in a bracket (the places close up around them).
- **During a game:** a chip under the turn bar («البطولة — اللعبة 2 من 5» / «نصف النهائي — ماما ضد بابا») opens the standings or the bracket. On the game's final screen «العب مجدداً» becomes the tournament actions: «+5 نقاط في البطولة» and everyone's points, then «ترتيب البطولة» (host). The room menu has «أعد اللعبة», «تخطَّ اللعبة» and «إنهاء البطولة» (ends it without saving). A game that ends without a result gives no points.
- **Champion:** «بطل البطولة» with a crown, the podium (league) or the final (knockout), the full table; «بطولة جديدة» (same settings) or «العودة إلى الانتظار».
- **«لوحة الشرف»:** tournaments finished in a group's room are saved with the group (table `tournaments`, migration 3) — the group screen shows titles per member (crowns), the last 10 champions with date and format, and points over all tournaments (a knockout counts 5 for the champion, 3 for the finalist, 2 for a semi-finalist, 1 for the others).

Code: `src/shared/tournament.ts` (types, points, brackets, checks), `server/tournament.ts` (the tournament state, the honour board), the `tournament*` room actions and `GameModule.result()` in `server/room.ts`; `src/games/tournament-setup.tsx`, `src/games/tournament.tsx`, `src/groups/honor-board.tsx`; tests in `server/tournament.test.ts`.

## Voice chat

Tap the microphone at the top of any room to join the room's voice chat. Others see who is in it and can join with «انضم». Once you're in, the same button mutes and unmutes you; the strip under the header shows everyone in voice (glowing while they talk, a red mark when muted), and the red button hangs up.

- **Phone to phone:** every phone connects directly to every other phone with WebRTC (`react-native-webrtc`; in the browser, the browser's own WebRTC). The game server only keeps the list of who is in voice and passes the connection set-up messages; the sound doesn't go through it. That works well up to about 8 people. Echo cancellation and noise suppression come with WebRTC, and the sound plays on the loudspeaker (or headphones / Bluetooth when connected) while voice is on.
- **If two phones can't reach each other** (some mobile networks block direct connections), the sound needs a relay. The server can hand out free [Cloudflare TURN](https://developers.cloudflare.com/realtime/turn/) relay credentials (free up to 1,000 GB a month — far more than a family uses):
  1. In the Cloudflare dashboard (free account), open **Realtime → TURN** and create a TURN key. Copy its **key id** and **API token**.
  2. In Railway, open the `family-games` service → **Variables** and add `CF_TURN_KEY_ID` and `CF_TURN_API_TOKEN` with those values. Railway restarts the server.
  Without them, voice still works on Wi-Fi and most networks; only some mobile-data connections will fail to connect.
- Code: `src/lib/voice.ts` (connections, mute, who is talking), `src/lib/rtc.ts` / `rtc.native.ts` (web / phone WebRTC), `src/games/voice-ui.tsx` (button and strip), `server/voice.ts` (ICE servers, message checks); the server's room keeps the voice list.

## Bots

Not enough people? In the lobby, the host taps **«أضف بوت»** (up to 8). Tap a bot to remove it.

| Game | What bots do |
|---|---|
| الدخيل | Get ready, show a clue on screen, vote, and guess the word if caught. Clues are traits shared by several words of the category (`server/imposter-traits.ts`), so they never give the word away; imposter bots bluff with a common trait |
| اسم ولد اسم بنت | Fill their boxes one by one from a built-in dictionary (`server/bot-content.ts`). They don't always find an answer |
| البطاطا الحارة | Shout a word from the topic and throw the potato |
| لودو، الضامة | Bots roll, capture when they can and keep their pieces safe |
| حروف، مسابقة، من هو؟، من أي سورة؟، معلومات عامة | Bots answer after a while and are right about 65–70% of the time (on a team with people, they wait so people answer first) |
| رحلة الحج، سلّم الحسنات | Bots roll and answer question squares |
| الخربقة، معركة السفن، إكس أو، أربعة في صف، الشطرنج | Casual or strong bot, chosen in the lobby |
| سودوكو | Bots fill one correct cell every few seconds, at a human pace |
| الذاكرة | Bots remember most of the cards they have seen |
| ملك العقار | Bots buy while keeping a cash reserve, build on full sets, offer trades that finish a colour set and judge offers by value |
| Card games | Bots play their own cards (they capture, follow suit, meld and discard). Use them to fill the 4 seats of التريس |
| الذئب | Night picks for bot wolves / big bad wolf / white wolf / guard / doctor / seer / witch / hunter are made automatically on the narrator's screen, and a dying bot mayor names a successor. In the day, bots accuse someone (a bot seer goes after the wolf it found) |

Bots sit out **على راسك**، **ممنوع تقول**، **الكلمات السرية** and **ارسم وخمّن**, since those games need real people. The narrator is never a bot.

## Run it

You need two things running on your computer: the **game server** and the **Expo dev server**.

```bash
bun install
bun run dev          # starts both (or: `bun run server` + `bunx expo start` in two terminals)
```

Open the app on each phone (Expo Go or a development build). The phones must be on the **same Wi-Fi** as the computer.
The app finds the server automatically: it uses the same computer that serves the Expo bundle, on port `5757`.

> If phones can't connect, check that your firewall allows port **5757**. You can also set the server address manually in the app: Profile → إعدادات الخادم.

### Deploying the server (optional)

`server/` is a tiny dependency-free Bun app, so it runs on any host that supports Bun and WebSockets (Fly.io, Railway, Render, a VPS…).
Build the app with `EXPO_PUBLIC_SERVER_URL=wss://your-server.example.com` so phones connect there instead of to your laptop.

## Project layout

```
server/              Realtime game server (Bun WebSockets). Source of truth for every game.
  index.ts           Rooms, connections, timers
  room.ts            Lobby, settings, sending each player only what they may see
  db.ts, groups.ts   Groups: SQLite storage (DATA_DIR / Railway volume), presence, «لنلعب», push notifications
  tournament.ts      Tournaments (league / knockout) and the groups' honour board
  games/*.ts         Game logic: imposter, names, headsup, taboo, potato, werewolf, ronda, kanza, tris, konkan, unoflip, ludo, dama, codenames, draw, estate, huroof, quiz, whois, surah, hajj, ladders, connect4, chess, kdab, wave, wordle, kharbga, battleship, xo, sudoku, trivia, memory
  cardkit.ts         Deck / seats / teams helpers for the card games
  content.ts         Arabic word decks, Taboo cards, Hot Potato topics ← add your own!
  content-extra.ts   Words for Codenames and Draw & Guess
  bot-content.ts     What bots know: imposter fallback hints, potato answers
  names-words.ts     «اسم ولد اسم بنت» word lists (names, animals, plants, things, countries & cities, jobs): bots' answers, also accepted by the dictionary check
  imposter-traits.ts Shared traits bots use as «الدخيل» clues
  dictionary.ts      Arabic dictionary lookup for «اسم ولد اسم بنت» (data/names-dict.txt)
  content-islamic.ts, content-trivia.ts, content-games2.ts, content-extra.ts  Questions and word lists for the other games
  server.test.ts     End-to-end tests with fake phones (bun run test:server)
  rules.test.ts      Unit tests for the card rules
  fix-*.test.ts, turn.test.ts  Tests for freezes, fairness and turn alerts
  duel.ts, qdeck.ts  Rematch series for 2-player games; per-room question decks
src/
  shared/protocol.ts Types shared by the app and the server
  app/               Screens: home, profile, join, room, group
  groups/            Group cards on the home screen, create / join sheets, the invitation sheet, the waiting panel
  games/             Lobby, settings and one screen per game (games/cards/ for the card games)
  shared/cards.ts    The 40-card Spanish deck (ذهب، كوبا، سيوف، زرواطة)
  shared/uno.ts      The 112 two-sided UNO FLIP cards and matching rules
  shared/ludo.ts     Ludo board geometry (track, home columns, safe squares)
  shared/estate.ts   «ملك العقار» board, rents and cards
  shared/chess.ts    Chess rules engine + bot (used by the server)
  shared/connect4.ts Connect Four rules + bot
  shared/wordle.ts   Word normalisation, keyboard, marking
  shared/kharbga.ts, battleship.ts, xo.ts, sudoku.ts, memory.ts  Rules and bots for the newest games
  shared/islamic.ts  Hajj stations, good deeds / bad habits, board geometry for the Islamic games
  ui/dice3d.tsx      3D dice thrown across the board, rendered live with three.js on expo-gl (ui/dice-scene.ts); sprite fallback
  art/               Illustrations: avatars, game emblems, roles, cards (HD WebP, see assets.ts) + vector icons
  ui/                Gamey UI kit: 3D buttons, timers, confetti, hold-to-reveal…
  lib/               Connection client, profile, sounds/haptics, tilt sensor
assets/sounds/       Generated sound effects
assets/art/          HD illustrations (avatars, game emblems, Werewolf roles, Spanish deck, UNO FLIP faces)
```

## RTL & Arabic

The UI is RTL everywhere. The root view uses `direction: 'rtl'`, `app.json` forces RTL through `expo-localization`, and on the web `<html dir="rtl">` is set.
Fonts are **Lalezar** (titles) and **Baloo Bhaijaan 2** (text).
Text never uses `textAlign: 'left' | 'right'`, because React Native swaps those under RTL. Use natural alignment or `center` instead.

All player-facing text and word lists are Modern Standard Arabic (الفصحى), with no dialect words. `server/fusha-ui.test.ts` scans the app and server strings for common dialect words, and the word games use dialect blocklists. Dialect spellings may appear only as hidden accepted aliases (e.g. a typed answer in «ماذا قال الناس؟»), never as displayed text.

## Checks

```bash
bun run typecheck
bun run lint
bun run test:server
```

## Islamic content

- Questions, «من هو؟» clues, Hajj stations and deeds are in `server/content-islamic.ts` and
  `src/shared/islamic.ts`. They were reviewed for accuracy (no disputed answers, only well-known authentic
  hadith). If you add questions, keep the wrong options clearly wrong.
- Quran text for «من أي سورة؟» is `server/quran-data.json`, built from
  [quran-json](https://github.com/risan/quran-json) 3.1.2 — Uthmani text from
  [quranenc.com](https://quranenc.com), licensed CC BY-SA 4.0. Very short verses and verses that appear
  word-for-word in more than one surah are left out, so every question has exactly one right answer.
- «من القائل؟», «مسابقة التجويد» and «كلمة قرآنية» use the complete text in `server/data/quran-full.json`
  (all 6236 verses, same source and licence, built by `tools/quran-full.mjs`). Every quote, tajweed example and
  story chapter of «قصص الأنبياء» cites its surah and verse, and tests check the citations against the Quran data.
- Tajweed rules follow Hafs ʿan ʿAsim. The 99 names follow the list narrated by at-Tirmidhi, with short
  meanings. Prophets' stories stay with what the Quran itself says.
- Verses are shown with the Amiri Quran font. The art never depicts prophets, companions or angels.

## Putting it online and making an APK

The app needs the game server to be reachable from every phone. This setup puts the server on
[Railway](https://railway.com) (free, no card) and builds an Android APK with Expo's cloud builder (EAS).

### 1. Put the server online (Railway)

In the project folder:

```bash
npx @railway/cli up        # sign in / create an account in the browser, then it builds and deploys
npx @railway/cli domain    # prints the public address, e.g. https://family-games-production-1a2b.up.railway.app
```

`railway up` creates the project and service by itself and builds the `Dockerfile` (a couple of minutes).
Opening `…/health` in a browser should show `{"ok":true,…}`.

Cost: new accounts get a $5 trial for 30 days, then the Free plan gives $1 of usage per month, no card.
The server uses about 32 MB of memory, roughly $0.30–0.50 a month at Railway's prices, and it doesn't
sleep. If the monthly credit ever runs out, the server stops until the next month (usage is shown in the
Railway dashboard). To update the server later, run `npx @railway/cli up` again.

<details>
<summary>Alternative: Render</summary>

`render.yaml` is a Render Blueprint (New → Blueprint → pick the GitHub repo). Render's free plan sleeps
after 15 minutes without players (about a minute to wake) and may ask for a card for verification.
</details>

### 2. Build the APK

1. In `eas.json`, replace `wss://REPLACE-ME` with your server address, starting with `wss://` instead of
   `https://` (e.g. `wss://family-games-production-1a2b.up.railway.app`).
2. Create a free account on expo.dev, then in the project folder:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build -p android --profile preview
   ```
   The first time it asks to create the EAS project and to generate an Android keystore — answer yes to
   both. The build runs on Expo's servers; on the free plan it can wait in a queue for a while.
3. When it finishes you get a link and a QR code. Open it on the phone, download the `.apk` and install
   it (Android asks you to allow installing apps from this source). Send the same file to the family.

### Building the APK on a Windows PC

EAS local builds don't run on Windows, so `scripts/build-apk-windows.ps1` builds with Gradle directly
(same app and server address as the EAS «preview» build).

1. Install [Bun](https://bun.sh). The build also needs Node.js (Expo runs `npm`, Gradle runs `node`); if it
   isn't installed, the script downloads a portable copy (zip, no admin) to `C:\Android\node-v22…`.
2. JDK 17, as a zip: [Microsoft Build of OpenJDK 17](https://learn.microsoft.com/java/openjdk/download#openjdk-17)
   (or [Eclipse Temurin 17](https://adoptium.net/temurin/releases/?version=17&os=windows&arch=x64&package=jdk) → `.zip`).
   Unzip to `C:\Android\jdk-17`.
3. Android command-line tools: [developer.android.com/studio](https://developer.android.com/studio#command-line-tools-only)
   → «Command line tools only» → Windows. Unzip, then move the inner `cmdline-tools` folder so that
   `C:\Android\sdk\cmdline-tools\latest\bin\sdkmanager.bat` exists.
4. Put the project in a short path (e.g. `C:\fg`) — the native build breaks on long Windows paths.
5. Double-click `scripts\build-apk-windows.cmd` (or `bun run build:apk-windows`). The first run installs the
   SDK packages and takes 10–30 minutes; the APK ends up as `family-games.apk` in the project folder.
   Other locations: `-JavaHome …` / `-AndroidHome …` / `-NodeHome …` (folder with `node.exe`) (or the `JAVA_HOME` / `ANDROID_HOME` variables).

The APK is signed with a local key, so a phone that has the GitLab-built APK must uninstall it first.

### Updating later

- **Server / game rules:** `npx @railway/cli up` (attach a volume first so the groups survive it — see [المجموعات](#المجموعات-groups)).
- **App screens or new games:** build a new APK (step 2) and install it over the old one.
- The server address can still be changed inside the app («إعدادات الخادم» on the profile screen), for
  example to play on a computer at home over Wi-Fi (`bun run server`).
