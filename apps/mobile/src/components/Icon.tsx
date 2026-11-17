import { icons, tokens, type IconName } from '@synkka/core';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Decorative 24×24 stroke icon. Give the surrounding control an accessibilityLabel. */
export function Icon({ name, size = 20, color = tokens.color.text.primary, strokeWidth = tokens.icon.strokeWidth }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      pointerEvents="none"
    >
      {icons[name].map((s, i) => {
        if (s.type === 'path') return <Path key={i} d={s.d} />;
        if (s.type === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} />;
        return <Rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} />;
      })}
    </Svg>
  );
}
