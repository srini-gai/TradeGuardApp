import React, { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Navigation from './app/navigation'
import ErrorBoundary from './app/components/ErrorBoundary'
import {
  registerForPushNotifications,
  scheduleMorningReminder,
  scheduleIntradayReminder,
  scheduleExitReminder,
} from './app/services/notifications'
import { checkPaperTradeAlerts } from './app/services/paperTrading'

export default function App() {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    registerForPushNotifications().catch(() => null)
    scheduleMorningReminder().catch(() => null)
    scheduleIntradayReminder().catch(() => null)
    scheduleExitReminder().catch(() => null)
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        try {
          await checkPaperTradeAlerts()
        } catch {
          // silent — foreground check is best-effort
        }
      }
      appStateRef.current = nextState
    })
    return () => sub.remove()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StatusBar style="light" backgroundColor="#0a0e1a" />
        <Navigation />
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}
