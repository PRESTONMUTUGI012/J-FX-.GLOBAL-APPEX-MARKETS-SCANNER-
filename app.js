const DERIV_APP_ID = "34ZfveN7Be9dqW8mOCJAe";
const AFFILIATE_TOKEN = "3A2CFHPG722B";

const DEFAULT_MINUTE_TIMEFRAMES = ['1', '2', '3', '5', '10', '15', '30'];
const COMPULSORY_SHIFT_SECONDS = 8;

// STRICTLY ONLY Volatility plane index (R_10..R_100), Volatility 1s (1HZ10V..1HZ100V), and Jump indices (JD10..JD100)
const exhaustiveAssets = [
    { symbol: 'R_10', name: 'Volatility 10', market: 'volatility', pip: 3, base: 6321.450, tv: 'FX:EURUSD' },
    { symbol: 'R_25', name: 'Volatility 25', market: 'volatility', pip: 3, base: 3120.100, tv: 'FX:GBPUSD' },
    { symbol: 'R_50', name: 'Volatility 50', market: 'volatility', pip: 3, base: 2450.750, tv: 'FX:USDJPY' },
    { symbol: 'R_75', name: 'Volatility 75', market: 'volatility', pip: 3, base: 8940.200, tv: 'FX:AUDUSD' },
    { symbol: 'R_100', name: 'Volatility 100', market: 'volatility', pip: 3, base: 4120.900, tv: 'FX:USDCAD' },
    { symbol: '1HZ10V', name: 'Volatility 10 (1s)', market: 'volatility_1s', pip: 2, base: 9452.18, tv: 'FX:EURUSD' },
    { symbol: '1HZ25V', name: 'Volatility 25 (1s)', market: 'volatility_1s', pip: 2, base: 5320.45, tv: 'FX:GBPUSD' },
    { symbol: '1HZ50V', name: 'Volatility 50 (1s)', market: 'volatility_1s', pip: 2, base: 48912.34, tv: 'FX:USDJPY' },
    { symbol: '1HZ75V', name: 'Volatility 75 (1s)', market: 'volatility_1s', pip: 2, base: 12450.80, tv: 'FX:AUDUSD' },
    { symbol: '1HZ100V', name: 'Volatility 100 (1s)', market: 'volatility_1s', pip: 2, base: 1428.64, tv: 'FX:USDCHF' },
    { symbol: 'JD10', name: 'Jump 10 Index', market: 'jump', pip: 2, base: 1240.50, tv: 'FX:EURGBP' },
    { symbol: 'JD25', name: 'Jump 25 Index', market: 'jump', pip: 2, base: 2150.80, tv: 'FX:NZDUSD' },
    { symbol: 'JD50', name: 'Jump 50 Index', market: 'jump', pip: 2, base: 3420.10, tv: 'FX:AUDJPY' },
    { symbol: 'JD75', name: 'Jump 75 Index', market: 'jump', pip: 2, base: 5120.40, tv: 'FX:GBPJPY' },
    { symbol: 'JD100', name: 'Jump 100 Index', market: 'jump', pip: 2, base: 8940.20, tv: 'FX:EURUSD' }
];

// STRICTLY ONLY Over 2, Over 3, Over 4, Over 5 and Under 7, Under 6, Under 5
const OVER_UNDER_SETUPS = [
    { side: 'under', barrier: '7', name: 'UNDER 7', hitBase: '~70%', hitNum: 70, payoutMult: 0.36, api: 'DIGITUNDER', ticks: 2, runs: 6, boatId: 1 },
    { side: 'over',  barrier: '2', name: 'OVER 2',  hitBase: '~70%', hitNum: 70, payoutMult: 0.36, api: 'DIGITOVER',  ticks: 2, runs: 6, boatId: 1 },
    { side: 'under', barrier: '6', name: 'UNDER 6', hitBase: '~60%', hitNum: 60, payoutMult: 0.56, api: 'DIGITUNDER', ticks: 2, runs: 6, boatId: 2 },
    { side: 'over',  barrier: '3', name: 'OVER 3',  hitBase: '~60%', hitNum: 60, payoutMult: 0.56, api: 'DIGITOVER',  ticks: 2, runs: 6, boatId: 2 },
    { side: 'under', barrier: '5', name: 'UNDER 5', hitBase: '~50%', hitNum: 50, payoutMult: 0.88, api: 'DIGITUNDER', ticks: 3, runs: 5, boatId: 3 },
    { side: 'over',  barrier: '4', name: 'OVER 4',  hitBase: '~50%', hitNum: 50, payoutMult: 0.88, api: 'DIGITOVER',  ticks: 3, runs: 5, boatId: 3 },
    { side: 'over',  barrier: '5', name: 'OVER 5',  hitBase: '~40%', hitNum: 40, payoutMult: 1.35, api: 'DIGITOVER',  ticks: 3, runs: 5, boatId: 4 }
];

let currentCategory = 'all';
let currentBarrierFilter = 'all';
let currentSymbol = exhaustiveAssets[0].symbol;
let activeCandleTf = '5';
let shiftTimer = null;
let shiftCountdown = COMPULSORY_SHIFT_SECONDS;
let cooldownUntil = 0;
let marketDataStore = {};
let activeAccountMode = 'demo';
let simulatedBalance = 1000.00;
let sessionNetPnl = 0;
let sessionWins = 0;
let sessionLosses = 0;
let consecutiveLosses = 0;
let lastExecutionTimestamp = 0;
let activeAutomationMode = null;

function getSelectedRunsTarget(defaultRuns = 6) {
    const sel = parseInt(document.getElementById('runs-target-select')?.value, 10);
    return (sel === 5 || sel === 6) ? sel : defaultRuns;
}

function updateRunsTargetOverride() {
    const st = marketDataStore[currentSymbol];
    if (st) {
        st.runsTarget = getSelectedRunsTarget(st.strategy.runs);
        st.runsCompleted = 0;
        updateSignalUI(currentSymbol);
    }
}

function computeIndicatorsFromHistory(prices, fallbackAdx = 25) {
    if (!prices || prices.length < 10) {
        return { adx: fallbackAdx, rsi: 54.0, emaBias: 'BULLISH' };
    }
    const recent = prices.slice(-25);
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < recent.length; i++) {
        const diff = recent[i] - recent[i - 1];
        if (diff > 0) gains += diff;
        else if (diff < 0) losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 10 : gains / losses;
    const rsi = Number((100 - (100 / (1 + rs))).toFixed(1));
    const trendStrength = Math.abs(rsi - 50);
    const adx = Number(Math.min(45, Math.max(15, 17 + trendStrength * 0.95)).toFixed(1));

    const k = 2 / (20 + 1);
    let ema = recent[0];
    for (let i = 1; i < recent.length; i++) {
        ema = recent[i] * k + ema * (1 - k);
    }
    const emaBias = recent[recent.length - 1] >= ema ? 'BULLISH' : 'BEARISH';
    return { adx, rsi, emaBias };
}

exhaustiveAssets.forEach((a, idx) => {
    const tf = DEFAULT_MINUTE_TIMEFRAMES[idx % DEFAULT_MINUTE_TIMEFRAMES.length];
    const strat = OVER_UNDER_SETUPS[idx % OVER_UNDER_SETUPS.length];
    const digit = (idx * 3 + 2) % 10;
    const adxVal = Number((20 + ((idx * 3.7) % 18)).toFixed(1));
    const wickVal = Number((0.18 + ((idx * 0.04) % 0.25)).toFixed(2));
    const counts = new Array(10).fill(10);
    counts[digit] = 7;

    marketDataStore[a.symbol] = {
        name: a.name,
        market: a.market,
        pip: a.pip,
        price: a.base.toFixed(a.pip),
        priceHistory: [a.base],
        recentDigits: [],
        digitCounts: counts,
        timeframe: tf,
        ticks: strat.ticks,
        runsTarget: strat.runs,
        runsCompleted: 0,
        feederDigit: digit,
        strategy: { ...strat },
        adx: adxVal,
        rsi: 54.5,
        emaBias: 'BULLISH',
        wickRatio: wickVal,
        lastTickDir: 'up'
    };
});

function evaluateConditionFilters(st) {
    const minAdx = parseFloat(document.getElementById('filter-min-adx')?.value) || 18;
    const maxWick = parseFloat(document.getElementById('filter-max-wick')?.value) || 0.55;
    const maxDigitPct = parseFloat(document.getElementById('filter-max-digit-pct')?.value) || 12;

    const totalDigits = st.digitCounts.reduce((a, b) => a + b, 0) || 1;
    const feederPct = Math.round((st.digitCounts[st.feederDigit] / totalDigits) * 100);

    const adxPass = st.adx >= minAdx;
    const wickPass = st.wickRatio <= maxWick;
    const digitPass = feederPct <= maxDigitPct;

    const reasons = [];
    if (!adxPass) reasons.push(`ADX ${st.adx} < ${minAdx}`);
    if (!wickPass) reasons.push(`Wick ${st.wickRatio} > ${maxWick}`);
    if (!digitPass) reasons.push(`Digit ${feederPct}% > ${maxDigitPct}%`);

    return {
        passed: adxPass && wickPass && digitPass,
        feederPct,
        reasonText: reasons.length === 0
            ? `PASS (ADX ${st.adx} • RSI ${st.rsi} • ${st.emaBias})`
            : `SKIP (${reasons.join(' • ')})`
    };
}

function calculateExpectancyMath(st, stake) {
    const payoutMult = st.strategy.payoutMult;
    const winAmt = Number((stake * payoutMult).toFixed(2));
    const breakEvenPct = ((1 / (1 + payoutMult)) * 100).toFixed(1);
    const winsPerLoss = (1 / payoutMult).toFixed(1);
    const runsCap = getSelectedRunsTarget(st.runsTarget);
    const fullRunProfit = Number((winAmt * runsCap).toFixed(2));

    return {
        winAmt,
        breakEvenPct,
        winsPerLoss,
        runsCap,
        fullRunProfit
    };
}

function refreshAllFilterStatuses() {
    updateSignalUI(currentSymbol);
    renderScanner();
}

function logTransaction(msg, isHighlight = false) {
    const logContainer = document.getElementById('live-transaction-log');
    if (!logContainer) return;
    if (logContainer.querySelector('.italic')) logContainer.innerHTML = '';

    const time = new Date().toLocaleTimeString();
    const row = document.createElement('div');
    row.className = isHighlight
        ? 'p-1.5 rounded bg-emerald-950/80 border border-fxgreen text-fxgreen font-bold'
        : 'p-1 rounded bg-slate-950 border border-slate-800/80 text-slate-300';
    row.innerText = `[${time}] ${msg}`;
    logContainer.prepend(row);
    if (logContainer.children.length > 25) logContainer.lastChild.remove();
}

function dismissSplash() {
    const s = document.getElementById('splash-screen');
    if (s) { s.style.opacity = '0'; setTimeout(() => s.style.display = 'none', 300); }
}

function authDeriv() {
    if (window.derivApiInstance) {
        window.derivApiInstance.startOAuthLogin(AFFILIATE_TOKEN);
    }
}

function openDerivCashier(action) {
    const cashierUrl = action === 'withdraw'
        ? 'https://app.deriv.com/account/cashier/withdrawal'
        : 'https://app.deriv.com/account/cashier/deposit';
    window.open(cashierUrl, '_blank');
}

async function handleAccountSelect(accountId) {
    if (window.derivApiInstance && accountId) {
        const ok = await window.derivApiInstance.connectAuthenticatedWebSocket(accountId);
        if (ok) {
            const acc = window.derivApiInstance.accounts.find(a => a.account === accountId);
            const mode = acc && !acc.isVirtual ? 'real' : 'demo';
            activeAccountMode = mode;
            document.getElementById('btn-demo').className = mode === 'demo' ? "px-3 py-1 rounded-lg font-bold bg-emerald-600 text-white transition" : "px-3 py-1 rounded-lg font-semibold text-slate-400";
            document.getElementById('btn-real').className = mode === 'real' ? "px-3 py-1 rounded-lg font-bold bg-gold text-slate-950 transition" : "px-3 py-1 rounded-lg font-semibold text-slate-400";
            document.getElementById('account-id-label').innerText = mode === 'real' ? 'Real Balance' : 'Demo Balance';
            logTransaction(`Connected OTP WebSocket to ${accountId}`, true);
        }
    }
}

async function setMode(mode) {
    activeAccountMode = mode;
    document.getElementById('btn-demo').className = mode === 'demo' ? "px-3 py-1 rounded-lg font-bold bg-emerald-600 text-white transition" : "px-3 py-1 rounded-lg font-semibold text-slate-400";
    document.getElementById('btn-real').className = mode === 'real' ? "px-3 py-1 rounded-lg font-bold bg-gold text-slate-950 transition" : "px-3 py-1 rounded-lg font-semibold text-slate-400";
    document.getElementById('account-id-label').innerText = mode === 'real' ? 'Real Balance' : 'Demo Balance';

    if (window.derivApiInstance) {
        const switched = await window.derivApiInstance.switchAccountMode(mode);
        if (switched) {
            const sel = document.getElementById('account-selector');
            if (sel) sel.value = switched.account;
            logTransaction(`Switched to ${mode.toUpperCase()} Account (${switched.account})`, true);
        }
    }
}

function switchBarrierFilter(filterKey) {
    currentBarrierFilter = filterKey;
    ['all', 'over', 'under', 'high70'].forEach(k => {
        const btn = document.getElementById(`bf-${k}`);
        if (btn) {
            btn.className = k === filterKey
                ? "bg-cyan-600 text-white font-bold py-1 px-1 rounded"
                : "bg-slate-900 text-slate-300 py-1 px-1 rounded border border-slate-800";
        }
    });
    renderScanner();
}

function switchCategory(cat) {
    currentCategory = cat;
    ['all', 'volatility', 'volatility_1s', 'jump'].forEach(c => {
        const btn = document.getElementById(`cat-${c}`);
        if (btn) {
            btn.className = c === cat
                ? "bg-emerald-600 text-white font-bold py-1.5 px-1 rounded-lg transition"
                : "bg-slate-900 text-slate-300 py-1.5 px-1 rounded-lg transition border border-slate-800";
        }
    });
    renderScanner();
}

function changeChartTimeframe(tf, syncState = true) {
    activeCandleTf = String(tf);
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.className = btn.dataset.tf === activeCandleTf
            ? "tf-btn px-2 py-1 rounded bg-emerald-600 text-white font-bold"
            : "tf-btn px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300";
    });
    if (syncState && marketDataStore[currentSymbol]) {
        marketDataStore[currentSymbol].timeframe = activeCandleTf;
        updateSignalUI(currentSymbol);
    }
    initTradingView(currentSymbol, activeCandleTf);
}

function toggleChartFullscreen() {
    const w = document.getElementById('chart-card-wrapper');
    w.classList.toggle('fixed'); w.classList.toggle('inset-4'); w.classList.toggle('z-50');
}

function initTradingView(sym, tf = '5') {
    const c = document.getElementById('tradingview_advanced_chart');
    if (!c || typeof TradingView === 'undefined') return;
    c.innerHTML = '';
    const assetObj = exhaustiveAssets.find(a => a.symbol === sym);
    const tvSym = (assetObj && assetObj.tv) ? assetObj.tv : "FX:EURUSD";

    new TradingView.widget({
        width: "100%",
        height: "100%",
        symbol: tvSym,
        interval: tf,
        timezone: "Africa/Nairobi",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#030712",
        studies: ["STD;EMA", "STD;RSI", "STD;Directional_Movement"],
        container_id: "tradingview_advanced_chart"
    });
}

function computeFirmFeederDigit(st) {
    let minCount = Infinity;
    let bestDigit = st.feederDigit;
    st.digitCounts.forEach((cnt, d) => {
        if (cnt < minCount) {
            minCount = cnt;
            bestDigit = d;
        }
    });
    return bestDigit;
}

function buildCommandString(sym, st, filterRes) {
    const runsCap = getSelectedRunsTarget(st.strategy.runs);
    return `OU_SIGNAL(Asset=${sym}, Type=${st.strategy.api}, Setup=${st.strategy.name}, Barrier=${st.strategy.barrier}, Feeder=${st.feederDigit}, TF=${st.timeframe}m, Ticks=${st.ticks}, Runs=${runsCap}, Filter=${filterRes.passed ? 'PASS' : 'SKIP'})`;
}

function updatePnlDisplay() {
    const badge = document.getElementById('pnl-summary-badge');
    const scoreEl = document.getElementById('metric-score');
    const streakEl = document.getElementById('noise-readout');
    const maxStreak = parseInt(document.getElementById('max-loss-streak')?.value, 10) || 2;

    if (badge) {
        const sign = sessionNetPnl >= 0 ? '+' : '';
        badge.innerText = `NET P&L: ${sign}$${sessionNetPnl.toFixed(2)}`;
        badge.className = sessionNetPnl >= 0
            ? "text-[10px] font-bold text-slate-950 bg-fxgreen px-2.5 py-1 rounded"
            : "text-[10px] font-bold text-white bg-rose-600 px-2.5 py-1 rounded";
    }
    if (scoreEl) scoreEl.innerText = `${sessionWins}W / ${sessionLosses}L`;
    if (streakEl) streakEl.innerText = `${consecutiveLosses}/${maxStreak}`;
}

function updateSignalUI(sym) {
    const st = marketDataStore[sym];
    if (!st) return;

    const runsCap = getSelectedRunsTarget(st.strategy.runs);
    st.runsTarget = runsCap;

    const stake = parseFloat(document.getElementById('manual-stake')?.value) || 1.00;
    const filterRes = evaluateConditionFilters(st);
    const expMath = calculateExpectancyMath(st, stake);
    const cmdStr = buildCommandString(sym, st, filterRes);

    if (typeof highlightActiveBoat === 'function') {
        highlightActiveBoat(st.strategy.boatId);
    }

    const filterBadge = document.getElementById('side-signal-live-badge');
    if (filterBadge) {
        filterBadge.innerText = filterRes.passed ? 'FILTER: PASS' : 'FILTER: SKIP';
        filterBadge.className = filterRes.passed
            ? 'text-[9px] font-black bg-fxgreen text-slate-950 px-2 py-0.5 rounded'
            : 'text-[9px] font-black bg-rose-600 text-white px-2 py-0.5 rounded';
    }

    document.getElementById('chart-title-label').innerText = `${st.name} (${sym}) • ${st.timeframe}m • ${st.strategy.name}`;
    document.getElementById('live-tick-symbol-tag').innerText = sym;
    document.getElementById('adaptive-shift-status').innerText = `Compulsory Shift -> ${st.name} | ${st.strategy.name} (${st.strategy.hitBase}) | ${st.timeframe}m • ${st.ticks} Ticks • ${runsCap} Runs`;

    document.getElementById('side-sig-asset').innerText = sym;
    document.getElementById('side-sig-contract').innerText = `${st.strategy.name} (${st.strategy.hitBase})`;
    document.getElementById('side-sig-candle').innerText = `${st.timeframe}m Candle`;
    document.getElementById('side-sig-ticks').innerText = `${st.ticks} Ticks`;
    document.getElementById('side-sig-feeder').innerText = `[ ${st.feederDigit} ]`;
    document.getElementById('side-sig-runs').innerText = `${st.runsCompleted} / ${runsCap} Runs`;
    document.getElementById('side-sig-boat').innerText = aiBoatsDirectory[st.strategy.boatId].name;
    document.getElementById('side-sig-command').innerText = cmdStr;

    const expBox = document.getElementById('expectancy-warning-box');
    const expBe = document.getElementById('exp-breakeven-rate');
    const expText = document.getElementById('exp-asymmetry-text');
    const expVerdict = document.getElementById('exp-filter-verdict');

    if (expBe && expText && expVerdict && expBox) {
        expBe.innerText = `BE: ${expMath.breakEvenPct}%`;
        expText.innerText = `Win +$${expMath.winAmt.toFixed(2)} vs Loss -$${stake.toFixed(2)}. ${runsCap}-run target: +$${expMath.fullRunProfit.toFixed(2)} | 1 loss erases ~${expMath.winsPerLoss} wins.`;
        expVerdict.innerText = `Indicator Status: ${filterRes.reasonText}`;
        expVerdict.className = filterRes.passed ? 'text-[9px] font-bold text-fxgreen' : 'text-[9px] font-bold text-rose-400';

        expBox.className = !filterRes.passed
            ? 'bg-rose-950/70 border border-rose-500 rounded-xl p-2.5 space-y-1 text-[10px]'
            : 'bg-amber-950/60 border border-amber-500/60 rounded-xl p-2.5 space-y-1 text-[10px]';
    }

    document.getElementById('man-asset').innerText = sym;
    document.getElementById('man-strat').innerText = `${st.strategy.name} [${st.feederDigit}]`;
    document.getElementById('man-trigger').innerText = `${st.timeframe}m • ${st.ticks} Ticks • ${runsCap} Runs`;

    document.getElementById('stable-entry-digit-display').innerText = `[ ${st.feederDigit} ]`;
    document.getElementById('momentum-readout').innerText = `${st.timeframe}m`;
    document.getElementById('streak-lock-badge').innerText = `RUNS: ${st.runsCompleted}/${runsCap}`;

    document.getElementById('metric-adx').innerText = st.adx;
    document.getElementById('metric-rsi').innerText = st.rsi;
    const emaEl = document.getElementById('metric-ema');
    if (emaEl) {
        emaEl.innerText = st.emaBias;
        emaEl.className = st.emaBias === 'BULLISH' ? 'text-fxgreen font-bold' : 'text-rose-400 font-bold';
    }
    document.getElementById('metric-wick').innerText = `${st.wickRatio} / ${(1 - st.wickRatio).toFixed(2)}`;
    document.getElementById('metric-ou-rate').innerText = st.strategy.hitBase;

    updatePnlDisplay();
    renderDigitHeatmap(st);
}

function getSetupPool() {
    if (currentBarrierFilter === 'over') {
        return OVER_UNDER_SETUPS.filter(s => s.side === 'over');
    }
    if (currentBarrierFilter === 'under') {
        return OVER_UNDER_SETUPS.filter(s => s.side === 'under');
    }
    if (currentBarrierFilter === 'high70') {
        return OVER_UNDER_SETUPS.filter(s => s.hitNum >= 70);
    }
    return OVER_UNDER_SETUPS;
}

function selectSymbol(sym, name, rotateStrategy = false) {
    currentSymbol = sym;
    shiftCountdown = COMPULSORY_SHIFT_SECONDS;
    const st = marketDataStore[sym];
    if (!st) return;

    st.runsCompleted = 0;
    if (rotateStrategy) {
        const pool = getSetupPool();
        const idx = pool.findIndex(s => s.name === st.strategy.name);
        const nextStrat = pool[(idx + 1) % pool.length];
        st.strategy = { ...nextStrat };
        st.ticks = nextStrat.ticks;
        st.runsTarget = getSelectedRunsTarget(nextStrat.runs);
        st.timeframe = DEFAULT_MINUTE_TIMEFRAMES[Math.floor(Math.random() * DEFAULT_MINUTE_TIMEFRAMES.length)];
        st.feederDigit = computeFirmFeederDigit(st);
    } else {
        st.runsTarget = getSelectedRunsTarget(st.strategy.runs);
    }

    activeCandleTf = st.timeframe;
    changeChartTimeframe(activeCandleTf, false);
    updateSignalUI(sym);

    const filterRes = evaluateConditionFilters(st);
    logTransaction(`Compulsory Shift -> ${name} (${sym}) | ${st.strategy.name} (${st.strategy.hitBase}) | Feeder [${st.feederDigit}] | ${st.timeframe}m | ${st.ticks}t | ${st.runsTarget} Runs`, filterRes.passed);

    if (window.derivApiInstance) {
        window.derivApiInstance.subscribeTicks(sym, handleTick);
    }
    renderScanner();
}

function pickBestCandidateAsset() {
    const pool = currentCategory === 'all' ? exhaustiveAssets : exhaustiveAssets.filter(a => a.market === currentCategory);
    const qualified = pool.filter(a => a.symbol !== currentSymbol && evaluateConditionFilters(marketDataStore[a.symbol]).passed);
    const candidates = qualified.length > 0 ? qualified : pool.filter(a => a.symbol !== currentSymbol);
    if (candidates.length === 0) return pool[0];

    candidates.sort((a, b) => {
        const scoreB = marketDataStore[b.symbol].strategy.hitNum + marketDataStore[b.symbol].adx;
        const scoreA = marketDataStore[a.symbol].strategy.hitNum + marketDataStore[a.symbol].adx;
        return scoreB - scoreA;
    });
    return candidates[0];
}

function forceNextMarketShift() {
    const candidate = pickBestCandidateAsset();
    if (candidate) {
        selectSymbol(candidate.symbol, candidate.name, true);
    }
}

function startCompulsoryScannerLoop() {
    if (shiftTimer) clearInterval(shiftTimer);
    shiftCountdown = COMPULSORY_SHIFT_SECONDS;

    shiftTimer = setInterval(() => {
        shiftCountdown--;
        const pill = document.getElementById('shift-countdown-pill');
        if (pill) pill.innerText = `${Math.max(1, shiftCountdown)}s`;

        if (shiftCountdown <= 0) {
            shiftCountdown = COMPULSORY_SHIFT_SECONDS;
            forceNextMarketShift();
        }
    }, 1000);
}

function renderDigitHeatmap(st) {
    const container = document.getElementById('digit-frequency-bar');
    if (!container) return;
    const total = st.digitCounts.reduce((a, b) => a + b, 0) || 1;
    container.innerHTML = st.digitCounts.map((cnt, d) => {
        const pct = Math.round((cnt / total) * 100);
        const isTarget = d === st.feederDigit;
        return `
            <div class="p-1 rounded border ${isTarget ? 'bg-emerald-950 border-fxgreen text-fxgreen font-black' : 'bg-slate-950 border-slate-800 text-slate-400'}">
                <div>D${d}</div>
                <div class="text-[9px]">${pct}%</div>
            </div>
        `;
    }).join('');
}

function renderScanner() {
    const list = document.getElementById('scanner-market-list');
    if (!list) return;
    list.innerHTML = '';

    const highHitBias = document.getElementById('high-hit-bias-toggle')?.checked;
    let filtered = currentCategory === 'all' ? exhaustiveAssets : exhaustiveAssets.filter(a => a.market === currentCategory);

    if (currentBarrierFilter === 'over') {
        filtered = filtered.filter(a => marketDataStore[a.symbol].strategy.side === 'over');
    } else if (currentBarrierFilter === 'under') {
        filtered = filtered.filter(a => marketDataStore[a.symbol].strategy.side === 'under');
    } else if (currentBarrierFilter === 'high70') {
        filtered = filtered.filter(a => marketDataStore[a.symbol].strategy.hitNum >= 70);
    }

    const sorted = [...filtered].sort((a, b) => {
        const hitDiff = marketDataStore[b.symbol].strategy.hitNum - marketDataStore[a.symbol].strategy.hitNum;
        if (highHitBias && hitDiff !== 0) return hitDiff;
        return marketDataStore[b.symbol].adx - marketDataStore[a.symbol].adx;
    });

    sorted.forEach(m => {
        const st = marketDataStore[m.symbol];
        const runsCap = getSelectedRunsTarget(st.strategy.runs);
        const filterRes = evaluateConditionFilters(st);
        const isSel = m.symbol === currentSymbol;
        const tickColor = st.lastTickDir === 'up' ? 'tick-up' : 'tick-down';

        const div = document.createElement('div');
        div.onclick = () => selectSymbol(m.symbol, m.name, true);
        div.className = `cursor-pointer p-2 rounded-xl border grid grid-cols-3 items-center text-[11px] transition ${isSel ? 'bg-emerald-950/70 border-fxgreen shadow-[0_0_10px_rgba(0,255,136,0.3)]' : 'bg-slate-900 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-850'}`;
        div.innerHTML = `
            <div><div class="font-bold text-white truncate">${m.name}</div><div class="text-[9px] text-cyan-400">${st.timeframe}m • ${st.ticks}t • ADX ${st.adx}</div></div>
            <div class="text-right"><div class="font-bold font-mono ${tickColor}" id="price-${m.symbol}">${st.price}</div><div class="text-[9px] text-gold truncate">${st.strategy.name} [${st.feederDigit}]</div></div>
            <div class="text-right font-mono"><div class="${filterRes.passed ? 'text-fxgreen' : 'text-rose-400'} font-bold text-[10px]">${st.strategy.hitBase} • ${runsCap}R</div><div class="text-[9px] text-slate-400">${filterRes.passed ? 'PASS' : 'SKIP'}</div></div>
        `;
        list.appendChild(div);
    });
}

function haltWithGuardrail(reason) {
    activeAutomationMode = null;
    document.getElementById('tx-status-pill').innerText = `🛑 Guardrail Halt & Shift: ${reason}`;
    logTransaction(`GUARDRAIL HALT (${reason}) — Compulsory Shift Triggered — courtesy of ELHADARTGLOBALFX`, true);
    if (typeof triggerProfitAlert === 'function') {
        triggerProfitAlert(reason, sessionNetPnl);
    }
    forceNextMarketShift();
}

function settleSimulatedOutcome(stake, strategy) {
    const winProb = Math.min(0.85, Math.max(0.20, (strategy.hitNum || 50) / 100));
    const isWin = Math.random() < winProb;

    if (isWin) {
        const profit = Number((stake * strategy.payoutMult).toFixed(2));
        sessionWins++;
        consecutiveLosses = 0;
        sessionNetPnl = Number((sessionNetPnl + profit).toFixed(2));
        simulatedBalance = Number((simulatedBalance + profit).toFixed(2));
        return { isWin: true, delta: profit };
    } else {
        const loss = Number(stake.toFixed(2));
        sessionLosses++;
        consecutiveLosses++;
        sessionNetPnl = Number((sessionNetPnl - loss).toFixed(2));
        simulatedBalance = Number(Math.max(0, simulatedBalance - loss).toFixed(2));
        return { isWin: false, delta: -loss };
    }
}

function handleTick(tick) {
    const sym = tick.symbol;
    const q = Number(tick.quote);
    if (isNaN(q)) return;

    const st = marketDataStore[sym];
    if (!st) return;

    const prevPrice = parseFloat(st.price);
    st.price = q.toFixed(tick.pip_size || st.pip || 2);
    st.lastTickDir = q >= prevPrice ? 'up' : 'down';

    st.priceHistory.push(q);
    if (st.priceHistory.length > 35) st.priceHistory.shift();

    const ind = computeIndicatorsFromHistory(st.priceHistory, st.adx);
    st.adx = ind.adx;
    st.rsi = ind.rsi;
    st.emaBias = ind.emaBias;

    const liveDigit = parseInt(st.price.slice(-1), 10);
    if (!isNaN(liveDigit)) {
        st.recentDigits.push(liveDigit);
        if (st.recentDigits.length > 100) st.recentDigits.shift();
        if (st.recentDigits.length >= 25) {
            st.digitCounts = new Array(10).fill(0);
            st.recentDigits.forEach(d => st.digitCounts[d]++);
        }
    }

    const priceEl = document.getElementById(`price-${sym}`);
    if (priceEl) {
        priceEl.innerText = st.price;
        priceEl.className = `font-bold font-mono ${st.lastTickDir === 'up' ? 'tick-up' : 'tick-down'}`;
    }

    if (sym === currentSymbol) {
        const bigQuoteEl = document.getElementById('live-big-quote');
        const bigDigitEl = document.getElementById('live-last-digit-badge');
        if (bigQuoteEl) {
            bigQuoteEl.innerText = st.price;
            bigQuoteEl.className = st.lastTickDir === 'up' ? 'text-fxgreen font-black' : 'text-rose-400 font-black';
        }
        if (bigDigitEl && !isNaN(liveDigit)) {
            bigDigitEl.innerText = liveDigit;
        }
        document.getElementById('metric-adx').innerText = st.adx;
        document.getElementById('metric-rsi').innerText = st.rsi;
        const emaEl = document.getElementById('metric-ema');
        if (emaEl) {
            emaEl.innerText = st.emaBias;
            emaEl.className = st.emaBias === 'BULLISH' ? 'text-fxgreen font-bold' : 'text-rose-400 font-bold';
        }
        renderDigitHeatmap(st);

        const now = Date.now();
        const maxStreak = parseInt(document.getElementById('max-loss-streak')?.value, 10) || 2;
        const maxStopLoss = parseFloat(document.getElementById('session-stop-loss')?.value) || 5.00;
        const cooldownSec = parseInt(document.getElementById('loss-cooldown-sec')?.value, 10) || 4;
        const runsCap = getSelectedRunsTarget(st.strategy.runs);
        st.runsTarget = runsCap;

        if (activeAutomationMode && now >= cooldownUntil && (now - lastExecutionTimestamp > 1000)) {
            const filterCheck = evaluateConditionFilters(st);
            if (!filterCheck.passed) {
                logTransaction(`Indicator filter skipped ${sym} (${filterCheck.reasonText}) — Compulsory Shifting...`);
                lastExecutionTimestamp = now;
                forceNextMarketShift();
                return;
            }

            lastExecutionTimestamp = now;
            st.runsCompleted++;

            const stake = activeAutomationMode === 'BULK'
                ? (parseFloat(document.getElementById('bulk-stake').value) || 1.00)
                : (parseFloat(document.getElementById('manual-stake').value) || 1.00);

            const executorName = activeAutomationMode === 'BOAT'
                ? aiBoatsDirectory[currentActiveBoat].name
                : `${activeAutomationMode} O/U`;

            if (!window.derivApiInstance || !window.derivApiInstance.isAuthorized) {
                const outcome = settleSimulatedOutcome(stake, st.strategy);
                document.getElementById('account-balance').innerText = `$${simulatedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                const tag = outcome.isWin ? `WIN +$${outcome.delta.toFixed(2)}` : `LOSS -$${Math.abs(outcome.delta).toFixed(2)}`;
                logTransaction(`Run ${st.runsCompleted}/${runsCap} | ${executorName} | ${sym} ${st.strategy.name} [Feeder ${st.feederDigit}] | ${tag}`, !outcome.isWin);

                if (!outcome.isWin) {
                    cooldownUntil = now + (cooldownSec * 1000);
                    if (consecutiveLosses >= maxStreak) {
                        haltWithGuardrail(`Max Loss Streak (${maxStreak}) Hit`);
                        return;
                    }
                    if (sessionNetPnl <= -Math.abs(maxStopLoss)) {
                        haltWithGuardrail(`Session Stop-Loss (-$${Math.abs(maxStopLoss).toFixed(2)}) Hit`);
                        return;
                    }
                }
            } else {
                window.derivApiInstance.buyContract({
                    symbol: sym,
                    contractType: st.strategy.api,
                    stake: stake,
                    duration: st.ticks,
                    durationUnit: 't',
                    barrier: st.strategy.barrier
                });
                logTransaction(`Run ${st.runsCompleted}/${runsCap} | ${executorName} | Order sent on ${sym} (${st.strategy.name}, ${st.ticks}t, flat $${stake.toFixed(2)})`);
            }

            updateSignalUI(sym);

            if (activeAutomationMode && st.runsCompleted >= runsCap) {
                const prevMode = activeAutomationMode;
                st.runsCompleted = 0;
                if (prevMode === 'BULK') {
                    logTransaction(`${runsCap}-run cap reached on ${sym} — Compulsory Shifting to next Over/Under market...`, true);
                    forceNextMarketShift();
                } else {
                    activeAutomationMode = null;
                    document.getElementById('tx-status-pill').innerText = `${runsCap} Runs Complete • Compulsory Shift`;
                    logTransaction(`${runsCap}-run target completed (${executorName}) — Compulsory Shifting...`, true);
                    forceNextMarketShift();
                }
            }
        }
    }
}

function executeAutomatedManualTrade() {
    const st = marketDataStore[currentSymbol];
    const filterCheck = evaluateConditionFilters(st);
    if (!filterCheck.passed) {
        logTransaction(`Indicator filter blocked ${currentSymbol} (${filterCheck.reasonText}) — Compulsory Shifting...`, true);
        forceNextMarketShift();
        return;
    }
    st.runsCompleted = 0;
    st.runsTarget = getSelectedRunsTarget(st.strategy.runs);
    consecutiveLosses = 0;
    cooldownUntil = 0;
    activeAutomationMode = 'MANUAL';
    document.getElementById('tx-status-pill').innerText = `🟢 Manual (${currentSymbol} • ${st.strategy.name} • ${st.runsTarget} Runs)...`;
    logTransaction(`Started ${st.runsTarget}-Run Manual Over/Under on ${currentSymbol} | ${st.strategy.name} | ${st.timeframe}m | ${st.ticks} Ticks`, true);
}

function executeAutomatedBulkTrade() {
    const count = parseInt(document.getElementById('bulk-count').value, 10) || 5;
    const topAssets = exhaustiveAssets
        .filter(a => evaluateConditionFilters(marketDataStore[a.symbol]).passed)
        .sort((a, b) => marketDataStore[b.symbol].strategy.hitNum - marketDataStore[a.symbol].strategy.hitNum)
        .slice(0, count);

    if (topAssets.length === 0) {
        logTransaction("No allowed Over/Under markets currently pass indicator filters.", true);
        return;
    }

    selectSymbol(topAssets[0].symbol, topAssets[0].name, false);
    marketDataStore[currentSymbol].runsCompleted = 0;
    consecutiveLosses = 0;
    cooldownUntil = 0;
    activeAutomationMode = 'BULK';
    document.getElementById('tx-status-pill').innerText = `🟢 Bulk O/U (${topAssets.map(a => a.symbol).join(', ')})...`;
    logTransaction(`Armed Bulk Over/Under Basket (${topAssets.length} markets): ${topAssets.map(a => a.symbol).join(', ')}`, true);
}

function startBoatAutomation(boatId) {
    const st = marketDataStore[currentSymbol];
    const boatMap = {
        1: 'UNDER 7',
        2: 'UNDER 6',
        3: 'UNDER 5',
        4: 'OVER 5',
        5: 'UNDER 7',
        6: 'UNDER 6',
        7: 'OVER 2',
        8: 'OVER 3',
        9: 'UNDER 5'
    };
    const desiredName = boatMap[boatId] || 'UNDER 7';
    const matchedSetup = OVER_UNDER_SETUPS.find(s => s.name === desiredName) || OVER_UNDER_SETUPS[0];
    st.strategy = { ...matchedSetup };
    st.ticks = matchedSetup.ticks;
    st.runsTarget = getSelectedRunsTarget(matchedSetup.runs);
    st.runsCompleted = 0;
    consecutiveLosses = 0;
    cooldownUntil = 0;

    const filterCheck = evaluateConditionFilters(st);
    if (!filterCheck.passed) {
        updateSignalUI(currentSymbol);
        logTransaction(`${aiBoatsDirectory[boatId].name} skipped ${currentSymbol} (${filterCheck.reasonText}) — Compulsory Shifting...`, true);
        forceNextMarketShift();
        return;
    }

    activeAutomationMode = 'BOAT';
    updateSignalUI(currentSymbol);
    document.getElementById('tx-status-pill').innerText = `🟢 ${aiBoatsDirectory[boatId].name} (${st.runsTarget} Runs)...`;
    logTransaction(`Running ${aiBoatsDirectory[boatId].name} on ${currentSymbol} | ${st.strategy.name} | ${st.runsTarget} Runs`, true);
}

function stopAllAutomation() {
    activeAutomationMode = null;
    if (marketDataStore[currentSymbol]) {
        marketDataStore[currentSymbol].runsCompleted = 0;
        updateSignalUI(currentSymbol);
    }
    document.getElementById('tx-status-pill').innerText = "🛑 Runs Stopped • Compulsory Shift Active";
    logTransaction("Active trade runs stopped. Compulsory market shifting remains active.", true);
}

function copySideSignalSettings() {
    const st = marketDataStore[currentSymbol];
    const stake = parseFloat(document.getElementById('manual-stake')?.value) || 1.00;
    const filterRes = evaluateConditionFilters(st);
    const expMath = calculateExpectancyMath(st, stake);
    const cmd = buildCommandString(currentSymbol, st, filterRes);
    const summary = `ELHADART OVER/UNDER SIGNAL\nAsset: ${st.name} (${currentSymbol})\nContract: ${st.strategy.name} (${st.strategy.hitBase})\nFeeder Digit: [${st.feederDigit}] | Candle TF: ${st.timeframe}m | Ticks: ${st.ticks} | Runs: ${expMath.runsCap}\nIndicators: ADX ${st.adx} | RSI ${st.rsi} | EMA20 ${st.emaBias}\nBreak-Even: ${expMath.breakEvenPct}% (1 loss erases ~${expMath.winsPerLoss} wins)\nCommand: ${cmd}`;
    navigator.clipboard?.writeText(summary);
    alert(`📋 Copied Over/Under Signal:\n\n${summary}`);
}

function bootPlatform() {
    let totalSeconds = 90;
    const pBar = document.getElementById('splash-progress-bar');
    const cTxt = document.getElementById('splash-countdown-text');

    const countdownInterval = setInterval(() => {
        totalSeconds--;
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        if (cTxt) cTxt.innerText = `Loading Over/Under Scanner: ${mins}:${secs} (Live Ticks Active)`;
        if (pBar) pBar.style.width = `${((90 - totalSeconds) / 90) * 100}%`;

        if (totalSeconds <= 0) {
            clearInterval(countdownInterval);
            dismissSplash();
        }
    }, 1000);

    document.getElementById('header-asset-count').innerText = `${exhaustiveAssets.length} Markets (Vol • Vol 1s • Jump) • Over 2-5 & Under 5-7`;
    selectSymbol('1HZ100V', 'Volatility 100 (1s)', false);
    renderScanner();
    startCompulsoryScannerLoop();

    if (typeof DerivAPIConnector !== 'undefined') {
        const api = new DerivAPIConnector(DERIV_APP_ID);
        window.derivApiInstance = api;
        api.onAccountsLoaded = (accounts, selectedId) => {
            const sel = document.getElementById('account-selector');
            if (sel && accounts.length > 0) {
                sel.innerHTML = accounts.map(a => `<option value="${a.account}" ${a.account === selectedId ? 'selected' : ''}>${a.account} (${a.isVirtual ? 'Demo' : 'Real'})</option>`).join('');
                sel.classList.remove('hidden');
            }
        };
        api.onBalanceUpdate = (b) => {
            document.getElementById('account-balance').innerText = `$${Number(b.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            const badge = document.getElementById('oauth-connection-badge');
            if (badge && b.loginid) {
                badge.innerText = `🟢 Connected (${b.loginid})`;
                badge.className = "text-[10px] font-mono font-bold text-fxgreen bg-emerald-950 px-2.5 py-1 rounded border border-fxgreen/40";
            }
        };
        api.onContractPurchased = (buyData) => {
            logTransaction(`Deriv Over/Under #${buyData.contract_id} Executed | Payout: $${buyData.payout}`);
        };
        api.connect(exhaustiveAssets).then(() => {
            api.subscribeTicks(currentSymbol, handleTick);
            api.subscribeMultipleTicks(exhaustiveAssets.map(a => a.symbol), handleTick);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPlatform);
} else {
    bootPlatform();
}
