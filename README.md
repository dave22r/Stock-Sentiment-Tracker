
# 📊 Stock Sentiment Tracker

A full-stack stock sentiment visualization tool that combines Reddit and News sentiment, Yahoo Finance data, and price history to predict short-term market sentiment. Built using React, Node.js, Puppeteer, and external APIs.

---

## 🌟 Overview

Stock Sentiment Tracker allows users to:

- Add stocks (with custom aliases)
- Analyze live Reddit and news sentiment
- View simplified trend predictions
- Visualize top sentiment-driving posts
- See 7-day price movement (limited support)

It’s designed to predict how a stock is going to behave solely based on public sentiment and news.

---

## Status

Functional but a work in progress........

---

## 🧠 Features

### ✅ Add Custom Stocks
- Add tickers like `$TSLA` with aliases like “Tesla”
- Auto-deduplicates and validates inputs

### 📰 Real-Time Sentiment
- Scrapes Reddit (via Snoowrap) and News (via NewsAPI)  
- Filters out irrelevant results (e.g., AMC theatres vs. AMC stock)
- Uses `sentiment` package to score text from -5 (very negative) to +5 (very positive)

### 📉 Price Trend Calculation
- Pulls 7-day price data from Yahoo Finance
- Computes % change and maps it to sentiment scale

### 🧪 Prediction Logic
- Weighted formula combining Reddit (30%), News (60%), and Historical (10%)
- Outputs simple prediction: `Uptick`, `Neutral`, or `Downtick`

### 📊 Visual Dashboard
- React frontend with Chart.js
- Bar graphs of sentiment breakdown
- Line charts for supported stocks (e.g., $TSLA)
- Top Reddit posts with preview, subreddit, and score

---

## 🛠️ Tech Stack

| Layer        | Tools                                     |
|--------------|-------------------------------------------|
| Frontend     | React, Chart.js, Axios, CSS Modules       |
| Backend      | Node.js, Express, Snoowrap, Puppeteer     |
| Data Sources | Reddit API, NewsAPI, Yahoo Finance API    |
| NLP          | Sentiment (AFINN-based scoring)           |
| Caching      | `node-cache` (5-minute expiry)            |

---

## 📦 Local Setup

1. **Clone repo**
```bash
git clone https://github.com/yourusername/stock-sentiment-tracker
cd stock-sentiment-tracker
