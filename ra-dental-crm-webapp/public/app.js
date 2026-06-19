(function () {
  var TOKEN_KEY = 'ra_crm_token';
  var USER_KEY = 'ra_crm_user';

  var tickets = [];
  var employees = [];
  var sortState = { field: 'created_at', dir: 'desc' };
  var editingTicketId = null;
  var editingEmployeeId = null;
  var activeView = 'table';
  var charts = {};
  var CHART_COLORS = ['#0e7c86', '#1d4ed8', '#b45309', '#15803d', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04'];

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(v) {
    if (v === '' || v === null || v === undefined || isNaN(v)) return '—';
    return '₱' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function dateOnly(s) {
    if (!s) return '';
    return String(s).slice(0, 10);
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    var res = await fetch(path, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401) {
      clearSession();
      showLogin();
      throw new Error('Session expired. Please sign in again.');
    }
    var data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
    }
    return data;
  }

  // ---------- Auth / view switching ----------

  function showLogin() {
    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
  }

  function showApp() {
    var user = getUser();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    document.getElementById('userNameLabel').textContent = user.fullName;
    document.getElementById('userRoleLabel').textContent = user.role;
    document.getElementById('tabEmployeesBtn').style.display = user.role === 'admin' ? '' : 'none';
    loadTickets();
  }

  async function init() {
    if (getToken() && getUser()) {
      try {
        await apiFetch('/api/auth/me');
        showApp();
        return;
      } catch (e) { /* fall through to login */ }
    }
    showLogin();
  }

  document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var username = document.getElementById('loginUsername').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errorBox = document.getElementById('loginError');
    errorBox.textContent = '';
    try {
      var data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: username, password: password }) });
      setSession(data.token, data.user);
      document.getElementById('loginPassword').value = '';
      showApp();
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    clearSession();
    showLogin();
  });

  // Change password modal
  document.getElementById('changePwBtn').addEventListener('click', function () {
    document.getElementById('pw_current').value = '';
    document.getElementById('pw_new').value = '';
    document.getElementById('pwError').textContent = '';
    document.getElementById('pwOverlay').classList.add('show');
  });
  document.getElementById('pwCancelBtn').addEventListener('click', function () {
    document.getElementById('pwOverlay').classList.remove('show');
  });
  document.getElementById('pwForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var errorBox = document.getElementById('pwError');
    errorBox.textContent = '';
    try {
      await apiFetch('/api/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword: document.getElementById('pw_current').value,
          newPassword: document.getElementById('pw_new').value
        })
      });
      document.getElementById('pwOverlay').classList.remove('show');
      alert('Password updated.');
    } catch (err) {
      errorBox.textContent = err.message;
    }
  });

  // ---------- Stats / table rendering ----------

  function renderStats() {
    var total = tickets.length;
    var underWarranty = tickets.filter(function (t) { return t.warranty === 'Under Warranty'; }).length;
    var lapsed = tickets.filter(function (t) { return t.warranty === 'Lapsed Warranty'; }).length;
    var inProgress = tickets.filter(function (t) { return ['Received', 'In Progress', 'Awaiting Parts'].indexOf(t.repair_status) > -1; }).length;
    var completed = tickets.filter(function (t) { return ['Completed', 'Returned to Client'].indexOf(t.repair_status) > -1; }).length;

    var cards = [
      ['Total Tickets', total, ''],
      ['Under Warranty', underWarranty, 'color:var(--ok)'],
      ['Lapsed Warranty', lapsed, 'color:var(--danger)'],
      ['Open / In Progress', inProgress, 'color:var(--info)'],
      ['Completed / Returned', completed, 'color:var(--accent-dark)']
    ];
    document.getElementById('stats').innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="num" style="' + c[2] + '">' + c[1] + '</div><div class="label">' + c[0] + '</div></div>';
    }).join('');
  }

  function warrantyBadge(status) {
    var cls = status === 'Under Warranty' ? 'badge-ok' : 'badge-danger';
    return '<span class="badge ' + cls + '">' + escapeHtml(status) + '</span>';
  }
  function statusBadge(status) {
    var map = { 'Received': 'badge-muted', 'In Progress': 'badge-info', 'Awaiting Parts': 'badge-warn', 'Completed': 'badge-ok', 'Returned to Client': 'badge-info' };
    return '<span class="badge ' + (map[status] || 'badge-muted') + '">' + escapeHtml(status || '—') + '</span>';
  }

  function getFiltered() {
    var q = document.getElementById('searchInput').value.trim().toLowerCase();
    var wf = document.getElementById('warrantyFilter').value;
    var sf = document.getElementById('statusFilter').value;
    var list = tickets.filter(function (t) {
      if (wf && t.warranty !== wf) return false;
      if (sf && t.repair_status !== sf) return false;
      if (q) {
        var hay = [t.ticket_no, t.client_name, t.serial, t.device, t.brand, t.model].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      var fa = (a[sortState.field] || '').toString().toLowerCase();
      var fb = (b[sortState.field] || '').toString().toLowerCase();
      if (fa < fb) return sortState.dir === 'asc' ? -1 : 1;
      if (fa > fb) return sortState.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }

  var columns = [
    { key: 'ticket_no', label: 'Ticket #' },
    { key: 'client_name', label: 'Client' },
    { key: 'device', label: 'Device / Brand / Model' },
    { key: 'serial', label: 'Serial Number' },
    { key: 'warranty', label: 'Warranty' },
    { key: 'date_reported', label: 'Date Reported' },
    { key: 'repair_status', label: 'Repair Status' },
    { key: 'technician', label: 'Technician' },
    { key: 'cost', label: 'Cost' },
    { key: '_actions', label: '' }
  ];

  function renderTable() {
    var list = getFiltered();
    if (list.length === 0) {
      document.getElementById('tableWrap').innerHTML = '<div class="empty-state">No repair tickets match your filters yet.</div>';
      return;
    }
    var isAdmin = (getUser() || {}).role === 'admin';
    var thead = '<thead><tr>' + columns.map(function (c) {
      var arrow = sortState.field === c.key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th data-key="' + c.key + '">' + escapeHtml(c.label) + arrow + '</th>';
    }).join('') + '</tr></thead>';

    var rows = list.map(function (t) {
      return '<tr>' +
        '<td class="ticket-no">' + escapeHtml(t.ticket_no) + '</td>' +
        '<td>' + escapeHtml(t.client_name) + '<div class="muted">' + escapeHtml(t.client_phone || t.client_email || '') + '</div></td>' +
        '<td>' + escapeHtml(t.device) + '<div class="muted">' + escapeHtml(t.brand) + ' · ' + escapeHtml(t.model) + '</div></td>' +
        '<td>' + escapeHtml(t.serial) + '</td>' +
        '<td>' + warrantyBadge(t.warranty) + '</td>' +
        '<td>' + fmtDate(t.date_reported) + '</td>' +
        '<td>' + statusBadge(t.repair_status) + '</td>' +
        '<td>' + escapeHtml(t.technician || '—') + '</td>' +
        '<td>' + money(t.cost) + '</td>' +
        '<td><button class="btn-secondary btn-small" data-edit="' + t.id + '">Edit</button> ' +
        (isAdmin ? '<button class="btn-danger btn-small" data-del="' + t.id + '">Delete</button>' : '') +
        '</td>' +
        '</tr>';
    }).join('');

    document.getElementById('tableWrap').innerHTML = '<table>' + thead + '<tbody>' + rows + '</tbody></table>';

    document.querySelectorAll('th[data-key]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-key');
        if (key === '_actions') return;
        if (sortState.field === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        else { sortState.field = key; sortState.dir = 'asc'; }
        renderTable();
      });
    });
    document.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditTicket(btn.getAttribute('data-edit')); });
    });
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteTicket(btn.getAttribute('data-del')); });
    });
  }

  function renderAll() {
    renderStats();
    renderTable();
    if (activeView === 'reports') renderReports();
  }

  // ---------- Reports ----------

  function aggregateByField(list, field) {
    var map = {};
    list.forEach(function (t) {
      var k = (t[field] || '').toString().trim() || 'Unspecified';
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }
  function monthKey(dateStr) {
    if (!dateStr) return 'Unknown';
    return String(dateStr).slice(0, 7);
  }
  function destroyCharts() {
    Object.keys(charts).forEach(function (k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });
  }

  function renderReports() {
    if (typeof Chart === 'undefined') return;
    destroyCharts();

    var wMap = aggregateByField(tickets, 'warranty');
    charts.warranty = new Chart(document.getElementById('chartWarranty'), {
      type: 'doughnut',
      data: { labels: Object.keys(wMap), datasets: [{ data: Object.values(wMap), backgroundColor: ['#15803d', '#dc2626', '#94a3b8'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    var statusOrder = ['Received', 'In Progress', 'Awaiting Parts', 'Completed', 'Returned to Client'];
    var sMap = aggregateByField(tickets, 'repair_status');
    var sLabels = statusOrder.filter(function (s) { return sMap[s]; });
    Object.keys(sMap).forEach(function (k) { if (statusOrder.indexOf(k) === -1) sLabels.push(k); });
    charts.status = new Chart(document.getElementById('chartStatus'), {
      type: 'bar',
      data: { labels: sLabels, datasets: [{ label: 'Tickets', data: sLabels.map(function (s) { return sMap[s] || 0; }), backgroundColor: '#0e7c86' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    var mMap = {};
    tickets.forEach(function (t) { var k = monthKey(t.date_reported); mMap[k] = (mMap[k] || 0) + 1; });
    var mLabels = Object.keys(mMap).sort();
    charts.monthly = new Chart(document.getElementById('chartMonthly'), {
      type: 'line',
      data: { labels: mLabels, datasets: [{ label: 'Tickets Reported', data: mLabels.map(function (m) { return mMap[m]; }), borderColor: '#0e7c86', backgroundColor: 'rgba(14,124,134,0.15)', fill: true, tension: 0.25 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    var dMap = aggregateByField(tickets, 'device');
    var dEntries = Object.entries(dMap).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    charts.devices = new Chart(document.getElementById('chartDevices'), {
      type: 'bar',
      data: { labels: dEntries.map(function (e) { return e[0]; }), datasets: [{ label: 'Tickets', data: dEntries.map(function (e) { return e[1]; }), backgroundColor: CHART_COLORS }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    var costMap = { 'Under Warranty': 0, 'Lapsed Warranty': 0 };
    tickets.forEach(function (t) {
      var key = t.warranty === 'Under Warranty' ? 'Under Warranty' : 'Lapsed Warranty';
      var c = Number(t.cost);
      costMap[key] += isNaN(c) ? 0 : c;
    });
    charts.cost = new Chart(document.getElementById('chartCost'), {
      type: 'bar',
      data: { labels: Object.keys(costMap), datasets: [{ label: 'Total Cost (₱)', data: Object.values(costMap), backgroundColor: ['#15803d', '#dc2626'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // ---------- Tab switching ----------

  function showView(view) {
    activeView = view;
    document.getElementById('tableView').style.display = view === 'table' ? '' : 'none';
    document.getElementById('reportsView').style.display = view === 'reports' ? '' : 'none';
    document.getElementById('employeesView').style.display = view === 'employees' ? '' : 'none';
    document.getElementById('tabTicketsBtn').classList.toggle('active', view === 'table');
    document.getElementById('tabReportsBtn').classList.toggle('active', view === 'reports');
    document.getElementById('tabEmployeesBtn').classList.toggle('active', view === 'employees');
    if (view === 'reports') renderReports();
    if (view === 'employees') loadEmployees();
  }
  document.getElementById('tabTicketsBtn').addEventListener('click', function () { showView('table'); });
  document.getElementById('tabReportsBtn').addEventListener('click', function () { showView('reports'); });
  document.getElementById('tabEmployeesBtn').addEventListener('click', function () { showView('employees'); });

  // ---------- Ticket data ----------

  async function loadTickets() {
    try {
      tickets = await apiFetch('/api/tickets');
      renderAll();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteTicket(id) {
    var t = tickets.find(function (x) { return String(x.id) === String(id); });
    if (!t) return;
    if (!confirm('Delete ticket ' + t.ticket_no + ' for ' + t.client_name + '? This cannot be undone.')) return;
    try {
      await apiFetch('/api/tickets/' + id, { method: 'DELETE' });
      await loadTickets();
    } catch (err) {
      alert(err.message);
    }
  }

  document.getElementById('searchInput').addEventListener('input', renderTable);
  document.getElementById('warrantyFilter').addEventListener('change', renderTable);
  document.getElementById('statusFilter').addEventListener('change', renderTable);

  // ---------- Ticket modal ----------

  function updateWarrantyHint() {
    var w = document.getElementById('f_warranty').value;
    document.getElementById('warrantyHint').textContent = w === 'Under Warranty' ? 'Covered — confirm coverage before charging the client.' : '';
  }
  document.getElementById('f_warranty').addEventListener('change', updateWarrantyHint);

  function clearTicketForm() {
    document.getElementById('ticketForm').reset();
    document.getElementById('f_dateReported').value = todayStr();
    document.getElementById('f_warranty').value = 'Under Warranty';
    document.getElementById('f_repairStatus').value = 'Received';
    updateWarrantyHint();
  }

  function fillTicketForm(t) {
    document.getElementById('f_clientName').value = t.client_name || '';
    document.getElementById('f_clientPhone').value = t.client_phone || '';
    document.getElementById('f_clientEmail').value = t.client_email || '';
    document.getElementById('f_device').value = t.device || '';
    document.getElementById('f_brand').value = t.brand || '';
    document.getElementById('f_model').value = t.model || '';
    document.getElementById('f_serial').value = t.serial || '';
    document.getElementById('f_warranty').value = t.warranty || 'Under Warranty';
    document.getElementById('f_dateReported').value = dateOnly(t.date_reported) || todayStr();
    document.getElementById('f_repairStatus').value = t.repair_status || 'Received';
    document.getElementById('f_technician').value = t.technician || '';
    document.getElementById('f_cost').value = (t.cost === null || t.cost === undefined) ? '' : t.cost;
    document.getElementById('f_notes').value = t.notes || '';
    updateWarrantyHint();
  }

  function openNewTicket() {
    editingTicketId = null;
    document.getElementById('modalTitle').textContent = 'New Repair Ticket';
    document.getElementById('modalSub').textContent = 'A ticket number will be generated automatically on save.';
    clearTicketForm();
    document.getElementById('overlay').classList.add('show');
    document.getElementById('f_clientName').focus();
  }
  function openEditTicket(id) {
    var t = tickets.find(function (x) { return String(x.id) === String(id); });
    if (!t) return;
    editingTicketId = id;
    document.getElementById('modalTitle').textContent = 'Edit Ticket ' + t.ticket_no;
    document.getElementById('modalSub').textContent = 'Ticket number stays fixed once created.';
    fillTicketForm(t);
    document.getElementById('overlay').classList.add('show');
  }
  document.getElementById('newTicketBtn').addEventListener('click', openNewTicket);
  document.getElementById('cancelBtn').addEventListener('click', function () { document.getElementById('overlay').classList.remove('show'); });
  document.getElementById('overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') document.getElementById('overlay').classList.remove('show'); });

  document.getElementById('ticketForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var payload = {
      clientName: document.getElementById('f_clientName').value.trim(),
      clientPhone: document.getElementById('f_clientPhone').value.trim(),
      clientEmail: document.getElementById('f_clientEmail').value.trim(),
      device: document.getElementById('f_device').value.trim(),
      brand: document.getElementById('f_brand').value.trim(),
      model: document.getElementById('f_model').value.trim(),
      serial: document.getElementById('f_serial').value.trim(),
      warranty: document.getElementById('f_warranty').value,
      dateReported: document.getElementById('f_dateReported').value || todayStr(),
      repairStatus: document.getElementById('f_repairStatus').value,
      technician: document.getElementById('f_technician').value.trim(),
      cost: document.getElementById('f_cost').value === '' ? null : Number(document.getElementById('f_cost').value),
      notes: document.getElementById('f_notes').value.trim()
    };
    try {
      if (editingTicketId) {
        await apiFetch('/api/tickets/' + editingTicketId, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
      }
      document.getElementById('overlay').classList.remove('show');
      await loadTickets();
    } catch (err) {
      alert(err.message);
    }
  });

  // ---------- CSV export ----------

  function exportCsv() {
    var headers = ['Ticket Number', 'Client Name', 'Phone', 'Email', 'Device', 'Brand', 'Model', 'Serial Number', 'Warranty Status', 'Date Reported', 'Repair Status', 'Technician', 'Cost', 'Notes'];
    var rows = tickets.map(function (t) {
      return [t.ticket_no, t.client_name, t.client_phone, t.client_email, t.device, t.brand, t.model, t.serial, t.warranty, dateOnly(t.date_reported), t.repair_status, t.technician, t.cost, t.notes]
        .map(function (v) {
          v = v === null || v === undefined ? '' : String(v);
          if (v.indexOf(',') > -1 || v.indexOf('"') > -1 || v.indexOf('\n') > -1) v = '"' + v.replace(/"/g, '""') + '"';
          return v;
        }).join(',');
    });
    var csv = headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'ra-dental-repair-tickets-' + todayStr() + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

  // ---------- Employees (admin only) ----------

  async function loadEmployees() {
    try {
      employees = await apiFetch('/api/employees');
      renderEmployees();
    } catch (err) {
      console.error(err);
    }
  }

  function renderEmployees() {
    if (employees.length === 0) {
      document.getElementById('employeesWrap').innerHTML = '<div class="empty-state">No employees yet.</div>';
      return;
    }
    var rows = employees.map(function (emp) {
      return '<tr>' +
        '<td>' + escapeHtml(emp.full_name) + '</td>' +
        '<td>' + escapeHtml(emp.username) + '</td>' +
        '<td><span class="badge ' + (emp.role === 'admin' ? 'badge-info' : 'badge-muted') + '">' + escapeHtml(emp.role) + '</span></td>' +
        '<td><span class="badge ' + (emp.active ? 'badge-ok' : 'badge-danger') + '">' + (emp.active ? 'Active' : 'Disabled') + '</span></td>' +
        '<td>' + fmtDate(emp.created_at) + '</td>' +
        '<td><button class="btn-secondary btn-small" data-emp-edit="' + emp.id + '">Edit</button> ' +
        '<button class="btn-secondary btn-small" data-emp-toggle="' + emp.id + '">' + (emp.active ? 'Disable' : 'Enable') + '</button></td>' +
        '</tr>';
    }).join('');
    document.getElementById('employeesWrap').innerHTML =
      '<table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>';

    document.querySelectorAll('[data-emp-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEditEmployee(btn.getAttribute('data-emp-edit')); });
    });
    document.querySelectorAll('[data-emp-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleEmployeeActive(btn.getAttribute('data-emp-toggle')); });
    });
  }

  async function toggleEmployeeActive(id) {
    var emp = employees.find(function (x) { return String(x.id) === String(id); });
    if (!emp) return;
    try {
      await apiFetch('/api/employees/' + id, { method: 'PUT', body: JSON.stringify({ active: !emp.active }) });
      await loadEmployees();
    } catch (err) {
      alert(err.message);
    }
  }

  function openNewEmployee() {
    editingEmployeeId = null;
    document.getElementById('empModalTitle').textContent = 'Add Employee';
    document.getElementById('empModalSub').textContent = 'They will use this username and password to sign in.';
    document.getElementById('employeeForm').reset();
    document.getElementById('e_role').value = 'staff';
    document.getElementById('e_passwordLabel').textContent = 'Password *';
    document.getElementById('e_password').required = true;
    document.getElementById('e_activeField').style.display = 'none';
    document.getElementById('empOverlay').classList.add('show');
  }
  function openEditEmployee(id) {
    var emp = employees.find(function (x) { return String(x.id) === String(id); });
    if (!emp) return;
    editingEmployeeId = id;
    document.getElementById('empModalTitle').textContent = 'Edit Employee';
    document.getElementById('empModalSub').textContent = 'Leave password blank to keep it unchanged.';
    document.getElementById('e_fullName').value = emp.full_name;
    document.getElementById('e_username').value = emp.username;
    document.getElementById('e_username').disabled = true;
    document.getElementById('e_password').value = '';
    document.getElementById('e_passwordLabel').textContent = 'New Password (optional)';
    document.getElementById('e_password').required = false;
    document.getElementById('e_role').value = emp.role;
    document.getElementById('e_activeField').style.display = '';
    document.getElementById('e_active').checked = emp.active;
    document.getElementById('empOverlay').classList.add('show');
  }
  document.getElementById('newEmployeeBtn').addEventListener('click', openNewEmployee);
  document.getElementById('empCancelBtn').addEventListener('click', function () {
    document.getElementById('e_username').disabled = false;
    document.getElementById('empOverlay').classList.remove('show');
  });
  document.getElementById('empOverlay').addEventListener('click', function (e) {
    if (e.target.id === 'empOverlay') {
      document.getElementById('e_username').disabled = false;
      document.getElementById('empOverlay').classList.remove('show');
    }
  });

  document.getElementById('employeeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fullName = document.getElementById('e_fullName').value.trim();
    var username = document.getElementById('e_username').value.trim();
    var password = document.getElementById('e_password').value;
    var role = document.getElementById('e_role').value;
    try {
      if (editingEmployeeId) {
        var body = { fullName: fullName, role: role, active: document.getElementById('e_active').checked };
        if (password) body.password = password;
        await apiFetch('/api/employees/' + editingEmployeeId, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/employees', { method: 'POST', body: JSON.stringify({ fullName: fullName, username: username, password: password, role: role }) });
      }
      document.getElementById('e_username').disabled = false;
      document.getElementById('empOverlay').classList.remove('show');
      await loadEmployees();
    } catch (err) {
      alert(err.message);
    }
  });

  init();
})();
