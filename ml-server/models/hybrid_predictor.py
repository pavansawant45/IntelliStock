import time
import numpy as np
import pandas as pd
import yfinance as yf
from .lstm_model import LSTMStockPredictor
from .sentiment_analyzer import SentimentAnalyzer
import warnings
warnings.filterwarnings('ignore')

DATA_TTL = 10 * 60          # reuse downloaded prices for 10 minutes (avoids Yahoo rate limits)
MODEL_TTL = 6 * 60 * 60     # reuse a trained model for 6 hours
MAX_SENTIMENT_ADJUSTMENT = 0.02   # sentiment can nudge the price by at most +/-2%


class HybridStockPredictor:
    def __init__(self):
        self.sentiment_analyzer = SentimentAnalyzer()
        self.lstm_weight = 0.65
        self.sentiment_weight = 0.35
        self._data_cache = {}     # symbol -> (timestamp, DataFrame)
        self._model_cache = {}    # symbol -> (timestamp, LSTMStockPredictor)

    def get_stock_data(self, symbol, period='2y'):
        key = (symbol, period)
        cached = self._data_cache.get(key)
        if cached and time.time() - cached[0] < DATA_TTL:
            return cached[1].copy()
        try:
            data = yf.Ticker(symbol).history(period=period)
            if data is None or data.empty:
                return None
            self._data_cache[key] = (time.time(), data)
            return data.copy()
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def get_lstm_model(self, symbol, data):
        """One model PER SYMBOL. The old code shared one model (and one scaler) across all symbols."""
        cached = self._model_cache.get(symbol)
        if cached and time.time() - cached[0] < MODEL_TTL:
            return cached[1]
        model = LSTMStockPredictor(lookback=30, epochs=30, batch_size=32)
        model.fit(data)
        self._model_cache[symbol] = (time.time(), model)
        return model

    def calculate_technical_indicators(self, data):
        if data is None or len(data) < 20:
            return {}

        data['SMA_20'] = data['Close'].rolling(window=20).mean()
        data['SMA_50'] = data['Close'].rolling(window=50).mean()
        data['SMA_200'] = data['Close'].rolling(window=200).mean()

        delta = data['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        data['RSI'] = 100 - (100 / (1 + rs))

        exp1 = data['Close'].ewm(span=12).mean()
        exp2 = data['Close'].ewm(span=26).mean()
        data['MACD'] = exp1 - exp2
        data['MACD_signal'] = data['MACD'].ewm(span=9).mean()

        data['BB_middle'] = data['Close'].rolling(window=20).mean()
        bb_std = data['Close'].rolling(window=20).std()
        data['BB_upper'] = data['BB_middle'] + (bb_std * 2)
        data['BB_lower'] = data['BB_middle'] - (bb_std * 2)

        return data.iloc[-1].to_dict()

    def generate_prediction(self, symbol, days=1):
        try:
            print(f"Starting prediction for {symbol}...")

            data = self.get_stock_data(symbol)

            if data is None or len(data) < 100:
                return {
                    'error': 'Insufficient historical data for prediction',
                    'message': f'Need at least 100 days of data, got {len(data) if data is not None else 0}'
                }

            current_price = float(data['Close'].iloc[-1])

            print("Running LSTM prediction...")
            try:
                lstm_model = self.get_lstm_model(symbol, data)
                lstm_predictions = lstm_model.predict_next_days(data, days)
                lstm_predicted_price = float(lstm_predictions[-1])
                lstm_confidence = lstm_model.calculate_confidence(data, lstm_predictions)
                backtest = lstm_model.metrics
            except Exception as e:
                print(f"LSTM prediction error: {e}")
                return {
                    'error': 'LSTM model training failed',
                    'message': str(e)
                }

            print("Running sentiment analysis...")
            sentiment_result = self.sentiment_analyzer.analyze_market_sentiment(symbol, data)
            sentiment_adjustment = self.sentiment_analyzer.get_sentiment_adjustment(sentiment_result['score'])
            sentiment_adjustment = float(np.clip(
                sentiment_adjustment, -MAX_SENTIMENT_ADJUSTMENT, MAX_SENTIMENT_ADJUSTMENT
            ))

            hybrid_predicted_price = lstm_predicted_price * (1 + sentiment_adjustment)

            price_change = hybrid_predicted_price - current_price
            price_change_percent = (price_change / current_price) * 100

            hybrid_confidence = (
                self.lstm_weight * lstm_confidence +
                self.sentiment_weight * sentiment_result['confidence']
            )

            if price_change_percent > 3:
                recommendation = 'Strong Buy'
            elif price_change_percent > 1:
                recommendation = 'Buy'
            elif price_change_percent < -3:
                recommendation = 'Strong Sell'
            elif price_change_percent < -1:
                recommendation = 'Sell'
            else:
                recommendation = 'Hold'

            if sentiment_result['score'] > 0.15:
                overall_sentiment = 'Very Positive'
            elif sentiment_result['score'] > 0.05:
                overall_sentiment = 'Positive'
            elif sentiment_result['score'] < -0.15:
                overall_sentiment = 'Very Negative'
            elif sentiment_result['score'] < -0.05:
                overall_sentiment = 'Negative'
            else:
                overall_sentiment = 'Neutral'

            indicators = self.calculate_technical_indicators(data)

            factors = [
                f"LSTM model prediction: ${lstm_predicted_price:.2f}",
                f"Sentiment adjustment: {sentiment_adjustment*100:+.2f}%",
            ]
            if backtest.get('directional_accuracy') is not None:
                factors.append(
                    f"Hold-out direction accuracy: {backtest['directional_accuracy']*100:.0f}%"
                )
            factors.extend(sentiment_result['factors'][:3])

            return {
                'symbol': symbol,
                'currentPrice': round(current_price, 2),
                'predictedPrice': round(hybrid_predicted_price, 2),
                'confidence': round(hybrid_confidence, 0),
                'recommendation': recommendation,
                'sentiment': overall_sentiment,
                'priceChange': round(price_change, 2),
                'priceChangePercent': round(price_change_percent, 2),
                'days': days,
                'factors': factors,
                'modelDetails': {
                    'lstmPrediction': round(lstm_predicted_price, 2),
                    'lstmConfidence': round(lstm_confidence, 2),
                    'sentimentScore': round(sentiment_result['score'], 3),
                    'sentimentConfidence': round(sentiment_result['confidence'], 2),
                    'hybridWeight': f"{self.lstm_weight*100:.0f}% LSTM, {self.sentiment_weight*100:.0f}% Sentiment",
                    'directionalAccuracy': round(backtest.get('directional_accuracy', 0), 3),
                    'maeVsBaseline': (
                        round(backtest['mae'] / backtest['baseline_mae'], 3)
                        if backtest.get('baseline_mae') else None
                    )
                },
                'technicalIndicators': {
                    'RSI': round(indicators.get('RSI', 50), 2),
                    'SMA_20': round(indicators.get('SMA_20', current_price), 2),
                    'SMA_50': round(indicators.get('SMA_50', current_price), 2),
                    'SMA_200': round(indicators.get('SMA_200', current_price), 2),
                    'MACD': round(indicators.get('MACD', 0), 4),
                    'MACD_Signal': round(indicators.get('MACD_signal', 0), 4)
                }
            }

        except Exception as e:
            print(f"Error generating prediction for {symbol}: {e}")
            import traceback
            traceback.print_exc()
            return {
                'error': 'Prediction generation failed',
                'message': str(e)
            }
