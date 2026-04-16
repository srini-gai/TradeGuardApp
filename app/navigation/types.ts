import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs'

export type RootTabParamList = {
  Home: undefined
  Signals: undefined
  Journal: undefined
  Search: undefined
  More: undefined
}

export type RootTabNavProp = BottomTabNavigationProp<RootTabParamList>
