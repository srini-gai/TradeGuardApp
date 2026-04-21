# TradeGuard — Deployment Guide

---

## Section 1 — EAS Setup

```bash
npx eas login
npx eas init
```

Copy the `projectId` shown and paste into `app.json` under `expo.extra.eas.projectId`:

```json
"extra": {
  "eas": {
    "projectId": "YOUR_PROJECT_ID_HERE"
  }
}
```

---

## Section 2 — Build preview APK for testing

```bash
npx eas build --platform android --profile preview
```

Wait 5-10 mins, download the `.apk` link shown.

Install on phone: **Settings → Allow unknown sources → open apk file**

---

## Section 3 — Build production AAB for Play Store

```bash
npx eas build --platform android --profile production
```

Downloads as `.aab` file.

---

## Section 4 — Play Store submission steps

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create new app → name: **TradeGuard**
3. Fill store listing with this copy:

**Title:** TradeGuard — Options Trading

**Short description:** AI-powered Nifty 500 options screener with live signals, trade journal and paper trading

**Full description:**
TradeGuard is a personal algorithmic trading assistant for Indian stock options. It scans all Nifty 500 stocks every morning at 9:20 AM IST and delivers 1-2 high-confidence CE/PE trade signals with live Upstox premiums, stop loss, and a 3-tier profit booking ladder (T1/T2/T3). Features include: morning swing screener, intraday 30-min screener, Nifty 500 on-demand stock analysis, strike price selector, live options premiums via Upstox API, trade journal with partial booking, paper trading simulation with virtual 5 lakh capital, backtesting engine, TradingView webhook alerts, risk dashboard, and push notifications for screener runs and exit reminders. Built for disciplined options traders who want data-driven signals with strict risk rules — max 2 trades per day, 2% capital risk, mandatory stop loss, no trades after 2 PM. Not financial advice.

4. Set content rating — finance, no violence, no ads
5. Upload screenshots of all 5 tabs
6. Upload AAB to Internal Testing track
7. Add your email as internal tester
8. Promote to Production after testing

---

## Section 5 — Post launch update flow

1. Increment `versionCode` in `app.json`
2. Run `eas build production`
3. Upload new AAB to Play Store
4. Submit for review

---

## Final Checklist

- [ ] All API calls use https://tradegard.tech
- [ ] No hardcoded IPs or test tokens
- [ ] Error boundary wrapping root navigator
- [ ] Loading states on all API calls
- [ ] Empty states on all FlatLists
- [ ] tsc --noEmit passes with zero errors
- [ ] Push notifications tested
- [ ] Paper trading auto-tracking tested
- [ ] Log Trade tested end to end
- [ ] All 5 tabs tested on real device
- [ ] eas.json created
- [ ] app.json updated with correct package name
