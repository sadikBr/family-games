import type { GameView as View, RoomView } from '@/shared/protocol';

import { KanzaGame } from './cards/kanza';
import { KonkanGame } from './cards/konkan';
import { RondaGame } from './cards/ronda';
import { TrisGame } from './cards/tris';
import { UnoFlipGame } from './cards/unoflip';
import { Hez2Game } from './hez2';
import { CodenamesGame } from './codenames';
import { DamaGame } from './dama';
import { DrawGame } from './draw';
import { ChessGame } from './chess';
import { Connect4Game } from './connect4';
import { EstateGame } from './estate';
import { KdabGame } from './kdab';
import { WaveGame } from './wave';
import { WordleGame } from './wordle';
import { BattleshipGame } from './battleship';
import { KharbgaGame } from './kharbga';
import { MemoryGame } from './memory';
import { Phase10Game } from './phase10';
import { ScrabbleGame } from './scrabble';
import { CharadesGame } from './charades';
import { SpyGame } from './spy';
import { SurveyGame } from './survey';
import { DotsGame } from './dots';
import { MancalaGame } from './mancala';
import { BlocksGame } from './blocks';
import { CodebreakGame } from './codebreak';
import { CatanGame } from './catan';
import { CarcaGame } from './carca';
import { BalootGame } from './baloot';
import { ToutiGame } from './touti';
import { TeledrawGame } from './teledraw';
import { StoryGame } from './story';
import { OnewordGame } from './oneword';
import { BoggleGame } from './boggle';
import { QquoteGame } from './qquote';
import { TajweedGame } from './tajweed';
import { AsmaGame } from './asma';
import { StepsGame } from './steps';
import { MapquizGame } from './mapquiz';
import { FastGame } from './fast';
import { BilliardsGame } from './billiards';
import { EstimateGame } from './estimate';
import { TruefalseGame } from './truefalse';
import { FlagsGame } from './flags';
import { QcondGame } from './qcond';
import { GuesswhoGame } from './guesswho';
import { ClueGame } from './clue';
import { TrianglesGame } from './triangles';
import { RealmsGame } from './realms';
import { BalloonsGame } from './balloons';
import { KalimGame } from './kalim';
import { DominoGame } from './domino';
import { TawlaGame } from './tawla';
import { QamusGame } from './qamus';
import { MindGame } from './mind';
import { CoupGame } from './coup';
import { MillionGame } from './million';
import { RawabitGame } from './rawabit';
import { KhaliaGame } from './khalia';
import { ProphetsGame } from './prophets';
import { MosqueGame } from './mosque';
import { RamiGame } from './rami';
import { SudokuGame } from './sudoku';
import { XoGame } from './xo';
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
    case 'hez2':
      return <Hez2Game room={room} view={view} />;
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
    case 'trivia':
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
    case 'kharbga':
      return <KharbgaGame room={room} view={view} />;
    case 'battleship':
      return <BattleshipGame room={room} view={view} />;
    case 'xo':
      return <XoGame room={room} view={view} />;
    case 'sudoku':
      return <SudokuGame room={room} view={view} />;
    case 'memory':
      return <MemoryGame room={room} view={view} />;
    case 'phase10':
      return <Phase10Game room={room} view={view} />;
    case 'scrabble':
      return <ScrabbleGame room={room} view={view} />;
    case 'charades':
      return <CharadesGame room={room} view={view} />;
    case 'spy':
      return <SpyGame room={room} view={view} />;
    case 'survey':
      return <SurveyGame room={room} view={view} />;
    case 'dots':
      return <DotsGame room={room} view={view} />;
    case 'mancala':
      return <MancalaGame room={room} view={view} />;
    case 'blocks':
      return <BlocksGame room={room} view={view} />;
    case 'codebreak':
      return <CodebreakGame room={room} view={view} />;
    case 'catan':
      return <CatanGame room={room} view={view} />;
    case 'carca':
      return <CarcaGame room={room} view={view} />;
    case 'baloot':
      return <BalootGame room={room} view={view} />;
    case 'touti':
      return <ToutiGame room={room} view={view} />;
    case 'teledraw':
      return <TeledrawGame room={room} view={view} />;
    case 'story':
      return <StoryGame room={room} view={view} />;
    case 'oneword':
      return <OnewordGame room={room} view={view} />;
    case 'boggle':
      return <BoggleGame room={room} view={view} />;
    case 'qquote':
      return <QquoteGame room={room} view={view} />;
    case 'tajweed':
      return <TajweedGame room={room} view={view} />;
    case 'asma':
      return <AsmaGame room={room} view={view} />;
    case 'steps':
      return <StepsGame room={room} view={view} />;
    case 'mapquiz':
      return <MapquizGame room={room} view={view} />;
    case 'prophets':
      return <ProphetsGame room={room} view={view} />;
    case 'mosque':
      return <MosqueGame room={room} view={view} />;
    case 'rami':
      return <RamiGame room={room} view={view} />;
    case 'fast':
      return <FastGame room={room} view={view} />;
    case 'billiards':
      return <BilliardsGame room={room} view={view} />;
    case 'estimate':
      return <EstimateGame room={room} view={view} />;
    case 'truefalse':
      return <TruefalseGame room={room} view={view} />;
    case 'flags':
      return <FlagsGame room={room} view={view} />;
    case 'qcond':
      return <QcondGame room={room} view={view} />;
    case 'guesswho':
      return <GuesswhoGame room={room} view={view} />;
    case 'clue':
      return <ClueGame room={room} view={view} />;
    case 'triangles':
      return <TrianglesGame room={room} view={view} />;
    case 'realms':
      return <RealmsGame room={room} view={view} />;
    case 'balloons':
      return <BalloonsGame room={room} view={view} />;
    case 'kalim':
      return <KalimGame room={room} view={view} />;
    case 'domino':
      return <DominoGame room={room} view={view} />;
    case 'tawla':
      return <TawlaGame room={room} view={view} />;
    case 'qamus':
      return <QamusGame room={room} view={view} />;
    case 'mind':
      return <MindGame room={room} view={view} />;
    case 'coup':
      return <CoupGame room={room} view={view} />;
    case 'million':
      return <MillionGame room={room} view={view} />;
    case 'rawabit':
      return <RawabitGame room={room} view={view} />;
    case 'khalia':
      return <KhaliaGame room={room} view={view} />;
    case 'draw':
      return <DrawGame room={room} view={view} />;
  }
}
