/**
 * Hand-drawn stroke icon set (24×24 grid). Replaces emojis across the UI.
 * Arrows are drawn for an RTL interface: "back" points right, "next" points left.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'back'
  | 'chevron'
  | 'leaf'
  | 'globe'
  | 'box'
  | 'paw'
  | 'next'
  | 'close'
  | 'check'
  | 'plus'
  | 'minus'
  | 'sound'
  | 'mute'
  | 'home'
  | 'share'
  | 'key'
  | 'users'
  | 'user'
  | 'sliders'
  | 'clock'
  | 'skip'
  | 'crown'
  | 'bot'
  | 'star'
  | 'trophy'
  | 'book'
  | 'shuffle'
  | 'refresh'
  | 'door'
  | 'edit'
  | 'hand'
  | 'eye'
  | 'thumbDown'
  | 'vote'
  | 'mic'
  | 'micOff'
  | 'starFull'
  | 'phoneOff'
  | 'moon'
  | 'sun'
  | 'skull'
  | 'flame'
  | 'bolt'
  | 'sparkle'
  | 'bell'
  | 'cards'
  | 'target'
  | 'chat'
  | 'siren'
  | 'trash'
  | 'layers'
  | 'info'
  | 'wifiOff'
  | 'stop'
  | 'rocket'
  | 'play'
  | 'grab'
  | 'down'
  | 'heart'
  | 'calc'
  | 'search'
  | 'train'
  | 'drop'
  | 'bars'
  | 'tea'
  | 'coins'
  | 'question'
  | 'gift'
  | 'house'
  | 'swap'
  | 'bank'
  | 'go';

const P = {
  fill: 'none',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function shapes(name: IconName, c: string) {
  const s = { ...P, stroke: c };
  switch (name) {
    case 'back':
      return <Path d="M5 12h14M13 6l6 6-6 6" {...s} />;
    case 'next':
      return <Path d="M19 12H5M11 6l-6 6 6 6" {...s} />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" {...s} />;
    case 'check':
      return <Path d="M4.5 12.5l5 5 10-11" {...s} />;
    case 'plus':
      return <Path d="M12 5v14M5 12h14" {...s} />;
    case 'minus':
      return <Path d="M5 12h14" {...s} />;
    case 'sound':
      return (
        <>
          <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...s} />
          <Path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" {...s} />
        </>
      );
    case 'mute':
      return (
        <>
          <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...s} />
          <Path d="M16 9.5l5 5M21 9.5l-5 5" {...s} />
        </>
      );
    case 'home':
      return <Path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5M10 19v-5h4v5" {...s} />;
    case 'share':
      return (
        <>
          <Path d="M12 15V4M8 8l4-4 4 4" {...s} />
          <Path d="M6 12v7h12v-7" {...s} />
        </>
      );
    case 'key':
      return (
        <>
          <Circle cx={8} cy={12} r={3.5} {...s} />
          <Path d="M11.5 12H20M17 12v3M20 12v2.5" {...s} />
        </>
      );
    case 'users':
      return (
        <>
          <Circle cx={9} cy={8.5} r={3} {...s} />
          <Path d="M3.5 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5" {...s} />
          <Circle cx={16.5} cy={9.5} r={2.4} {...s} />
          <Path d="M15.5 14.2c2.5-.3 4.4 1.2 5 4.3" {...s} />
        </>
      );
    case 'user':
      return (
        <>
          <Circle cx={12} cy={8.5} r={3.5} {...s} />
          <Path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" {...s} />
        </>
      );
    case 'sliders':
      return (
        <>
          <Path d="M4 7h16M4 12h16M4 17h16" {...s} />
          <Circle cx={15} cy={7} r={1.8} {...s} fill={c} />
          <Circle cx={8} cy={12} r={1.8} {...s} fill={c} />
          <Circle cx={13} cy={17} r={1.8} {...s} fill={c} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={13} r={7.5} {...s} />
          <Path d="M12 9v4.5l3 2M9.5 3.5h5" {...s} />
        </>
      );
    case 'skip':
      return <Path d="M12 6l-6 6 6 6M19 6l-6 6 6 6" {...s} />;
    case 'crown':
      return <Path d="M4 17.5L3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z" {...s} />;
    case 'bot':
      return (
        <>
          <Rect x={4.5} y={8} width={15} height={11} rx={3.5} {...s} />
          <Path d="M12 8V4.5M12 4.5h.01M2.5 13v2M21.5 13v2" {...s} />
          <Circle cx={9.2} cy={13} r={1.2} fill={c} />
          <Circle cx={14.8} cy={13} r={1.2} fill={c} />
          <Path d="M10 16.2h4" {...s} />
        </>
      );
    case 'star':
      return <Path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" {...s} />;
    case 'starFull':
      return <Path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" fill={c} stroke={c} strokeWidth={1.6} strokeLinejoin="round" />;
    case 'trophy':
      return (
        <>
          <Path d="M8 4h8v5a4 4 0 01-8 0z" {...s} />
          <Path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v3.5M8.5 20h7M9.5 16.5h5V20h-5z" {...s} />
        </>
      );
    case 'book':
      return (
        <>
          <Path d="M12 6.5C10 5 7 4.6 4 5v13c3-.4 6 0 8 1.5 2-1.5 5-1.9 8-1.5V5c-3-.4-6 0-8 1.5z" {...s} />
          <Path d="M12 6.5v13" {...s} />
        </>
      );
    case 'shuffle':
      return <Path d="M4 7h3.5c4.5 0 4.5 10 9 10H20M17 14l3 3-3 3M4 17h3.5c1.6 0 2.6-1.2 3.4-2.8M13.4 9.6C14.2 8 15.2 7 16.5 7H20M17 4l3 3-3 3" {...s} />;
    case 'refresh':
      return <Path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4v4.5H15" {...s} />;
    case 'door':
      return (
        <>
          <Path d="M14 4H6v16h8M10 12h10M17 9l3 3-3 3" {...s} />
        </>
      );
    case 'edit':
      return <Path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5zM13.5 7l3 3" {...s} />;
    case 'hand':
    case 'stop':
      return (
        <Path
          d="M8 12.5V6.5a1.5 1.5 0 013 0V11V4.8a1.5 1.5 0 013 0V11V6.2a1.5 1.5 0 013 0v7.3c0 4-2.6 6.5-6 6.5-2.6 0-4-1.2-5.4-3.4L4 13.3a1.5 1.5 0 012.5-1.6z"
          {...s}
        />
      );
    case 'eye':
      return (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...s} />
          <Circle cx={12} cy={12} r={3} {...s} />
        </>
      );
    case 'thumbDown':
      return <Path d="M17 13.5V4M17 4h2.5v9.5H17M17 13.5l-4 6.5c-1.5 0-2.4-1.3-2-2.8l.8-3H6.5a2 2 0 01-2-2.4l1.3-6A2 2 0 017.8 4H17" {...s} />;
    case 'vote':
      return (
        <>
          <Path d="M4 13h16v7H4z" {...s} />
          <Path d="M8 13V5h8v8M10 9l1.5 1.5L14.5 7" {...s} />
        </>
      );
    case 'mic':
      return (
        <>
          <Rect x={9} y={3.5} width={6} height={11} rx={3} {...s} />
          <Path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M9 21h6" {...s} />
        </>
      );
    case 'micOff':
      return (
        <>
          <Path d="M15 10V6.5a3 3 0 00-5.6-1.5M9 9v2.5a3 3 0 004.6 2.5" {...s} />
          <Path d="M5.5 11a6.5 6.5 0 0010.4 5.2M18.4 12.6c.07-.5.1-1 .1-1.6M12 17.5V21M9 21h6M4 4l16 16" {...s} />
        </>
      );
    case 'phoneOff':
      return (
        <>
          <Path d="M3.5 14.5c4.7-4 12.3-4 17 0l-2 2.5-3-1.2v-2.3a10 10 0 00-7 0v2.3l-3 1.2z" {...s} />
        </>
      );
    case 'moon':
      return <Path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" {...s} />;
    case 'sun':
      return (
        <>
          <Circle cx={12} cy={12} r={4} {...s} />
          <Path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" {...s} />
        </>
      );
    case 'skull':
      return (
        <>
          <Path d="M5 11a7 7 0 0114 0c0 2.3-1 3.6-2 4.4V19H7v-3.6C6 14.6 5 13.3 5 11z" {...s} />
          <Circle cx={9.2} cy={11.5} r={1.6} fill={c} />
          <Circle cx={14.8} cy={11.5} r={1.6} fill={c} />
          <Path d="M10.5 19v-2M13.5 19v-2" {...s} />
        </>
      );
    case 'flame':
      return <Path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.8 3.4-5.6 3.9-9.8 2.6 1.6 4 3.7 4 6.2 1-.6 1.6-1.7 1.7-3 2.2 1.7 3.4 4.1 3.4 6.6 0 3.6-2.6 6.2-6.5 6.2z" {...s} />;
    case 'bolt':
      return <Path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" {...s} />;
    case 'sparkle':
      return <Path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7zM18.5 16c.3 1.8 1 2.5 2.7 2.7-1.7.3-2.4 1-2.7 2.8-.3-1.8-1-2.5-2.7-2.8 1.7-.2 2.4-.9 2.7-2.7z" {...s} />;
    case 'bell':
      return <Path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2.2 2.2 0 004 0" {...s} />;
    case 'cards':
      return (
        <>
          <Rect x={3.5} y={6} width={10} height={14} rx={1.8} {...s} transform="rotate(-10 8.5 13)" />
          <Rect x={10.5} y={4} width={10} height={14} rx={1.8} {...s} transform="rotate(8 15.5 11)" />
        </>
      );
    case 'target':
      return (
        <>
          <Circle cx={12} cy={12} r={8} {...s} />
          <Circle cx={12} cy={12} r={4.5} {...s} />
          <Circle cx={12} cy={12} r={1.2} fill={c} />
        </>
      );
    case 'chat':
      return <Path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4V16A2.5 2.5 0 014 13.5z" {...s} />;
    case 'siren':
      return (
        <>
          <Path d="M7 18v-5a5 5 0 0110 0v5M5 18h14v2.5H5zM12 3v2M4.5 6l1.4 1.4M19.5 6l-1.4 1.4" {...s} />
        </>
      );
    case 'trash':
      return <Path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" {...s} />;
    case 'layers':
      return <Path d="M12 4l9 4.5-9 4.5-9-4.5zM3 12.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" {...s} />;
    case 'info':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M12 11v5.5M12 7.8v.01" {...s} />
        </>
      );
    case 'wifiOff':
      return <Path d="M3 3l18 18M8.5 16.5a5 5 0 017 0M5.2 13a10 10 0 015.3-2.8M18.8 13a10 10 0 00-2.3-1.6M2 9.5a15 15 0 014.4-2.8M22 9.5A15 15 0 0011 5.6M12 20h.01" {...s} />;
    case 'rocket':
      return <Path d="M14.5 4.5c3-1 5-1 5-1s0 2-1 5L13 14l-3-3zM10 11l-4-.5-2.5 2.5 4 1M13 14l.5 4L11 20.5l-1-4M7 17l-2.5 2.5" {...s} />;
    case 'play':
      return <Path d="M17 5.5v13L6.5 12z" {...s} />;
    case 'grab':
      return <Path d="M4 14.5c2.3 0 3.6-1 5-2.5l2-2.2a1.6 1.6 0 012.4 2.1L12 13.5h6.5a1.5 1.5 0 010 3H12l-3.5 3H4z" {...s} />;
    case 'down':
      return <Path d="M12 4v15M6 13l6 6 6-6" {...s} />;
    case 'chevron':
      return <Path d="M6.5 9.5l5.5 5.5 5.5-5.5" {...s} />;
    case 'leaf':
      return (
        <>
          <Path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" {...s} />
          <Path d="M5 19l8-8" {...s} />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.3 3.6 8.5s-1 6.1-3.6 8.5c-2.6-2.4-3.6-5.3-3.6-8.5s1-6.1 3.6-8.5z" {...s} />
        </>
      );
    case 'box':
      return (
        <>
          <Path d="M12 3.5l8 4v9l-8 4-8-4v-9z" {...s} />
          <Path d="M4 7.5l8 4 8-4M12 11.5v9" {...s} />
        </>
      );
    case 'paw':
      return (
        <>
          <Path d="M12 12.5c-3 0-5.5 3-5.5 5 0 1.4 1.2 2 2.4 2 1.3 0 2-.6 3.1-.6s1.8.6 3.1.6c1.2 0 2.4-.6 2.4-2 0-2-2.5-5-5.5-5z" {...s} />
          <Circle cx={7} cy={9.5} r={1.7} {...s} />
          <Circle cx={10.2} cy={6} r={1.7} {...s} />
          <Circle cx={13.8} cy={6} r={1.7} {...s} />
          <Circle cx={17} cy={9.5} r={1.7} {...s} />
        </>
      );
    case 'heart':
      return <Path d="M12 19.5s-7.5-4.4-7.5-9.7A4.3 4.3 0 0112 7.2a4.3 4.3 0 017.5 2.6c0 5.3-7.5 9.7-7.5 9.7z" {...s} />;
    case 'calc':
      return (
        <>
          <Rect x={5} y={3.5} width={14} height={17} rx={2.5} {...s} />
          <Path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" {...s} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={10.5} cy={10.5} r={6} {...s} />
          <Path d="M15 15l5 5" {...s} />
        </>
      );
    case 'train':
      return (
        <>
          <Rect x={6} y={3.5} width={12} height={13} rx={3} {...s} />
          <Path d="M6 10h12M9 13.5h.01M15 13.5h.01M9 16.5l-2 4M15 16.5l2 4M8 19h8" {...s} />
        </>
      );
    case 'drop':
      return <Path d="M12 3.5c3.2 4 5.8 7.3 5.8 10.6a5.8 5.8 0 01-11.6 0C6.2 10.8 8.8 7.5 12 3.5zM9.3 14.5a2.8 2.8 0 002.4 2.6" {...s} />;
    case 'bars':
      return (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={2} {...s} />
          <Path d="M8.5 4v16M12 4v16M15.5 4v16" {...s} />
        </>
      );
    case 'tea':
      return (
        <>
          <Path d="M7 8h10l-1.3 11.2a1.5 1.5 0 01-1.5 1.3H9.8a1.5 1.5 0 01-1.5-1.3z" {...s} />
          <Path d="M7.6 12.5h8.8M10 5c0-1 1-1.2 1-2.2M13.5 5c0-1 1-1.2 1-2.2" {...s} />
        </>
      );
    case 'coins':
      return (
        <>
          <Circle cx={9} cy={9} r={5} {...s} />
          <Path d="M13.5 10.3a5 5 0 11-4 8.3M9 7v4M7.8 8h2.4" {...s} />
        </>
      );
    case 'question':
      return (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M9.6 9.5a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.3M12 16.8h.01" {...s} />
        </>
      );
    case 'gift':
      return (
        <>
          <Rect x={4} y={9} width={16} height={4} rx={1} {...s} />
          <Path d="M5.5 13v6.5h13V13M12 9v10.5M12 9c-1.5-3.5-5.5-4-5.5-1.5C6.5 9 12 9 12 9zM12 9c1.5-3.5 5.5-4 5.5-1.5C17.5 9 12 9 12 9z" {...s} />
        </>
      );
    case 'house':
      return <Path d="M4 11l8-6.5 8 6.5M6.5 9v10.5h11V9M10 19.5v-5h4v5" {...s} />;
    case 'swap':
      return <Path d="M7 7.5h12l-3-3M17 16.5H5l3 3" {...s} />;
    case 'bank':
      return <Path d="M3.5 9L12 4l8.5 5zM5.5 9v8M9.8 9v8M14.2 9v8M18.5 9v8M3.5 19.5h17" {...s} />;
    case 'go':
      return <Path d="M20 12H5M10.5 6L4.5 12l6 6" {...s} />;
  }
}

export function Icon({ name, size = 22, color = '#F7F4EC' }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes(name, color)}
    </Svg>
  );
}
