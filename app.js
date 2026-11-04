import { createClient } from '@neondatabase/neon-js';

(() => {
  const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
  const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL;
  const neon = AUTH_URL && DATA_API_URL ? createClient({ auth: { url: AUTH_URL }, dataApi: { url: DATA_API_URL } }) : null;
  const $ = (selector) => document.querySelector(selector);
  const heatmap = $('#heatmap');
  const dialog = $('#workoutDialog');
  const form = $('#workoutForm');
  let workouts = [];
  let creatingAccount = false;
  let selectedDate = null;
  let showAll = false;
  let toastTimer;

  function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function parseDate(key) { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day); }
  function localToday() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
  function shiftDay(date, amount) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount); }
  function formatDate(key, options = { month: 'short', day: 'numeric', year: 'numeric' }) { return parseDate(key).toLocaleDateString(undefined, options); }
  function byDate() {
    const map = new Map();
    for (const workout of workouts) {
      const day = map.get(workout.date) || { minutes: 0, sessions: 0 };
      day.minutes += Number(workout.duration || 0);
      day.sessions++;
      map.set(workout.date, day);
    }
    return map;
  }
  function levelFor(minutes, sessions) { if (!sessions) return 0; if (minutes < 30) return 1; if (minutes < 60) return 2; if (minutes < 90) return 3; return 4; }

  function fromDatabase(row) {
    return { id: row.id, date: row.date, type: row.workout_type, duration: row.duration == null ? null : Number(row.duration), notes: row.notes || '', createdAt: new Date(row.created_at).getTime() || 0 };
  }

  function sessionFrom(result) {
    const candidates = [result?.data?.session, result?.data, result?.session, result];
    return candidates.find((candidate) => candidate?.user) || null;
  }

  async function loadWorkouts() {
    const { data, error } = await neon.from('workouts')
      .select('id,date,workout_type,duration,notes,created_at')
      .order('date', { ascending: false });
    if (error) throw error;
    workouts = (data || []).map(fromDatabase);

    // Bring forward sessions created with the previous browser-only version once.
    if (workouts.length === 0) {
      try {
        const oldRows = JSON.parse(localStorage.getItem('repcount.workouts.v1') || '[]');
        const legacy = Array.isArray(oldRows) ? oldRows.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(Number(row.duration)) && Number(row.duration) > 0 && Number(row.duration) <= 600) : [];
        if (legacy.length) {
          const result = await neon.from('workouts').insert(legacy.map((row) => ({ date: row.date, workout_type: row.type || 'Other', duration: Number(row.duration), notes: String(row.notes || '').slice(0, 500) }))).select('id,date,workout_type,duration,notes,created_at');
          if (result.error) throw result.error;
          workouts = (result.data || []).map(fromDatabase);
          localStorage.removeItem('repcount.workouts.v1');
          showToast(`Imported ${workouts.length} saved session${workouts.length === 1 ? '' : 's'}`);
        }
      } catch (error) {
        console.error('Could not import browser-saved workouts:', error);
      }
    }
  }

  function showTracker(user) {
    $('#authGate').hidden = true;
    $('#trackerMain').hidden = false;
    $('#accountLabel').innerHTML = '<span class="live-dot"></span>';
    $('#accountLabel').append(document.createTextNode(user.email || 'Signed in'));
    $('#accountAvatar').textContent = (user.name || user.email || 'Y').trim().slice(0, 1).toUpperCase();
    $('#signOutButton').hidden = false;
  }

  function showSignIn(message = '') {
    $('#trackerMain').hidden = true;
    $('#authGate').hidden = false;
    $('#accountLabel').innerHTML = '<span class="live-dot"></span> Sign in to sync';
    $('#signOutButton').hidden = true;
    $('#authTitle').textContent = creatingAccount ? 'Start your training story.' : 'Pick up where you left off.';
    $('#authDescription').textContent = creatingAccount ? 'Create an account to keep your workout history synced and private to you.' : 'Sign in to keep your workout history synced and private to your account.';
    $('#authSubmit').innerHTML = creatingAccount ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
    $('#authSwitch').textContent = creatingAccount ? 'Already have an account? Sign in' : 'New here? Create an account';
    $('#authPassword').autocomplete = creatingAccount ? 'new-password' : 'current-password';
    $('#authError').textContent = message;
  }

  async function startSession(session) {
    const user = session?.user || session?.data?.user || null;
    if (!user) { showSignIn(); return; }
    showTracker(user);
    try {
      await loadWorkouts();
      render();
    } catch (error) {
      console.error('Could not load workouts:', error);
      showToast('Could not load workouts. Check the Neon table and access policies.');
      workouts = [];
      render();
    }
  }

  function renderHeatmap() {
    const today = localToday();
    const todayKey = dateKey(today);
    const firstDay = shiftDay(today, -364);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = shiftDay(firstDay, -mondayOffset);
    const weekCount = Math.ceil((365 + mondayOffset) / 7);
    const totals = byDate();
    heatmap.innerHTML = '';
    heatmap.style.gridTemplateColumns = `repeat(${weekCount}, 12px)`;
    heatmap.setAttribute('aria-rowcount', '7');
    heatmap.setAttribute('aria-colcount', String(weekCount));
    $('#monthLabels').innerHTML = '';
    $('#monthLabels').style.gridTemplateColumns = `repeat(${weekCount}, 12px)`;
    let lastMonth = -1;
    for (let week = 0; week < weekCount; week++) {
      const monday = shiftDay(gridStart, week * 7);
      const monthDate = monday < firstDay ? firstDay : monday;
      if (monthDate.getMonth() !== lastMonth) {
        const label = document.createElement('span');
        label.className = 'month-label';
        label.textContent = monthDate.toLocaleDateString(undefined, { month: 'short' });
        label.style.gridColumn = String(week + 1);
        $('#monthLabels').append(label);
        lastMonth = monthDate.getMonth();
      }
    }
    // A week column contains Monday through Sunday, matching contribution calendars.
    for (let week = 0; week < weekCount; week++) {
      for (let weekday = 0; weekday < 7; weekday++) {
        const date = shiftDay(gridStart, week * 7 + weekday);
        const key = dateKey(date);
        const inRange = date >= firstDay && date <= today;
        const activity = totals.get(key) || { minutes: 0, sessions: 0 };
        const minutes = activity.minutes;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `cell level-${levelFor(minutes, activity.sessions)}${inRange ? '' : ' outside'}${date > today ? ' future' : ''}${selectedDate === key ? ' selected' : ''}`;
        cell.setAttribute('role', 'gridcell');
        const activityLabel = activity.sessions ? `${minutes ? `${minutes} minutes trained` : 'workout logged, duration not set'}` : 'no workout';
        cell.setAttribute('aria-label', inRange ? `${formatDate(key)}: ${activityLabel}` : 'Outside the displayed year');
        cell.title = inRange ? `${formatDate(key)} · ${activity.sessions ? (minutes ? `${minutes} min` : 'Duration not set') : 'Rest day'}` : '';
        cell.addEventListener('click', () => {
          if (!inRange) return;
          selectedDate = selectedDate === key ? null : key;
          showAll = false;
          renderHeatmap();
          renderRecent();
          if (!activity.sessions) openDialog(key);
        });
        heatmap.append(cell);
      }
    }
    $('#periodLabel').textContent = `${formatDate(dateKey(firstDay), { month: 'short', year: 'numeric' })} — ${formatDate(todayKey, { month: 'short', year: 'numeric' })}`;
  }

  function streaks() {
    const workoutDays = new Set(workouts.map((item) => item.date));
    if (!workoutDays.size) return { current: 0, best: 0 };
    const sorted = [...workoutDays].sort();
    let best = 0, run = 0, previous = null;
    for (const key of sorted) {
      const date = parseDate(key);
      run = previous && dateKey(shiftDay(previous, 1)) === key ? run + 1 : 1;
      best = Math.max(best, run);
      previous = date;
    }
    let cursor = localToday();
    if (!workoutDays.has(dateKey(cursor))) cursor = shiftDay(cursor, -1);
    let current = 0;
    while (workoutDays.has(dateKey(cursor))) { current++; cursor = shiftDay(cursor, -1); }
    return { current, best };
  }

  function renderStats() {
    const today = localToday();
    const firstDay = shiftDay(today, -364);
    const yearWorkouts = workouts.filter((item) => parseDate(item.date) >= firstDay && parseDate(item.date) <= today);
    const days = new Set(yearWorkouts.map((item) => item.date));
    const minutes = workouts.reduce((sum, item) => sum + Number(item.duration || 0), 0);
    const streak = streaks();
    $('#daysStat').textContent = days.size;
    $('#streakStat').textContent = streak.current;
    $('#bestStat').textContent = streak.best;
    $('#hoursStat').textContent = minutes === 0 ? '0' : minutes < 600 ? (minutes / 60).toFixed(1) : String(Math.floor(minutes / 60));
  }

  function renderMonthlyChart() {
    const today = localToday();
    const months = Array.from({ length: 12 }, (_, index) => new Date(today.getFullYear(), today.getMonth() - 11 + index, 1));
    const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const counts = new Map();
    for (const workout of workouts) counts.set(workout.date.slice(0, 7), (counts.get(workout.date.slice(0, 7)) || 0) + 1);
    const monthlyCounts = months.map((month) => counts.get(monthKey(month)) || 0);
    const maxCount = Math.max(1, ...monthlyCounts);
    const chart = $('#monthlyChart');
    chart.innerHTML = '';
    months.forEach((month, index) => {
      const count = monthlyCounts[index];
      const monthName = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const column = document.createElement('div');
      column.className = 'month-bar-column';
      column.setAttribute('role', 'listitem');
      column.setAttribute('aria-label', `${monthName}: ${count} workout${count === 1 ? '' : 's'}`);
      column.innerHTML = '<span class="month-bar-value"></span><span class="month-bar-track" aria-hidden="true"><span class="month-bar-fill"></span></span><span class="month-bar-label"></span>';
      column.querySelector('.month-bar-value').textContent = count;
      column.querySelector('.month-bar-label').textContent = month.toLocaleDateString(undefined, { month: 'short' });
      column.querySelector('.month-bar-fill').style.height = count ? `${Math.max(6, (count / maxCount) * 100)}%` : '0';
      chart.append(column);
    });
    const firstMonth = months[0].toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const lastMonth = months[months.length - 1].toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    $('#monthlyPeriod').textContent = `${firstMonth} — ${lastMonth}`;
  }

  function renderWeekdayChart() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const counts = Array(7).fill(0);
    for (const workout of workouts) {
      const mondayFirstDay = (parseDate(workout.date).getDay() + 6) % 7;
      counts[mondayFirstDay]++;
    }
    const maxCount = Math.max(1, ...counts);
    const chart = $('#weekdayChart');
    chart.innerHTML = '';
    days.forEach((day, index) => {
      const count = counts[index];
      const row = document.createElement('div');
      row.className = 'weekday-chart-row';
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', `${day}: ${count} workout${count === 1 ? '' : 's'}`);
      row.innerHTML = '<span class="weekday-chart-day"></span><span class="weekday-chart-track" aria-hidden="true"><span class="weekday-chart-fill"></span></span><span class="weekday-chart-count"></span>';
      row.querySelector('.weekday-chart-day').textContent = day;
      row.querySelector('.weekday-chart-count').textContent = count;
      row.querySelector('.weekday-chart-fill').style.width = count ? `${(count / maxCount) * 100}%` : '0';
      chart.append(row);
    });
  }

  function renderRecent() {
    const list = $('#recentList');
    const heading = $('.activity-card .card-heading h2');
    const button = $('#viewAll');
    let visible = [...workouts].sort((a, b) => b.date.localeCompare(a.date) || Number(b.createdAt || 0) - Number(a.createdAt || 0));
    if (selectedDate && !showAll) {
      visible = visible.filter((item) => item.date === selectedDate);
      heading.textContent = `Sessions · ${formatDate(selectedDate, { month: 'short', day: 'numeric' })}`;
      button.textContent = 'View recent';
    } else {
      heading.textContent = 'Your training log';
      button.innerHTML = 'View all <span>↗</span>';
      if (!showAll) visible = visible.slice(0, 4);
    }
    list.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = selectedDate && !showAll ? '<strong>A rest day, or one waiting to be logged?</strong>Select a square with a workout to see its sessions.' : '<strong>Your first session starts the story.</strong>Log today or add a workout from any date in the past.';
      list.append(empty);
      return;
    }
    for (const workout of visible) {
      const row = document.createElement('div');
      row.className = 'session-row';
      const icon = workout.type === 'Cardio' ? '↗' : workout.type === 'Mobility' ? '〰' : '✳';
      row.innerHTML = `<span class="session-mark" aria-hidden="true">${icon}</span><div class="session-info"><div class="session-title"></div><div class="session-meta"></div></div><span class="session-duration"></span><button class="session-delete" type="button" aria-label="Delete session">×</button>`;
      row.querySelector('.session-title').textContent = workout.type || 'Workout';
      row.querySelector('.session-meta').textContent = `${formatDate(workout.date)}${workout.notes ? ` · ${workout.notes}` : ''}`;
      row.querySelector('.session-duration').textContent = workout.duration == null ? 'Time not set' : `${workout.duration} min`;
      row.querySelector('.session-delete').addEventListener('click', async () => {
        const { error } = await neon.from('workouts').delete().eq('id', workout.id);
        if (error) { showToast('Could not remove this session.'); return; }
        workouts = workouts.filter((item) => item.id !== workout.id);
        render(); showToast('Session removed');
      });
      list.append(row);
    }
  }

  function render() { renderHeatmap(); renderStats(); renderMonthlyChart(); renderWeekdayChart(); renderRecent(); }
  function openDialog(date = dateKey(localToday())) {
    $('#workoutDate').value = date;
    $('#workoutDate').max = dateKey(localToday());
    $('#formError').textContent = '';
    dialog.showModal();
  }
  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  $('#addWorkout').addEventListener('click', () => openDialog());
  $('#nudgeLog').addEventListener('click', () => openDialog());
  $('#closeDialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  $('#viewAll').addEventListener('click', () => {
    if (selectedDate && !showAll) { selectedDate = null; showAll = false; }
    else showAll = !showAll;
    renderRecent();
  });
  $('#authSwitch').addEventListener('click', () => {
    creatingAccount = !creatingAccount;
    showSignIn();
  });
  $('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!neon) return;
    const authForm = event.currentTarget;
    const submit = $('#authSubmit');
    const data = new FormData(authForm);
    submit.disabled = true;
    $('#authError').textContent = '';
    try {
      const result = creatingAccount
        ? await neon.auth.signUp.email({ email: data.get('email'), password: data.get('password'), name: String(data.get('email')).split('@')[0] })
        : await neon.auth.signIn.email({ email: data.get('email'), password: data.get('password') });
      if (result?.error) throw result.error;
      const session = sessionFrom(await neon.auth.getSession());
      if (creatingAccount) {
        if (!session) {
          creatingAccount = false;
          showSignIn('Account created. Sign in to continue.');
          return;
        }
      }
      if (!session) throw new Error('Sign-in completed, but Neon did not return an active session. Please try again.');
      await startSession(session);
      authForm.reset();
    } catch (error) {
      $('#authError').textContent = error.message || 'Could not sign in. Check your details and try again.';
    } finally {
      submit.disabled = false;
    }
  });
  $('#signOutButton').addEventListener('click', async () => {
    try { await neon.auth.signOut(); } catch (error) { console.error('Sign out failed:', error); }
    workouts = []; selectedDate = null; showSignIn();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const date = data.get('date');
    const durationValue = data.get('duration');
    const duration = durationValue === '' ? null : Number(durationValue);
    if (!date || date > dateKey(localToday())) { $('#formError').textContent = 'Choose today or an earlier date.'; return; }
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 600)) { $('#formError').textContent = 'Enter a duration between 1 and 600 minutes, or leave it blank.'; return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const { data: rows, error } = await neon.from('workouts').insert({ date, workout_type: data.get('type'), duration, notes: String(data.get('notes') || '').trim() }).select('id,date,workout_type,duration,notes,created_at');
      if (error) throw error;
      workouts.push(...(rows || []).map(fromDatabase));
      selectedDate = null; showAll = false; dialog.close(); form.reset();
      render(); showToast('Workout saved. Nice work showing up.');
    } catch (error) {
      $('#formError').textContent = error.message || 'Could not save this session. Check your Neon setup.';
    } finally {
      submit.disabled = false;
    }
  });

  if (!neon) {
    $('#authForm').hidden = true;
    $('#authSwitch').hidden = true;
    $('#configHelp').hidden = false;
  } else {
    neon.auth.getSession()
      .then((result) => startSession(sessionFrom(result)))
      .catch((error) => { console.error('Could not check sign-in:', error); showSignIn('Could not connect to Neon Auth. Check the configured Auth URL.'); });
  }
})();
