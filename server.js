const express = require('express');
const fs = require('fs');
const cron = require('node-cron');
require('dotenv').config();

const { refreshLeaveData, refreshAbsenceData, FILE_PATH, ABSENCE_FILE_PATH } = require('./functions/breathe');

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
cron.schedule('0 */12 * * *', () => {
  refreshLeaveData();
  refreshAbsenceData();
});

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

// Serve current and upcoming leave/absence data (next 6 weeks)
app.get('/leave-requests/current', requireAuth, (req, res) => {
  try {
    const now = new Date();
    const sixWeeksFromNow = new Date(now);
    sixWeeksFromNow.setDate(now.getDate() + 42); // 6 weeks = 42 days
    
    const todayStr = now.toISOString().slice(0, 10);
    const sixWeeksStr = sixWeeksFromNow.toISOString().slice(0, 10);

    // Helper function to check if date range overlaps with current period
    function overlapsWithCurrentPeriod(startDate, endDate) {
      if (!startDate || !endDate) return false;
      return startDate <= sixWeeksStr && endDate >= todayStr;
    }

    const leaveRequests = [];

    // Read and filter leave requests
    if (fs.existsSync(FILE_PATH)) {
      const leaveData = JSON.parse(fs.readFileSync(FILE_PATH));
      const filtered = (leaveData.leave_requests || []).filter(item => 
        !item.cancelled && overlapsWithCurrentPeriod(item.start_date, item.end_date)
      );
      leaveRequests.push(...filtered);
    }

    // Read and filter absences, normalize to match leave request structure
    if (fs.existsSync(ABSENCE_FILE_PATH)) {
      const absenceData = JSON.parse(fs.readFileSync(ABSENCE_FILE_PATH));
      const filtered = (absenceData.absences || []).filter(item => 
        !item.cancelled && overlapsWithCurrentPeriod(item.start_date, item.end_date)
      );
      // Convert absences to match leave request structure
      const normalizedAbsences = filtered.map(item => ({
        id: item.id,
        employee_id: item.employee_id,
        employee_name: item.employee_name,
        department: item.department,
        start_date: item.start_date,
        end_date: item.end_date,
        half_day_start: false,
        half_day_end: false,
        status: item.status,
        leave_type: item.absence_type,
        notes: item.notes,
        cancelled: item.cancelled
      }));
      leaveRequests.push(...normalizedAbsences);
    }

    const result = {
      updated_at: new Date(),
      range: {
        start_date: todayStr,
        end_date: sixWeeksStr
      },
      leave_requests: leaveRequests
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(result);
  } catch (error) {
    console.error('Error fetching current leave/absence data:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch current leave/absence data',
      message: error.message 
    });
  }
});
  
// Run once at startup
refreshLeaveData();
refreshAbsenceData();

app.listen(PORT, () => {
  console.log(`Leave API running at http://localhost:${PORT}/leave-requests`);
});
