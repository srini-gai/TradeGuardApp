import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'

import { colors } from '../constants'
import type { RootTabNavProp } from '../navigation/types'
import type { Signal, IntradaySignal } from '../types'
import {
  getTodaySignals,
  getTodayIntradaySignals,
  runScreener,
  scanIntraday,
} from '../services/api'
import { getIST, isMarketOpen, formatISTTime, countdownTo3PM } from '../utils/time'
import SignalCard from '../components/SignalCard'
import IntradaySignalCard from '../components/IntradaySignalCard'
import { openPaperTrade } from '../services/paperTrading'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'swing' | 'intraday'
type ConfFilter = 'all' | '60+' | '70+' | '80+'

const CONF_FILTERS: ConfFilter[] = ['all', '60+', '70+', '80+']
const CONF_MIN: Record<ConfFilter, number> = { all: 0, '60+': 60, '70+': 70, '80+': 80 }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyConfFilter<T extends { confidence_score: number }>(
  items: T[],
  filter: ConfFilter,
): T[] {
  const min = CONF_MIN[filter]
  return min === 0 ? items : items.filter(s => s.confidence_score >= min)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabToggle({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  return (
    <View style={toggleStyles.container}>
      <TouchableOpacity
        style={[
          toggleStyles.tab,
          active === 'swing' && toggleStyles.activeSwing,
        ]}
        onPress={() => onChange('swing')}
        activeOpacity={0.8}
      >
        <Text style={[toggleStyles.label, active === 'swing' && toggleStyles.activeLabelSwing]}>
          Swing · Daily
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          toggleStyles.tab,
          active === 'intraday' && toggleStyles.activeIntraday,
        ]}
        onPress={() => onChange('intraday')}
        activeOpacity={0.8}
      >
        <Text style={[toggleStyles.label, active === 'intraday' && toggleStyles.activeLabelIntraday]}>
          Intraday · 30min
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function ConfidenceFilter({
  active,
  onChange,
  accent,
}: {
  active: ConfFilter
  onChange: (f: ConfFilter) => void
  accent: string
}) {
  return (
    <View style={filterStyles.row}>
      {CONF_FILTERS.map(f => (
        <TouchableOpacity
          key={f}
          style={[
            filterStyles.btn,
            active === f && { backgroundColor: accent + '22', borderColor: accent },
          ]}
          onPress={() => onChange(f)}
          activeOpacity={0.7}
        >
          <Text style={[filterStyles.label, active === f && { color: accent, fontWeight: '700' }]}>
            {f === 'all' ? 'All' : f}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.title}>{message}</Text>
      <Text style={emptyStyles.sub}>{sub}</Text>
    </View>
  )
}

function MarketStatusBar() {
  const [ist, setIST] = useState(getIST())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setIST(getIST()), 60000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const open = isMarketOpen()
  const countdown = countdownTo3PM()
  const timeStr = formatISTTime(ist)

  return (
    <View style={[mktStyles.bar, { borderLeftColor: open ? colors.bull : colors.bear }]}>
      <View style={mktStyles.left}>
        <View style={[mktStyles.dot, { backgroundColor: open ? colors.bull : colors.bear }]} />
        <Text style={[mktStyles.status, { color: open ? colors.bull : colors.muted }]}>
          {open ? 'Market Open' : 'Market Closed'}
        </Text>
        <Text style={mktStyles.time}>{timeStr} IST</Text>
      </View>
      {open && countdown && (
        <View style={mktStyles.countdownBadge}>
          <Text style={mktStyles.countdownText}>{countdown}</Text>
        </View>
      )}
    </View>
  )
}

function IntradayExitBanner() {
  return (
    <View style={bannerStyles.banner}>
      <Text style={bannerStyles.text}>
        ⚠ Intraday positions must be closed by 3:00 PM IST. No new entries after 2:30 PM.
      </Text>
    </View>
  )
}

// ─── Swing tab ────────────────────────────────────────────────────────────────

function SwingTab({
  confFilter,
  onNavigateJournal,
  onSimulate,
}: {
  confFilter: ConfFilter
  onNavigateJournal: () => void
  onSimulate: (signal: Signal) => void
}) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getTodaySignals()
      const sorted = [...res.signals].sort((a, b) => b.confidence_score - a.confidence_score)
      setSignals(sorted)
    } catch {
      // keep existing data on error
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    load().finally(() => setRefreshing(false))
  }, [load])

  const handleRunScreener = useCallback(async () => {
    setScanLoading(true)
    try {
      await runScreener()
      await load()
    } catch {
      Alert.alert('Screener', 'Failed to run screener. Please try again.')
    } finally {
      setScanLoading(false)
    }
  }, [load])

  const filtered = applyConfFilter(signals, confFilter)

  return (
    <View style={tabStyles.container}>
      {/* Run Screener button */}
      <TouchableOpacity
        style={swingStyles.screenerBtn}
        onPress={handleRunScreener}
        disabled={scanLoading}
        activeOpacity={0.8}
      >
        {scanLoading ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Text style={swingStyles.screenerBtnText}>Run Screener</Text>
        )}
      </TouchableOpacity>

      {loading ? (
        <View style={tabStyles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={tabStyles.loadingText}>Loading signals…</Text>
        </View>
      ) : (
        <FlatList<Signal>
          data={filtered}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <SignalCard
              signal={item}
              onLogTrade={onNavigateJournal}
              onSimulate={onSimulate}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          contentContainerStyle={tabStyles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              message="No signals yet"
              sub="Tap Run Screener to generate today's signals"
            />
          }
        />
      )}
    </View>
  )
}

// ─── Intraday tab ─────────────────────────────────────────────────────────────

function IntradayTab({
  confFilter,
  onNavigateJournal,
  onSimulate,
}: {
  confFilter: ConfFilter
  onNavigateJournal: () => void
  onSimulate: (signal: IntradaySignal) => void
}) {
  const [signals, setSignals] = useState<IntradaySignal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)

  const open = isMarketOpen()

  const load = useCallback(async () => {
    try {
      const res = await getTodayIntradaySignals()
      const sorted = [...res.signals].sort((a, b) => b.confidence_score - a.confidence_score)
      setSignals(sorted)
    } catch {
      // keep existing data on error
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    load().finally(() => setRefreshing(false))
  }, [load])

  const handleScan = useCallback(async () => {
    setScanLoading(true)
    try {
      await scanIntraday()
      await load()
    } catch {
      Alert.alert('Intraday Scan', 'Scan failed. Please try again.')
    } finally {
      setScanLoading(false)
    }
  }, [load])

  const filtered = applyConfFilter(signals, confFilter)

  return (
    <View style={tabStyles.container}>
      {/* Market status bar */}
      <MarketStatusBar />

      {/* Exit warning — only when market is open */}
      {open && <IntradayExitBanner />}

      {/* Scan Now button */}
      <TouchableOpacity
        style={intradayStyles.scanBtn}
        onPress={handleScan}
        disabled={scanLoading}
        activeOpacity={0.8}
      >
        {scanLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={intradayStyles.scanBtnText}>Scan Now</Text>
        )}
      </TouchableOpacity>

      {loading ? (
        <View style={tabStyles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.intraday} />
          <Text style={tabStyles.loadingText}>Loading intraday signals…</Text>
        </View>
      ) : (
        <FlatList<IntradaySignal>
          data={filtered}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <IntradaySignalCard
              signal={item}
              onLogTrade={onNavigateJournal}
              onSimulate={onSimulate}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.intraday}
              colors={[colors.intraday]}
            />
          }
          contentContainerStyle={tabStyles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              message="No intraday signals"
              sub="Tap Scan Now to run the intraday screener"
            />
          }
        />
      )}
    </View>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SignalsScreen() {
  const navigation = useNavigation<RootTabNavProp>()
  const [activeTab, setActiveTab] = useState<Tab>('swing')
  const [confFilter, setConfFilter] = useState<ConfFilter>('all')

  const accent = activeTab === 'swing' ? colors.accent : colors.intraday

  const handleNavigateJournal = useCallback(() => {
    navigation.navigate('Journal')
  }, [navigation])

  const handleSimulateSwing = useCallback(async (signal: Signal) => {
    try {
      await openPaperTrade(signal)
      Alert.alert('Paper Trade Opened', `${signal.symbol} ${signal.direction} added to simulation`)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not open paper trade')
    }
  }, [])

  const handleSimulateIntraday = useCallback(async (signal: IntradaySignal) => {
    try {
      await openPaperTrade(signal)
      Alert.alert('Paper Trade Opened', `${signal.symbol} ${signal.direction} added to simulation`)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not open paper trade')
    }
  }, [])

  // Reset filter when switching tabs
  const handleTabChange = useCallback((t: Tab) => {
    setActiveTab(t)
    setConfFilter('all')
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Signals</Text>
      </View>

      {/* Tab toggle */}
      <TabToggle active={activeTab} onChange={handleTabChange} />

      {/* Confidence filter */}
      <ConfidenceFilter active={confFilter} onChange={setConfFilter} accent={accent} />

      {/* Tab content */}
      {activeTab === 'swing' ? (
        <SwingTab confFilter={confFilter} onNavigateJournal={handleNavigateJournal} onSimulate={handleSimulateSwing} />
      ) : (
        <IntradayTab confFilter={confFilter} onNavigateJournal={handleNavigateJournal} onSimulate={handleSimulateIntraday} />
      )}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
})

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 3,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeSwing: {
    backgroundColor: colors.accent + '22',
  },
  activeIntraday: {
    backgroundColor: colors.intraday + '22',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.2,
  },
  activeLabelSwing: {
    color: colors.accent,
  },
  activeLabelIntraday: {
    color: colors.intraday,
  },
})

const filterStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
  },
})

const tabStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 24,
    flexGrow: 1,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.subtext,
  },
})

const swingStyles = StyleSheet.create({
  screenerBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 48,
  },
  screenerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bg,
    letterSpacing: 0.3,
  },
})

const intradayStyles = StyleSheet.create({
  scanBtn: {
    backgroundColor: colors.intraday,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 48,
  },
  scanBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
})

const mktStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: '700',
  },
  time: {
    fontSize: 11,
    color: colors.muted,
  },
  countdownBadge: {
    backgroundColor: 'rgba(234,88,12,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countdownText: {
    fontSize: 11,
    color: colors.intraday,
    fontWeight: '700',
  },
})

const bannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: 'rgba(234,88,12,0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: colors.intraday + '44',
  },
  text: {
    fontSize: 11,
    color: colors.intraday,
    fontWeight: '600',
    lineHeight: 16,
  },
})

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.subtext,
  },
  sub: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
})
