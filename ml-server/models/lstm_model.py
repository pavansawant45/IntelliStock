import numpy as np
import pandas as pd
from tensorflow import keras
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')


class LSTMStockPredictor:
    """
    Predicts the next-day *log return* (not the absolute price).

    Why: absolute prices trend and leave the range the scaler saw during
    training, which produces wild outputs (e.g. -34% in one day). Returns are
    roughly stationary, so the network stays in a sensible range.

    One instance = one symbol. Create a new instance per symbol.
    """

    def __init__(self, lookback=30, epochs=30, batch_size=32):
        self.lookback = lookback
        self.epochs = epochs
        self.batch_size = batch_size
        self.model = None
        self.scaler = StandardScaler()
        self.metrics = {}
        self.daily_vol = None

    # ---------- data ----------
    @staticmethod
    def build_features(data):
        close = data['Close']
        df = pd.DataFrame(index=data.index)
        df['ret'] = np.log(close / close.shift(1))                      # target column (index 0)
        df['range'] = (data['High'] - data['Low']) / close              # intraday range
        df['gap'] = np.log(data['Open'] / close.shift(1))               # overnight gap
        volume = data['Volume'].replace(0, np.nan)
        df['vol_chg'] = np.log(volume / volume.shift(1)).clip(-1, 1).fillna(0)
        return df.replace([np.inf, -np.inf], np.nan).dropna()

    def _make_sequences(self, scaled):
        X, y = [], []
        for i in range(self.lookback, len(scaled)):
            X.append(scaled[i - self.lookback:i])
            y.append(scaled[i, 0])
        return np.array(X), np.array(y)

    # ---------- model ----------
    def build_model(self, input_shape):
        model = keras.Sequential([
            keras.layers.Input(shape=input_shape),
            keras.layers.LSTM(48),
            keras.layers.Dropout(0.2),
            keras.layers.Dense(16, activation='relu'),
            keras.layers.Dense(1)
        ])
        model.compile(optimizer=keras.optimizers.Adam(1e-3), loss=keras.losses.Huber())
        return model

    def fit(self, data):
        df = self.build_features(data)
        if len(df) < self.lookback + 60:
            raise ValueError(f"Insufficient data. Need at least {self.lookback + 60} trading days.")

        keras.utils.set_random_seed(42)

        # Chronological split. The scaler only sees training rows (no leakage).
        n_seq = len(df) - self.lookback
        split = int(0.8 * n_seq)
        train_end = split + self.lookback
        self.scaler.fit(df.values[:train_end])
        scaled = self.scaler.transform(df.values)

        X, y = self._make_sequences(scaled)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]

        self.model = self.build_model((X_train.shape[1], X_train.shape[2]))
        early_stop = keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=5, restore_best_weights=True
        )
        # validation_split takes the LAST 15% of the training data (still chronological);
        # the test set is never used to pick weights.
        self.model.fit(
            X_train, y_train,
            epochs=self.epochs,
            batch_size=self.batch_size,
            validation_split=0.15,
            callbacks=[early_stop],
            verbose=0
        )

        self._evaluate(X_test, y_test)
        self.daily_vol = float(df['ret'].iloc[-60:].std())
        return self

    def _evaluate(self, X_test, y_test):
        """Honest hold-out check: direction accuracy and error vs a 'no change' baseline."""
        mean, scale = self.scaler.mean_[0], self.scaler.scale_[0]
        pred = self.model.predict(X_test, verbose=0).ravel() * scale + mean
        actual = y_test * scale + mean
        self.metrics = {
            'directional_accuracy': float(np.mean(np.sign(pred) == np.sign(actual))),
            'mae': float(np.mean(np.abs(pred - actual))),
            'baseline_mae': float(np.mean(np.abs(actual))),   # predicting 0% change
            'test_samples': int(len(y_test))
        }

    # ---------- prediction ----------
    def max_daily_move(self):
        vol = self.daily_vol if self.daily_vol else 0.02
        return float(np.clip(2.0 * vol, 0.01, 0.08))          # about 2 sigma, between 1% and 8%

    def predict_next_days(self, data, days=1):
        if self.model is None:
            self.fit(data)

        df = self.build_features(data)
        scaled = self.scaler.transform(df.values)
        seq = scaled[-self.lookback:].copy()

        mean, scale = self.scaler.mean_[0], self.scaler.scale_[0]
        max_move = self.max_daily_move()
        price = float(data['Close'].iloc[-1])
        prices = []

        for _ in range(days):
            batch = seq.reshape(1, self.lookback, seq.shape[1])
            scaled_ret = self.model.predict(batch, verbose=0)[0, 0]
            ret = float(np.clip(scaled_ret * scale + mean, -max_move, max_move))

            price *= float(np.exp(ret))
            prices.append(price)

            new_row = np.zeros(seq.shape[1])          # 0 in scaled space = training average
            new_row[0] = (ret - mean) / scale
            seq = np.vstack([seq[1:], new_row])

        return np.array(prices)

    def calculate_confidence(self, data, predictions):
        """Confidence comes from hold-out accuracy, not from a fixed base of 75."""
        confidence = 50.0
        accuracy = self.metrics.get('directional_accuracy')
        if accuracy is not None:
            confidence += (accuracy - 0.5) * 100

        if self.daily_vol and self.daily_vol > 0.04:
            confidence -= 10
        confidence -= 2 * (len(predictions) - 1)

        return round(float(np.clip(confidence, 40, 80)), 1)
