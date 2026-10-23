const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Hàm lấy dữ liệu nến từ Binance (Server-side, không lo CORS)
function fetchBinanceKlines() {
  return new Promise((resolve, reject) => {
    const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100';
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// API cho Frontend gọi
app.get('/api/candles', async (req, res) => {
  try {
    const data = await fetchBinanceKlines();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve giao diện HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Binance Signal Bot</title>
<script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
  body { background: #0a0e17; color: #e6edf3; padding: 16px; max-width: 1000px; margin: 0 auto; height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  h1 { font-size: 20px; color: #f3ba2f; }
  .price { font-size: 24px; font-weight: bold; font-family: monospace; }
  .grid { display: grid; grid-template-columns: 1fr 300px; gap: 16px; flex: 1; }
  @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; position: relative; }
  .card h2 { font-size: 13px; color: #8b949e; text-transform: uppercase; margin-bottom: 12px; }
  .signal-box { font-size: 44px; font-weight: 800; text-align: center; padding: 20px; border-radius: 8px; transition: all 0.3s; margin-bottom: 12px; }
  .signal-BUY  { background: rgba(63,185,80,.1); color: #3fb950; border: 2px solid #3fb950; }
  .signal-SELL { background: rgba(248,81,73,.1); color: #f85149; border: 2px solid #f85149; }
  .signal-WAIT { background: #21262d; color: #8b949e; border: 2px dashed #30363d; font-size: 24px; padding: 34px 20px; }
  #chart { width: 100%; height: 400px; }
  .stats { display: flex; justify-content: space-between; font-size: 14px; margin-top: 12px; }
  .pos { color: #3fb950; } .neg { color: #f85149; }
  #errorMsg { color: #f85149; font-size: 13px; margin-top: 10px; display: none; position: absolute; bottom: 10px; left: 16px; }
  #capital { color: #58a6ff; }
</style>
</head>
<body>

<header>
  <h1>⚡ BTC/USDT Signal</h1>
  <div class="price" id="livePrice">Đang tải...</div>
</header>

<div class="grid">
  <div class="card">
    <h2>Biểu đồ nến 1 Phút (Binance)</h2>
    <div id="chart"></div>
    <div id="errorMsg">Lỗi tải dữ liệu. Đang thử lại...</div>
  </div>
  
  <div class="card">
    <h2>Tín hiệu hiện tại</h2>
    <div class="signal-box signal-WAIT" id="signalBox">ĐANG PHÂN TÍCH...</div>
    
    <div style="font-size: 14px; margin-bottom: 8px;">
      Độ tin cậy: <b id="confidence">—</b>
    </div>
    <div style="font-size: 14px; margin-bottom: 16px;">
      Vốn đề xuất: <b id="capital">—</b>
    </div>

    <h2 style="margin-top: 20px;">Kết quả (Vừa đóng nến)</h2>
    <div class="stats">
      <span>Tổng: <b id="statTotal">0</b></span>
      <span>Đúng: <b class="pos" id="statWin">0</b></span>
      <span>Sai: <b class="neg" id="statLoss">0</b></span>
    </div>
    <div style="font-size: 14px; margin-top: 8px;">
      Tỉ lệ: <b id="statRate">0%</b>
    </div>
  </div>
</div>

<script>
  const chartEl = document.getElementById('chart');
  const chart = LightweightCharts.createChart(chartEl, {
    layout: { background: { color: '#161b22' }, textColor: '#8b949e' },
    grid: { vertLines: { color: '#21262d' }, horzLines: { color: '#21262d' } },
    timeScale: { timeVisible: true, secondsVisible: false },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    width: chartEl.clientWidth,
    height: 400,
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: '#3fb950', downColor: '#f85149',
    borderDownColor: '#f85149', borderUpColor: '#3fb950',
    wickDownColor: '#f85149', wickUpColor: '#3fb950',
  });

  new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== chartEl) return;
    chart.applyOptions({ width: entries[0].contentRect.width });
  }).observe(chartEl);

  function sma(arr, n) { return arr.length >= n ? arr.slice(-n).reduce((a, b) => a + b, 0) / n : null; }
  function ema(arr, n) {
    if (arr.length < n) return null;
    const k = 2 / (n + 1); let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
    for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
    return e;
  }
  function rsiCalc(arr, n = 14) {
    if (arr.length < n + 1) return null;
    let g = 0, l = 0;
    for (let i = arr.length - n; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      if (d >= 0) g += d; else l -= d;
    }
    const ag = g / n, al = l / n;
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }

  function predict(closes) {
    if (closes.length < 30) return { sig: 'WAIT', conf: 0, cap: 0 };
    const s9 = sma(closes, 9), s21 = sma(closes, 21);
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const rsi = rsiCalc(closes, 14);
    let score = 0, totalW = 0;
    if (s9 && s21) { score += (s9 > s21 ? 1 : -1) * 1; totalW += 1; }
    if (e12 && e26) { score += (e12 > e26 ? 1 : -1) * 1.2; totalW += 1.2; }
    if (rsi) { const sig = rsi < 30 ? 1 : rsi > 70 ? -1 : (rsi > 50 ? 1 : -1); score += sig * 0.5; totalW += 0.5; }
    const avg = score / totalW;
    const confidence = Math.round(Math.abs(avg) * 100);
    let sig = 'WAIT';
    if (avg > 0.15) sig = 'BUY';
    else if (avg < -0.15) sig = 'SELL';
    const cap = sig === 'WAIT' ? 0 : Math.max(2, Math.round(confidence * 0.1));
    return { sig, conf: confidence, cap };
  }

  let currentPredict = 'WAIT';
  let stats = { total: 0, win: 0, loss: 0 };
  let lastCandleTime = null;

  async function fetchData() {
    const errorBox = document.getElementById('errorMsg');
    try {
      const res = await fetch('/api/candles');
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      const formattedData = data.map(d => ({
        time: d[0] / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
      }));

      candleSeries.setData(formattedData);
      errorBox.style.display = 'none';

      const closes = formattedData.map(d => d.close);
      const liveCandle = formattedData[formattedData.length - 1];
      const closedCandle = formattedData[formattedData.length - 2];

      document.getElementById('livePrice').textContent = liveCandle.close.toLocaleString('en-US', {minimumFractionDigits: 2});

      if (lastCandleTime !== null && lastCandleTime < closedCandle.time) {
        if (currentPredict !== 'WAIT') {
          const isUp = closedCandle.close > closedCandle.open;
          const isWin = (currentPredict === 'BUY' && isUp) || (currentPredict === 'SELL' && !isUp);
          stats.total++; if (isWin) stats.win++; else stats.loss++;
          updateStatsUI();
        }
      }
      lastCandleTime = liveCandle.time;

      const pred = predict(closes);
      currentPredict = pred.sig;
      updateSignalUI(pred);

    } catch (err) {
      console.error('Lỗi fetch:', err);
      errorBox.style.display = 'block';
    }
  }

  function updateSignalUI(pred) {
    const box = document.getElementById('signalBox');
    box.className = 'signal-box signal-' + pred.sig;
    box.textContent = pred.sig === 'BUY' ? 'MUA' : pred.sig === 'SELL' ? 'BÁN' : 'CHỜ TÍN HIỆU';
    document.getElementById('confidence').textContent = pred.conf + '%';
    document.getElementById('capital').textContent = pred.cap > 0 ? pred.cap + '%' : '—';
  }

  function updateStatsUI() {
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statWin').textContent = stats.win;
    document.getElementById('statLoss').textContent = stats.loss;
    const rate = stats.total > 0 ? Math.round((stats.win / stats.total) * 100) : 0;
    document.getElementById('statRate').textContent = rate + '%';
  }

  fetchData();
  setInterval(fetchData, 3000);
</script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`Web đang chạy tại http://localhost:${PORT}`);
});
