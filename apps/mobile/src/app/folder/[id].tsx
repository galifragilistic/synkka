import { t, tokens } from '@synkka/core';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileRow } from '../../components/FileRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useObservable } from '../../lib/service';
import { colors, font } from '../../lib/theme';

// Folder contents (not designed: reuses the "Viimeisimmät" row pattern from MobileFiles).
export default function FolderScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const items = useObservable((s) => s.list(id), [id]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <ScreenHeader title={name ?? t('nav.tabFiles')} fallback="/" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 4 }}>
        {items.length === 0 ? (
          <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, paddingVertical: 24, textAlign: 'center' }]}>
            {t('folders.empty')}
          </Text>
        ) : (
          items.map((f) => <FileRow key={f.id} file={f} />)
        )}
      </ScrollView>
    </View>
  );
}
