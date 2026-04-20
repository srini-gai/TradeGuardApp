import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'

import { colors } from '../constants'
import type { RootTabNavProp } from '../navigation/types'
import type { Signal, RiskStatus, Alert as TGAlert, MonthlySummary, Trade } from '../types'
import {
  getRiskStatus,
  getTodaySignals,
  getBacktestSummary,
  getTodayAlerts,
  getMonthlySummary,
  getTodayTrades,
  runScreener,
  scanIntraday,
} from '../services/api'
import { getIST, isMarketOpen, formatISTDate, isPastCutoffWarning } from '../utils/time'
import SignalCard from '../components/SignalCard'
import { sendLocalNotification } from '../services/notifications'

function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function todayTradePnL(trades: Trade[]): number {
  return trades
    .filter(t => t.total_pnl !== null)
    .reduce((sum, t) => sum + (t.total_pnl ?? 0), 0)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MarketDot({ open }: { open: boolean }) {
  return (
    <View style={[dotStyles.dot, { backgroundColor: open ? colors.bull : colors.bear }]} />
  )
}

function MetricCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  return (
    <View style={metricStyles.card}>
      <Text style={metricStyles.label}>{label}</Text>
      <Text style={[metricStyles.value, valueColor ? { color: valueColor } : null]}>{value}</Text>
      {sub !== undefined && <Text style={metricStyles.sub}>{sub}</Text>}
    </View>
  )
}

function RiskPanel({ risk }: { risk: RiskStatus }) {
  const pastCutoff = isPastCutoffWarning()

  return (
    <View style={[riskStyles.panel, { borderLeftColor: risk.trading_window_open ? colors.bull : colors.bear }]}>
      <View style={riskStyles.header}>
        <Text style={riskStyles.title}>Risk Monitor</Text>
        <View style={[riskStyles.windowBadge, {
          backgroundColor: risk.trading_window_open ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        }]}>
          <Text style={[riskStyles.windowText, { color: risk.trading_window_open ? colors.bull : colors.bear }]}>
            {risk.trading_window_open ? 'Window Open' : 'Window Closed'}
          </Text>
        </View>
      </View>

      <View style={riskStyles.row}>
        <View style={riskStyles.stat}>
          <Text style={riskStyles.statLabel}>Trades Today</Text>
          <Text style={riskStyles.statValue}>{risk.trades_today} / {risk.max_trades}</Text>
        </View>
        <View style={riskStyles.stat}>
          <Text style={riskStyles.statLabel}>Slots Left</Text>
          <Text style={[riskStyles.statValue, { color: risk.slots_remaining > 0 ? colors.bull : colors.bear }]}>
            {risk.slots_remaining}
          </Text>
        </View>
        <View style={riskStyles.stat}>
          <Text style={riskStyles.statLabel}>Cutoff</Text>
          <Text style={riskStyles.statValue}>{risk.cutoff_hour_ist}:00 IST</Text>
        </View>
      </View>

      {pastCutoff && (
        <View style={riskStyles.warning}>
          <Text style={riskStyles.warningText}>
            ⚠ Past 1:30 PM — only {risk.slots_remaining} slot{risk.slots_remaining !== 1 ? 's' : ''} remaining
          </Text>
        </View>
      )}

      {risk.reason.length > 0 && (
        <Text style={riskStyles.reason}>{risk.reason}</Text>
      )}
    </View>
  )
}

function AlertRow({ alert }: { alert: TGAlert }) {
  function fmtTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    } catch {
      return iso
    }
  }

  return (
    <View style={alertStyles.row}>
      <View style={alertStyles.symbolBadge}>
        <Text style={alertStyles.symbolText}>{alert.symbol}</Text>
      </View>
      <View style={alertStyles.body}>
        <Text style={alertStyles.action}>{alert.action}</Text>
        {alert.price !== null && (
          <Text style={alertStyles.price}>₹{alert.price.toLocaleString('en-IN')}</Text>
        )}
      </View>
      <Text style={alertStyles.time}>{fmtTime(alert.received_at)}</Text>
    </View>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const navigation = useNavigation<RootTabNavProp>()

  const [risk, setRisk] = useState<RiskStatus | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [signalCount, setSignalCount] = useState(0)
  const [winRate, setWinRate] = useState<number | null>(null)
  const [alerts, setAlerts] = useState<TGAlert[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null)
  const [todayPnL, setTodayPnL] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [screenerLoading, setScreenerLoading] = useState(false)
  const [intradayLoading, setIntradayLoading] = useState(false)

  const marketOpen = isMarketOpen()
  const ist = getIST()

  const loadData = useCallback(async () => {
    const [riskRes, signalsRes, backtestRes, alertsRes, summaryRes, tradesRes] =
      await Promise.allSettled([
        getRiskStatus(),
        getTodaySignals(),
        getBacktestSummary(),
        getTodayAlerts(),
        getMonthlySummary(),
        getTodayTrades(),
      ])

    if (riskRes.status === 'fulfilled') setRisk(riskRes.value)
    if (signalsRes.status === 'fulfilled') {
      const sorted = [...signalsRes.value.signals].sort(
        (a, b) => b.confidence_score - a.confidence_score,
      )
      setSignals(sorted)
      setSignalCount(signalsRes.value.count)
    }
    if (backtestRes.status === 'fulfilled' && backtestRes.value.summary) {
      setWinRate(backtestRes.value.summary.win_rate)
    }
    if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.alerts)
    if (summaryRes.status === 'fulfilled') setMonthlySummary(summaryRes.value)
    if (tradesRes.status === 'fulfilled') setTodayPnL(todayTradePnL(tradesRes.value))
  }, [])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [loadData])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    loadData().finally(() => setRefreshing(false))
  }, [loadData])

  const handleRunScreener = useCallback(async () => {
    setScreenerLoading(true)
    try {
      const result = await runScreener() as { count?: number } | null
      const count = result?.count ?? 0
      sendLocalNotification(
        'Screener Complete',
        `${count} signal${count !== 1 ? 's' : ''} ready for today`,
      ).catch(() => null)
      navigation.navigate('Signals')
    } catch {
      Alert.alert('Screener', 'Failed to run screener. Please try again.')
    } finally {
      setScreenerLoading(false)
    }
  }, [navigation])

  const handleScanIntraday = useCallback(async () => {
    setIntradayLoading(true)
    try {
      const result = await scanIntraday() as { count?: number } | null
      const count = result?.count ?? 0
      sendLocalNotification(
        'Intraday Scan',
        `${count} intraday signal${count !== 1 ? 's' : ''} found`,
      ).catch(() => null)
      navigation.navigate('Signals')
    } catch {
      Alert.alert('Intraday Scan', 'Failed to scan. Please try again.')
    } finally {
      setIntradayLoading(false)
    }
  }, [navigation])

  const handleLogTrade = useCallback((_signal: Signal) => {
    navigation.navigate('Journal')
  }, [navigation])

  const topSignal = signals[0] ?? null

  // ── PnL display ──────────────────────────────────────────────────────────
  const pnlDisplay = todayPnL !== null
    ? { text: formatPnL(todayPnL), color: todayPnL >= 0 ? colors.bull : colors.bear }
    : monthlySummary
    ? { text: formatPnL(monthlySummary.total_pnl), color: monthlySummary.total_pnl >= 0 ? colors.bull : colors.bear }
    : { text: '—', color: colors.subtext }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>TradeGuard</Text>
          <Text style={styles.date}>{formatISTDate(ist)}</Text>
        </View>
        <View style={styles.marketStatus}>
          <MarketDot open={marketOpen} />
          <Text style={[styles.marketLabel, { color: marketOpen ? colors.bull : colors.muted }]}>
            {marketOpen ? 'Market Open' : 'Market Closed'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ── Metrics 2×2 ────────────────────────────────────────────── */}
          <View style={metricStyles.grid}>
            <MetricCard
              label={todayPnL !== null ? 'Today P&L' : 'Month P&L'}
              value={pnlDisplay.text}
              valueColor={pnlDisplay.color}
              sub={todayPnL === null && monthlySummary ? `${monthlySummary.total_trades} trades` : undefined}
            />
            <MetricCard
              label="Signals Ready"
              value={signalCount.toString()}
              sub={signalCount === 1 ? 'signal today' : 'signals today'}
              valueColor={signalCount > 0 ? colors.accent : colors.subtext}
            />
            <MetricCard
              label="Trades Today"
              value={risk ? `${risk.trades_today} / ${risk.max_trades}` : '— / 2'}
              sub={risk ? `${risk.slots_remaining} slot${risk.slots_remaining !== 1 ? 's' : ''} left` : undefined}
              valueColor={
                risk && risk.trades_today >= risk.max_trades ? colors.bear
                : risk && risk.trades_today > 0 ? colors.warn
                : colors.subtext
              }
            />
            <MetricCard
              label="Win Rate"
              value={winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
              sub="backtest"
              valueColor={
                winRate === null ? colors.subtext
                : winRate >= 60 ? colors.bull
                : winRate >= 40 ? colors.warn
                : colors.bear
              }
            />
          </View>

          {/* ── Risk Panel ──────────────────────────────────────────────── */}
          {risk && <RiskPanel risk={risk} />}

          {/* ── Quick Actions ───────────────────────────────────────────── */}
          <View style={actionStyles.row}>
            <TouchableOpacity
              style={[actionStyles.btn, actionStyles.screenerBtn]}
              onPress={handleRunScreener}
              disabled={screenerLoading}
              activeOpacity={0.8}
            >
              {screenerLoading ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Text style={actionStyles.btnText}>Run Screener</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[actionStyles.btn, actionStyles.intradayBtn]}
              onPress={handleScanIntraday}
              disabled={intradayLoading}
              activeOpacity={0.8}
            >
              {intradayLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[actionStyles.btnText, actionStyles.intradayBtnText]}>
                  Scan Intraday
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Top Signal ──────────────────────────────────────────────── */}
          {topSignal ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Top Signal Today</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Signals')}>
                  <Text style={styles.viewAll}>View all →</Text>
                </TouchableOpacity>
              </View>
              <SignalCard signal={topSignal} onLogTrade={handleLogTrade} compact />
            </View>
          ) : (
            <View style={styles.emptySignals}>
              <Text style={styles.emptyTitle}>No signals today</Text>
              <Text style={styles.emptyText}>Run the screener to generate today's signals</Text>
            </View>
          )}

          {/* ── Alerts ──────────────────────────────────────────────────── */}
          {alerts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Latest Alerts</Text>
              <View style={alertStyles.container}>
                {alerts.slice(0, 3).map(alert => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.bottomPad} />
        </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.2,
  },
  date: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 2,
  },
  marketStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  marketLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
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
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  viewAll: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  emptySignals: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: 14,
    color: colors.subtext,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  bottomPad: {
    height: 24,
  },
})

const dotStyles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})

const metricStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  label: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  sub: {
    fontSize: 10,
    color: colors.muted,
  },
})

const riskStyles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  windowBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  windowText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  warning: {
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  warningText: {
    fontSize: 11,
    color: colors.warn,
    fontWeight: '600',
  },
  reason: {
    marginTop: 8,
    fontSize: 11,
    color: colors.subtext,
    fontStyle: 'italic',
  },
})

const actionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  screenerBtn: {
    backgroundColor: colors.accent,
  },
  intradayBtn: {
    backgroundColor: colors.intraday,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bg,
    letterSpacing: 0.2,
  },
  intradayBtnText: {
    color: '#fff',
  },
})

const alertStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: 10,
  },
  symbolBadge: {
    backgroundColor: 'rgba(0,212,170,0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
  },
  symbolText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  action: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  price: {
    fontSize: 12,
    color: colors.subtext,
  },
  time: {
    fontSize: 10,
    color: colors.muted,
  },
})
