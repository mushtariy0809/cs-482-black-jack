
const authRoutes = require('./routes/auth');
const messagesRoutes = require('./routes/messages');
const historyRoutes = require('./routes/history');
const friendsRoutes = require('./routes/friends');

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/messages', messagesRoutes);

app.get('/', (req, res) => {
  res.send('21 CLUB backend is running!');
});

/*
app.listen(PORT, () => {
  console.log(`21 CLUB backend running on port ${PORT}`);
});
*/

// Connect to MongoDB

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected successfully!');

    app.listen(PORT, () => {
      console.log(`21 CLUB backend running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
  });
