import { tokens } from '@synkka/core';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynkkaEngine } from '../../modules/synkka-engine';
import { tc } from '../lib/copy';
import { accent, colors, font } from '../lib/theme';
import { Icon } from './Icon';
import { Button } from './primitives';

/** Explains and requests "All files access" (needed to sync folders in shared storage). */
export function PermissionGate({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [granted, setGranted] = useState(() => SynkkaEngine?.hasAllFilesAccess() ?? true);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && SynkkaEngine) setGranted(SynkkaEngine.hasAllFilesAccess());
    });
    return () => sub.remove();
  }, []);

  if (granted || skipped) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas, paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, gap: 20 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bg.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="folder" size={28} color={accent} />
      </View>
      <Text accessibilityRole="header" style={[font(700, tokens.font.size.h1Mobile), { letterSpacing: -0.02 * tokens.font.size.h1Mobile }]}>
        {tc('permissions.title')}
      </Text>
      <Text style={[font(400), { lineHeight: 22, color: colors.text.secondary }]}>{tc('permissions.body')}</Text>
      <Text style={[font(400, tokens.font.size.small), { lineHeight: 20, color: colors.text.muted }]}>{tc('permissions.steps')}</Text>
      <View style={{ flex: 1 }} />
      <Button label={tc('permissions.grant')} onPress={() => SynkkaEngine?.requestAllFilesAccess()} height={tokens.size.buttonMobilePrimary} radius={tokens.radius.xl} fontSize={16} />
      <Button label={tc('permissions.skip')} variant="secondary" onPress={() => setSkipped(true)} />
    </View>
  );
}
