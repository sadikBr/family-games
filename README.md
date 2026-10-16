# ألعاب العائلة — Family Games

A party-games app for family night. **Every player uses their own phone.** One person creates a room, everyone else joins with a 4-digit code, and the host picks the game.

| Game | | How it works on several phones |
|---|---|---|
| **الدخيل** (Imposter) | 3+ | Each phone shows the secret word, except the imposter's. Voting happens on the phones, and a caught imposter gets one last guess. |
| **اسم ولد اسم بنت** | 2+ | A random letter is drawn and everyone fills 6 boxes on their own phone (boy, girl, animal, plant, thing, country). The first to finish hits «ستوب ». The family then reviews the answers together and votes on wrong ones. A unique answer = 10, a shared one = 5. |
| **روندا** | 2–4 | Family rules: 4 cards each, no cards dealt to the table. Take matching cards plus the sequence that follows. إسطي +1, مسّة +1, روندا 1 / تريلا 5 (announced automatically), cards over 20 count. First to 41. |
| **الكانزة** | 2–4 | Play a card and take 1–2 table cards so the three add up to exactly 15. Scoring: every card = 1, gold = its number, 1 of gold = 20. |
| **التريس** | 4 | Two teams with partners sitting opposite, 10 cards each, follow suit, no trumps. 3 > 2 > 1 > 12 > 11 > 10 > 7…4. 1 = 1 pt, 3/2/figures = ⅓, last trick = 1. First to 31. |
| **الكونكان** | 2–4 | Spanish-deck rummy: draw, lay down sets (3–4 same number) or runs (3+ same suit), add to melds, discard. First to empty their hand wins the hand. Others count their cards (figures = 10). 100 = out. |
| **أونو فليب** (UNO FLIP) | 2–10 | Every card has a light side and a dark side. You see the active side of your own cards; everyone else sees the other side, so you know a bit about their hands. A Flip card turns the whole game over to the dark side (+5, Skip Everyone, Wild Draw Color). Say «أونو» with one card left or get caught for +2. Round winner scores the others' cards; first to 250 (adjustable) wins. |
| **حروف** (Huroof) | 2–12 | Two teams, a 5×5 grid of letter hexagons. Pick a letter; the first to answer the Islamic question (answer starts with that letter) wins the hexagon. Red joins right ↔ left, green top ↔ bottom. |
| **مسابقة إسلامية** (quiz) | 2–12 | Timed multiple-choice questions on Quran, prophets, seerah, companions, worship, Hajj, history and places. Faster right answers score more. |
| **من هو؟** (who is it?) | 2–12 | Clues about a prophet, companion, place or historical figure appear one by one; one guess each, earlier = more points. |
| **من أي سورة؟** (which surah?) | 2–12 | A verse is shown (Uthmani text) — pick its surah. Levels: Juz' Amma, Qaf–an-Nas, the whole Quran. |
| **رحلة الحج** (Hajj journey) | 2–6 | Dice race along the Hajj rites; you must stop at every station, where a card explains the ritual. Good-deed / delay squares and question squares. |
| **سلّم الحسنات** (snakes & ladders) | 2–6 | Ladders are good deeds, snakes are bad habits; each one shows a short card. |
| **ملك العقار** (property trading) | 2–6 | An original Monopoly-style game on a board of Moroccan cities and train stations. Buy, collect rent, build houses and hotels evenly on full colour sets, mortgage, trade with other players, draw «حظ» and «صندوق العائلة» cards. No auctions. Ends when one player is left, or after the round limit (richest net worth wins). Start cash and rounds are set in the lobby. |
| **لودو** (Ludo) | 2–4 | Each phone moves its own pieces on the shared board. A 6 brings a piece out and rolls again; landing on others sends them home (stars and start squares are safe); exact roll to finish. |
| **الضامة** (Checkers) | 2 | 8×8 board, compulsory and chained captures. Flying kings and backward captures can be switched off in the lobby. Play a friend or a bot. |
| **الكلمات السرية** (Codenames) | 4+ | Two teams. Only each team's spymaster sees on their phone which of the 25 Arabic words are theirs; they give a one-word clue and a number, the team points and reveals. Avoid the black word. |
| **ارسم وخمّن** (Draw & Guess) | 2–12 | The drawer picks one of three words and draws on their phone; the drawing appears live on every phone and everyone types guesses. Faster = more points; letters are revealed near the end. |
| **على راسك** (Heads Up) | 2+ | The guesser holds the phone to their forehead (tilt down = correct, tilt up = skip). Everyone else sees the word on their own phone and can tap / . |
| **ممنوع تقول** (Taboo) | 4+ | Red vs Blue. The describer and the **other** team see the card. Team-mates see only "guess!" and the other team has a buzzer. |
| **البطاطا الحارة** (Hot Potato) | 3+ | A virtual potato jumps from phone to phone. Say a word from the topic, then throw it before it explodes at a random moment. |
| **الذئب** (Werewolf) | 5+ | The narrator's phone shows every role plus a step-by-step night/day script. Each player sees only their own role (wolves also see their pack). |

## Bots

Not enough people? In the lobby, the host taps **«أضف بوت»** (up to 8). Tap a bot to remove it.

| Game | What bots do |
|---|---|
| الدخيل | Get ready, show a one-word clue on screen (imposter bots bluff with a clue for a similar word), vote, and guess the word if caught |
| اسم ولد اسم بنت | Fill their boxes one by one from a built-in dictionary (`server/bot-content.ts`). They don't always find an answer |
| البطاطا الحارة | Shout a word from the topic and throw the potato |
| لودو، الضامة | Bots roll, capture when they can and keep their pieces safe |
| حروف، مسابقة، من هو؟، من أي سورة؟ | Bots answer after a while and are right about 65–70% of the time (on a team with people, they wait so people answer first) |
| رحلة الحج، سلّم الحسنات | Bots roll and answer question squares |
| ملك العقار | Bots buy while keeping a cash reserve, build on full sets, offer trades that finish a colour set and judge offers by value |
| Card games | Bots play their own cards (they capture, follow suit, meld and discard). Use them to fill the 4 seats of التريس |
| الذئب | Night picks for bot wolves / doctor / seer / hunter are made automatically on the narrator's screen. In the day, bots accuse someone (a bot seer goes after the wolf it found) |

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
  games/*.ts         Game logic: imposter, names, headsup, taboo, potato, werewolf, ronda, kanza, tris, konkan, unoflip, ludo, dama, codenames, draw, estate, huroof, quiz, whois, surah, hajj, ladders
  cardkit.ts         Deck / seats / teams helpers for the card games
  content.ts         Arabic word decks, Taboo cards, Hot Potato topics ← add your own!
  content-extra.ts   Words for Codenames and Draw & Guess
  bot-content.ts     What bots know: imposter clues, names dictionary, potato answers
  server.test.ts     End-to-end tests with fake phones (bun run test:server)
  rules.test.ts      Unit tests for the card rules
src/
  shared/protocol.ts Types shared by the app and the server
  app/               Screens: home, profile, join, room
  games/             Lobby, settings and one screen per game (games/cards/ for the card games)
  shared/cards.ts    The 40-card Spanish deck (ذهب، كوبا، سيوف، زرواطة)
  shared/uno.ts      The 112 two-sided UNO FLIP cards and matching rules
  shared/ludo.ts     Ludo board geometry (track, home columns, safe squares)
  shared/estate.ts   «ملك العقار» board, rents and cards
  shared/islamic.ts  Hajj stations, good deeds / bad habits, board geometry for the Islamic games
  ui/dice3d.tsx      3D dice thrown across the board (pre-rendered three.js frames)
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

### Updating later

- **Server / game rules:** `npx @railway/cli up`.
- **App screens or new games:** build a new APK (step 2) and install it over the old one.
- The server address can still be changed inside the app («إعدادات الخادم» on the profile screen), for
  example to play on a computer at home over Wi-Fi (`bun run server`).
