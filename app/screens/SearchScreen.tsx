import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../constants'
import { getNifty500, analyseSymbol, getStrikes, logTrade } from '../services/api'
import type { Nifty500Symbol, StockAnalysis } from '../types'
import SignalCard from '../components/SignalCard'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StrikeLtp {
  ce_ltp: number
  pe_ltp: number
}

interface StrikesData {
  strikes: number[]
  atmStrike: number | null
  currentPrice: number | null
  expiry: string | null
  ltpMap: Record<number, StrikeLtp>
}

interface PremiumLadder {
  entry: number
  sl: number
  t1: number
  t2: number
  t3: number
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parseStrikesResponse(raw: unknown): StrikesData {
  const empty: StrikesData = { strikes: [], atmStrike: null, currentPrice: null, expiry: null, ltpMap: {} }
  if (!raw || typeof raw !== 'object') return empty

  const d = raw as Record<string, unknown>
  let strikes: number[] = []
  const ltpMap: Record<number, StrikeLtp> = {}

  if (Array.isArray(d.strikes)) {
    const first = d.strikes[0]
    if (first !== null && typeof first === 'object') {
      // Actual API format: [{strike, ce_ltp, pe_ltp}, ...]
      const rows = d.strikes as Array<Record<string, unknown>>
      for (const row of rows) {
        const num = typeof row.strike === 'number' ? row.strike : parseInt(String(row.strike), 10)
        if (!isNaN(num)) {
          strikes.push(num)
          ltpMap[num] = {
            ce_ltp: typeof row.ce_ltp === 'number' ? row.ce_ltp : 0,
            pe_ltp: typeof row.pe_ltp === 'number' ? row.pe_ltp : 0,
          }
        }
      }
      strikes.sort((a, b) => a - b)
    } else if (typeof first === 'number') {
      // Number array: [2400, 2420, ...]
      strikes = d.strikes.filter((s): s is number => typeof s === 'number')
    } else if (typeof first === 'string') {
      // String array: ["2400", "2420", ...]
      strikes = d.strikes
        .filter((s): s is string => typeof s === 'string')
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n))
    }
  } else if (d.strikes && typeof d.strikes === 'object' && !Array.isArray(d.strikes)) {
    // Object keyed by strike: { "2400": { ce_ltp: 28 }, ... }
    const obj = d.strikes as Record<string, unknown>
    strikes = Object.keys(obj)
      .map(k => parseInt(k, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b)
    for (const [k, v] of Object.entries(obj)) {
      const num = parseInt(k, 10)
      if (!isNaN(num) && v && typeof v === 'object') {
        const row = v as Record<string, unknown>
        ltpMap[num] = {
          ce_ltp: typeof row.ce_ltp === 'number' ? row.ce_ltp : 0,
          pe_ltp: typeof row.pe_ltp === 'number' ? row.pe_ltp : 0,
        }
      }
    }
  } else if (Array.isArray(d.option_chain)) {
    // Option chain array: [{strike, ce_ltp, pe_ltp}, ...]
    const rows = d.option_chain as Array<Record<string, unknown>>
    for (const row of rows) {
      const num = typeof row.strike === 'number' ? row.strike : parseInt(String(row.strike), 10)
      if (!isNaN(num)) {
        strikes.push(num)
        ltpMap[num] = {
          ce_ltp: typeof row.ce_ltp === 'number' ? row.ce_ltp : 0,
          pe_ltp: typeof row.pe_ltp === 'number' ? row.pe_ltp : 0,
        }
      }
    }
    strikes.sort((a, b) => a - b)
  } else if (d.data && typeof d.data === 'object') {
    return parseStrikesResponse(d.data)
  }

  const currentPrice =
    typeof d.current_price === 'number' ? d.current_price
    : typeof d.underlying_price === 'number' ? d.underlying_price
    : typeof d.ltp === 'number' ? d.ltp
    : null

  const atmStrike =
    typeof d.atm_strike === 'number' ? d.atm_strike
    : typeof d.atm === 'number' ? d.atm
    : null

  // Fallback: generate strikes around current price when API returns nothing
  if (strikes.length === 0 && currentPrice !== null) {
    const interval =
      currentPrice > 5000 ? 100
      : currentPrice > 1000 ? 50
      : currentPrice > 500 ? 20
      : 10
    const base = Math.round(currentPrice / interval) * interval
    strikes = Array.from({ length: 13 }, (_, i) => base + (i - 6) * interval)
  }

  const computedAtm = atmStrike ?? (currentPrice !== null
    ? (() => {
        const interval =
          currentPrice > 5000 ? 100 : currentPrice > 1000 ? 50 : currentPrice > 500 ? 20 : 10
        return Math.round(currentPrice / interval) * interval
      })()
    : null)

  return {
    strikes,
    atmStrike: computedAtm,
    currentPrice,
    expiry: typeof d.expiry === 'string' ? d.expiry : null,
    ltpMap,
  }
}

function computeLadder(
  targetStrike: number,
  analysis: StockAnalysis,
  direction: 'CE' | 'PE',
  ltpMap?: Record<number, StrikeLtp>,
): PremiumLadder {
  const { signal, current_price } = analysis

  // Use signal premiums when strike + direction match exactly
  if (signal && targetStrike === signal.strike && direction === signal.direction) {
    return {
      entry: signal.entry_premium,
      sl: signal.sl_premium,
      t1: signal.t1_premium,
      t2: signal.t2_premium,
      t3: signal.t3_premium,
    }
  }

  // Use actual LTP from strikes API when available
  const ltp = ltpMap?.[targetStrike]
  if (ltp) {
    const entry = direction === 'CE' ? ltp.ce_ltp : ltp.pe_ltp
    if (entry > 0) {
      return {
        entry,
        sl: parseFloat((entry * 0.5).toFixed(1)),
        t1: parseFloat((entry * 1.5).toFixed(1)),
        t2: parseFloat((entry * 2.0).toFixed(1)),
        t3: parseFloat((entry * 3.0).toFixed(1)),
      }
    }
  }

  // Direction-aware OTM distance estimation: CE = higher strikes more OTM, PE = lower strikes more OTM
  let entry = 0
  if (signal) {
    const price = current_price ?? signal.strike
    const otmDist = (strike: number) =>
      direction === 'CE'
        ? (strike - price) / Math.max(price, 1)
        : (price - strike) / Math.max(price, 1)
    const otmDiff = otmDist(targetStrike) - otmDist(signal.strike)
    const scale = Math.max(0.05, 1 - otmDiff * 8)
    entry = Math.max(1, parseFloat((signal.entry_premium * scale).toFixed(1)))
  }

  return {
    entry,
    sl: parseFloat((entry * 0.5).toFixed(1)),
    t1: parseFloat((entry * 1.5).toFixed(1)),
    t2: parseFloat((entry * 2.0).toFixed(1)),
    t3: parseFloat((entry * 3.0).toFixed(1)),
  }
}

function findAtmStrike(strikes: number[], price: number | null): number | null {
  if (!price || strikes.length === 0) return null
  return strikes.reduce((prev, curr) =>
    Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
  )
}

// ─── Confidence Bar ────────────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const barColor =
    pct >= 80 ? colors.bull : pct >= 60 ? colors.warn : colors.bear
  return (
    <View style={confStyles.wrapper}>
      <View style={confStyles.row}>
        <Text style={confStyles.label}>Confidence</Text>
        <Text style={[confStyles.score, { color: barColor }]}>{pct}%</Text>
      </View>
      <View style={confStyles.track}>
        <View style={[confStyles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  )
}

// ─── Metric Pill ───────────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <View style={metricStyles.pill}>
      <Text style={metricStyles.label}>{label}</Text>
      <Text style={[metricStyles.value, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  )
}

// ─── Analysis Card ─────────────────────────────────────────────────────────────

function AnalysisCard({ analysis }: { analysis: StockAnalysis }) {
  const qualified = analysis.qualified
  const badgeColor = qualified ? colors.bull : colors.bear
  const badgeBg = qualified ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'

  const rsiColor =
    analysis.rsi !== null
      ? analysis.rsi >= 70 ? colors.bear
        : analysis.rsi <= 30 ? colors.bull
        : colors.text
      : colors.muted

  return (
    <View style={analysisStyles.card}>
      {/* Symbol + qualified badge */}
      <View style={analysisStyles.header}>
        <View>
          <Text style={analysisStyles.symbol}>{analysis.symbol}</Text>
          {analysis.current_price !== null && (
            <Text style={analysisStyles.price}>
              ₹{analysis.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </Text>
          )}
        </View>
        <View style={[analysisStyles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[analysisStyles.badgeText, { color: badgeColor }]}>
            {qualified ? '✓ Qualifies' : '✗ Does not qualify'}
          </Text>
        </View>
      </View>

      {/* Metrics row */}
      <View style={analysisStyles.metrics}>
        {analysis.rsi !== null && (
          <MetricPill
            label="RSI"
            value={analysis.rsi.toFixed(1)}
            valueColor={rsiColor}
          />
        )}
        {analysis.ema20 !== null && (
          <MetricPill
            label="EMA20"
            value={`₹${analysis.ema20.toFixed(1)}`}
            valueColor={analysis.above_ema ? colors.bull : colors.bear}
          />
        )}
        {analysis.volume_ratio !== null && (
          <MetricPill
            label="Vol Ratio"
            value={`${analysis.volume_ratio.toFixed(2)}×`}
            valueColor={analysis.volume_ratio >= 1.5 ? colors.bull : colors.subtext}
          />
        )}
        {analysis.above_ema && (
          <MetricPill label="EMA" value="Above" valueColor={colors.bull} />
        )}
      </View>

      {/* Confidence bar */}
      <ConfidenceBar score={analysis.confidence_score} />

      {/* Reason */}
      {analysis.reason.length > 0 && (
        <Text style={analysisStyles.reason}>{analysis.reason}</Text>
      )}
    </View>
  )
}

// ─── Price Ladder ──────────────────────────────────────────────────────────────

function PriceLadderRow({ ladder, direction }: { ladder: PremiumLadder; direction: 'CE' | 'PE' }) {
  const levels = [
    { label: 'SL', value: ladder.sl, color: colors.bear },
    { label: 'Entry', value: ladder.entry, color: colors.text },
    { label: 'T1', value: ladder.t1, color: colors.accent },
    { label: 'T2', value: ladder.t2, color: colors.accent },
    { label: 'T3', value: ladder.t3, color: colors.bull },
  ]

  return (
    <View style={ladderStyles.container}>
      <Text style={ladderStyles.header}>{direction} Premium Ladder</Text>
      <View style={ladderStyles.row}>
        {levels.map((lvl, idx) => (
          <React.Fragment key={lvl.label}>
            {idx > 0 && <Text style={ladderStyles.arrow}>›</Text>}
            <View style={ladderStyles.cell}>
              <Text style={[ladderStyles.cellLabel, { color: lvl.color }]}>{lvl.label}</Text>
              <Text style={[ladderStyles.cellValue, { color: lvl.color }]}>
                {lvl.value > 0 ? `₹${lvl.value}` : '—'}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  )
}

// ─── Strike Selector ──────────────────────────────────────────────────────────

interface StrikeSelectorProps {
  strikesData: StrikesData
  analysis: StockAnalysis
  direction: 'CE' | 'PE'
  selectedStrike: number | null
  onDirectionChange: (d: 'CE' | 'PE') => void
  onStrikeChange: (s: number) => void
  onLogTrade?: (strike: number, direction: 'CE' | 'PE', ladder: PremiumLadder, expiry: string) => void
}

function StrikeSelector({
  strikesData,
  analysis,
  direction,
  selectedStrike,
  onDirectionChange,
  onStrikeChange,
  onLogTrade,
}: StrikeSelectorProps) {
  const { strikes, atmStrike, ltpMap, expiry } = strikesData
  const signalStrike = analysis.signal?.strike ?? null

  const ladder = selectedStrike !== null
    ? computeLadder(selectedStrike, analysis, direction, ltpMap)
    : null

  if (strikes.length === 0) return null

  return (
    <View style={strikeStyles.container}>
      <Text style={strikeStyles.sectionTitle}>Strike Selector</Text>

      {/* CE / PE toggle */}
      <View style={strikeStyles.toggle}>
        <TouchableOpacity
          style={[strikeStyles.toggleBtn, direction === 'CE' && strikeStyles.activeCE]}
          onPress={() => onDirectionChange('CE')}
          activeOpacity={0.8}
        >
          <Text style={[strikeStyles.toggleText, direction === 'CE' && strikeStyles.textCE]}>
            CE — Call
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[strikeStyles.toggleBtn, direction === 'PE' && strikeStyles.activePE]}
          onPress={() => onDirectionChange('PE')}
          activeOpacity={0.8}
        >
          <Text style={[strikeStyles.toggleText, direction === 'PE' && strikeStyles.textPE]}>
            PE — Put
          </Text>
        </TouchableOpacity>
      </View>

      {/* Strike chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={strikeStyles.chipsContent}
        style={strikeStyles.chipsScroll}
      >
        {strikes.map(strike => {
          const isSelected = selectedStrike === strike
          const isAtm = atmStrike === strike
          const isSignal = signalStrike === strike
          const chipColor = direction === 'CE' ? colors.bull : colors.bear

          return (
            <TouchableOpacity
              key={strike}
              style={[
                strikeStyles.chip,
                isSelected && { backgroundColor: chipColor + '22', borderColor: chipColor },
              ]}
              onPress={() => onStrikeChange(strike)}
              activeOpacity={0.8}
            >
              {(isAtm || isSignal) && (
                <Text style={[strikeStyles.chipTag, { color: isAtm ? colors.warn : colors.accent }]}>
                  {isAtm ? 'ATM' : 'SIG'}
                </Text>
              )}
              <Text style={[strikeStyles.chipText, isSelected && { color: chipColor, fontWeight: '700' }]}>
                {strike}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Selected strike label */}
      {selectedStrike !== null && (
        <Text style={strikeStyles.selectedLabel}>
          Strike {selectedStrike} {direction}
          {selectedStrike === signalStrike ? ' · Signal pick' : selectedStrike === atmStrike ? ' · ATM' : ''}
        </Text>
      )}

      {/* Price ladder */}
      {ladder !== null && (
        <PriceLadderRow ladder={ladder} direction={direction} />
      )}

      {/* Log Trade for selected strike */}
      {ladder !== null && selectedStrike !== null && onLogTrade && (
        <TouchableOpacity
          style={strikeStyles.logBtn}
          onPress={() => onLogTrade(
            selectedStrike,
            direction,
            ladder,
            expiry ?? analysis.signal?.expiry ?? '',
          )}
          activeOpacity={0.8}
        >
          <Text style={strikeStyles.logBtnText}>
            Log {direction} {selectedStrike} Trade
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>⊕</Text>
      <Text style={emptyStyles.title}>Search any Nifty 500 stock</Text>
      <Text style={emptyStyles.sub}>
        Get RSI, EMA20, volume analysis and options signals
      </Text>
    </View>
  )
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const [symbols, setSymbols] = useState<Nifty500Symbol[]>([])
  const [symbolsLoading, setSymbolsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [inputFocused, setInputFocused] = useState(false)

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null)
  const [analysing, setAnalysing] = useState(false)

  const [strikesData, setStrikesData] = useState<StrikesData | null>(null)
  const [strikesLoading, setStrikesLoading] = useState(false)

  const [direction, setDirection] = useState<'CE' | 'PE'>('CE')
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null)

  const searchIdRef = useRef(0)

  // Load Nifty500 symbol list once
  useEffect(() => {
    getNifty500()
      .then(res => setSymbols(res.symbols))
      .catch(() => null)
      .finally(() => setSymbolsLoading(false))
  }, [])

  // Filter symbols as user types — limit to 20 results
  const filteredSymbols = useMemo(() => {
    if (!query) return []
    const q = query.toUpperCase().trim()
    return symbols
      .filter(s => s.symbol.startsWith(q) || s.symbol.includes(q) || s.label.toUpperCase().includes(q))
      .sort((a, b) => (a.symbol.startsWith(q) ? -1 : 1) - (b.symbol.startsWith(q) ? -1 : 1))
      .slice(0, 20)
  }, [symbols, query])

  const showDropdown = inputFocused && query.length >= 1 && filteredSymbols.length > 0

  const handleSelectSymbol = useCallback(async (symbol: string, label: string) => {
    const myId = ++searchIdRef.current

    setQuery(label)
    setInputFocused(false)
    setSelectedSymbol(symbol)
    setAnalysis(null)
    setStrikesData(null)
    setSelectedStrike(null)
    setDirection('CE')
    setAnalysing(true)
    setStrikesLoading(true)

    try {
      const [analysisRes, strikesRes] = await Promise.allSettled([
        analyseSymbol(symbol),
        getStrikes(symbol),
      ])

      if (myId !== searchIdRef.current) return  // superseded by a newer search

      if (analysisRes.status === 'fulfilled') {
        const result = analysisRes.value
        setAnalysis(result)
        setDirection(result.signal?.direction ?? 'CE')

        // Parse and apply strikes
        const parsed = strikesRes.status === 'fulfilled'
          ? parseStrikesResponse(strikesRes.value)
          : { strikes: [], atmStrike: null, currentPrice: result.current_price, expiry: null, ltpMap: {} }
        setStrikesData(parsed)

        // Default selection: signal strike → ATM → first strike
        const defaultStrike =
          result.signal?.strike
          ?? parsed.atmStrike
          ?? findAtmStrike(parsed.strikes, result.current_price)
          ?? parsed.strikes[0]
          ?? null
        setSelectedStrike(defaultStrike)
      } else {
        // Analysis failed — try to still set strikes
        if (strikesRes.status === 'fulfilled') {
          const parsed = parseStrikesResponse(strikesRes.value)
          setStrikesData(parsed)
          setSelectedStrike(parsed.atmStrike ?? parsed.strikes[0] ?? null)
        }
      }
    } finally {
      if (myId === searchIdRef.current) {
        setAnalysing(false)
        setStrikesLoading(false)
      }
    }
  }, [])

  const handleLogTrade = useCallback(async (signal: import('../types').Signal) => {
    try {
      await logTrade({
        symbol: signal.symbol,
        direction: signal.direction,
        strike: signal.strike,
        expiry: signal.expiry,
        entry_premium: signal.entry_premium,
        lots: 1,
        lot_size: 1,
        sl_premium: signal.sl_premium,
        t1_premium: signal.t1_premium,
        t2_premium: signal.t2_premium,
        t3_premium: signal.t3_premium,
      })
      Alert.alert('Success', 'Trade logged successfully')
    } catch {
      Alert.alert('Error', 'Failed to log trade')
    }
  }, [])

  const handleLogStrikeTrade = useCallback(async (
    strike: number,
    dir: 'CE' | 'PE',
    ladder: PremiumLadder,
    expiry: string,
  ) => {
    if (!selectedSymbol) return
    try {
      await logTrade({
        symbol: selectedSymbol,
        direction: dir,
        strike,
        expiry,
        entry_premium: ladder.entry,
        lots: 1,
        lot_size: 1,
        sl_premium: ladder.sl,
        t1_premium: ladder.t1,
        t2_premium: ladder.t2,
        t3_premium: ladder.t3,
      })
      Alert.alert('Success', 'Trade logged successfully')
    } catch {
      Alert.alert('Error', 'Failed to log trade')
    }
  }, [selectedSymbol])

  const handleClear = useCallback(() => {
    setQuery('')
    setSelectedSymbol(null)
    setAnalysis(null)
    setStrikesData(null)
    setSelectedStrike(null)
    setInputFocused(false)
  }, [])

  const showStrikeSelector =
    !analysing
    && analysis !== null
    && strikesData !== null
    && !strikesLoading
    && strikesData.strikes.length > 0

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.titleSub}>Nifty 500</Text>
      </View>

      <View style={styles.body}>
        {/* Search input */}
        <View style={styles.searchRow}>
          <View style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}>
            <Text style={styles.searchIcon}>⊕</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setInputFocused(true)}
              onBlur={() => {
                // Delay so tap on dropdown registers first
                setTimeout(() => setInputFocused(false), 150)
              }}
              placeholder={symbolsLoading ? 'Loading symbols…' : 'Symbol or company name…'}
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClear} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Dropdown — replaces content area when visible */}
        {showDropdown ? (
          <FlatList
            data={filteredSymbols}
            keyExtractor={item => item.symbol}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => handleSelectSymbol(item.symbol, item.symbol)}
                activeOpacity={0.75}
              >
                <Text style={styles.dropdownSymbol}>{item.symbol}</Text>
                <Text style={styles.dropdownLabel} numberOfLines={1}>{item.label}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.dropdownSep} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.dropdown}
          />
        ) : selectedSymbol ? (
          /* Analysis content */
          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {analysing ? (
              <View style={styles.analysingCenter}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.analysingText}>Analysing {selectedSymbol}…</Text>
              </View>
            ) : analysis ? (
              <>
                <AnalysisCard analysis={analysis} />

                {/* Full SignalCard if qualified and direction matches signal */}
                {analysis.qualified && analysis.signal && direction === analysis.signal.direction && (
                  <View style={styles.signalSection}>
                    <Text style={styles.sectionTitle}>Signal</Text>
                    <SignalCard signal={analysis.signal} onLogTrade={handleLogTrade} />
                  </View>
                )}

                {/* Strike selector */}
                {showStrikeSelector && strikesData && (
                  <StrikeSelector
                    strikesData={strikesData}
                    analysis={analysis}
                    direction={direction}
                    selectedStrike={selectedStrike}
                    onDirectionChange={setDirection}
                    onStrikeChange={setSelectedStrike}
                    onLogTrade={handleLogStrikeTrade}
                  />
                )}

                {strikesLoading && (
                  <View style={styles.strikesLoading}>
                    <ActivityIndicator size="small" color={colors.muted} />
                    <Text style={styles.strikesLoadingText}>Loading strikes…</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>Could not analyse {selectedSymbol}.</Text>
                <Text style={styles.errorSub}>Check your connection and try again.</Text>
              </View>
            )}

            <View style={styles.bottomPad} />
          </ScrollView>
        ) : (
          <EmptyState />
        )}
      </View>
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
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  searchRow: {
    marginBottom: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputWrapFocused: {
    borderColor: colors.accent,
    borderWidth: 1,
  },
  searchIcon: {
    fontSize: 16,
    color: colors.muted,
  },
  input: {
    flex: 1,
    height: 46,
    fontSize: 14,
    color: colors.text,
    letterSpacing: 0.3,
  },
  clearBtn: {
    paddingLeft: 4,
  },
  clearText: {
    fontSize: 13,
    color: colors.muted,
  },
  dropdown: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  dropdownSymbol: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    width: 80,
  },
  dropdownLabel: {
    fontSize: 12,
    color: colors.subtext,
    flex: 1,
  },
  dropdownSep: {
    height: 0.5,
    backgroundColor: colors.border,
    marginHorizontal: 14,
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    paddingBottom: 24,
  },
  analysingCenter: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  analysingText: {
    fontSize: 13,
    color: colors.subtext,
  },
  signalSection: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  strikesLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  strikesLoadingText: {
    fontSize: 12,
    color: colors.muted,
  },
  errorBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  errorText: {
    fontSize: 14,
    color: colors.subtext,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorSub: {
    fontSize: 12,
    color: colors.muted,
  },
  bottomPad: {
    height: 32,
  },
})

const confStyles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 10,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  score: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
})

const metricStyles = StyleSheet.create({
  pill: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.border,
    minWidth: 64,
  },
  label: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
})

const analysisStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  symbol: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  price: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  reason: {
    marginTop: 12,
    fontSize: 12,
    color: colors.subtext,
    lineHeight: 17,
    fontStyle: 'italic',
  },
})

const ladderStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  header: {
    fontSize: 9,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    fontSize: 12,
    color: colors.border,
  },
  cell: {
    alignItems: 'center',
    flex: 1,
  },
  cellLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  cellValue: {
    fontSize: 11,
    fontWeight: '600',
  },
})

const strikeStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  toggle: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  activeCE: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: colors.bull,
  },
  activePE: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: colors.bear,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  textCE: {
    color: colors.bull,
  },
  textPE: {
    color: colors.bear,
  },
  chipsScroll: {
    marginBottom: 4,
  },
  chipsContent: {
    gap: 8,
    paddingRight: 4,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: 'center',
    minWidth: 68,
  },
  chipTag: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  chipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  selectedLabel: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 8,
    marginBottom: 2,
  },
  logBtn: {
    marginTop: 14,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  logBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
})

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    gap: 10,
  },
  icon: {
    fontSize: 40,
    color: colors.border,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.subtext,
  },
  sub: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 32,
  },
})
