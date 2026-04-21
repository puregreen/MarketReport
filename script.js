// 1. チャート表示設定
const charts = [
    { id: "tv_dxy", symbol: "CAPITALCOM:DXY", interval: "60" },
    { id: "tv_us500", symbol: "OANDA:SPX500USD", interval: "60" },
    { id: "tv_us30", symbol: "OANDA:US30USD", interval: "60" },
    { id: "tv_ustec", symbol: "OANDA:NAS100USD", interval: "60" },
    { id: "tv_jp225", symbol: "OANDA:JP225YJPY", interval: "60" },
    { id: "tv_xauusd", symbol: "OANDA:XAUUSD", interval: "60" },
    { id: "tv_usoil", symbol: "OANDA:WTICOUSD", interval: "60" },
    { id: "tv_eurusd", symbol: "OANDA:EURUSD", interval: "60" },
    { id: "tv_gbpusd", symbol: "OANDA:GBPUSD", interval: "60" },
    { id: "tv_usdjpy", symbol: "OANDA:USDJPY", interval: "60" },
    { id: "tv_audusd", symbol: "OANDA:AUDUSD", interval: "60" },
    { id: "tv_btcusd", symbol: "BITSTAMP:BTCUSD", interval: "60" }
];

window.onload = function() {
    charts.forEach(chart => {
        if(document.getElementById(chart.id)) {
            new TradingView.widget({
                "autosize": true,
                "symbol": chart.symbol,
                "interval": chart.interval,
                "timezone": "Asia/Tokyo",
                "theme": "light",
                "style": "1",
                "locale": "ja",
                "enable_publishing": false,
                "hide_top_toolbar": true, 
                "hide_legend": true,
                "save_image": false,
                "container_id": chart.id,
                "studies": ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"]
            });
        }
    });
    fetchAndRenderData();
};

// 2. 強弱メーターAPI取得・フォールバック機能
async function fetchAndRenderData() {
    const btn = document.getElementById('updateBtn');
    const status = document.getElementById('statusText');
    const container = document.getElementById('api-chart-container');
    
    if(!btn || !status || !container) return; // エラー防止

    btn.disabled = true;
    btn.textContent = '取得中...';
    status.innerHTML = '最新データを分析中...';
    container.innerHTML = '';

    let results = [];
    let apiFailed = false;
    let fiatSuccess = false;
    let isMarketClosed = false;

    // BTC/XAU取得
    try {
        const btcRes = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
        if (btcRes.ok) {
            const btcData = await btcRes.json();
            results.push({ symbol: 'BTC', changePercent: parseFloat(btcData.priceChangePercent) });
        }
    } catch (e) {}

    try {
        const xauRes = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT');
        if (xauRes.ok) {
            const xauData = await xauRes.json();
            results.push({ symbol: 'XAU', changePercent: parseFloat(xauData.priceChangePercent) });
        }
    } catch (e) {}

    // 法定通貨取得
    try {
        const latestRes = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
        if (latestRes.ok) {
            const latestData = await latestRes.json();
            const usdLatest = latestData.usd;
            const baseDate = new Date(latestData.date);

            let pastData = null;
            for (let i = 1; i <= 10; i++) {
                const d = new Date(baseDate);
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                try {
                    const pastRes = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`);
                    if (pastRes.ok) {
                        const pastJson = await pastRes.json();
                        if (pastJson.usd && Math.abs(((usdLatest.jpy / pastJson.usd.jpy) - 1) * 100) > 0.05) {
                            pastData = pastJson.usd;
                            break;
                        }
                    }
                } catch (e) {}
            }

            if (usdLatest && pastData) {
                const fiatSymbols = ['eur', 'jpy', 'gbp', 'aud', 'chf', 'cad', 'nzd', 'cny', 'krw'];
                const displayNames = {'eur':'EUR','jpy':'JPY','gbp':'GBP','aud':'AUD','chf':'CHF','cad':'CAD','nzd':'NZD','cny':'CNH','krw':'KRW'};
                fiatSymbols.forEach(sym => {
                    if (usdLatest[sym] && pastData[sym]) {
                        const change = ((pastData[sym] / usdLatest[sym]) - 1) * 100;
                        results.push({ symbol: displayNames[sym], changePercent: change });
                    }
                });
                results.push({ symbol: 'USD', changePercent: 0 });
                fiatSuccess = true;
            } else { isMarketClosed = true; }
        } else { apiFailed = true; }
    } catch (e) { apiFailed = true; }

    // 【最終手段】APIがダメなら表からスクレイピング
    if (!fiatSuccess || results.length < 5 || isMarketClosed) {
        status.innerHTML = '<span style="color:#e67e22; font-weight:bold;">※API更新前のため、サマリー表の数値からグラフを生成しました</span>';
        results = []; 
        const rows = document.querySelectorAll('.summary-detail-table tbody tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if(cells.length < 5) return;
            const symbolText = cells[0].textContent;
            
            // 最新のHTML構造に合わせて4番目のセル(前日比)を取得
            let changeText = cells[3].textContent;
            // もし「現在値」などが入っていたら5番目のセルを見る
            if(changeText.indexOf('%') === -1 && cells.length > 4) {
                changeText = cells[4].textContent;
            }

            const changeVal = parseFloat(changeText.replace('%', '').replace('+', ''));
            if (isNaN(changeVal)) return;

            if (symbolText.includes('EURUSD')) results.push({ symbol: 'EUR', changePercent: changeVal });
            if (symbolText.includes('GBPUSD')) results.push({ symbol: 'GBP', changePercent: changeVal });
            if (symbolText.includes('AUDUSD')) results.push({ symbol: 'AUD', changePercent: changeVal });
            if (symbolText.includes('BTCUSD')) results.push({ symbol: 'BTC', changePercent: changeVal });
            if (symbolText.includes('XAUUSD')) results.push({ symbol: 'XAU', changePercent: changeVal });
            if (symbolText.includes('USDJPY')) results.push({ symbol: 'JPY', changePercent: -changeVal }); 
            if (symbolText.includes('DXY')) results.push({ symbol: 'USD', changePercent: changeVal }); 
        });
        if (!results.find(r => r.symbol === 'USD')) {
            results.push({ symbol: 'USD', changePercent: 0.00 });
        }
    } else {
        const now = new Date();
        status.innerHTML = `最終更新: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    if (results.length > 0) {
        results.sort((a, b) => b.changePercent - a.changePercent);
        renderChart(results);
    } else {
        status.innerHTML = '<span style="color:#e74c3c;">データ生成失敗</span>';
    }
    btn.disabled = false;
    btn.textContent = '🔄 最新データ取得';
}

function renderChart(data) {
    const container = document.getElementById('api-chart-container');
    const maxAbsChange = Math.max(...data.map(item => Math.abs(item.changePercent)));
    const scaleFactor = maxAbsChange === 0 ? 1 : 100 / maxAbsChange; 

    data.forEach(item => {
        const change = parseFloat(item.changePercent).toFixed(2);
        const isPositive = change > 0;
        const isZero = change == 0.00;
        const barWidth = Math.abs(change) * scaleFactor; 

        const row = document.createElement('div');
        row.className = 'asset-row';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'asset-name';
        nameDiv.textContent = item.symbol;

        const barArea = document.createElement('div');
        barArea.className = 'bar-area';
        const zeroLine = document.createElement('div');
        zeroLine.className = 'zero-line';
        const barLeft = document.createElement('div');
        barLeft.className = 'bar-half bar-left';
        const barRight = document.createElement('div');
        barRight.className = 'bar-half bar-right';
        const fill = document.createElement('div');
        fill.className = 'bar-fill ' + (isPositive ? 'fill-positive' : 'fill-negative');
        
        setTimeout(() => { fill.style.width = `${barWidth}%`; }, 50);
        if (isPositive) barRight.appendChild(fill);
        else if (!isZero) barLeft.appendChild(fill);

        barArea.appendChild(barLeft);
        barArea.appendChild(zeroLine);
        barArea.appendChild(barRight);

        const valueDiv = document.createElement('div');
        valueDiv.className = `asset-value ${isZero ? 'val-zero' : (isPositive ? 'val-pos' : 'val-neg')}`;
        valueDiv.textContent = (isPositive ? '+' : '') + change + '%';

        row.appendChild(nameDiv);
        row.appendChild(barArea);
        row.appendChild(valueDiv);
        container.appendChild(row);
    });
}

// 3. 画像として保存
function saveAsImage() {
    html2canvas(document.getElementById('report-content'), { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = 'MarketReport.png';
        link.click();
    });
}
