/**
 * «من سيربح المليون؟» — how hard each question of the existing quizzes is, from 1 (everyone knows it) to 5
 * (a real million question), rated by hand for a Moroccan family: «معلومات عامة» (server/content-trivia.ts)
 * and «مسابقة إسلامية» (server/content-islamic.ts). The content files stay untouched: a question is found by
 * a short hash of its text (qHash in million-hash.ts). A question added or reworded later has no rating
 * and gets a guess from its shape (levelGuess); million.test.ts checks that almost all are rated.
 *
 * Ratings by hand (884 questions): 1 → 339, 2 → 264, 3 → 168, 4 → 78, 5 → 33.
 */
import { qHash } from './million-hash';

const RATED: Record<number, string> = {
  1: [
    '1fygcpm panbss 1er0x3u g6cif0 1ylcr5v 79fqpu 1l9z4ux 12330vz 1kc7zq5 1qh9rb8 113xs2m nf8fqs 5x0alx rggyom z5z81x 15eel7s',
    '3xofoz 1udmcp1 s5e12g o0wwpl je9i5e noeoh5 k2u5r1 148wtys dhvz0c 1f04emz 15wj4qc ot1hwu kjsbvy ccknuf cbl5wu 1p0toxh',
    '1v8i3gj 16lvbke jdsg1d 1vn3ryx i465k8 s99iuq h5qxo1 qfmtu5 1o6o3kx 1c4tw8e 1pjfjok 1aw5nju 1mm6kvd 1ly74m8 1v4ll3d 1o65fni',
    '1exe8hq 925khp 87qk0h 1p8c93 1bq698p ggth01 1t84dja 1oaim6r 6ynwkp 41xd2b 2fxpkk b39uo6 1jk9eog 120e3g4 1gohz75 e31wzj',
    '1nxpue3 lr3g1n 1mjd0km fj45x4 1fo2mql buq6s1 1xuas5g 76mc4w 19ahwua 19f7nh9 8zm5kw wse402 vvjure 15yoqkm 15e5x5a 1xa92x9',
    '1kp28w1 11r193r l9wbt6 1uqbkwx vd17uy 1g7ja05 19lxx7l 1khieoj uyo1ie 1q2jnfa 17imaq1 9cyjwo hgaw19 q2msjv twrkei 10mf4c7',
    '1mewwtn 8kzfh7 1ovc9lp 11b6ykc 1w6sko1 j03hnz 1hbs6rt 1oizymq rvayix 15thors 1cwd74x c461k2 7bv66u 1ssqryt 1ivpcy1 7tugtw',
    '4w2n99 yi8n2r f3qai2 onjhvt wrekgr xd1sm0 nmgn4t 1nz83df v45hbp 1gb0dxi 1w1cjdq 2djad4 6l2y5e 6emed7 1ex85ml 1e9191h',
    'fwm5l2 8ov6a7 u3stmk 1jopcmy ld1mfc soo9w7 1jyln2k 1e6vllf vaudm0 1fgh2i0 1bff22f nc1d8q 1vci3tk nfxgr9 1x1kf9n 1ps666z',
    '196qy4w lnpy1t 1nitapy 11gxw2v 1nk625z 1e73502 e0sfa 7vi2q8 12zu5kw t74aq7 mxz4c1 ma5oyk aeb1cd s1o22i keuqv 118erzr',
    '10ignnv 2yzfay 1aztgh6 1et651i ss5710 1ta3094 f4eqpj fzu405 1mpm1oj iwoh3x 9n0qhc kbvvic 1yjnzr3 1jv9lgv y3xjdf 1h1o57l',
    'dgzbbb jpmiek m7h07p hv8zx2 pbs2sy 13ntnl6 un1yih 1qfnquw 1m50ucv 1nyaewo 1dzvopy x68uie 87p3q4 9hj271 1qnxeed 1vyh1rr',
    '15bxnab 1x1po1c 9c9qeo 88b8r4 ezaz50 bwydd1 1c0bvlw p5pvp5 3rvts1 12cgn8a roihjq 2v0be7 cpnb8x fhf2a6 1iqka4q rlf4zd',
    'i7vcvl mp9ih0 3887z2 6le0k 1nyozrt 1jz9hgb 1ysmrtp 13he5rl 1481gqi 1elet89 19c16hk 1b5likn 1o2cjxu 1b7kvtr 8xh39b 1gltz1u',
    '1tnmf2x 1dro2cn v6yw0e 1tbltf4 3tjhrc 1jfrmn5 1oejotr 1xjgk5u uwl65x 1xq3ttb 1njq3nn aj0r1a 1khdqvs z3xsvi 114id23 mx0an8',
    '1n3yobm p3y6eo 8uwcow ivb9jz 1u08htl 123wylt 99bavx d439ep 1j5vvrs 1s01x9o rpjbhs 1gflc8p gvk0i1 1dvr8cb 132ur3o ccdeq1',
    '2rqp5u 642fkz 32zdua 1tokksz 1oh1shk qwi4p2 17qz6bh ynniyt 13s2ffr cks72u ckgwe2 s7jr8 1efqfsn ley2o8 1yxqbij j8gpow',
    '1eob2v0 10hvnpw 1ycaq4b hf73co 17ub7cq mbry68 70rbuu 1cpwyqp 1jdeh6u a4qim9 1mnveff eorj16 1s7z5xr sysq8c q1aq98 w3iw0v',
    '1dmieid 1chi2y5 19k2h77 1b018x3 1klrkvs 2bcnj jg6scn 5s6lg4 paaot2 17m9ss1 asl13m 1f5ykts 1c1iosq s5f6ba 155ndhq 8t6lx7',
    'h27u3a gnxicw 16j2ut2 xogvtl 1fin6ms 1w8qclm 18cmybg 11eci45 1624e74 mahg1v 1f2gjfh nka6my 1i6bqf1 1bwjuq5 1p03gjo l9jc3j',
    '1v2kjrq 10xllor yn35ml vuvcbn 529o3o 1g8a1lb h38cru 78ig42 4mnr82 5txhv1 19cn2l nxw68q 1tfg3ju po0hq1 rb6hsq um8eq7',
    '90m6sv nd6h2n aplwsm',
  ].join(' '),
  2: [
    'jujob6 1lk2tk w5ekxl p2bl5o 8ubzm0 l67nwh 15ndv30 tnilve 1bom405 18o5ibk 1fgg8cw 1xq7web 18c3bbz 1aw8lve 27ey3h j3twqy',
    '6ds6jp rq7hxs 1vs3xn1 w3xwho 12qszkb 4b2bvy qqpw23 1yfu7yf 1taxk4v 1a7yvtm vdqria z0w2kd cyzfd5 1vgypo6 kjwznu 1w55wsz',
    '12xns8n un7sn 1r94g2x m9sger 1l2y6ri rvkeyw 1s98m9b 1alnxn8 tt7csn 1pe6vyr ld224e 1113sm4 1a0u8ab 1w7cl65 3b7931 1ip91qf',
    '1fn5vqa 9ncrv9 rc7n3s i7ijkt 9rsobm 1baqvh9 rbikk0 6mh0nz 1vf30px 1n0i1ew 3noy96 1j2sofu 1u0oalq 1r70lxt 4mouq3 1sml80a',
    '11pf6z3 17kkfn1 3497a2 1rxtu5b 2x0mnw 191qszm xbjjvj 9s8gh4 1vy6q4z qglk54 ost53 q8f3zf 19urp75 mrmm85 122tdn8 1cekqm6',
    'ndoe9e 6jb5y6 fbrkq yp53dl li4xbm 80vcga 8mmslq xz0tnc 19yl5d2 nt6sr9 1m67fn7 omiq75 1swv9wx 16cvvt9 q2v9j7 11tklxc',
    '28am9u 1p5537o v95q99 5qzk2g sybgxk z91tzs 1j4pwzz tbg3ga j6lsra fgzfad 242fm 1506h61 1wt1th7 1v6ilbo 174e2cd 1vuxonm',
    '1vrymyv q5exd7 xf13 gwqznh 1llsu9g h8i6af 1b2muh9 14ufjfb 16008bo 1edlfs7 1ee1g6k 1pekj9r 1qb9okc hasgc6 11on7s1 k32oiu',
    '1qo3w74 6uv780 rbp0vn 1r54o40 uxvgdo 19wicy1 13br54e 19wdpvh kx72qv 1x7kn9k 19dqa5x 9p45eq 7ukfbe 19l2sev 1ji77ox 86sks4',
    '1ubdalc 1rx14r uto6fm so3gam 1xlg6jd plgo9x hjrgq1 1b4glk8 19p8jg 1kngq9f 1oifmso 1tynmo6 1799dtp 1h5217 1cvi90e 166v44c',
    '1wgu3ur 1mxpwty 1uuezep pfm7j5 1oy7r9t km9ydo 113ggqs 199v6rq n12a7j 1heuid9 10goa3b rjp5af 1bc21di hudko4 1m4kzug afbmpl',
    '187yseu 3q1wyv 1r57k04 1c09ia0 1l10e8c acvod4 1dc3pnx 3adw9j 1f82ft2 1yyfrw4 goh55i wz4iy5 18mtt1b 6rnaez 5qkbkl hxzonk',
    'q1h6pz 1gz4yb 1pq6p9f qitvkt bjhg68 12zd970 yefhf4 2akx3e xi6ssy 110uqo8 1t3o0d3 7wucfw co817l 19xdv4k 13dapek 1briwq1',
    '7nb85g 1oymcaz 13oana9 t9hoz1 1t70py5 tc38ln 1ictcwt krzlwy 1rbwlcg 1hoeo4o fkjh7l 14pchto 13wftvp cjr9g5 12zvav6 16keo4e',
    'b7xa8j 36eo6j 1sojtuh 6vxl3v 7iaa5a 1yfechb 1xfih79 13cim17 17jhcnq 1drst9v ddp570 cwctug e06sg1 7xsby1 1arhfab 86yc9h',
    '17mfdfp 1714lrq eqt7g6 gjfsm3 yupzp0 utzcpk 1g0kmo aaybz5 1au2mc 1gwemx4 uqcqvh 1svidvs q76el3 17b2rql 1waqhmb 5k21v0',
    '1g53it4 k47tuq tk1nff zydeew 5t52yk akf9xm 1b1jnrs 1qk7jnx',
  ].join(' '),
  3: [
    '1i888ng cihzbt besxr 1fdnxdj hawt42 dgd5ps vmepnx 2gqcj5 1mpp6m8 snjdh 1apidx4 j1000z 7tktmi djtu3n 1ho922q r6fczt',
    '1b5p4oj 1o38g1y 1uddi18 19kv00v 563w9w vflkp8 1whtnom dphdfe cmyikx pbjmvj qi6fhv 1bt2sv6 18av4l0 2xodsr f0lmgg k2vv5s',
    'qhm1qi 7jnvtm vlq0wq pb0o4m 1xdfkgi 17my5op 1pc2ko seakc5 1n8ivpx 22qkmi ue6a3w y3xufo f0q9mx 1c6qtcl 15r4ys4 180ulgc',
    'w3o8qc 1nqexhs hyk8zo 1miqs7b g7354x uqt470 ansdhk 1c1eodj fo7kh6 ucwiix 1ggmgs1 tt6rry s37mf1 i761cd 18ugigm o9249f',
    '1b88hkx 1sdz2c0 gbqzdq c1aj4o m10kze 15p1pu9 1ca0wm2 1vkhbdn 1xefx9m ji0xds o2rip3 1kb2ae3 19yqh7g rywt4 uo17mi 1usqnps',
    '107cuj1 a80g2w 1yjchr2 8sip3j 19zwjzh plqsoe 11qez3n 1vnr311 44jze2 p499ao q8d8g9 j56as1 dyjfza 15i9eat 1m1c8j9 remcny',
    'rras6u 1fp1bqy 1q7kf4a v9both 1hjjb8h 1jgbvbd 122zns6 nsy8e8 3poyyh 1yv2hrj 1bmocut x6yv91 y1vx5 14jn1n4 du85f8 1jam2b9',
    'iqrdcc j0vnsr 1dx267o 78pxzd 1bmb5dl qbwi8i fua1xz 41fjzz ycxg9c afjtsy lndk5f pum124 1sowbjv 1mv3jah 1sbjlbz f6cyul',
    'k7r1hx 1647zfz 1scnqog smdxy2 cu31v9 b714mo zrffh8 40u9e6 1gvl654 1en2f48 oeb51f v0rj3l 6uqsw8 yobvdr 1l752nl megspm',
    'ty5zfd qukboe 1twrhzw zi7sr0 18rk6le cftcum p6f7ot 1webwhp 1qj8kl1 1tywmwl cmgnup psj8dl 1lb6r65 1k5o8ag 1w44psf noihnr',
    'txoduv en2p4y 1fw9p34 1oujjoz fs35q3 1pj1yie ki7gr9 1fsd7o',
  ].join(' '),
  4: [
    'vsx4er i4dcmj 129f7zm qoruxn 14x7r08 10hvidg t5u6b7 1wr0mh1 149y51d 34kop0 x18ucx 7e75mh 8gtea3 1esj7pq 1c12s0p 1m6vcal',
    '1q8iz1u xpum2i 167clhm ki4vaw ev4veq e2095f 1kqoy5y ryx4bu 1w950d7 u089fz 1f9svte gwarq0 1s06fqi 19rho7g hfr9qm xhy2sr',
    'uwpcet m05ps8 de9doq 1fe00tt 13pzbq0 m8nvck 1dtychy u4ckf2 1yeops1 ey5e9d 1fetoi0 15d2vws f9627j 5cmqeb kqk353 18rw889',
    '19q86g7 1y3ib1h 17kwb2f ym2d4c ejqo92 1f2s6al 1osexw4 m5yzu7 hebjyb maulnm ydbvsc pecfsh 4khgm4 180v3if 1n1xaga q0ktyr',
    'xr37ip 1793nzo hpnm15 19tn7c 7t9rh4 1pc317b ey8jk8 1xbil6e q1exx3 1fo2yrv pj3bx8 1lmeawz hrpe5s 1i6ylgv',
  ].join(' '),
  5: [
    '5qiqoj 17okfc1 o8mype hdphb5 142rj6j 1si7b3g yp1cio 6ou7cg 1wcz2gr 16l54gj 1gqkm8 kzvylw 1rk53rl 1xsx66e 1bgr76f 1spwbis',
    '5lrnqg zyv0s6 15il2zs g70fwv 1gc37pc 1lwecyw h8pkic vlthzd gwc7cw 1r8iaw7 ucv0w3 yvs1ko wczenu gcyfmv hxavvx gw7dxx',
    '19vnz6c',
  ].join(' '),
};

const LEVELS = new Map<string, number>();
for (const [lv, list] of Object.entries(RATED)) for (const h of list.split(' ')) LEVELS.set(h, Number(lv));

/** A rough level for a question nobody rated: a number, a date or a long question is harder. */
export function levelGuess(q: string, a: string): number {
  let lv = 2;
  if (/[0-9٠-٩]/.test(a)) lv++;
  if (q.length > 70) lv++;
  return Math.min(4, lv);
}

/** The rated level (1–5) of a question, or null if nobody rated it. */
export function ratedLevel(q: string): number | null {
  return LEVELS.get(qHash(q)) ?? null;
}

/** The level (1–5) of a question: its rating, else a guess. */
export function levelOf(q: string, a: string): number {
  return ratedLevel(q) ?? levelGuess(q, a);
}
