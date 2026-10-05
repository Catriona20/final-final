import React, { useEffect } from 'react';
import { Platform, Animated, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useThemeStore } from './src/store/useThemeStore';
import { useAppStore } from './src/store/useAppStore';

// Silence useNativeDriver warnings on Web by overriding Animated functions
if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
  }
  const originalTiming = Animated.timing;
  (Animated as any).timing = (value: any, config: any) => {
    return originalTiming(value, { ...config, useNativeDriver: false });
  };
  const originalSpring = Animated.spring;
  (Animated as any).spring = (value: any, config: any) => {
    return originalSpring(value, { ...config, useNativeDriver: false });
  };
}

export default function App() {
  const { initializeTheme, isDark } = useThemeStore();
  const { initializeLocation } = useAppStore();

  useEffect(() => {
    initializeTheme();
    initializeLocation();
  }, []);

  const content = (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </SafeAreaProvider>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webOuterContainer, { backgroundColor: isDark ? '#020817' : '#E2E8F0' }]}>
        <View style={[styles.webInnerContainer, { backgroundColor: isDark ? '#06152F' : '#F5F8FC' }]}>
          {content}
        </View>
      </View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  webOuterContainer: {
    flex: 1,
    width: '100%',
    minHeight: '100vh' as any,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webInnerContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    minHeight: '100vh' as any,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    overflow: 'hidden',
  },
});
