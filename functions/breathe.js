const axios = require('axios');
const fs = require('fs');

const FILE_PATH = './storage/leave_data.json';
const ABSENCE_FILE_PATH = './storage/absence_data.json';
const PRE_DAYS = 180;
const POST_DAYS = 180;

// Get dynamic date range
function getDateRange() {
  const now = new Date();
  const past = new Date(now);
  past.setDate(now.getDate() - PRE_DAYS);
  const future = new Date(now);
  future.setDate(now.getDate() + POST_DAYS);

  return {
    start_date: past.toISOString().slice(0, 10),
    end_date: future.toISOString().slice(0, 10)
  };
}

// Fetch all employees and build lookup
async function fetchEmployeeDirectory() {
  const employees = [];
  let page = 1;
  const per_page = 100;

  while (true) {
    const res = await axios.get('https://api.breathehr.com/v1/employees', {
      headers: { 'X-Api-Key': process.env.BREATHE_API_KEY },
      params: { page, per_page }
    });

    const batch = res.data?.employees || [];
    employees.push(...batch);

    if (batch.length < per_page) break;
    page++;
  }

  const lookup = {};
  for (const emp of employees) {
    lookup[emp.id] = {
      name: `${emp.first_name} ${emp.last_name}`,
      department: emp.department?.name || null
    };
  }

  return lookup;
}

// Fetch paginated leave requests
async function fetchAllLeaveRequests(start_date, end_date) {
  const results = [];
  let page = 1;
  const per_page = 100;

  while (true) {
    const res = await axios.get('https://api.breathehr.com/v1/leave_requests', {
      headers: { 'X-Api-Key': process.env.BREATHE_API_KEY },
      params: { page, per_page, start_date, end_date }
    });

    const batch = res.data?.leave_requests || [];
    results.push(...batch);

    if (batch.length < per_page) break;
    page++;
  }

  return results;
}

// Fetch paginated absences
async function fetchAllAbsences(start_date, end_date) {
  const results = [];
  let page = 1;
  const per_page = 100;

  while (true) {
    const res = await axios.get('https://api.breathehr.com/v1/absences', {
      headers: { 'X-Api-Key': process.env.BREATHE_API_KEY },
      params: { page, per_page, start_date, end_date }
    });

    const batch = res.data?.absences || [];
    results.push(...batch);

    if (batch.length < per_page) break;
    page++;
  }

  return results;
}

// Combine, enrich and write to file
async function refreshLeaveData() {
  const { start_date, end_date } = getDateRange();
  const [employeeLookup, leaveData] = await Promise.all([
    fetchEmployeeDirectory(),
    fetchAllLeaveRequests(start_date, end_date)
  ]);

  const final = leaveData.map((leave) => {
    const empId = leave.employee?.id;
    const emp = employeeLookup[empId] || {};

    return {
      id: leave.id,
      employee_id: empId || null,
      employee_name: emp.name || null,
      department: emp.department || null,
      start_date: leave.start_date,
      end_date: leave.end_date,
      half_day_start: leave.half_start || false,
      half_day_end: leave.half_end || false,
      status: leave.status,
      leave_type: leave.type || null,
      notes: leave.notes || null,
      cancelled: leave.cancelled || false
    };
  });

  fs.writeFileSync(FILE_PATH, JSON.stringify({
    updated_at: new Date(),
    range: { start_date, end_date },
    leave_requests: final
  }, null, 2));

  console.log(`[${new Date().toISOString()}] Leave data refreshed. Total: ${final.length}`);
}

// Fetch and save absence data
async function refreshAbsenceData() {
  const { start_date, end_date } = getDateRange();
  const [employeeLookup, absenceData] = await Promise.all([
    fetchEmployeeDirectory(),
    fetchAllAbsences(start_date, end_date)
  ]);

  const final = absenceData.map((absence) => {
    const empId = absence.employee?.id;
    const emp = employeeLookup[empId] || {};

    return {
      id: absence.id,
      employee_id: empId || null,
      employee_name: emp.name || null,
      department: emp.department || null,
      start_date: absence.start_date,
      end_date: absence.end_date,
      absence_type: absence.type || null,
      status: absence.status || null,
      notes: absence.notes || null,
      cancelled: absence.cancelled || false
    };
  });

  fs.writeFileSync(ABSENCE_FILE_PATH, JSON.stringify({
    updated_at: new Date(),
    range: { start_date, end_date },
    absences: final
  }, null, 2));

  console.log(`[${new Date().toISOString()}] Absence data refreshed. Total: ${final.length}`);
}

module.exports = {
  refreshLeaveData,
  refreshAbsenceData,
  FILE_PATH,
  ABSENCE_FILE_PATH
};
