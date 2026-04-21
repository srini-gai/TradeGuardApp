import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../constants'
import {
  getTrades,
  getMonthlySummary,
  logTrade,
  bookLevel as bookLevelApi,
} from '../services/api'
import type { Trade, MonthlySummary, TradeCreate } from '../types'
import TradeRow, { BookLevel } from '../components/TradeRow'
import { sendLocalNotification } from '../services/notifications'

// ─── Types ─────────────────────────────────────────────────────────────────────

type FilterKey = 'ALL' | 'OPEN' | 'CLOSED' | 'SL_HIT'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'CLOSED', label: 'Closed' },
  { key: 'SL_HIT', label: 'SL Hit' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function filterMatchesStatus(trade: Trade, key: FilterKey): boolean {
  if (key === 'ALL') return true
  if (key === 'SL_HIT') return trade.status === 'SL_HIT'
  return trade.status === key
}

function countByFilter(trades: Trade[], key: FilterKey): number {
  return trades.filter(t => filterMatchesStatus(t, key)).length
}

// ─── Summary Header ────────────────────────────────────────────────────────────

function SummaryHeader({ summary }: { summary: MonthlySummary }) {
  const pnlColor = summary.total_pnl >= 0 ? colors.bull : colors.bear
  const winColor =
    summary.win_rate >= 60 ? colors.bull
    : summary.win_rate >= 40 ? colors.warn
    : colors.bear

  return (
    <View style={summaryStyles.card}>
      <Text style={summaryStyles.period}>{summary.period}</Text>
      <View style={summaryStyles.statsRow}>
        <View style={summaryStyles.stat}>
          <Text style={summaryStyles.statLabel}>Month P&L</Text>
          <Text style={[summaryStyles.statValue, { color: pnlColor }]}>
            {formatPnL(summary.total_pnl)}
          </Text>
        </View>
        <View style={summaryStyles.sep} />
        <View style={summaryStyles.stat}>
          <Text style={summaryStyles.statLabel}>Win Rate</Text>
          <Text style={[summaryStyles.statValue, { color: winColor }]}>
            {summary.win_rate.toFixed(1)}%
          </Text>
        </View>
        <View style={summaryStyles.sep} />
        <View style={summaryStyles.stat}>
          <Text style={summaryStyles.statLabel}>Open</Text>
          <Text style={summaryStyles.statValue}>{summary.open_trades}</Text>
        </View>
        <View style={summaryStyles.sep} />
        <View style={summaryStyles.stat}>
          <Text style={summaryStyles.statLabel}>Total</Text>
          <Text style={summaryStyles.statValue}>{summary.total_trades}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Filter Tabs ───────────────────────────────────────────────────────────────

interface FilterTabsProps {
  trades: Trade[]
  active: FilterKey
  onChange: (key: FilterKey) => void
}

function FilterTabs({ trades, active, onChange }: FilterTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={filterStyles.scroll}
      contentContainerStyle={filterStyles.content}
    >
      {FILTERS.map(f => {
        const count = countByFilter(trades, f.key)
        const isActive = active === f.key
        return (
          <TouchableOpacity
            key={f.key}
            style={[filterStyles.tab, isActive && filterStyles.tabActive]}
            onPress={() => onChange(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[filterStyles.text, isActive && filterStyles.textActive]}>
              {f.label}
              {'  '}
              <Text style={[filterStyles.count, isActive && filterStyles.countActive]}>
                {count}
              </Text>
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ─── Lot size lookup ───────────────────────────────────────────────────────────

const LOT_SIZES: Record<string, number> = {
  NIFTY: 75, BANKNIFTY: 30, FINNIFTY: 65, MIDCPNIFTY: 75,
  RELIANCE: 250, TCS: 150, HDFCBANK: 550, INFY: 300, ICICIBANK: 700,
  SBIN: 1500, BHARTIARTL: 500, KOTAKBANK: 400, LT: 150, AXISBANK: 1200,
  WIPRO: 1500, HCLTECH: 350, TATAMOTORS: 700, SUNPHARMA: 350, BAJFINANCE: 125,
  MARUTI: 100, TITAN: 175, ADANIPORTS: 1250, NTPC: 2250, POWERGRID: 2900,
  ONGC: 1925, COALINDIA: 2100, JSWSTEEL: 675, TATASTEEL: 5500, HINDALCO: 2100,
  DRREDDY: 125, CIPLA: 650, DIVISLAB: 200, SIEMENS: 275, HAVELLS: 500,
  ZOMATO: 4500, DMART: 75, IRCTC: 875, HAL: 200, BEL: 4500,
  PERSISTENT: 150, COFORGE: 150, TATAELXSI: 100, JUBLFOOD: 1250,
}

// ─── Log Trade Modal ───────────────────────────────────────────────────────────

interface LogTradeModalProps {
  visible: boolean
  onClose: () => void
  onSubmit: (payload: TradeCreate) => Promise<void>
}

function LogTradeModal({ visible, onClose, onSubmit }: LogTradeModalProps) {
  const [symbol, setSymbol] = useState('')
  const [direction, setDirection] = useState<'CE' | 'PE'>('CE')
  const [strike, setStrike] = useState('')
  const [expiry, setExpiry] = useState('')
  const [entryPremium, setEntryPremium] = useState('')
  const [lots, setLots] = useState('1')
  const [lotSize, setLotSize] = useState('50')
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const entryNum = parseFloat(entryPremium) || 0
  const autoSL = entryNum > 0 ? parseFloat((entryNum * 0.5).toFixed(1)) : 0
  const autoT1 = entryNum > 0 ? parseFloat((entryNum * 1.5).toFixed(1)) : 0
  const autoT2 = entryNum > 0 ? parseFloat((entryNum * 2.0).toFixed(1)) : 0
  const autoT3 = entryNum > 0 ? parseFloat((entryNum * 3.0).toFixed(1)) : 0

  function handleSymbolChange(v: string) {
    const sym = v.toUpperCase()
    setSymbol(sym)
    const known = LOT_SIZES[sym]
    if (known) setLotSize(known.toString())
  }

  function reset() {
    setSymbol('')
    setDirection('CE')
    setStrike('')
    setExpiry('')
    setEntryPremium('')
    setLots('1')
    setLotSize('50')
    setSubmitAttempted(false)
  }

  async function handleSubmit() {
    setSubmitAttempted(true)
    if (!symbol.trim()) {
      Alert.alert('Validation', 'Symbol is required.')
      return
    }
    if (!strike.trim()) {
      Alert.alert('Validation', 'Strike is required.')
      return
    }
    if (!expiry.trim()) {
      Alert.alert('Validation', 'Expiry is required (YYYY-MM-DD).')
      return
    }
    if (!entryPremium.trim()) {
      Alert.alert('Validation', 'Entry Premium is required.')
      return
    }
    const strikeNum = parseInt(strike, 10)
    if (isNaN(strikeNum) || strikeNum <= 0) {
      Alert.alert('Validation', 'Strike must be a positive number.')
      return
    }
    if (isNaN(entryNum) || entryNum <= 0) {
      Alert.alert('Validation', 'Entry Premium must be a positive number.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        symbol: symbol.trim().toUpperCase(),
        direction,
        strike: strikeNum,
        expiry: expiry.trim(),
        entry_premium: entryNum,
        lots: Math.max(1, parseInt(lots, 10) || 1),
        lot_size: Math.max(1, parseInt(lotSize, 10) || 1),
        sl_premium: autoSL,
        t1_premium: autoT1,
        t2_premium: autoT2,
        t3_premium: autoT3,
      })
      reset()
    } catch {
      Alert.alert('Error', 'Failed to log trade. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const strikeInvalid = submitAttempted && !strike.trim()
  const expiryInvalid = submitAttempted && !expiry.trim()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Full-screen container: backdrop behind, sheet at bottom */}
      <View style={modalStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.sheetTitle}>Log New Trade</Text>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={logStyles.fieldLabel}>Symbol</Text>
              <TextInput
                style={logStyles.input}
                value={symbol}
                onChangeText={handleSymbolChange}
                placeholder="e.g. RELIANCE"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                returnKeyType="next"
              />

              <Text style={logStyles.fieldLabel}>Direction</Text>
              <View style={logStyles.toggle}>
                <TouchableOpacity
                  style={[logStyles.toggleBtn, direction === 'CE' && logStyles.toggleActiveCE]}
                  onPress={() => setDirection('CE')}
                  activeOpacity={0.8}
                >
                  <Text style={[logStyles.toggleText, direction === 'CE' && logStyles.toggleTextCE]}>
                    CE
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[logStyles.toggleBtn, direction === 'PE' && logStyles.toggleActivePE]}
                  onPress={() => setDirection('PE')}
                  activeOpacity={0.8}
                >
                  <Text style={[logStyles.toggleText, direction === 'PE' && logStyles.toggleTextPE]}>
                    PE
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={logStyles.row2}>
                <View style={logStyles.half}>
                  <Text style={logStyles.fieldLabel}>Strike *</Text>
                  <TextInput
                    style={[logStyles.input, strikeInvalid && logStyles.inputError]}
                    value={strike}
                    onChangeText={setStrike}
                    placeholder="e.g. 2500"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={logStyles.half}>
                  <Text style={logStyles.fieldLabel}>Expiry *</Text>
                  <TextInput
                    style={[logStyles.input, expiryInvalid && logStyles.inputError]}
                    value={expiry}
                    onChangeText={setExpiry}
                    placeholder="2026-04-30"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                  />
                  <Text style={logStyles.fieldHint}>YYYY-MM-DD</Text>
                </View>
              </View>

              <Text style={logStyles.fieldLabel}>Entry Premium *</Text>
              <TextInput
                style={logStyles.input}
                value={entryPremium}
                onChangeText={setEntryPremium}
                placeholder="e.g. 120"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />
              {entryNum > 0 && (
                <Text style={logStyles.levelHint}>
                  {`SL ₹${autoSL} · T1 ₹${autoT1} · T2 ₹${autoT2} · T3 ₹${autoT3}`}
                </Text>
              )}

              <View style={logStyles.row2}>
                <View style={logStyles.half}>
                  <Text style={logStyles.fieldLabel}>Lots</Text>
                  <TextInput
                    style={logStyles.input}
                    value={lots}
                    onChangeText={setLots}
                    keyboardType="numeric"
                  />
                </View>
                <View style={logStyles.half}>
                  <Text style={logStyles.fieldLabel}>Lot Size</Text>
                  <TextInput
                    style={logStyles.input}
                    value={lotSize}
                    onChangeText={setLotSize}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={logStyles.spacer} />

              <TouchableOpacity
                style={[logStyles.submitBtn, submitting && logStyles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Text style={logStyles.submitText}>Log Trade</Text>
                }
              </TouchableOpacity>

              <View style={logStyles.bottomPad} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Booking Modal ─────────────────────────────────────────────────────────────

interface BookingModalProps {
  visible: boolean
  level: BookLevel | null
  suggestedPrice: number | null
  onClose: () => void
  onConfirm: (exitPremium: number) => Promise<void>
}

function BookingModal({
  visible,
  level,
  suggestedPrice,
  onClose,
  onConfirm,
}: BookingModalProps) {
  const [exitInput, setExitInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible && suggestedPrice !== null) {
      setExitInput(suggestedPrice.toString())
    }
    if (!visible) setExitInput('')
  }, [visible, suggestedPrice])

  const isSL = level === 'SL'
  const accentColor = isSL ? colors.bear : colors.accent

  async function handleConfirm() {
    const val = parseFloat(exitInput)
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid', 'Please enter a valid exit premium.')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(val)
    } catch {
      Alert.alert('Error', 'Booking failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.sheetTitle}>Book {level ?? ''}</Text>
            <Text style={bookStyles.subtitle}>Enter exit premium</Text>

            <TextInput
              style={[bookStyles.input, { borderColor: accentColor }]}
              value={exitInput}
              onChangeText={setExitInput}
              placeholder="Exit premium"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
            />

            {suggestedPrice !== null && (
              <Text style={[bookStyles.suggestion, { color: accentColor }]}>
                Target: ₹{suggestedPrice}
              </Text>
            )}

            <View style={bookStyles.btnRow}>
              <TouchableOpacity
                style={bookStyles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={bookStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  bookStyles.confirmBtn,
                  { backgroundColor: accentColor },
                  submitting && bookStyles.confirmBtnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={submitting}
                activeOpacity={0.8}
              >
                {submitting
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Text style={bookStyles.confirmText}>Confirm</Text>
                }
              </TouchableOpacity>
            </View>

            <View style={bookStyles.bottomPad} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [summary, setSummary] = useState<MonthlySummary | null>(null)
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [logModalVisible, setLogModalVisible] = useState(false)

  const [bookModalVisible, setBookModalVisible] = useState(false)
  const [pendingTrade, setPendingTrade] = useState<Trade | null>(null)
  const [pendingLevel, setPendingLevel] = useState<BookLevel | null>(null)
  const [pendingSuggested, setPendingSuggested] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    const [tradesRes, summaryRes] = await Promise.allSettled([
      getTrades(),
      getMonthlySummary(),
    ])
    if (tradesRes.status === 'fulfilled') {
      const sorted = [...tradesRes.value].sort(
        (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime(),
      )
      setTrades(sorted)
    }
    if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value)
  }, [])

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [loadData])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    loadData().finally(() => setRefreshing(false))
  }, [loadData])

  const filteredTrades = trades.filter(t => filterMatchesStatus(t, filter))

  const handleBook = useCallback(
    (tradeId: number, level: BookLevel, targetPrice: number) => {
      const trade = trades.find(t => t.id === tradeId) ?? null
      setPendingTrade(trade)
      setPendingLevel(level)
      setPendingSuggested(targetPrice)
      setBookModalVisible(true)
    },
    [trades],
  )

  const handleBookConfirm = useCallback(
    async (exitPremium: number) => {
      if (!pendingTrade || !pendingLevel) return
      const updated = await bookLevelApi(pendingTrade.id, pendingLevel, exitPremium)
      setTrades(prev => prev.map(t => (t.id === updated.id ? updated : t)))
      if (pendingLevel === 'T1') {
        sendLocalNotification(
          'T1 Booked ✅',
          '30% profit locked. SL moved to entry.',
        ).catch(() => null)
      }
      setBookModalVisible(false)
      setPendingTrade(null)
      setPendingLevel(null)
      setPendingSuggested(null)
      getMonthlySummary().then(setSummary).catch(() => null)
    },
    [pendingTrade, pendingLevel],
  )

  const handleLogSubmit = useCallback(async (payload: TradeCreate) => {
    const newTrade = await logTrade(payload)
    setTrades(prev => [newTrade, ...prev])
    setLogModalVisible(false)
    getMonthlySummary().then(setSummary).catch(() => null)
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      {/* Screen header */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Journal</Text>
        <Text style={styles.titleSub}>
          {trades.length} trade{trades.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading journal…</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Monthly summary — fixed above list */}
          {summary && <SummaryHeader summary={summary} />}

          {/* Filter tabs — fixed above list, outside FlatList to avoid nested scroll issues */}
          <FilterTabs trades={trades} active={filter} onChange={setFilter} />

          {/* Trade list */}
          <FlatList
            data={filteredTrades}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => <TradeRow trade={item} onBook={handleBook} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No trades</Text>
                <Text style={styles.emptyText}>
                  {filter === 'ALL'
                    ? 'Tap + to log your first trade'
                    : `No ${filter === 'SL_HIT' ? 'SL hit' : filter.toLowerCase()} trades`}
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* FAB */}
      {!loading && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setLogModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      <LogTradeModal
        visible={logModalVisible}
        onClose={() => setLogModalVisible(false)}
        onSubmit={handleLogSubmit}
      />
      <BookingModal
        visible={bookModalVisible}
        level={pendingLevel}
        suggestedPrice={pendingSuggested}
        onClose={() => setBookModalVisible(false)}
        onConfirm={handleBookConfirm}
      />
    </SafeAreaView>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

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
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
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
  listContent: {
    paddingBottom: 96,
    paddingTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.subtext,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 28,
    color: colors.bg,
    fontWeight: '300',
    lineHeight: 32,
  },
})

const summaryStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  period: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sep: {
    width: 0.5,
    height: 32,
    backgroundColor: colors.border,
  },
})

const filterStyles = StyleSheet.create({
  scroll: {
    marginBottom: 12,
  },
  content: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: 'rgba(0,212,170,0.12)',
    borderColor: colors.accent,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  textActive: {
    color: colors.accent,
  },
  count: {
    fontSize: 11,
    color: colors.muted,
  },
  countActive: {
    color: colors.accent,
  },
})

// Shared modal shell styles
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
    maxHeight: '90%',
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
    marginBottom: 18,
  },
})

const logStyles = StyleSheet.create({
  fieldLabel: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  toggle: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  toggleActiveCE: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: colors.bull,
  },
  toggleActivePE: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: colors.bear,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.5,
  },
  toggleTextCE: {
    color: colors.bull,
  },
  toggleTextPE: {
    color: colors.bear,
  },
  row2: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  inputError: {
    borderColor: colors.bear,
    borderWidth: 1,
  },
  fieldHint: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
    marginLeft: 2,
  },
  levelHint: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 6,
    marginLeft: 2,
    letterSpacing: 0.2,
  },
  spacer: {
    height: 16,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bg,
    letterSpacing: 0.2,
  },
  bottomPad: {
    height: 32,
  },
})

const bookStyles = StyleSheet.create({
  subtitle: {
    fontSize: 12,
    color: colors.subtext,
    marginBottom: 18,
    marginTop: -10,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  suggestion: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bg,
    letterSpacing: 0.2,
  },
  bottomPad: {
    height: 24,
  },
})
