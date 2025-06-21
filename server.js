const express = require('express');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const { refreshLeaveData, FILE_PATH } = require('./functions/breathe');

const app = express();
const PORT = process.env.PORT || 3500;

function requireAuth(req, res, next) {
    const tokenFromHeader = (req.headers.authorization || '').split(' ')[1];
    const tokenFromQuery = req.query.key;
  
    const isValid =
      tokenFromHeader === process.env.ACCESS_KEY ||
      tokenFromQuery === process.env.ACCESS_KEY;
  
    if (isValid) {
      return next();
    }
  
    res.status(401).json({ error: 'Unauthorized' });
  }
  


// Scheduled job every 12 hours
cron.schedule('0 */12 * * *', refreshLeaveData);

// Serve cached data
app.get('/leave-requests', requireAuth, (req, res) => {
    if (fs.existsSync(FILE_PATH)) {
      const data = fs.readFileSync(FILE_PATH);
      res.setHeader('Content-Type', 'application/json');
      res.send(data);
    } else {
      res.status(503).json({ error: 'Authorization failed.  Use Door4 provided key.' });
    }
  });
  
// Run once at startup
refreshLeaveData();

app.listen(PORT, () => {
  console.log(`Leave API running at http://localhost:${PORT}/leave-requests`);
});
