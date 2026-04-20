import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Navigation from './app/navigation'
import {
  registerForPushNotifications,
  scheduleMorningReminder,
  scheduleIntradayReminder,
  scheduleExitReminder,
} from './app/services/notifications'

export default function App() {
  useEffect(() => {
    registerForPushNotifications().catch(() => null)
    scheduleMorningReminder().catch(() => null)
    scheduleIntradayReminder().catch(() => null)
    scheduleExitReminder().catch(() => null)
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0a0e1a" />
      <Navigation />
    </GestureHandlerRootView>
  )
}
