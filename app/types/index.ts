export interface Signal {
  id: number
  symbol: string
  signal_date: string
  direction: 'CE' | 'PE'
  strike: number
  expiry: string
  entry_premium: number
  sl_premium: number
  t1_premium: number
  t2_premium: number
  t3_premium: number
  t1_date: string | null
  t2_date: string | null
  t3_date: string | null
  confidence_score: number
  rationale: string[]
  current_price?: number
  rsi?: number
  ema20?: number
  volume_ratio?: number
  days_to_expiry?: number
  premium_source?: string
}

export interface IntradaySignal {
  id: number
  symbol: string
  direction: 'CE' | 'PE'
  strike: number
  expiry: string
  entry_premium: number
  sl_premium: number
  t1_premium: number
  t2_premium: number
  confidence_score: number
  rationale: string[]
  current_price: number | null
  vwap: number | null
  rsi: number | null
  scan_time: string
  timeframe: string
  expiry_type: string
  exit_by: string
}

export interface PartialBooking {
  id: number
  trade_id: number
  level: 'T1' | 'T2' | 'T3' | 'SL'
  booked_at: string
  qty_booked: number
  exit_premium: number
  pnl: number
}

export interface Trade {
  id: number
  symbol: string
  direction: 'CE' | 'PE'
  strike: number
  expiry: string
  entry_date: string
  entry_premium: number
  lots: number
  lot_size: number
  sl_premium: number
  t1_premium: number
  t2_premium: number
  t3_premium: number
  status: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'SL_HIT'
  exit_premium: number | null
  total_pnl: number | null
  notes: string | null
  bookings: PartialBooking[]
}

export interface TradeCreate {
  symbol: string
  direction: 'CE' | 'PE'
  strike: number
  expiry: string
  entry_premium: number
  lots: number
  lot_size: number
  sl_premium: number
  t1_premium: number
  t2_premium: number
  t3_premium: number
  notes?: string
}

export interface BacktestSummary {
  id: number
  run_date: string
  period_start: string
  period_end: string
  total_signals: number
  win_rate: number
  avg_pnl: number
  best_trade_pnl: number
  worst_trade_pnl: number
  max_drawdown: number
  monthly_breakdown: Record<string, { trades: number; win_rate: number; avg_pnl: number }>
}

export interface Alert {
  id: number
  symbol: string
  action: string
  price: number | null
  rsi: number | null
  received_at: string
  source: string
}

export interface RiskStatus {
  trades_today: number
  max_trades: number
  slots_remaining: number
  trading_window_open: boolean
  cutoff_hour_ist: number
  current_hour_ist: number
  reason: string
}

export interface MonthlySummary {
  period: string
  total_trades: number
  open_trades: number
  closed_trades: number
  sl_hit: number
  win_rate: number
  total_pnl: number
  best_trade_pnl: number | null
  worst_trade_pnl: number | null
}

export interface Nifty500Symbol {
  symbol: string
  label: string
}

export interface StockAnalysis {
  qualified: boolean
  symbol: string
  current_price: number | null
  rsi: number | null
  ema20: number | null
  volume_ratio: number | null
  above_ema: boolean
  confidence_score: number
  reason: string
  signal: Signal | null
}

export interface IntradayStatus {
  market_open: boolean
  current_time_ist: string
  scan_available: boolean
  exit_cutoff: string
  message: string
}
