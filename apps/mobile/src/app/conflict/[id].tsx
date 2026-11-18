import {
  conflictOptions, ctaFor, DEFAULT_RESOLUTION, t, tokens, type Conflict, type ConflictResolution,
} from '@synkka/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { Button, RadioCard } from '../../components/primitives';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { useSyncService } from '../../lib/service';
import { accent, colors, font, overline } from '../../lib/theme';

function goBackToSync() {
  if (router.canGoBack()) router.back();
  else router.replace('/sync');
}

export default function ConflictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const service = useSyncService();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [selected, setSelected] = useState<ConflictResolution>(DEFAULT_RESOLUTION);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    service.getConflict(String(id)).then(
      (c) => alive && setConflict(c),
      () => alive && goBackToSync(), // already resolved or unknown id
    );
    return () => {
      alive = false;
    };
  }, [service, id]);

  const options = useMemo(() => (conflict ? conflictOptions(conflict) : []), [conflict]);

  const submit = async () => {
    if (!conflict || submitting) return;
    setSubmitting(true);
    try {
      await service.resolve(conflict.id, selected);
      toast(t('conflict.resolvedToast'));
      goBackToSync();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <ScreenHeader title={t('conflict.title')} fallback="/sync" />
      {conflict ? (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.alert} accessibilityRole="alert">
              <Icon name="alertTriangle" size={tokens.size.iconLg} color={colors.status.conflict} strokeWidth={2.2} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[font(600), { color: colors.text.dangerStrong }]}>{conflict.fileName}</Text>
                <Text style={[font(400, tokens.font.size.small), { color: colors.text.dangerStrong, lineHeight: 19 }]}>
                  {t('conflict.explanation')}
                </Text>
              </View>
            </View>

            <View accessibilityRole="radiogroup" accessibilityLabel={t('conflict.question')} style={{ gap: 10 }}>
              <Text style={[overline, { marginBottom: 0 }]}>{t('conflict.question')}</Text>
              {options.map((o) => (
                <RadioCard
                  key={o.id}
                  icon={o.icon}
                  title={o.title}
                  meta={o.meta}
                  selected={selected === o.id}
                  onSelect={() => setSelected(o.id)}
                />
              ))}
            </View>

            <Text style={[font(400, tokens.font.size.small), { color: colors.text.muted, lineHeight: 20 }]}>
              {t('conflict.historyNote')}
              {conflict?.olderCopies ? ` ${t('conflict.olderCopies', { count: conflict.olderCopies })}` : ''}
            </Text>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Button
              label={ctaFor(options, selected)}
              onPress={submit}
              disabled={submitting}
              height={tokens.size.buttonMobilePrimary}
              radius={tokens.radius.xl}
              fontSize={16}
            />
            <Pressable
              accessibilityRole="link"
              onPress={goBackToSync}
              style={({ pressed }) => [styles.later, pressed && { opacity: 0.7 }]}
            >
              <Text style={[font(600), { color: accent }]}>{t('conflict.decideLater')}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 20 },
  alert: {
    flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: tokens.radius.xl, backgroundColor: colors.bg.dangerSoft,
  },
  footer: { paddingHorizontal: 20, paddingTop: 16, gap: 8, backgroundColor: colors.bg.canvas },
  later: { height: tokens.size.touchTarget, alignItems: 'center', justifyContent: 'center' },
});
