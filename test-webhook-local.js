const http = require('http');

const data = JSON.stringify({
  type: 'message_received',
  data: {
    customer: {
      phone_number: '+916005138551',
      traits: { name: 'Test User' },
      channel_phone_number: '7309523829'
    },
    message: {
      text: 'Hello test!'
    }
  }
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/interakt/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
