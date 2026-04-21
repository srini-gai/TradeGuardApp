import React, { useState, useEffect, useCallback, memo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { colors, WEBHOOK_BASE } from '../constants'
import NotificationSettingsScreen from './NotificationSettingsScreen'
import PaperTradingScreen from './PaperTradingScreen'
import {
  getBacktestSummary,
  runBacktest,
  getBacktestRuns,
  getTodayAlerts,
  getAllAlerts,
  sendTestWebhook,
  checkHealth,
} from '../services/api'
import type { BacktestSummary, Alert as TradingAlert } from '../types'

// ─── Types ─────────────────────────────────────────────────────────────────────

type TabId = 'backtest' | 'alerts' | 'settings' | 'paper'

interface BacktestRun {
  id: number
  run_date: string
  period_start: string
  period_end: string
  total_signals: number
  win_rate: number
  avg_pnl: number
  best_trade_pnl: number | null
  worst_trade_pnl: number | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_URL = `${WEBHOOK_BASE}/tradingview`
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch {
    return ''
  }
}

function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function parseRuns(raw: unknown): BacktestRun[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .filter(item => item !== null && typeof item === 'object')
    .map(item => {
      const r = item as Record<string, unknown>
      return {
        id: typeof r.id === 'number' ? r.id : 0,
        run_date: typeof r.run_date === 'string' ? r.run_date : '',
        period_start: typeof r.period_start === 'string' ? r.period_start : '',
        period_end: typeof r.period_end === 'string' ? r.period_end : '',
        total_signals: typeof r.total_signals === 'number' ? r.total_signals : 0,
        win_rate: typeof r.win_rate === 'number' ? r.win_rate : 0,
        avg_pnl: typeof r.avg_pnl === 'number' ? r.avg_pnl : 0,
        best_trade_pnl: typeof r.best_trade_pnl === 'number' ? r.best_trade_pnl : null,
        worst_trade_pnl: typeof r.worst_trade_pnl === 'number' ? r.worst_trade_pnl : null,
      }
    })
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={sharedStyles.sectionLabel}>{title}</Text>
}

function EmptyBox({ message, sub }: { message: string; sub?: string }) {
  return (
    <View style={sharedStyles.emptyBox}>
      <Text style={sharedStyles.emptyMsg}>{message}</Text>
      {sub ? <Text style={sharedStyles.emptySub}>{sub}</Text> : null}
    </View>
  )
}

// ─── Backtest Tab ──────────────────────────────────────────────────────────────

const SummaryCard = memo(function SummaryCard({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <View style={btStyles.summaryCard}>
      <Text style={btStyles.summaryLabel}>{label}</Text>
      <Text style={[btStyles.summaryValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  )
})

const MonthRow = memo(function MonthRow({
  month,
  data,
}: {
  month: string
  data: { trades: number; win_rate: number; avg_pnl: number }
}) {
  return (
    <View style={btStyles.tableRow}>
      <Text style={[btStyles.tableCell, btStyles.tableCellMonth]}>{month}</Text>
      <Text style={[btStyles.tableCell, btStyles.tableCellNum]}>{data.trades}</Text>
      <Text style={[
        btStyles.tableCell,
        btStyles.tableCellNum,
        { color: data.win_rate >= 50 ? colors.bull : colors.bear },
      ]}>
        {data.win_rate.toFixed(0)}%
      </Text>
      <Text style={[
        btStyles.tableCell,
        btStyles.tableCellNum,
        { color: data.avg_pnl >= 0 ? colors.bull : colors.bear },
      ]}>
        {formatPnL(data.avg_pnl)}
      </Text>
    </View>
  )
})

const RunRow = memo(function RunRow({
  run,
  onPress,
}: {
  run: BacktestRun
  onPress: (run: BacktestRun) => void
}) {
  return (
    <TouchableOpacity style={btStyles.runRow} onPress={() => onPress(run)} activeOpacity={0.8}>
      <View style={btStyles.runLeft}>
        <Text style={btStyles.runDate}>{formatDate(run.run_date)}</Text>
        <Text style={btStyles.runPeriod}>
          {formatDate(run.period_start)} — {formatDate(run.period_end)}
        </Text>
        <Text style={btStyles.runSignals}>{run.total_signals} signals</Text>
      </View>
      <View style={btStyles.runRight}>
        <Text style={[btStyles.runWinRate, { color: run.win_rate >= 50 ? colors.bull : colors.bear }]}>
          {run.win_rate.toFixed(0)}%
        </Text>
        <Text style={[btStyles.runAvgPnl, { color: run.avg_pnl >= 0 ? colors.bull : colors.bear }]}>
          {formatPnL(run.avg_pnl)}
        </Text>
      </View>
      <Text style={btStyles.runChevron}>›</Text>
    </TouchableOpacity>
  )
})

function BacktestTab() {
  const [summary, setSummary] = useState<BacktestSummary | null>(null)
  const [runs, setRuns] = useState<BacktestRun[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [selectedRun, setSelectedRun] = useState<BacktestRun | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, runsRes] = await Promise.allSettled([
        getBacktestSummary(),
        getBacktestRuns(),
      ])
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.summary)
      if (runsRes.status === 'fulfilled') setRuns(parseRuns(runsRes.value))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleRunBacktest = useCallback(async (months: number) => {
    setShowPicker(false)
    setRunning(true)
    try {
      await runBacktest(months)
      const [summaryRes, runsRes] = await Promise.allSettled([
        getBacktestSummary(),
        getBacktestRuns(),
      ])
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.summary)
      if (runsRes.status === 'fulfilled') setRuns(parseRuns(runsRes.value))
    } catch {
      Alert.alert('Error', 'Backtest failed. Try again.')
    } finally {
      setRunning(false)
    }
  }, [])

  const monthBreakdown = summary?.monthly_breakdown
    ? Object.entries(summary.monthly_breakdown)
    : []

  if (loading) {
    return (
      <View style={sharedStyles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <>
      <Modal
        visible={selectedRun !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRun(null)}
      >
        <Pressable style={modalStyles.overlay} onPress={() => setSelectedRun(null)}>
          <Pressable style={modalStyles.sheet} onPress={() => {}}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.sheetTitle}>Run Details</Text>
            {selectedRun && (
              <View style={btStyles.runDetail}>
                <Text style={btStyles.runDetailRow}>
                  Period: {formatDate(selectedRun.period_start)} → {formatDate(selectedRun.period_end)}
                </Text>
                <Text style={btStyles.runDetailRow}>
                  Signals: {selectedRun.total_signals}
                </Text>
                <Text style={[
                  btStyles.runDetailRow,
                  { color: selectedRun.win_rate >= 50 ? colors.bull : colors.bear },
                ]}>
                  Win Rate: {selectedRun.win_rate.toFixed(1)}%
                </Text>
                <Text style={[
                  btStyles.runDetailRow,
                  { color: selectedRun.avg_pnl >= 0 ? colors.bull : colors.bear },
                ]}>
                  Avg P&L: {formatPnL(selectedRun.avg_pnl)}
                </Text>
                {selectedRun.best_trade_pnl !== null && (
                  <Text style={[btStyles.runDetailRow, { color: colors.bull }]}>
                    Best Trade: {formatPnL(selectedRun.best_trade_pnl)}
                  </Text>
                )}
                {selectedRun.worst_trade_pnl !== null && (
                  <Text style={[btStyles.runDetailRow, { color: colors.bear }]}>
                    Worst Trade: {formatPnL(selectedRun.worst_trade_pnl)}
                  </Text>
                )}
              </View>
            )}
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={() => setSelectedRun(null)}
            >
              <Text style={modalStyles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        style={btStyles.scroll}
        contentContainerStyle={btStyles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        {summary ? (
          <>
            <SectionLabel title="Latest Results" />
            <View style={btStyles.summaryRow}>
              <SummaryCard
                label="Win Rate"
                value={`${summary.win_rate.toFixed(0)}%`}
                valueColor={summary.win_rate >= 50 ? colors.bull : colors.bear}
              />
              <SummaryCard
                label="Avg P&L"
                value={formatPnL(summary.avg_pnl)}
                valueColor={summary.avg_pnl >= 0 ? colors.bull : colors.bear}
              />
              <SummaryCard
                label="Best"
                value={formatPnL(summary.best_trade_pnl)}
                valueColor={colors.bull}
              />
              <SummaryCard
                label="Worst"
                value={formatPnL(summary.worst_trade_pnl)}
                valueColor={colors.bear}
              />
            </View>
          </>
        ) : (
          <EmptyBox
            message="No backtest results yet"
            sub="Run a backtest to see performance metrics"
          />
        )}

        {/* Run backtest button */}
        <View style={btStyles.runBtnSection}>
          {running ? (
            <View style={btStyles.runningBox}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={btStyles.runningText}>
                Running backtest… this may take 2–3 mins
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={btStyles.runBtn}
                onPress={() => setShowPicker(v => !v)}
                activeOpacity={0.8}
              >
                <Text style={btStyles.runBtnText}>
                  Run Backtest {showPicker ? '▲' : '▾'}
                </Text>
              </TouchableOpacity>
              {showPicker && (
                <View style={btStyles.monthPicker}>
                  {([1, 2, 3] as const).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={btStyles.monthChip}
                      onPress={() => handleRunBacktest(m)}
                      activeOpacity={0.8}
                    >
                      <Text style={btStyles.monthChipText}>
                        {m} Month{m > 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Monthly breakdown table */}
        {monthBreakdown.length > 0 && (
          <>
            <SectionLabel title="Monthly Breakdown" />
            <View style={btStyles.table}>
              <View style={btStyles.tableHeader}>
                <Text style={[btStyles.tableHeadCell, btStyles.tableCellMonth]}>Month</Text>
                <Text style={[btStyles.tableHeadCell, btStyles.tableCellNum]}>Trades</Text>
                <Text style={[btStyles.tableHeadCell, btStyles.tableCellNum]}>Win%</Text>
                <Text style={[btStyles.tableHeadCell, btStyles.tableCellNum]}>Avg P&L</Text>
              </View>
              {monthBreakdown.map(([month, data]) => (
                <MonthRow key={month} month={month} data={data} />
              ))}
            </View>
          </>
        )}

        {/* Past runs */}
        {runs.length > 0 && (
          <>
            <SectionLabel title="Past Runs" />
            {runs.map(run => (
              <RunRow key={run.id} run={run} onPress={setSelectedRun} />
            ))}
          </>
        )}

        <View style={sharedStyles.bottomPad} />
      </ScrollView>
    </>
  )
}

// ─── Alerts Tab ────────────────────────────────────────────────────────────────

const AlertRow = memo(function AlertRow({ item }: { item: TradingAlert }) {
  const isCE = item.action.includes('CE')
  const isPE = item.action.includes('PE')
  const actionColor = isCE ? colors.bull : isPE ? colors.bear : colors.muted
  const actionBg = isCE
    ? 'rgba(34,197,94,0.12)'
    : isPE
    ? 'rgba(239,68,68,0.12)'
    : colors.surface

  return (
    <View style={alertStyles.row}>
      <View style={alertStyles.symbolBadge}>
        <Text style={alertStyles.symbolText}>{item.symbol}</Text>
      </View>
      <View style={[alertStyles.actionBadge, { backgroundColor: actionBg }]}>
        <Text style={[alertStyles.actionText, { color: actionColor }]}>{item.action}</Text>
      </View>
      <View style={alertStyles.details}>
        {item.price !== null && (
          <Text style={alertStyles.price}>
            ₹{item.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </Text>
        )}
        <Text style={alertStyles.time}>
          {formatDate(item.received_at)} {formatTime(item.received_at)}
        </Text>
      </View>
    </View>
  )
})

function AlertsTab() {
  const [alerts, setAlerts] = useState<TradingAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [sending, setSending] = useState(false)

  const fetchAlerts = useCallback(async (all: boolean) => {
    setLoading(true)
    try {
      const res = all ? await getAllAlerts() : await getTodayAlerts()
      setAlerts(res.alerts)
    } catch {
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlerts(showAll) }, [showAll, fetchAlerts])

  const handleSendTest = useCallback(async () => {
    setSending(true)
    try {
      await sendTestWebhook()
      Alert.alert('Success', 'Test alert sent successfully')
      fetchAlerts(showAll)
    } catch {
      Alert.alert('Error', 'Failed to send test alert')
    } finally {
      setSending(false)
    }
  }, [showAll, fetchAlerts])

  const handleShareWebhook = useCallback(() => {
    Share.share({ message: WEBHOOK_URL })
  }, [])

  const listHeader = (
    <View>
      <View style={alertStyles.toggle}>
        <TouchableOpacity
          style={[alertStyles.toggleBtn, !showAll && alertStyles.toggleActive]}
          onPress={() => setShowAll(false)}
          activeOpacity={0.8}
        >
          <Text style={[alertStyles.toggleText, !showAll && alertStyles.toggleTextActive]}>
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[alertStyles.toggleBtn, showAll && alertStyles.toggleActive]}
          onPress={() => setShowAll(true)}
          activeOpacity={0.8}
        >
          <Text style={[alertStyles.toggleText, showAll && alertStyles.toggleTextActive]}>
            All
          </Text>
        </TouchableOpacity>
      </View>

      <View style={alertStyles.webhookBox}>
        <View style={alertStyles.webhookHeader}>
          <Text style={alertStyles.webhookLabel}>Webhook URL</Text>
          <TouchableOpacity
            onPress={handleShareWebhook}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={alertStyles.shareBtn}>Share ⎘</Text>
          </TouchableOpacity>
        </View>
        <Text style={alertStyles.webhookUrl} selectable>{WEBHOOK_URL}</Text>
      </View>

      <TouchableOpacity
        style={alertStyles.testBtn}
        onPress={handleSendTest}
        activeOpacity={0.8}
        disabled={sending}
      >
        {sending
          ? <ActivityIndicator size="small" color={colors.accent} />
          : <Text style={alertStyles.testBtnText}>Send Test Alert</Text>
        }
      </TouchableOpacity>

      {loading
        ? (
          <View style={sharedStyles.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        )
        : alerts.length === 0
        ? (
          <EmptyBox
            message="No alerts yet"
            sub="Set up TradingView webhook to receive alerts"
          />
        )
        : <SectionLabel title="Alerts" />
      }
    </View>
  )

  return (
    <FlatList
      data={loading ? [] : alerts}
      keyExtractor={item => String(item.id)}
      renderItem={({ item }) => <AlertRow item={item} />}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        !loading ? (
          <View style={alertStyles.empty}>
            <Text style={alertStyles.emptyText}>No alerts yet</Text>
          </View>
        ) : null
      }
      contentContainerStyle={alertStyles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  )
}

// ─── Settings Tab ──────────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? colors.warn : ok ? colors.bull : colors.bear
  return <View style={[settingsStyles.dot, { backgroundColor: color }]} />
}

function SettingsRow({
  label,
  value,
  valueColor,
  right,
}: {
  label: string
  value?: string
  valueColor?: string
  right?: React.ReactNode
}) {
  return (
    <View style={settingsStyles.row}>
      <Text style={settingsStyles.rowLabel}>{label}</Text>
      {right ?? (
        <Text style={[settingsStyles.rowValue, valueColor ? { color: valueColor } : null]}>
          {value ?? '—'}
        </Text>
      )}
    </View>
  )
}

function SettingsTab({ onOpenNotifSettings }: { onOpenNotifSettings: () => void }) {
  const [healthOk, setHealthOk] = useState<boolean | null>(null)
  const [clearingCache, setClearingCache] = useState(false)

  useEffect(() => {
    checkHealth()
      .then(() => setHealthOk(true))
      .catch(() => setHealthOk(false))
  }, [])

  const statusLabel = healthOk === null ? 'Checking…' : healthOk ? 'Connected' : 'Unreachable'
  const statusColor = healthOk === null ? colors.warn : healthOk ? colors.bull : colors.bear

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear Local Cache',
      'This will clear all locally stored data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true)
            try {
              await AsyncStorage.clear()
              Alert.alert('Done', 'Local cache cleared successfully')
            } catch {
              Alert.alert('Error', 'Failed to clear cache')
            } finally {
              setClearingCache(false)
            }
          },
        },
      ],
    )
  }, [])

  return (
    <ScrollView
      style={settingsStyles.scroll}
      contentContainerStyle={settingsStyles.content}
      showsVerticalScrollIndicator={false}
    >
      <SectionLabel title="Connection" />
      <View style={settingsStyles.card}>
        <SettingsRow
          label="API Status"
          right={
            <View style={settingsStyles.statusRow}>
              <StatusDot ok={healthOk} />
              <Text style={[settingsStyles.rowValue, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          }
        />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow
          label="Options Data (Upstox)"
          right={
            <View style={settingsStyles.statusRow}>
              <StatusDot ok={healthOk} />
              <Text style={[settingsStyles.rowValue, { color: statusColor }]}>
                {healthOk === null ? 'Checking…' : healthOk ? 'Live' : 'Unavailable'}
              </Text>
            </View>
          }
        />
      </View>

      <SectionLabel title="Screener Schedule" />
      <View style={settingsStyles.card}>
        <SettingsRow label="Morning scan" value="9:20 AM IST (weekdays)" />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow label="Intraday scan" value="10:30 AM IST (weekdays)" />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow label="Exit reminder" value="2:55 PM IST (weekdays)" />
      </View>

      <SectionLabel title="Risk Rules" />
      <View style={settingsStyles.card}>
        <SettingsRow label="Max trades/day" value="2" />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow label="Capital risk/trade" value="2%" />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow label="No trades after" value="2:00 PM IST" />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow
          label="Stop-loss"
          value="Mandatory"
          valueColor={colors.warn}
        />
      </View>

      <SectionLabel title="App" />
      <View style={settingsStyles.card}>
        <SettingsRow label="Version" value={`v${APP_VERSION}`} />
        <View style={settingsStyles.rowDivider} />
        <SettingsRow label="Backend" value="tradegard.tech" />
        <View style={settingsStyles.rowDivider} />
        <TouchableOpacity
          style={settingsStyles.row}
          onPress={onOpenNotifSettings}
          activeOpacity={0.7}
        >
          <Text style={settingsStyles.rowLabel}>Notification Settings</Text>
          <Text style={settingsStyles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={settingsStyles.clearBtn}
        onPress={handleClearCache}
        activeOpacity={0.8}
        disabled={clearingCache}
      >
        {clearingCache
          ? <ActivityIndicator size="small" color={colors.bear} />
          : <Text style={settingsStyles.clearBtnText}>Clear Local Cache</Text>
        }
      </TouchableOpacity>

      <View style={sharedStyles.bottomPad} />
    </ScrollView>
  )
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'backtest', label: 'Backtest' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'paper', label: 'Paper' },
  { id: 'settings', label: 'Settings' },
]

export default function MoreScreen() {
  const [activeTab, setActiveTab] = useState<TabId>('backtest')
  const [showNotifSettings, setShowNotifSettings] = useState(false)

  return (
    <SafeAreaView style={styles.safe}>
      {/* Notification Settings full-screen modal */}
      <Modal
        visible={showNotifSettings}
        animationType="slide"
        onRequestClose={() => setShowNotifSettings(false)}
      >
        <NotificationSettingsScreen onBack={() => setShowNotifSettings(false)} />
      </Modal>

      <View style={styles.topBar}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.titleSub}>Tools & Settings</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'backtest' && <BacktestTab />}
        {activeTab === 'alerts' && <AlertsTab />}
        {activeTab === 'paper' && <PaperTradingScreen />}
        {activeTab === 'settings' && (
          <SettingsTab onOpenNotifSettings={() => setShowNotifSettings(true)} />
        )}
      </View>
    </SafeAreaView>
  )
}

// ─── Shared Styles ─────────────────────────────────────────────────────────────

const sharedStyles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 16,
  },
  emptyBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
    marginTop: 8,
  },
  emptyMsg: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.subtext,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomPad: {
    height: 32,
  },
})

// ─── Modal Styles ──────────────────────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  closeBtn: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.subtext,
  },
})

// ─── Main Screen Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
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
  titleSub: {
    fontSize: 12,
    color: colors.muted,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(0,212,170,0.12)',
    borderColor: colors.accent,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: colors.accent,
  },
  content: {
    flex: 1,
  },
})

// ─── Backtest Styles ───────────────────────────────────────────────────────────

const btStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  summaryLabel: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  runBtnSection: {
    marginTop: 16,
  },
  runBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  runBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  monthPicker: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  monthChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  monthChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  runningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    gap: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  runningText: {
    fontSize: 13,
    color: colors.subtext,
    flex: 1,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tableHeadCell: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  tableCell: {
    fontSize: 12,
    color: colors.text,
  },
  tableCellMonth: {
    flex: 2,
    fontWeight: '600',
  },
  tableCellNum: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
  runRow: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  runLeft: {
    flex: 1,
    gap: 2,
  },
  runDate: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  runPeriod: {
    fontSize: 11,
    color: colors.muted,
  },
  runSignals: {
    fontSize: 10,
    color: colors.muted,
  },
  runRight: {
    alignItems: 'flex-end',
    marginRight: 8,
    gap: 2,
  },
  runWinRate: {
    fontSize: 14,
    fontWeight: '700',
  },
  runAvgPnl: {
    fontSize: 12,
    fontWeight: '600',
  },
  runChevron: {
    fontSize: 20,
    color: colors.muted,
  },
  runDetail: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    gap: 10,
  },
  runDetailRow: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
})

// ─── Alert Styles ──────────────────────────────────────────────────────────────

const alertStyles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    flexGrow: 1,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
  },
  toggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  toggleActive: {
    backgroundColor: 'rgba(0,212,170,0.12)',
    borderColor: colors.accent,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  toggleTextActive: {
    color: colors.accent,
  },
  webhookBox: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  webhookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  webhookLabel: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  shareBtn: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
  },
  webhookUrl: {
    fontSize: 11,
    color: colors.text,
    letterSpacing: 0.2,
  },
  testBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: 4,
    minHeight: 44,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  row: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  symbolBadge: {
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: colors.border,
    minWidth: 72,
    alignItems: 'center',
  },
  symbolText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  actionBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minWidth: 64,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  details: {
    flex: 1,
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  time: {
    fontSize: 10,
    color: colors.muted,
  },
})

// ─── Settings Styles ───────────────────────────────────────────────────────────

const settingsStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 13,
    color: colors.subtext,
    fontWeight: '500',
  },
  rowDivider: {
    height: 0.5,
    backgroundColor: colors.border,
    marginLeft: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chevron: {
    fontSize: 18,
    color: colors.muted,
  },
  clearBtn: {
    marginTop: 24,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.bear,
    minHeight: 44,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bear,
    letterSpacing: 0.3,
  },
})
