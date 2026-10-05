import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuthStore } from '../store/useAuthStore';
import { useAppointmentStore } from '../store/useAppointmentStore';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import { ClinicDetailScreen } from '../screens/clinic/ClinicDetailScreen';
import { DoctorProfileScreen } from '../screens/clinic/DoctorProfileScreen';
import { DepartmentSelectionScreen } from '../screens/appointments/DepartmentSelectionScreen';
import { BookingScreen } from '../screens/appointments/BookingScreen';
import { AppointmentDetailScreen } from '../screens/appointments/AppointmentDetailScreen';
import { MapScreen } from '../screens/map/MapScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { AppStackParamList } from '../types';

const Stack = createStackNavigator<AppStackParamList>();

const AppStack: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="MainTabs" component={MainTabNavigator} />
    <Stack.Screen
      name="SelectDepartment"
      component={DepartmentSelectionScreen}
      options={{ presentation: 'card', gestureEnabled: true }}
    />
    <Stack.Screen
      name="ClinicDetail"
      component={ClinicDetailScreen}
      options={{ presentation: 'card', gestureEnabled: true }}
    />
    <Stack.Screen
      name="DoctorProfile"
      component={DoctorProfileScreen}
      options={{ presentation: 'card', gestureEnabled: true }}
    />
    <Stack.Screen
      name="Booking"
      component={BookingScreen}
      options={{ presentation: 'modal', gestureEnabled: true }}
    />
    <Stack.Screen
      name="AppointmentDetail"
      component={AppointmentDetailScreen}
      options={{ presentation: 'card', gestureEnabled: true }}
    />
    <Stack.Screen
      name="MapView"
      component={MapScreen}
      options={{ presentation: 'card', gestureEnabled: true }}
    />
    <Stack.Screen
      name="Notifications"
      component={NotificationsScreen}
      options={{ presentation: 'card', gestureEnabled: true }}
    />
  </Stack.Navigator>
);

export const RootNavigator: React.FC = () => {
  const [minSplashDone, setMinSplashDone] = useState(false);
  const {
    isAuthenticated,
    isInitializing,
    user,
    initializeAuth,
    isSplashTriggered,
    clearSplashTrigger,
  } = useAuthStore();
  const { initializeStore, resetStore } = useAppointmentStore();

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (isSplashTriggered) {
      setMinSplashDone(false);
    }
  }, [isSplashTriggered]);

  const isFullyAuthenticated = isAuthenticated && user && (user as any).account_status !== 'PENDING';

  useEffect(() => {
    if (isFullyAuthenticated && user?.id) {
      initializeStore();
    } else if (!isFullyAuthenticated) {
      resetStore();
    }
  }, [isFullyAuthenticated, user?.id]);

  const showSplashScreen = !minSplashDone || isSplashTriggered || isInitializing;

  if (showSplashScreen) {
    return (
      <SplashScreen
        duration={1200}
        onFinish={() => {
          setMinSplashDone(true);
          clearSplashTrigger();
        }}
      />
    );
  }

  return (
    <NavigationContainer>
      {isFullyAuthenticated ? <AppStack /> : <AuthNavigator />}
    </NavigationContainer>
  );
};
