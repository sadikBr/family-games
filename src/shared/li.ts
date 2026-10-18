/**
 * «لـ» + a name, spelled the Arabic way: «لماما», «للحسن» (the alif of «ال» drops), «لـSam» for a
 * name in Latin letters. Lets us say «الفوز لماما» / «نقطة لبابا» instead of conjugating a verb for
 * a player whose gender we don't know.
 */
export const li = (name: string) => (/^[ء-ي]/.test(name) ? `ل${name.startsWith('ال') ? name.slice(1) : name}` : `لـ${name}`);
