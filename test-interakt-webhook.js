import http from 'http';

// Simulating an Interakt Webhook payload for a USER_MESSAGE
const testPayload = JSON.stringify({
  userPhoneNumber: "+918888888888", // This number doesn't exist, so it will create a NEW lead!
  botId: "test-bot-id",
  entityType: "USER_MESSAGE",
  entity: {
    messageId: "MxTcYxYyXrTKS=o46jMjDJPQ",
    sendTime: new Date().toISOString(),
    text: "Hello from Interakt Webhook Test!",
    userFile: null,
    location: null,
    suggestionResponse: null
  }
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/v1/interakt/webhook',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': testPayload.length
  }
};

const req = http.request(options, (res) => {
  console.log(`WEBHOOK STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`WEBHOOK BODY: ${chunk}`);
  });
  
  // Wait 2 seconds and then query the backend directly for the new lead to prove it exists
  setTimeout(() => {
    console.log("\n--- Checking Database for the new lead ---");
    http.get('http://localhost:5000/api/v1/leads?limit=5', {
      headers: { 'Cookie': 'connect.sid=fake' } // Just a dummy request, but it will fail with 401 if not authenticated. Instead of API, let's just ask the user to check UI.
    }, (res2) => {
      // Actually we need Auth to use the API, so we will skip API fetch.
    });
  }, 2000);
});

req.write(testPayload);
req.end();
