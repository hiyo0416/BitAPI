const express = require('express');
const axios = require('axios');
const mysql = require('mysql');
const crypto = require('crypto');
const querystring = require("querystring");
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { sign } = require('jsonwebtoken');
const app = express();
const port = 8081;
access_key = 'accKey';
secret_key = 'seKey';
server_url = 'https://api.upbit.com';
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const connection = mysql.createConnection({
 host: 'endpoint',
 user: 'username',
 password: 'userpassword',
 database: 'database'
});
connection.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL database:', err);
    return;
  }
  console.log('Connected to MySQL database');
});
app.set('view engine', 'ejs');
app.get('/', (req, res) => {
  const payload = {
    access_key: access_key,
    nonce: uuidv4(),
  };
  const token = sign(payload, secret_key);
  const accountOptions = {
    method: 'GET',
    url: server_url + '/v1/accounts',
    headers: { Authorization: `Bearer ${token}` },
  };
  axios(accountOptions)
    .then(accountResponse => {
      const jsonData = accountResponse.data;
      const formattedValues = jsonData.map(obj => Object.values(obj));
      const marketOptions = {
        method: 'GET',
        url: `${server_url}/v1/market/all?isDetails=false`
      };
      axios(marketOptions)
        .then(marketResponse => {
          const marketData = marketResponse.data;
          const marketDataK = marketData.filter(item => item.market.startsWith('K'));
          const marketEnglishName = marketDataK.map(item => item.english_name);
         insertMarketEnglishNames(marketEnglishName, formattedValues, marketDataK, res);
        })
        .catch(error => {
          console.error(error);
          res.status(500).send('Error fetching market data');
        });
    })
    .catch(error => {
      console.error('Error fetching account data:', error);
      res.status(500).send('Error fetching account data');
    });
});

function insertMarketEnglishNames(marketEnglishName, formattedValues, marketDataK, res) {
  console.log('Successfully inserted marketEnglishName data');
  // 데이터 삽입 후 나머지 로직 수행
  processRemainingLogic(formattedValues, marketDataK, marketEnglishName, res);
}

function processRemainingLogic(formattedValues, marketDataK, marketEnglishName, res) {
 const tickerOptions = {
   method: 'GET',
   url: 'https://api.upbit.com/v1/ticker',
   params: {
     markets: marketDataK.map(item => item.market).join(',')
   },
   headers: {
     'Accept': 'application/json'
   }
 };
 axios(tickerOptions)
   .then(tickerResponse => {
     const tickerData = tickerResponse.data;

     // coin_data 테이블에 데이터 삽입   
     const insertCoinData = () => {
         const currentTime = new Date();
         const values = marketDataK.map((item, index) => {
         const ticker = tickerData.find(data => data.market === item.market);
         
         const price = ticker ? ticker.trade_price : null;
         const coinName = marketEnglishName[index] === "Bitcoin" ? "Bitcoin" : null;

         // coinName이 null이 아닌 경우에만 데이터 삽입
         if (coinName !== null) {
           return [coinName, currentTime, price];
         }
       });

       const filteredValues = values.filter(value => value !== undefined); // undefined 값 제거

       if (filteredValues.length === 0) {
         console.log('No data to insert');
         return;
       }

       const query = 'INSERT INTO coin_data (coin_name, timestamp, price) VALUES ?';
       connection.query(query, [filteredValues], (err, result) => {
         if (err) {
           console.error('Error inserting coin_data:', err);
           return res.status(500).send('Error inserting coin_data');
         }
         console.log(query)
         console.log('Successfully inserted coin_data');

         // 삽입한 데이터를 가져와서 차트로 그리기
         const selectQuery = 'SELECT timestamp, price FROM coin_data WHERE coin_name = ?';
         connection.query(selectQuery, ['Bitcoin'], (err, rows) => {
           if (err) {
             console.error('Error selecting coin_data:', err);
             return res.status(500).send('Error selecting coin_data');
           }
           const chartData = rows.map(row => ({
             timestamp: row.timestamp,
             price: row.price
           }));
           res.render('index', { formattedValues, marketDataK, marketEnglishName, tickerData, chartData });
         });
       });
     };

     // coin_data 데이터 삽입 함수 호출
     insertCoinData();
   })
   .catch(error => {
     console.error(error);
     res.status(500).send('Error fetching ticker data');
   });
}
app.post('/place-order', (req, res) => {
  const market = 'KRW-BTC'; // 거래하고자 하는 마켓
  const side = 'bid'; // 주문 종류: 매수
  const price = req.body.price
  const ordType = 'price'; // 주문 타입: 시장가 매수
  
  const body = {
    market: market,
    side: side,
    price: price,
    ord_type: ordType
  };

  const query = querystring.encode(body);

  const hash = crypto.createHash('sha512');
  const queryHash = hash.update(query, 'utf-8').digest('hex');

  const payload = {
    access_key: access_key,
    nonce: uuidv4(),
    query_hash: queryHash,
    query_hash_alg: 'SHA512',
  };
  const token = sign(payload, secret_key);
  const options = {
    method: 'POST',
    url: server_url + '/v1/orders',
    headers: { Authorization: `Bearer ${token}` },
    data: body
  };

  axios(options)
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error placing order');
    });
});
app.post('/sell-order', (req, res) => {
  const market = 'KRW-BTC';
  const side = 'ask'; 
  const volume = req.body.volume; 
  const ordType = 'market'; 
  console.log(volume)
  const body = {
    market: market,
    side: side,
    volume: volume,
    ord_type: ordType
  };
  const query = querystring.encode(body);
  const hash = crypto.createHash('sha512');
  const queryHash = hash.update(query, 'utf-8').digest('hex');
  const payload = {
    access_key: access_key,
    nonce: uuidv4(),
    query_hash: queryHash,
    query_hash_alg: 'SHA512',
  };

  const token = sign(payload, secret_key);

  const options = {
    method: 'POST',
    url: server_url + '/v1/orders',
    headers: { Authorization: `Bearer ${token}` },
    data: body
  };

  axios(options)
    .then(response => {
      console.log(response.data);
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error placing sell order');
    });
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});