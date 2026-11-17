import { tokens, t, type IconName } from '@synkka/core';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTween } from '../lib/hooks';
import { accent, colors, font } from '../lib/theme';
import { Icon } from './Icon';

// ---- Button -----------------------------------------------------------------

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  icon?: IconName;
  disabled?: boolean;
  height?: number;
  radius?: number;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label, onPress, variant = 'primary', icon, disabled, height = tokens.size.buttonMobile,
  radius = tokens.radius.lg, fontSize = tokens.font.size.bodyMobile, style,
}: ButtonProps) {
  const primary = variant === 'primary';
  const fg = primary ? colors.text.onAccent : colors.text.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { height, borderRadius: radius },
        primary ? { backgroundColor: accent } : { backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.control },
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.85 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={tokens.size.iconSm} color={fg} strokeWidth={2.2} /> : null}
      <Text style={[font(600, fontSize), { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

// ---- IconButton (icon-only, always labelled) ----------------------------------

export function IconButton({
  icon, label, onPress, color = colors.text.primary, background, round,
}: { icon: IconName; label: string; onPress?: () => void; color?: string; background?: string; round?: boolean }) {
  const size = tokens.size.touchTarget;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        { width: size, height: size, alignItems: 'center', justifyContent: 'center', borderRadius: round ? size / 2 : tokens.radius.md },
        background ? { backgroundColor: background } : null,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name={icon} size={tokens.size.iconLg} color={color} strokeWidth={round ? 2.4 : 2.2} />
    </Pressable>
  );
}

// ---- ProgressBar ------------------------------------------------------------

export function ProgressBar({ value, color = accent }: { value: number; color?: string }) {
  const v = useTween(Math.min(1, Math.max(0, value)));
  return (
    <View style={styles.barTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={{ width: `${v * 100}%`, height: tokens.size.progressBar, backgroundColor: color }} />
    </View>
  );
}

// ---- ProgressRing -----------------------------------------------------------

export function ProgressRing({ value, children, label }: { value: number; children?: ReactNode; label: string }) {
  const { size, stroke } = tokens.size.progressRing;
  const r = (size - stroke) / 2 - 1; // 56 at 132/10, as in the design
  const circumference = 2 * Math.PI * r;
  const v = useTween(Math.min(1, Math.max(0, value)));
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      {/* Rotated -90° so progress starts at 12 o'clock. */}
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}>
        <G>
          <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.track} strokeWidth={stroke} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - v)}
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}

// ---- Toggle row (whole row is the control) -----------------------------------

export function ToggleRow({ label, hint, value, onChange, last }: {
  label: string; hint: string; value: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  const { w, h, thumb } = tokens.size.toggle;
  const x = useTween(value ? 1 : 0);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => onChange(!value)}
      style={[styles.toggleRow, !last && styles.divider]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font(500)}>{label}</Text>
        <Text style={[font(400, tokens.font.size.label), { color: colors.text.muted }]}>{hint}</Text>
      </View>
      <View
        style={{
          width: w, height: h, borderRadius: h / 2, padding: 3, justifyContent: 'center',
          backgroundColor: value ? colors.toggle.trackOn : colors.toggle.trackOff,
        }}
      >
        <View
          style={{
            width: thumb, height: thumb, borderRadius: thumb / 2, backgroundColor: colors.toggle.thumb,
            transform: [{ translateX: x * (w - thumb - 6) }],
            boxShadow: tokens.shadow.toggleThumb,
          }}
        />
      </View>
    </Pressable>
  );
}

// ---- RadioCard --------------------------------------------------------------

export function RadioCard({ icon, title, meta, selected, onSelect }: {
  icon: IconName; title: string; meta: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${meta}`}
      onPress={onSelect}
      style={[
        styles.radioCard,
        selected
          ? { borderWidth: 2, borderColor: accent, paddingVertical: 13, paddingHorizontal: 15 }
          : { borderWidth: 1, borderColor: colors.border.default },
      ]}
    >
      <View style={[styles.radioRing, { borderColor: selected ? accent : colors.border.radioIdle }]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.iconTile40}>
        <Icon name={icon} size={tokens.size.iconLg} color={colors.text.secondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={font(600)}>{title}</Text>
        <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted }]}>{meta}</Text>
      </View>
    </Pressable>
  );
}

// ---- Not-designed placeholder -----------------------------------------------

export function NotDesigned() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.space[8] }}>
      <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, textAlign: 'center' }]}>
        {t('common.notDesigned')}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  barTrack: { height: tokens.size.progressBar, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border.divider },
  radioCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: tokens.radius.xl, backgroundColor: colors.bg.surface,
  },
  radioRing: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: accent },
  iconTile40: {
    width: 40, height: 40, borderRadius: tokens.radius.md, backgroundColor: colors.bg.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  card: { backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.default, borderRadius: tokens.radius.xl },
});
