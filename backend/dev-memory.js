
// Runs the backend against a throwaway in-memory MongoDB.
// Handy when you don't have MONGO_URI set up. Data is lost when it stops.
const { MongoMemoryServer } = require('mongodb-memory-server');

MongoMemoryServer.create().then(mongo => {
  process.env.MONGO_URI = mongo.getUri('21club');
  console.log('Using in-memory MongoDB (data is not saved)');
  require('./server');
});
