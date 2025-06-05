import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js';
import { ClipLoader } from 'react-spinners';
import './App.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend);

function App() {
  const [stocks, setStocks] = useState({});
  const [ticker, setTicker] = useState('');
  const [aliases, setAliases] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchHype = async (retries = 3, delay = 2000) => {
    setLoading(true);
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.get('http://localhost:3000/hype', { timeout: 60000 });
        console.log('Hype response:', res.data);
        setStocks(res.data);
        setError('');
        setLoading(false);
        return;
      } catch (error) {
        console.error(`Hype fetch attempt ${i + 1} failed:`, error);
        if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    setError('Failed to load stocks after retries. Check server.');
    setLoading(false);
  };

  useEffect(() => {
    fetchHype();
  }, []);

  const addStock = async () => {
    if (!ticker.match(/^\$[A-Z]{1,5}$/)) {
      setMessage('Invalid ticker. Use $ followed by 1-5 uppercase letters (e.g., $BB).');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:3000/add-stock', {
        ticker,
        aliases: aliases.split(',').map(a => a.trim()).filter(a => a)
      }, { timeout: 60000 });
      setMessage(res.data.message);
      await fetchHype();
      setTicker('');
      setAliases('');
      setLoading(false);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Error adding stock');
      console.error('Add stock error:', error);
      setLoading(false);
    }
  };

  const getChartData = (sentiment) => ({
    labels: ['Reddit', 'News', 'Historical'],
    datasets: [{
      label: 'Sentiment Score',
      data: [sentiment.reddit, sentiment.news, sentiment.historical],
      backgroundColor: ['#FF6384', '#36A2EB', '#4BC0C0'],
      borderColor: ['#FF6384', '#36A2EB', '#4BC0C0'],
      borderWidth: 1
    }]
  });

  const getPriceChart = (ticker) => {
    if (ticker !== '$TSLA') return null;
    return {
      type: 'line',
      data: {
        labels: ['May 19', 'May 26'],
        datasets: [{
          label: '$TSLA Price',
          data: [343.5, 339.34],
          borderColor: '#FF6384',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true },
          title: { display: true, text: '$TSLA Price (7 Days)' }
        },
        scales: {
          y: { beginAtZero: false, title: { display: true, text: 'Price ($)' } }
        }
      }
    };
  };

  const getCurrentPrice = (ticker) => {
    if (ticker === '$TSLA') return '$339.34';
    return 'N/A';
  };

  return (
    <div className="App">
      <h1>Stock Sentiment Tracker</h1>
      <div className="add-stock">
        <h2>Add Stock</h2>
        <input
          type="text"
          placeholder="$BB"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
        />
        <input
          type="text"
          placeholder="BlackBerry,BB IoT"
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
        />
        <button onClick={addStock} disabled={loading}>Add Stock</button>
        {message && <p className={message.includes('Error') ? 'error' : 'success'}>{message}</p>}
      </div>
      <div className="stocks">
        <h2>Stock Predictions</h2>
        {loading && (
          <div className="loading">
            <ClipLoader color="#007bff" size={50} />
            <p>Loading stocks...</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {!loading && !error && Object.keys(stocks).length === 0 ? (
          <p>No stocks added yet.</p>
        ) : (
          Object.entries(stocks).map(([ticker, data]) => (
            <div key={ticker} className="stock-card">
              <h3>{ticker} (Price: {getCurrentPrice(ticker)})</h3>
              <p><strong>Prediction:</strong> {data.prediction}</p>
              <p><strong>Reddit Posts:</strong> {data.postCount}</p>
              <p><strong>Sentiment:</strong></p>
              <div className="chart-container">
                <Bar
                  data={getChartData(data.sentiment)}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false },
                      title: { display: true, text: 'Sentiment Scores' }
                    },
                    scales: {
                      y: { beginAtZero: true, max: 5, min: -5, title: { display: true, text: 'Score' } }
                    }
                  }}
                />
              </div>
              {getPriceChart(ticker) && (
                <div className="chart-container">
                  <Line
                    data={getPriceChart(ticker).data}
                    options={getPriceChart(ticker).options}
                  />
                </div>
              )}
              <ul>
                <li className={data.sourceAvailable.reddit ? '' : 'unavailable'}>
                  Reddit: {data.sentiment.reddit.toFixed(2)} {data.sourceAvailable.reddit ? '' : '(Unavailable)'}
                </li>
                <li className={data.sourceAvailable.news ? '' : 'unavailable'}>
                  News: {data.sentiment.news.toFixed(2)} {data.sourceAvailable.news ? '' : '(Unavailable)'}
                </li>
                <li className={data.sourceAvailable.historical ? '' : 'unavailable'}>
                  Historical: {data.sentiment.historical.toFixed(2)} {data.sourceAvailable.historical ? '' : '(Unavailable)'}
                </li>
              </ul>
              <p><strong>Top Posts:</strong></p>
              {data.topPosts.length ? (
                <ul>
                  {data.topPosts.map((post, i) => (
                    <li key={i}>
                      <strong>{post.title}</strong> (r/{post.subreddit}, Sentiment: {post.sentiment})
                      <br />
                      {post.textPreview}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No posts found.</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default App;