
const authRoutes = require('./routes/auth');
const messagesRoutes = require('./routes/messages');
const historyRoutes = require('./routes/history');
const friendsRoutes = require('./routes/friends');
const adminRoutes = require('./routes/admin');

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const { startRealtime } = require('./realtime');
const { ensureAdminAccount } = require('./bootstrapAdmin');

const app = express();
const PORT = process.env.PORT || 5000;

// Express and Socket.IO share one HTTP server (and one port)
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/admin', adminRoutes);

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
  .then(async () => {
    console.log('MongoDB connected successfully!');

    if (await ensureAdminAccount()) {
      console.log('Configured admin account created.');
    }

    // Live tables (lobby status, seats) over Socket.IO
    app.locals.tableStore = await startRealtime(io);
    app.locals.io = io;

    server.listen(PORT, () => {
      console.log(`21 CLUB backend running on port ${PORT}`);
    });
  })
  .catch(async (error) => {
    console.error('Server startup failed:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
