import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text, View } from 'react-native'
import { colors } from '../constants'

import DashboardScreen from '../screens/DashboardScreen'
import SignalsScreen from '../screens/SignalsScreen'
import JournalScreen from '../screens/JournalScreen'
import SearchScreen from '../screens/SearchScreen'
import MoreScreen from '../screens/MoreScreen'

const Tab = createBottomTabNavigator()

function TabIcon({ label, active }: { label: string; active: boolean }) {
  const icons: Record<string, string> = {
    Home: '⬡',
    Signals: '◎',
    Journal: '◉',
    Search: '⊕',
    More: '≡',
  }
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 18, color: active ? colors.accent : colors.muted }}>
        {icons[label]}
      </Text>
    </View>
  )
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => (
            <TabIcon label={route.name} active={focused} />
          ),
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
            paddingBottom: 8,
            paddingTop: 4,
            height: 64,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={DashboardScreen} />
        <Tab.Screen name="Signals" component={SignalsScreen} />
        <Tab.Screen name="Journal" component={JournalScreen} />
        <Tab.Screen name="Search" component={SearchScreen} />
        <Tab.Screen name="More" component={MoreScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  )
}
