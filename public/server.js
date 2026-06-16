const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
app.use(express.static('public'));
app.use(express.json());

const deviceDatabase = {}; // Maps: username -> FCM Device Token

// Register client token
app.post('/subscribe', (req, res) => {
    const { username, token } = req.body;
    deviceDatabase[username.toLowerCase()] = token;
    res.sendStatus(200);
});

// Send notification route via Firebase admin SDK
app.post('/send-miss', (req, res) => {
    const { sender, target } = req.body;
    const targetToken = deviceDatabase[target.toLowerCase()];

    if (!targetToken) return res.sendStatus(404);

    const message = {
        notification: {
            title: 'Someone misses you! ❤️',
            body: `${sender} just sent you a sweet thought.`
        },
        token: targetToken
    };

    admin.messaging().send(message)
        .then(() => res.sendStatus(200))
        .catch((error) => {
            console.error('Error sending message:', error);
            res.sendStatus(500);
        });
});

app.listen(5000, () => console.log('Server running on port 5000'));
