import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { colors } from '../constants'
import {
  getPaperPortfolio,
  getPaperStats,
  bookPaperLevel,
  closePaperTrade,
  resetPaperPortfolio,
} from '../services/paperTrading'
import type { PaperTrade } from '../services/paperTrading'
import PaperTradeRow from '../components/PaperTradeRow'

type FilterTab = 'OPEN' | 'CLOSED' | 'ALL'

function formatAmount(v: number): string {
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(2)}L`
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function formatPnL(v: number): string {
  const sign = v >= 0 ? '+' : ''
  return `${sign}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

type PaperStats = {
  totalTrades: number
  winRate: number
  totalPnl: number
  bestTrade: number
  worstTrade: number
  monthlyBreakdown: Record<string, { trades: number; pnl: number }>
}

export default function PaperTradingScreen() {
  const [capital, setCapital] = useState(500000)
  const [used, setUsed] = useState(0)
  const [available, setAvailable] = useState(500000)
  const [trades, setTrades] = useState<PaperTrade[]>([])
  const [stats, setStats] = useState<PaperStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('OPEN')

  const loadData = useCallback(async () => {
    try {
      const [portfolioRes, statsRes] = await Promise.allSettled([
        getPaperPortfolio(),
        getPaperStats(),
      ])
      if (portfolioRes.status === 'fulfilled') {
        setCapital(portfolioRes.value.capital)
        setUsed(portfolioRes.value.used)
        setAvailable(portfolioRes.value.available)
        setTrades(portfolioRes.value.trades)
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleBook = useCallback(async (tradeId: string, level: string, exitPremium: number) => {
    try {
      await bookPaperLevel(tradeId, level, exitPremium)
      loadData()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Booking failed')
    }
  }, [loadData])

  const handleClose = useCallback(async (tradeId: string, exitPremium: number) => {
    try {
      await closePaperTrade(tradeId, exitPremium)
      loadData()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Close failed')
    }
  }, [loadData])

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset Portfolio',
      'This will clear all paper trades and reset capital to ₹5,00,000. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetPaperPortfolio()
            loadData()
          },
        },
      ],
    )
  }, [loadData])

  const filteredTrades = trades.filter(t => {
    if (filter === 'OPEN') return t.status === 'OPEN' || t.status === 'PARTIAL'
    if (filter === 'CLOSED') return t.status === 'CLOSED' || t.status === 'SL_HIT'
    return true
  })

  const totalPnl = trades.reduce((s, t) => s + t.totalPnl, 0)

  const monthEntries = stats
    ? Object.entries(stats.monthlyBreakdown).sort(([a], [b]) => a.localeCompare(b))
    : []
  const maxAbsPnl = monthEntries.length > 0
    ? Math.max(...monthEntries.map(([, d]) => Math.abs(d.pnl)), 1)
    : 1

  const listHeader = (
    <View>
      {/* Portfolio card */}
      <View style={styles.portfolioCard}>
        <Text style={styles.portfolioTitle}>Virtual Portfolio</Text>
        <View style={styles.portfolioRow}>
          <View style={styles.portfolioItem}>
            <Text style={styles.portfolioLabel}>Total</Text>
            <Text style={styles.portfolioValue}>{formatAmount(capital)}</Text>
          </View>
          <View style={styles.portfolioItem}>
            <Text style={styles.portfolioLabel}>Available</Text>
            <Text style={[styles.portfolioValue, { color: colors.accent }]}>
              {formatAmount(available)}
            </Text>
          </View>
          <View style={styles.portfolioItem}>
            <Text style={styles.portfolioLabel}>Used</Text>
            <Text style={[styles.portfolioValue, { color: colors.warn }]}>
              {formatAmount(used)}
            </Text>
          </View>
          <View style={styles.portfolioItem}>
            <Text style={styles.portfolioLabel}>P&L</Text>
            <Text style={[styles.portfolioValue, { color: totalPnl >= 0 ? colors.bull : colors.bear }]}>
              {formatPnL(totalPnl)}
            </Text>
          </View>
        </View>
      </View>

      {/* Stats row */}
      {stats && stats.totalTrades > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Win Rate</Text>
            <Text style={[styles.statValue, { color: stats.winRate >= 50 ? colors.bull : colors.bear }]}>
              {stats.winRate.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Trades</Text>
            <Text style={styles.statValue}>{stats.totalTrades}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Best</Text>
            <Text style={[styles.statValue, { color: colors.bull }]}>
              {formatPnL(stats.bestTrade)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Worst</Text>
            <Text style={[styles.statValue, { color: colors.bear }]}>
              {formatPnL(stats.worstTrade)}
            </Text>
          </View>
        </View>
      )}

      {/* Monthly P&L bar chart */}
      {monthEntries.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Monthly P&L</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chartBars}>
              {monthEntries.map(([month, data]) => {
                const barH = Math.max(4, Math.round((Math.abs(data.pnl) / maxAbsPnl) * 56))
                const isPos = data.pnl >= 0
                return (
                  <View key={month} style={styles.barGroup}>
                    <Text style={[styles.barValue, { color: isPos ? colors.bull : colors.bear }]}>
                      {data.pnl >= 0 ? '+' : ''}{(data.pnl / 1000).toFixed(0)}k
                    </Text>
                    <View style={[styles.bar, { height: barH, backgroundColor: isPos ? colors.bull : colors.bear }]} />
                    <Text style={styles.barLabel}>{month.slice(5)}</Text>
                  </View>
                )
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['OPEN', 'CLOSED', 'ALL'] as FilterTab[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterLabel, filter === f && styles.filterLabelActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredTrades.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyMsg}>No {filter.toLowerCase()} trades</Text>
          <Text style={styles.emptySub}>
            {filter === 'OPEN'
              ? 'Tap "Simulate" on any signal card to paper trade'
              : 'Closed trades will appear here'}
          </Text>
        </View>
      )}
    </View>
  )

  const listFooter = (
    <View style={styles.footerPad}>
      <TouchableOpacity
        style={styles.resetBtn}
        onPress={handleReset}
        activeOpacity={0.8}
      >
        <Text style={styles.resetBtnText}>Reset Portfolio</Text>
      </TouchableOpacity>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={colors.intraday} />
      </View>
    )
  }

  return (
    <FlatList<PaperTrade>
      data={filteredTrades}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <PaperTradeRow
          trade={item}
          onBook={handleBook}
          onClose={handleClose}
        />
      )}
      ListHeaderComponent={listHeader}
      ListFooterComponent={listFooter}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No trades</Text>
          <Text style={styles.emptySub}>Open a paper trade from the Signals tab</Text>
        </View>
      }
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.subtext,
  },
  portfolioCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.intraday,
  },
  portfolioTitle: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  portfolioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  portfolioItem: {
    alignItems: 'center',
    flex: 1,
  },
  portfolioLabel: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  portfolioValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  statLabel: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 5,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  chartTitle: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingBottom: 4,
    minHeight: 80,
  },
  barGroup: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 9,
    fontWeight: '700',
  },
  bar: {
    width: 28,
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: 'rgba(234,88,12,0.12)',
    borderColor: colors.intraday,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  filterLabelActive: {
    color: colors.intraday,
  },
  emptyBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: 12,
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
  footerPad: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  resetBtn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.bear,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.bear,
    letterSpacing: 0.3,
  },
})
