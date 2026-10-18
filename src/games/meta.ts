import { PHASE10_INFO } from '@/shared/games/phase10';
import { SCRABBLE_INFO } from '@/shared/games/scrabble';
import { CHARADES_INFO } from '@/shared/games/charades';
import { SPY_INFO } from '@/shared/games/spy';
import { SURVEY_INFO } from '@/shared/games/survey';
import { DOTS_INFO } from '@/shared/games/dots';
import { MANCALA_INFO } from '@/shared/games/mancala';
import { BLOCKS_INFO } from '@/shared/games/blocks';
import { CODEBREAK_INFO } from '@/shared/games/codebreak';
import { CATAN_INFO } from '@/shared/games/catan';
import { CARCA_INFO } from '@/shared/games/carca';
import { BALOOT_INFO, BALOOT_MA_INFO } from '@/shared/games/baloot';
import { TELEDRAW_INFO } from '@/shared/games/teledraw';
import { ONEWORD_INFO } from '@/shared/games/oneword';
import { BOGGLE_INFO } from '@/shared/games/boggle';
import { QQUOTE_INFO } from '@/shared/games/qquote';
import { TAJWEED_INFO } from '@/shared/games/tajweed';
import { QWORD_INFO } from '@/shared/games/qword';
import { ASMA_INFO } from '@/shared/games/asma';
import { STEPS_INFO } from '@/shared/games/steps';
import { MAPQUIZ_INFO } from '@/shared/games/mapquiz';
import { PROPHETS_INFO } from '@/shared/games/prophets';
import { MOSQUE_INFO } from '@/shared/games/mosque';
import type { IconName } from '@/art/icons';
import type { AllSettings, GameId } from '@/shared/protocol';
import { MIN_PLAYERS } from '@/shared/protocol';

export interface GameMeta {
  id: GameId;
  title: string;
  tagline: string;
  /** tile colour behind the game art */
  color: string;
  minPlayers: number;
  maxPlayers?: number;
  howTo: string[];
  /** the cover text for the room's settings, when they change the game's rules (e.g. Moroccan Baloot) */
  variant?: (settings: AllSettings) => { tagline: string; howTo: string[] } | null;
}

export const GAMES: Record<GameId, GameMeta> = {
  phase10: { id: 'phase10', minPlayers: MIN_PLAYERS.phase10, ...PHASE10_INFO },
  scrabble: { id: 'scrabble', minPlayers: MIN_PLAYERS.scrabble, ...SCRABBLE_INFO },
  charades: { id: 'charades', minPlayers: MIN_PLAYERS.charades, ...CHARADES_INFO },
  spy: { id: 'spy', minPlayers: MIN_PLAYERS.spy, ...SPY_INFO },
  survey: { id: 'survey', minPlayers: MIN_PLAYERS.survey, ...SURVEY_INFO },
  dots: { id: 'dots', minPlayers: MIN_PLAYERS.dots, ...DOTS_INFO },
  mancala: { id: 'mancala', minPlayers: MIN_PLAYERS.mancala, ...MANCALA_INFO },
  blocks: { id: 'blocks', minPlayers: MIN_PLAYERS.blocks, ...BLOCKS_INFO },
  codebreak: { id: 'codebreak', minPlayers: MIN_PLAYERS.codebreak, ...CODEBREAK_INFO },
  catan: { id: 'catan', minPlayers: MIN_PLAYERS.catan, ...CATAN_INFO },
  carca: { id: 'carca', minPlayers: MIN_PLAYERS.carca, ...CARCA_INFO },
  baloot: { id: 'baloot', minPlayers: MIN_PLAYERS.baloot, ...BALOOT_INFO, variant: (s) => (s.baloot?.mode === 'morocco' ? BALOOT_MA_INFO : null) },
  teledraw: { id: 'teledraw', minPlayers: MIN_PLAYERS.teledraw, ...TELEDRAW_INFO },
  oneword: { id: 'oneword', minPlayers: MIN_PLAYERS.oneword, ...ONEWORD_INFO },
  boggle: { id: 'boggle', minPlayers: MIN_PLAYERS.boggle, ...BOGGLE_INFO },
  qquote: { id: 'qquote', minPlayers: MIN_PLAYERS.qquote, ...QQUOTE_INFO },
  tajweed: { id: 'tajweed', minPlayers: MIN_PLAYERS.tajweed, ...TAJWEED_INFO },
  qword: { id: 'qword', minPlayers: MIN_PLAYERS.qword, ...QWORD_INFO },
  asma: { id: 'asma', minPlayers: MIN_PLAYERS.asma, ...ASMA_INFO },
  steps: { id: 'steps', minPlayers: MIN_PLAYERS.steps, ...STEPS_INFO },
  mapquiz: { id: 'mapquiz', minPlayers: MIN_PLAYERS.mapquiz, ...MAPQUIZ_INFO },
  prophets: { id: 'prophets', minPlayers: MIN_PLAYERS.prophets, ...PROPHETS_INFO },
  mosque: { id: 'mosque', minPlayers: MIN_PLAYERS.mosque, ...MOSQUE_INFO },
  imposter: {
    id: 'imposter',
    title: 'الدخيل',
    tagline: 'أحدكم لا يعرف الكلمة. اكتشفوه.',
    color: '#7B61D9',
    minPlayers: MIN_PLAYERS.imposter,
    howTo: [
      'يرى كلُّ لاعب كلمة سرية على هاتفه، إلا الدخيل.',
      'بالدور، يقول كل لاعب كلمة واحدة تصف الكلمة السرية.',
      'الدخيل يحاول التظاهر بأنه يعرفها.',
      'صوّتوا على هواتفكم: من هو الدخيل؟',
      'إذا انكشف الدخيل، فلديه 25 ثانية فرصةً أخيرة لتخمين الكلمة.',
      'بعد آخر جولة، يفوز صاحب أكبر عدد من النقاط.',
    ],
  },
  names: {
    id: 'names',
    title: 'اسم ولد اسم بنت',
    tagline: 'حرف واحد، سبع خانات، ومن يُكمل أولاً يقول «ستوب».',
    color: '#2FB67C',
    minPlayers: MIN_PLAYERS.names,
    howTo: [
      'يظهر حرف عشوائي للجميع.',
      'املأ على هاتفك: اسم ولد، اسم بنت، حيوان، نبات، جماد، بلاد، مهنة — كلها تبدأ بنفس الحرف (بدون «ال»: «الرباط» لا تُحسب لحرف الراء).',
      'أول من يملأ كل الخانات يضغط «ستوب» (أي: توقّفوا) فيتوقف الجميع. ويمكن تعطيل «ستوب» من الإعدادات ليستمر اللعب حتى نهاية الوقت.',
      'راجعوا الأجوبة معاً، واضغطوا على أي جواب خاطئ للتصويت ضده.',
      'التحقق بالقاموس: كلمة ليست في القاموس تظهر بعلامة ؟ وأنت تكتب. في الوضع «صارم» تُحسب خطأ إلا إذا صوّت أغلب الآخرين لقبولها (اضغطوا عليها عند المراجعة).',
      'جواب فريد = 10، مكرر = 5 (حتى لو كُتب بشكل مختلف قليلاً، مثل «زيمبابوي» و«زمبابوي»)، فارغ أو خاطئ = 0.',
    ],
  },
  ronda: {
    id: 'ronda',
    title: 'روندا',
    tagline: 'أشهر لعبة ورق في المغرب.',
    color: '#2E8B57',
    minPlayers: MIN_PLAYERS.ronda,
    maxPlayers: 4,
    howTo: [
      'من 2 إلى 4 لاعبين (4 = فريقان). 4 أوراق لكل لاعب، والطاولة فارغة في البداية.',
      'إذا كانت على الطاولة ورقة برقم ورقتك أخذتها، مع الأوراق التي تليها بالتسلسل (… 6، 7، 10، 11، 12).',
      'دقة: تأخذ الورقة التي لعبها من قبلك مباشرة = 1. إن ردّ اللاعب التالي بالورقة الثالثة من نفس الرقم أخذ الأوراق الثلاث: «ف جوج» = 5، والرابعة تأخذ الأربع: «ف ثلاثة» = 10. مسّة: تنظّف الطاولة = 1.',
      'روندا (زوج) = 1، ترينكا (ثلاثة) = 5. يعلنها التطبيق، والأقوى يأخذ الجميع.',
      'في آخر اليد، كل ورقة فوق 20 = نقطة (فوق 13 إذا كنتم 3 لاعبين). أول من يصل إلى 41 يربح.',
    ],
  },
  kanza: {
    id: 'kanza',
    title: 'الكانزة',
    tagline: 'اجمع 15 واصطد أوروص.',
    color: '#C98A14',
    minPlayers: MIN_PLAYERS.kanza,
    maxPlayers: 4,
    howTo: [
      'من 2 إلى 4 لاعبين. 4 أوراق على الطاولة و3 في يد كل لاعب.',
      'العب ورقة وخذ ورقة أو ورقتين من الطاولة ليصبح المجموع 15 بالضبط.',
      'إذا لم تستطع، ضع ورقتك على الطاولة.',
      'في آخر اليد: كل ورقة = 1، أوروص = رقمها، و1 أوروص = 20.',
      'بعد عدد الأيدي المختار، يربح صاحب أكبر مجموع.',
    ],
  },
  tris: {
    id: 'tris',
    title: 'التريس',
    tagline: 'فريقان، والشريك قبالتك.',
    color: '#3D6FD6',
    minPlayers: MIN_PLAYERS.tris,
    maxPlayers: 4,
    howTo: [
      '4 لاعبين بالضبط في فريقين. أضيفوا بوتات إذا نقص العدد.',
      '10 أوراق لكل لاعب. العب من نوع أول ورقة في اللمّة إن كان لديك منه.',
      'الأقوى: 3، 2، 1، 12، 11، 10، 7، 6، 5، 4.',
      'النقاط: الآس = 1، 3 و2 والصور = ⅓، آخر لمّة = 1.',
      'أول فريق يصل إلى 31 يربح.',
    ],
  },
  konkan: {
    id: 'konkan',
    title: 'الكونكان',
    tagline: 'نزّل مجموعاتك قبل الجميع.',
    color: '#C8384E',
    minPlayers: MIN_PLAYERS.konkan,
    maxPlayers: 4,
    howTo: [
      'من 2 إلى 4 لاعبين: 10 أوراق لكلٍّ إذا كانا اثنين، و8 لثلاثة، و7 لأربعة.',
      'في دورك: اسحب من الكومة أو خذ المرمية، نزّل مجموعاتك، ثم ارمِ ورقة (لا ترمِ الورقة التي أخذتها للتو من المرمية).',
      'المجموعة: 3–4 أوراق من الرقم نفسه، أو 3 أوراق متتالية فأكثر من النوع نفسه.',
      'يمكنك إضافة أوراق على أي مجموعة فوق الطاولة.',
      'أول من يتخلص من أوراقه يربح اليد. ويحسب الباقون أوراقهم، ومن يصل إلى 100 يخرج.',
    ],
  },
  unoflip: {
    id: 'unoflip',
    title: 'أونو فليب',
    tagline: 'طابق اللون أو الرقم، واقلب اللعبة.',
    color: '#7A3CC2',
    minPlayers: MIN_PLAYERS.unoflip,
    maxPlayers: 10,
    howTo: [
      'يبدأ كل لاعب بـ 7 أوراق. العب ورقة لها لون الورقة المكشوفة أو رقمها أو رمزها.',
      'إذا لم تجد ورقة مناسبة، اسحب ورقة واحدة، فإن كانت مناسبة أمكنك لعبها.',
      'ورقة «قلب» تقلب كل شيء إلى الجهة المظلمة: أوراق أقوى مثل +5 ومنع الجميع.',
      'ترى أوراقك من جهتها النشطة، وغيرك يرى جهتها الأخرى.',
      'عندما تبقى لك ورقة واحدة قل «أونو»! وإلا فقد يكشفك أحدهم فتسحب ورقتين.',
      'من ينهي أوراقه يربح نقاط أوراق الآخرين. أول من يصل الهدف يفوز.',
    ],
  },
  ludo: {
    id: 'ludo',
    title: 'لودو',
    tagline: 'ارمِ النرد وأوصل قطعك الأربع.',
    color: '#E2475F',
    minPlayers: MIN_PLAYERS.ludo,
    maxPlayers: 4,
    howTo: [
      'لكل لاعب 4 قطع في قاعدته. اضغط على النرد في دورك.',
      'تحتاج إلى 6 لإخراج قطعة. والـ 6 تعطيك رمية أخرى (وثلاث رميات من 6 متتالية تضيّع الدور).',
      'إذا وقفت على قطعة لخصمك خارج المربعات الآمنة (النجوم ونقاط البداية) عادت إلى قاعدتها، وربحت رمية.',
      'تحتاج إلى الرقم المضبوط لإدخال القطعة إلى البيت. أول من يدخل قطعه الأربع يفوز.',
      'إذا كانت لك حركة واحدة ممكنة تتحرك قطعتك وحدها بعد الرمية.',
      'في الإعدادات: لعبة سريعة بقطعتين لكل لاعب، أو أكمل اللعب على المركز الثاني والثالث.',
    ],
  },
  dama: {
    id: 'dama',
    title: 'الضامة',
    tagline: 'كُل قطع خصمك أو احصره.',
    color: '#8A5A2B',
    minPlayers: MIN_PLAYERS.dama,
    maxPlayers: 2,
    howTo: [
      'لاعبان (أو لاعب وبوت). الأبيض يبدأ.',
      'القطعة تتحرك خطوة مائلة إلى الأمام. الأكل إجباري، ويمكن أكل عدة قطع متتالية — وإذا أمكن أكثر من أكلة فخذ التي تأكل أكثر القطع.',
      'القطعة التي تصل إلى الصف الأخير تصبح «ملكاً» يتحرك في كل الاتجاهات.',
      'تفوز إذا أكلت كل قطع خصمك أو لم يبق له أي حركة.',
    ],
  },
  connect4: {
    id: 'connect4',
    title: 'أربعة في صف',
    tagline: 'أسقط الأقراص — أول من يصفّ أربعة يفوز.',
    color: '#2F5BD0',
    minPlayers: MIN_PLAYERS.connect4,
    maxPlayers: 2,
    howTo: [
      'لاعبان (أو لاعب وبوت). الأحمر يبدأ.',
      'في دورك اضغط على عمود ليسقط قرصك إلى أسفل خانة فارغة.',
      'أول من يصفّ أربعة أقراص متتالية — أفقياً أو عمودياً أو مائلاً — يفوز.',
    ],
  },
  chess: {
    id: 'chess',
    title: 'الشطرنج',
    tagline: 'اللعبة الخالدة — كش مات!',
    color: '#4A5180',
    minPlayers: MIN_PLAYERS.chess,
    maxPlayers: 2,
    howTo: [
      'لاعبان (أو لاعب وبوت). الأبيض يبدأ، واللوحة تدور لتكون قطعك في الأسفل.',
      'اضغط على قطعة لترى خاناتها الممكنة، ثم اضغط على الخانة.',
      'كل القواعد: التبييت، الأخذ بالمرور، ترقية الجندي، الكش والكش مات والتعادل.',
    ],
  },
  kdab: {
    id: 'kdab',
    title: 'الكذّاب',
    tagline: 'العب أوراقك مقلوبة… واكشف الكذّابين!',
    color: '#C8384E',
    minPlayers: MIN_PLAYERS.kdab,
    maxPlayers: 6,
    howTo: [
      'توزّع كل الأوراق. من يبدأ الكومة يلعب من 1 إلى 4 أوراق مقلوبة ويقول رقماً.',
      'بعده يجب على الجميع أن يقولوا الرقم نفسه — بصدق أو بكذب — أو أن يمرّروا.',
      'يستطيع أي لاعب أن يضغط «كذّاب!» قبل اللعبة التالية: إذا كان كاذباً يأخذ الكومة، وإذا كان صادقاً يأخذها من اتّهمه.',
      'إذا مرّر الجميع تُبعَد الكومة. أول من يتخلّص من أوراقه يفوز.',
    ],
  },
  wave: {
    id: 'wave',
    title: 'موجة',
    tagline: 'تلميح واحد… أين يقع على المقياس؟',
    color: '#22B8B0',
    minPlayers: MIN_PLAYERS.wave,
    maxPlayers: 12,
    howTo: [
      'في كل جولة يرى لاعب واحد نقطة سرية على مقياس، مثلاً «بارد ↔ ساخن».',
      'يكتب تلميحاً قصيراً، مثلاً «شاي الصباح»، والباقون يحرّكون المؤشر إلى حيث يظنون.',
      'كلما اقتربت ربحت أكثر: 4 أو 3 أو 2 نقطة. ومعطي التلميح يربح متوسط نقاط الآخرين.',
    ],
  },
  wordle: {
    id: 'wordle',
    title: 'كلمة السر',
    tagline: 'خمّن الكلمة المخفية من 5 حروف في 6 محاولات.',
    color: '#5B6296',
    minPlayers: MIN_PLAYERS.wordle,
    maxPlayers: 12,
    howTo: [
      'الجميع يبحثون عن الكلمة نفسها في الوقت نفسه.',
      'بعد كل محاولة: الأخضر حرف صحيح في مكانه، الأصفر حرف موجود في مكان آخر، والرمادي غير موجود.',
      'ترى ألوان الآخرين دون حروفهم. كلما وجدتها بمحاولات أقل ربحت أكثر، وأول من يجدها يربح 100 إضافية.',
    ],
  },
  kharbga: {
    id: 'kharbga',
    title: 'الخربقة',
    tagline: 'لعبة الأجداد — حاصر قطع خصمك وكُلها.',
    color: '#B5652A',
    minPlayers: MIN_PLAYERS.kharbga,
    maxPlayers: 2,
    howTo: [
      'لوحة 7×7 و24 قطعة لكل لاعب. أولاً يضع كل لاعب قطعتين في دوره حتى تمتلئ اللوحة إلا «الملحة» في الوسط. يمكنك التراجع عن قطعة وضعتها في دورك، أو توزيع ما بقي لك عشوائياً.',
      'بعدها تتحرك القطعة خانة واحدة (إلى الأعلى أو الأسفل أو اليمين أو اليسار) إلى خانة فارغة. أول حركة تكون إلى الوسط.',
      'إذا حاصرت قطعة لخصمك بين قطعتين لك في خط واحد تأكلها، وتواصل الأكل بالقطعة نفسها ما دمت تستطيع.',
      'الدخول بين قطعتين للخصم آمن. يفوز من يأكل كل قطع خصمه، أو الأكثر قطعاً إذا طال اللعب بلا أكل.',
    ],
  },
  battleship: {
    id: 'battleship',
    title: 'معركة السفن',
    tagline: 'أسطولك مخفي في هاتفك… أغرق سفن خصمك أولاً!',
    color: '#2F7FD0',
    minPlayers: MIN_PLAYERS.battleship,
    maxPlayers: 2,
    howTo: [
      'لكل لاعب 5 سفن مخفية على شبكة 10×10. اخلط أسطولك حتى يعجبك ثم اضغط «جاهز».',
      'بالتناوب، اضغط على خانة في شبكة الخصم لتطلق قذيفة: 🔥 إصابة أو 💧 خطأ.',
      'إذا أصبت تطلق مرة أخرى. أول من يُغرق كل سفن خصمه يفوز.',
    ],
  },
  xo: {
    id: 'xo',
    title: 'إكس أو',
    tagline: 'ثلاثة في خط — لعبة سريعة لا تُملّ.',
    color: '#7B4BD0',
    minPlayers: MIN_PLAYERS.xo,
    maxPlayers: 2,
    howTo: [
      'لاعبان (أو لاعب وبوت). X يبدأ، والأدوار تتبدّل في كل لعبة.',
      'اضغط على خانة فارغة لتضع علامتك. أول من يصفّ ثلاثة في خط يفوز.',
      'اختر حجم اللوحة في الإعدادات: من ٣×٣ إلى ٩×٩. على ٤×٤ و٥×٥ تحتاج أربعة في خط، ومن ٦×٦ خمسة.',
      'على ٣×٣ البوت القوي لا يخسر أبداً — جرّب أن تتعادل معه!',
    ],
  },
  sudoku: {
    id: 'sudoku',
    title: 'سودوكو',
    tagline: 'اللغز نفسه للجميع — من يحلّه أولاً؟',
    color: '#2A9D7C',
    minPlayers: MIN_PLAYERS.sudoku,
    maxPlayers: 12,
    howTo: [
      'املأ الشبكة بالأرقام من 1 إلى 9: لا يتكرر رقم في صف ولا عمود ولا مربع 3×3.',
      'اختر خانة ثم رقماً. الرقم الخاطئ لا يُقبل ويُحسب خطأً عليك. زر «ملاحظات» يكتب أرقاماً صغيرة للتذكير فقط، تبقى في هاتفك.',
      'الجميع يحلّون اللغز نفسه في الوقت نفسه: الأول يربح 300 نقطة، ثم 200 و150… وتُخصم 20 عن كل خطأ.',
    ],
  },
  trivia: {
    id: 'trivia',
    title: 'معلومات عامة',
    tagline: 'المغرب، الجغرافيا، العلوم، الرياضة والحيوانات.',
    color: '#E58A2B',
    minPlayers: MIN_PLAYERS.trivia,
    maxPlayers: 12,
    howTo: [
      'سؤال وأربعة اختيارات تظهر على كل الهواتف في الوقت نفسه.',
      'الإجابة الصحيحة تربح 500 نقطة، وحتى 500 إضافية كلما أسرعت.',
      'اختر نوع الأسئلة من الإعدادات: المغرب، جغرافيا، علوم، رياضة، حيوانات أو منوّعات.',
    ],
  },
  memory: {
    id: 'memory',
    title: 'الذاكرة',
    tagline: 'اقلب بطاقتين… وتذكّر أين رأيت الصورة!',
    color: '#D0457A',
    minPlayers: MIN_PLAYERS.memory,
    maxPlayers: 6,
    howTo: [
      'البطاقات مقلوبة على الطاولة، وكل صورة موجودة مرتين.',
      'في دورك اقلب بطاقتين: إذا تطابقتا تأخذهما وتلعب مرة أخرى، وإلا تُقلبان من جديد ويلعب التالي.',
      'من يجمع أكثر الأزواج يفوز.',
    ],
  },
  huroof: {
    id: 'huroof',
    title: 'حروف',
    tagline: 'فريقان، شبكة حروف، وأسئلة إسلامية.',
    color: '#B8323F',
    minPlayers: MIN_PLAYERS.huroof,
    maxPlayers: 12,
    howTo: [
      'ينقسم اللاعبون إلى فريقين: الأحمر والأخضر.',
      'الفريق صاحب الدور يختار حرفاً من الشبكة، فيظهر سؤال جوابه يبدأ بهذا الحرف.',
      'أول من يضغط الجرس يكتب الجواب (الأخطاء الإملائية الصغيرة مقبولة). إذا أصاب أخذ الحرف لفريقه، وإذا أخطأ تنتقل الفرصة للفريق الآخر.',
      'الأحمر يصل بين اليمين واليسار، والأخضر بين الأعلى والأسفل. أول فريق يصل يفوز.',
    ],
  },
  quiz: {
    id: 'quiz',
    title: 'مسابقة إسلامية',
    tagline: 'أسئلة في القرآن والسيرة والأنبياء — الأسرع يربح أكثر.',
    color: '#2F43A8',
    minPlayers: MIN_PLAYERS.quiz,
    maxPlayers: 12,
    howTo: [
      'يظهر السؤال على كل الهواتف مع أربعة اختيارات.',
      'اختر الجواب قبل انتهاء الوقت. الجواب الصحيح يعطيك 500 نقطة، وكلما أسرعت زادت النقاط حتى 1000.',
      'يمكن اختيار نوع الأسئلة من الإعدادات: القرآن، الأنبياء، السيرة، الصحابة، العبادات، الحج، التاريخ…',
    ],
  },
  whois: {
    id: 'whois',
    title: 'من هو؟',
    tagline: 'تلميحات عن نبي أو صحابي أو مكان — خمّن مبكراً!',
    color: '#7B61D9',
    minPlayers: MIN_PLAYERS.whois,
    maxPlayers: 12,
    howTo: [
      'تظهر التلميحات واحدة بعد الأخرى، من الأصعب إلى الأسهل.',
      'مع الاختيارات: لكل لاعب محاولة واحدة فقط في كل جولة.',
      'مع «اكتب الاسم» (في الإعدادات): تكتب الاسم بنفسك، والأخطاء الإملائية الصغيرة مقبولة. إن أخطأت تحاول مرة أخرى مع التلميح التالي.',
      'كلما خمّنت مبكراً ربحت أكثر: 400 بعد التلميح الأول، ثم 300، ثم 200، ثم 100.',
    ],
  },
  surah: {
    id: 'surah',
    title: 'من أي سورة؟',
    tagline: 'تظهر آية — اعرف السورة التي هي منها.',
    color: '#178A63',
    minPlayers: MIN_PLAYERS.surah,
    maxPlayers: 12,
    howTo: [
      'تظهر آية من القرآن الكريم بالرسم العثماني، وأربع سور للاختيار.',
      'الأسرع في الجواب الصحيح يربح نقاطاً أكثر، ثم تظهر السورة ورقم الآية.',
      'المستويات: جزء عمّ، أو من سورة «ق» إلى «الناس»، أو القرآن كاملاً.',
    ],
  },
  hajj: {
    id: 'hajj',
    title: 'رحلة الحج',
    tagline: 'سباق على طريق مناسك الحج — من الميقات إلى طواف الوداع.',
    color: '#C98A2A',
    minPlayers: MIN_PLAYERS.hajj,
    maxPlayers: 6,
    howTo: [
      'ارمِ النرد وتقدّم على طريق الحج. يجب أن تتوقف عند كل منسك (الميقات، الطواف، السعي، منى، عرفات…) وتظهر بطاقة تشرح ما يفعله الحاج.',
      'أول حاج يصل إلى منسك يفتح سؤاله للجميع: كل من يجيب صحيحاً يأخذ بطاقة زاد، والأسرع يتقدّم خطوة.',
      'بطاقات الزاد تُستعمل في دورك قبل الرمي: التلبية (+2)، الدليل (تعبر المنسك القادم)، ماء زمزم (رمية إضافية)، الصدقة (تتقدّم أنت وحاج تختاره). الصبر يحميك من التأخير وحده.',
      'النجمة: عمل صالح يقدّمك أو عائق يؤخّرك. علامة الاستفهام: سؤال لك وحدك. أول من يُتمّ طواف الوداع يفوز.',
    ],
  },
  ladders: {
    id: 'ladders',
    title: 'سلّم الحسنات',
    tagline: 'الأعمال الصالحة ترفعك، والعادات السيئة تُنزلك.',
    color: '#2FB67C',
    minPlayers: MIN_PLAYERS.ladders,
    maxPlayers: 6,
    howTo: [
      'ارمِ النرد وتقدّم من الخانة 1 إلى 100.',
      'إذا وقفت أسفل سلّم (عمل صالح مثل برّ الوالدين والصدقة) تصعد إلى أعلاه.',
      'إذا وقفت على رأس أفعى (عادة سيئة مثل الكذب والغيبة) تنزل إلى ذيلها.',
      'أول من يصل إلى 100 يفوز.',
    ],
  },
  estate: {
    id: 'estate',
    title: 'ملك العقار',
    tagline: 'اشترِ المدن، ابنِ الفنادق، واجمع الكراء.',
    color: '#1F8A5B',
    minPlayers: MIN_PLAYERS.estate,
    maxPlayers: 6,
    howTo: [
      'ارمِ النردين وتقدّم على اللوحة. يبدأ كل لاعب بالمبلغ نفسه.',
      'إذا وقفت على مدينة أو محطة أو شركة لا يملكها أحد، يمكنك شراؤها. وإن لم تشترِها تُطرح في مزاد للجميع: أعلى عرض يأخذها.',
      'إذا وقفت على عقار خصمك تدفع له الكراء. امتلاك كل مدن اللون يضاعف الكراء ويسمح بالبناء.',
      'ابنِ المنازل بالتساوي، والخامس فندق. ويمكنك رهن عقار لتحصل على نصف ثمنه.',
      'الزوج يعطيك رمية أخرى، وثلاثة أزواج متتالية تدخلك السجن.',
      'من لا يستطيع الدفع يفلس. يفوز آخر من بقي، أو الأغنى عند نهاية الجولات.',
    ],
  },
  codenames: {
    id: 'codenames',
    title: 'الكلمات السرية',
    tagline: 'قائد فريقك يلمّح، وأنتم تكتشفون الكلمات.',
    color: '#C8384E',
    minPlayers: MIN_PLAYERS.codenames,
    howTo: [
      'فريقان، ولكل فريق قائد. القائد وحده يرى على هاتفه أي الكلمات لفريقه.',
      'في دوره يعطي القائد كلمة واحدة ورقماً، مثلاً «بحر 2».',
      'الفريق يتناقش ويكشف الكلمات. كلمة صحيحة؟ استمروا. كلمة خاطئة؟ ينتهي الدور. اكشفوا كلمة واحدة على الأقل قبل إنهاء الدور.',
      'احذروا الكلمة السوداء: من يكشفها يخسر فوراً. أول فريق يكشف كل كلماته يفوز.',
    ],
  },
  draw: {
    id: 'draw',
    title: 'ارسم وخمّن',
    tagline: 'ارسم الكلمة والباقون يخمّنون.',
    color: '#2D9CDB',
    minPlayers: MIN_PLAYERS.draw,
    maxPlayers: 12,
    howTo: [
      'الرسام يختار كلمة من ثلاث ويرسمها على هاتفه، والرسم يظهر عند الجميع.',
      'الباقون يكتبون تخميناتهم. كلما خمّنت أسرع ربحت نقاطاً أكثر.',
      'الرسام يربح نقاطاً عن كل من خمّن. ممنوع كتابة الحروف في الرسم!',
      'عندما يقترب الوقت من النهاية تظهر بعض الحروف كمساعدة.',
    ],
  },
  headsup: {
    id: 'headsup',
    title: 'على رأسك',
    tagline: 'الكلمة على جبينك، والعائلة تساعدك.',
    color: '#1FA59E',
    minPlayers: MIN_PLAYERS.headsup,
    howTo: [
      'ضع الهاتف على جبينك والشاشة نحو العائلة.',
      'يرى الجميع الكلمة على هواتفهم ويمثّلونها أو يصفونها لك.',
      'أمِل الهاتف إلى الأسفل إذا خمّنت، وإلى الأعلى للتخطّي.',
      'أو دعوا أفراد العائلة يضغطون «صحيح» أو «تخطَّ» من هواتفهم.',
      'يفوز من يخمّن أكثر الكلمات في الوقت المحدد.',
    ],
  },
  taboo: {
    id: 'taboo',
    title: 'ممنوع أن تقول',
    tagline: 'اشرح الكلمة بدون الكلمات الممنوعة.',
    color: '#E0683A',
    minPlayers: MIN_PLAYERS.taboo,
    howTo: [
      'فريقان: الأحمر ضد الأزرق.',
      'الشارح يرى الكلمة و4 كلمات ممنوعة.',
      'فريقه يخمّن، والفريق الآخر يراقب على هواتفهم.',
      'إذا قال كلمة ممنوعة، يضغط الفريق الآخر «قالها» (−1). ضغطة بالخطأ؟ الشارح أو المضيف يتراجع عنها خلال 5 ثوانٍ.',
      'الفريق صاحب أكبر عدد من النقاط يفوز.',
    ],
  },
  potato: {
    id: 'potato',
    title: 'البطاطا الحارة',
    tagline: 'قل كلمة وارمِها قبل أن تنفجر.',
    color: '#D9862A',
    minPlayers: MIN_PLAYERS.potato,
    howTo: [
      'يظهر موضوع للجميع، مثل «فواكه».',
      'من بيده البطاطا يقول كلمة من الموضوع بسرعة،',
      'ثم يرميها إلى هاتف لاعب آخر.',
      'البطاطا تنفجر في وقت عشوائي.',
      'من تنفجر في يده يُحرق، والأقل حرقاً يفوز.',
    ],
  },
  werewolf: {
    id: 'werewolf',
    title: 'الذئب',
    tagline: 'القرية نائمة، والذئاب بيننا.',
    color: '#3B3F7A',
    minPlayers: MIN_PLAYERS.werewolf,
    howTo: [
      'اختاروا راوياً يرى كل الأدوار على هاتفه.',
      'كل لاعب يرى دوره سراً على هاتفه.',
      'في الليل: الذئاب تختار ضحية، والطبيب والحارس يحميان، والعرّافة تكشف، والساحرة تنقذ أو تسمّم.',
      'في النهار: القرية تتناقش وتصوّت لإقصاء مشتبه به. ويُحسب صوت العمدة بصوتين.',
      'القرية تفوز إذا قضت على الذئاب، والذئاب تفوز إذا صارت أغلبية. المجنون يفوز إذا أُقصي، والذئب الأبيض إذا بقي وحده.',
      'اختر الأدوار من إعدادات اللعبة.',
    ],
  },
};

export const GAME_ORDER: GameId[] = ['imposter', 'names', 'ronda', 'kanza', 'tris', 'konkan', 'baloot', 'unoflip', 'headsup', 'taboo', 'potato', 'werewolf', 'codenames', 'draw', 'teledraw', 'oneword', 'ludo', 'dama', 'estate', 'huroof', 'quiz', 'whois', 'surah', 'hajj', 'ladders', 'connect4', 'chess', 'kdab', 'wave', 'wordle', 'kharbga', 'battleship', 'xo', 'sudoku', 'trivia', 'memory', 'phase10', 'scrabble', 'charades', 'spy', 'survey', 'dots', 'mancala', 'catan', 'carca', 'blocks', 'codebreak', 'boggle', 'qquote', 'tajweed', 'qword', 'asma', 'steps', 'mapquiz', 'prophets', 'mosque'];

/** Grouping for the home screen (`short`: the filter chip). */
export const GAME_GROUPS: { title: string; short: string; icon: IconName; games: GameId[] }[] = [
  { title: 'ألعاب الكلام والضحك', short: 'كلام وضحك', icon: 'chat', games: ['imposter', 'names', 'headsup', 'taboo', 'potato', 'werewolf', 'codenames', 'draw', 'teledraw', 'oneword', 'wave', 'wordle', 'charades', 'spy', 'survey', 'scrabble', 'boggle'] },
  { title: 'ألعاب إسلامية', short: 'إسلامية', icon: 'moon', games: ['huroof', 'quiz', 'whois', 'surah', 'qquote', 'qword', 'tajweed', 'asma', 'steps', 'mapquiz', 'prophets', 'mosque', 'hajj', 'ladders'] },
  { title: 'ألعاب اللوحة', short: 'لوحة ونرد', icon: 'layers', games: ['catan', 'carca', 'estate', 'ludo', 'blocks', 'dama', 'kharbga', 'chess', 'connect4', 'battleship'] },
  { title: 'ذكاء وذاكرة', short: 'ذكاء', icon: 'bolt', games: ['trivia', 'memory', 'sudoku', 'xo', 'dots', 'mancala', 'codebreak'] },
  { title: 'ألعاب الورق', short: 'الورق', icon: 'cards', games: ['ronda', 'kanza', 'tris', 'baloot', 'konkan', 'kdab', 'unoflip', 'phase10'] },
];
