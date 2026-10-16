import type { GameView as View, RoomView } from '@/shared/protocol';

import { KanzaGame } from './cards/kanza';
import { KonkanGame } from './cards/konkan';
import { RondaGame } from './cards/ronda';
import { TrisGame } from './cards/tris';
import { UnoFlipGame } from './cards/unoflip';
import { CodenamesGame } from './codenames';
import { DamaGame } from './dama';
import { DrawGame } from './draw';
import { ChessGame } from './chess';
import { Connect4Game } from './connect4';
import { EstateGame } from './estate';
import { KdabGame } from './kdab';
import { WaveGame } from './wave';
import { WordleGame } from './wordle';
import { HajjGame } from './hajj';
import { HuroofGame } from './huroof';
import { LaddersGame } from './ladders';
import { McqGame } from './quiz';
import { WhoisGame } from './whois';
import { LudoGame } from './ludo';
import { HeadsUpGame } from './headsup';
import { ImposterGame } from './imposter';
import { NamesGame } from './names';
import { PotatoGame } from './potato';
import { TabooGame } from './taboo';
import { WerewolfGame } from './werewolf';

export function GameView({ room, view }: { room: RoomView; view: View }) {
  switch (view.game) {
    case 'imposter':
      return <ImposterGame room={room} view={view} />;
    case 'names':
      return <NamesGame room={room} view={view} />;
    case 'headsup':
      return <HeadsUpGame room={room} view={view} />;
    case 'taboo':
      return <TabooGame room={room} view={view} />;
    case 'potato':
      return <PotatoGame room={room} view={view} />;
    case 'werewolf':
      return <WerewolfGame room={room} view={view} />;
    case 'ronda':
      return <RondaGame room={room} view={view} />;
    case 'kanza':
      return <KanzaGame room={room} view={view} />;
    case 'tris':
      return <TrisGame room={room} view={view} />;
    case 'konkan':
      return <KonkanGame room={room} view={view} />;
    case 'unoflip':
      return <UnoFlipGame room={room} view={view} />;
    case 'ludo':
      return <LudoGame room={room} view={view} />;
    case 'codenames':
      return <CodenamesGame room={room} view={view} />;
    case 'dama':
      return <DamaGame room={room} view={view} />;
    case 'estate':
      return <EstateGame room={room} view={view} />;
    case 'quiz':
    case 'surah':
      return <McqGame room={room} view={view} />;
    case 'whois':
      return <WhoisGame room={room} view={view} />;
    case 'huroof':
      return <HuroofGame room={room} view={view} />;
    case 'hajj':
      return <HajjGame room={room} view={view} />;
    case 'ladders':
      return <LaddersGame room={room} view={view} />;
    case 'connect4':
      return <Connect4Game room={room} view={view} />;
    case 'chess':
      return <ChessGame room={room} view={view} />;
    case 'kdab':
      return <KdabGame room={room} view={view} />;
    case 'wave':
      return <WaveGame room={room} view={view} />;
    case 'wordle':
      return <WordleGame room={room} view={view} />;
    case 'draw':
      return <DrawGame room={room} view={view} />;
  }
}
