# IntelliStock

A full-stack stock analysis app. Search a stock, view its recent price history, and generate a 1 to 30 day prediction with a Buy / Hold / Sell recommendation, powered by an LSTM neural network and a news-sentiment score.

> **Attribution:** Originally created by Siddhant Sawant. Model rewrite (return-based LSTM, per-symbol models, hold-out evaluation), API client fixes, caching and dashboard fixes by Pavan Sawant.

> **Educational project.** Predictions are not financial advice. See [Model performance](#model-performance) for how well the model actually does.

---

## Architecture

Three independent services:

```
Browser (React, :3000)
   -> Backend API (Node/Express, :5000) -> MongoDB
        -> ML server (Python/Flask, :8000) -> Yahoo Finance
```

```
IntelliStock/
├── client/       React frontend
├── server/       Node.js + Express API, MongoDB
└── ml-server/    Flask service with the LSTM + sentiment model
```

Keeping the model in its own service means it can be changed or scaled without touching the website.

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Recharts, Framer Motion, Axios, React Hook Form, Context API |
| Backend | Node.js, Express, MongoDB + Mongoose, JWT auth, bcryptjs, Helmet, CORS, rate limiting, `yahoo-finance2` |
| ML server | Python, Flask, TensorFlow/Keras (LSTM), scikit-learn, pandas, NumPy, `yfinance`, VADER, TextBlob |
| Data | Yahoo Finance (unofficial API) |

## Features

- Register / login with JWT authentication and hashed passwords
- Stock search by symbol or company name
- Historical price chart for the selected stock
- Prediction for 1, 3, 5, 7 or 30 days with predicted price, confidence, recommendation and key factors
- Technical indicators: RSI, MACD, 20/50/200-day moving averages, Bollinger Bands
- Dashboard with stat cards, recent predictions and a watchlist table
- Watchlist and headline-based news sentiment
- Admin routes for user management (admin role)

## How the prediction works

1. Download about 2 years of daily prices for the symbol.
2. Build features: daily log return, intraday range, overnight gap and volume change.
3. Train an LSTM (30-day lookback, 48 units, then Dense 16 and Dense 1, Huber loss) to predict the **next-day return**, not the price.
4. Split the data chronologically (80% train, 20% hold-out). The scaler is fit on training data only, so nothing leaks from the future.
5. Roll the prediction forward for multi-day horizons. Each daily move is clamped to about 2 standard deviations of the stock's recent volatility (between 1% and 8%).
6. Score recent news headlines with VADER and TextBlob. The resulting sentiment adjustment nudges the predicted price by at most ±2%.
7. Convert to a recommendation from the predicted change:

| Predicted change | Recommendation |
|---|---|
| above +3% | Strong Buy |
| +1% to +3% | Buy |
| -1% to +1% | Hold |
| -3% to -1% | Sell |
| below -3% | Strong Sell |

Design choices worth knowing about:

- **One model per symbol**, cached for 6 hours. Price data is cached for 10 minutes to avoid Yahoo rate limits.
- **Confidence is measured, not fixed.** It is derived from the model's hold-out direction accuracy (range 40 to 80), then blended 65/35 with the sentiment confidence.
- Predicting returns instead of prices keeps outputs realistic; an earlier version predicted absolute prices and produced impossible moves (for example -34% in one day).

## Model performance

The API response includes `directionalAccuracy` and `maeVsBaseline` (model error divided by the error of a "tomorrow equals today" baseline), so every prediction ships with its own evidence.

In testing, hold-out direction accuracy was around **51%**, which is close to chance. This is expected: daily stock moves are mostly noise, and price history alone carries little signal. If `maeVsBaseline` is near or above 1.0, the model is not beating the naive baseline. Treat the output as a learning demo, not a trading signal.

## Setup

### Prerequisites

- Node.js **22+** (required by `yahoo-finance2` v4)
- Python 3.10+ (tested on 3.13)
- MongoDB (local install or MongoDB Atlas)

### 1. ML server (port 8000)

```bash
cd ml-server
python -m venv venv

# Windows PowerShell
venv\Scripts\Activate.ps1
# macOS / Linux
# source venv/bin/activate

pip install -r requirements.txt
```

Create `ml-server/.env`:

```
FLASK_ENV=development
PORT=8000
```

Run:

```bash
python app.py
```

The first prediction for a new symbol trains its model, which takes a few seconds. Later requests for that symbol are fast.

### 2. Backend (port 5000)

```bash
cd server
npm install
```

Create `server/.env`:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/intellistock
JWT_SECRET=replace-with-a-long-random-string
NODE_ENV=development
ML_SERVER_URL=http://127.0.0.1:8000
```

Run:

```bash
npm run dev
```

### 3. Frontend (port 3000)

```bash
cd client
npm install
npm run dev
```

Open http://localhost:3000, register an account, then use the Predictor page.

> Run the frontend from `client/`. Running Vite from the repo root skips the Tailwind config and the page loads unstyled.

Never commit `.env` files. They are ignored by `.gitignore`.

## API endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Stocks
- `GET /api/stocks/:symbol`
- `GET /api/stocks/search/:query`
- `GET /api/stocks/:symbol/history`
- `POST /api/stocks/predict` with body `{ "symbol": "AAPL", "days": 1 }`
- `GET /api/stocks/news/:symbol?`
- `GET /api/stocks/news/watchlist`

### Users
- `GET /api/users/profile`
- `GET /api/users/watchlist`
- `POST /api/users/watchlist`
- `DELETE /api/users/watchlist/:symbol`

### Admin
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `PUT /api/admin/users/:id/status`

### ML server
- `POST /predict`
- `GET /sentiment/:symbol`
- `GET /technical/:symbol`
- `GET /models`

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Page loads as unstyled text | Frontend was started from the repo root. Run it from `client/`. |
| `ModuleNotFoundError` (tensorflow, vaderSentiment, textblob) | Run `pip install -r requirements.txt` inside the activated venv. |
| Stock search returns 500 | Check the backend terminal. Make sure `npm install` was run in `server/` (it needs `p-retry@4` and `yahoo-finance2` v4 on Node 22+). |
| "Too Many Requests" | Yahoo is rate limiting your IP. Wait a while and avoid rapid repeated requests. Use `yfinance` 1.x (already pinned). |
| "ML prediction service is currently unavailable" | The ML server is not running, or a first-time model training exceeded the backend timeout. Check the ML terminal. |
| Blank dashboard | Hard refresh (Ctrl+Shift+R). The dashboard tolerates missing prediction fields. |

## Known limitations

- **Weak predictive power.** See [Model performance](#model-performance).
- **Yahoo Finance is unofficial** and can rate-limit or change without notice.
- **The dashboard "Portfolio Value" is the sum of watchlist prices**, not real holdings, and its 7-day chart line is placeholder data.
- **Prices always show a `$`**, even for stocks quoted in other currencies (for example `.NS` or `.KS` tickers).
- **The general news feed is sample data.** Watchlist news comes from Yahoo Finance headlines with keyword-based sentiment.
- No automated tests yet.

## Roadmap

- Walk-forward backtesting across many time windows instead of a single split
- More inputs such as earnings dates and market index moves
- Track live accuracy over time and show it in the app
- Real holdings for the portfolio view, with per-stock currency
- Automated tests and a deployment setup

## Deployment notes

- **Client:** `cd client && npm run build`, then deploy `dist/` (Netlify or Vercel).
- **Server:** set the `.env` values as environment variables (Railway, Render, etc.).
- **ML server:** needs enough memory for TensorFlow. On Linux hosts, `tensorflow-cpu` is a lighter alternative to `tensorflow` in `requirements.txt`. Use `gunicorn app:app` (gunicorn does not run on Windows).

## Acknowledgments

Yahoo Finance for data, and the Tailwind CSS, Recharts, Framer Motion, MongoDB, Flask and TensorFlow projects.

## Author

Pavan Sawant, [github.com/pavansawant45](https://github.com/pavansawant45)
