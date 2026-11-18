import { t, tokens } from '@synkka/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/primitives';
import { ScreenHeader } from '../components/ScreenHeader';
import { useToast } from '../components/Toast';
import { tc } from '../lib/copy';
import { useSyncService } from '../lib/service';
import { colors, font, overline } from '../lib/theme';

const BASE = '/storage/emulated/0/Synkka';

// Not designed: simple form (label + path) using the existing input/button styles.
export default function AddFolderScreen() {
  const sync = useSyncService();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectivePath = path.trim() || `${BASE}/${label.trim() || 'Kansio'}`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sync.addFolder(effectivePath, label.trim() || effectivePath.split('/').filter(Boolean).pop()!);
      toast(t('folders.added'));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <ScreenHeader title={t('folders.add')} fallback="/" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text style={overline} nativeID="lbl-name">{t('folders.label')}</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Kuvat"
            placeholderTextColor={colors.text.muted}
            accessibilityLabelledBy="lbl-name"
            accessibilityLabel={t('folders.label')}
            style={[font(400), styles.input]}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={overline} nativeID="lbl-path">{t('folders.path')}</Text>
          <TextInput
            value={path}
            onChangeText={setPath}
            placeholder={`${BASE}/${label.trim() || '…'}`}
            placeholderTextColor={colors.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('folders.path')}
            style={[font(400), styles.input]}
          />
          <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, lineHeight: 19 }]}>{tc('folders.addHint')}</Text>
        </View>
        {error ? <Text accessibilityRole="alert" style={[font(500, tokens.font.size.small), { color: colors.status.conflict }]}>{error}</Text> : null}
        <Button label={t('folders.add')} onPress={submit} disabled={busy} height={tokens.size.buttonMobilePrimary} radius={tokens.radius.xl} fontSize={16} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  input: {
    height: tokens.size.touchTarget, paddingHorizontal: 14, borderRadius: tokens.radius.lg,
    backgroundColor: colors.bg.surface, borderWidth: 1, borderColor: colors.border.control,
  },
});
