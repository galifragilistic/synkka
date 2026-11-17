import { tokens } from '@synkka/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '../lib/theme';
import { Icon } from './Icon';

const ToastContext = createContext<(message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const show = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{
            position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 96, alignItems: 'center',
          }}
        >
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16,
              borderRadius: tokens.radius.lg, backgroundColor: colors.text.primary,
            }}
          >
            <Icon name="checkCircle" size={18} color={colors.text.onAccent} strokeWidth={2.4} />
            <Text style={[font(600, tokens.font.size.body), { color: colors.text.onAccent }]}>{message}</Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
