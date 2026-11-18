import { t, tokens, type EngineState } from '@synkka/core';
import { ActivityIndicator, Text, View } from 'react-native';
import { accent, colors, font } from '../lib/theme';
import { Button } from './primitives';

/** Shown until the Syncthing engine answers (or fails to start). */
export function EngineGate({ state, onRetry }: { state: EngineState; onRetry: () => void }) {
  const error = state.state === 'error' ? state.error : null;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: colors.bg.canvas }}>
      {error ? null : <ActivityIndicator color={accent} size="large" />}
      <Text
        accessibilityRole={error ? 'alert' : 'text'}
        style={[font(error ? 600 : 500, tokens.font.size.title), { textAlign: 'center', color: error ? colors.text.dangerStrong : colors.text.primary }]}
      >
        {error ? t('engine.error', { error }) : t('engine.starting')}
      </Text>
      {error ? <Button label={t('engine.retry')} onPress={onRetry} style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}
