const PULSE_CACHE_TTL_MS = 90 * 60 * 1000

export const workspacePulseMoods = new Set([
  'sunny',
  'cloudy',
  'rainy',
  'stormy',
  'snowy',
  'clear-night',
  'cloudy-night',
  'steady',
  'attention',
])

function cleanText(value, maximumLength) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[`*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

function localDateKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${values.year}-${values.month}-${values.day}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function pulseMoodForWeather(weather) {
  if (!weather) return 'steady'
  const code = Number(weather.weatherCode)
  if (!weather.isDay) return code <= 1 ? 'clear-night' : 'cloudy-night'
  if (code === 0 || code === 1) return 'sunny'
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloudy'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy'
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snowy'
  if (code >= 95) return 'stormy'
  return 'cloudy'
}

function itemTarget(entityType) {
  if (entityType === 'project' || entityType === 'task') return 'work'
  if (entityType === 'invoice' || entityType === 'payment') return 'money'
  if (entityType === 'decision') return 'intelligence'
  return 'automations'
}

function buildTodayItems({ projects, invoices, runs, notifications, tasks, todayKey, tomorrowKey }) {
  const items = []
  const unfinishedProjects = projects.filter((project) => project.status !== 'Ready')
  const overdueProject = unfinishedProjects.find((project) => /^\d{4}-\d{2}-\d{2}$/.test(project.due || '') && project.due < todayKey)
  const dueProject = unfinishedProjects.find((project) => project.due === todayKey || project.due === tomorrowKey)
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue')
  const failedRun = runs.find((run) => run.status === 'failed')
  const alert = notifications.find((notification) =>
    !notification.readAt && /warning|alert|decision|failed|overdue/i.test(`${notification.kind} ${notification.title}`),
  )

  if (overdueProject) {
    items.push({
      id: `project-${overdueProject.id}`,
      title: cleanText(overdueProject.name, 90),
      detail: `Overdue${overdueProject.client ? ` · ${cleanText(overdueProject.client, 70)}` : ''}`,
      kind: 'deadline',
      target: 'work',
    })
  } else if (dueProject) {
    items.push({
      id: `project-${dueProject.id}`,
      title: cleanText(dueProject.name, 90),
      detail: `${dueProject.due === todayKey ? 'Due today' : 'Due tomorrow'}${dueProject.client ? ` · ${cleanText(dueProject.client, 70)}` : ''}`,
      kind: 'deadline',
      target: 'work',
    })
  }

  if (overdueInvoices.length > 0) {
    items.push({
      id: 'overdue-invoices',
      title: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? '' : 's'}`,
      detail: 'Ready for a friendly follow-up',
      kind: 'money',
      target: 'money',
    })
  }

  if (alert) {
    items.push({
      id: `notification-${alert.id}`,
      title: cleanText(alert.title, 90),
      detail: cleanText(alert.body, 120) || 'Needs your attention',
      kind: 'attention',
      target: itemTarget(alert.entityType),
    })
  } else if (failedRun) {
    items.push({
      id: `run-${failedRun.id}`,
      title: cleanText(failedRun.automationName || 'Automation needs attention', 90),
      detail: 'The latest run did not complete',
      kind: 'attention',
      target: 'automations',
    })
  }

  const openTask = tasks.find((task) => !task.completed)
  if (openTask && items.length < 4) {
    const project = projects.find((candidate) => candidate.id === openTask.projectId)
    items.push({
      id: `task-${openTask.id}`,
      title: cleanText(openTask.title, 90),
      detail: project ? cleanText(project.name, 90) : 'Open project task',
      kind: 'task',
      target: 'work',
    })
  }

  if (items.length === 0) {
    items.push({
      id: 'workspace-clear',
      title: 'Nothing urgent is waiting',
      detail: 'Your workspace is clear for focused work',
      kind: 'clear',
      target: 'work',
    })
  }
  return items.slice(0, 4)
}

async function buildPulseContext({ database, workspaceId, workspaceContext, now }) {
  const [projects, invoices, runs, notifications] = await Promise.all([
    database.listProjects(workspaceId),
    database.listInvoices(workspaceId),
    database.listAutomationRuns(workspaceId),
    database.listWorkspaceNotifications(workspaceId),
  ])
  const activeProjects = projects.filter((project) => project.status !== 'Ready')
  const taskLists = await Promise.all(
    activeProjects.slice(0, 12).map((project) => database.listProjectTasks(workspaceId, project.id)),
  )
  const tasks = taskLists.flat()
  const timeZone = workspaceContext?.location?.timezone || 'UTC'
  const todayKey = localDateKey(now, timeZone)
  const tomorrowKey = addDays(todayKey, 1)
  const recentBoundary = now.getTime() - (7 * 24 * 60 * 60 * 1000)
  const recentRuns = runs.filter((run) => {
    const timestamp = new Date(run.startedAt).getTime()
    return Number.isFinite(timestamp) && timestamp >= recentBoundary
  })
  const validDueProjects = activeProjects.filter((project) => /^\d{4}-\d{2}-\d{2}$/.test(project.due || ''))
  const warningCount = notifications.filter((notification) =>
    !notification.readAt && /warning|alert|decision|failed|overdue/i.test(`${notification.kind} ${notification.title}`),
  ).length

  return {
    summary: {
      activeProjects: activeProjects.length,
      dueToday: validDueProjects.filter((project) => project.due === todayKey).length,
      dueTomorrow: validDueProjects.filter((project) => project.due === tomorrowKey).length,
      overdueProjects: validDueProjects.filter((project) => project.due < todayKey).length,
      openTasks: tasks.filter((task) => !task.completed).length,
      pendingInvoices: invoices.filter((invoice) => invoice.status === 'pending').length,
      overdueInvoices: invoices.filter((invoice) => invoice.status === 'overdue').length,
      completedRunsThisWeek: recentRuns.filter((run) => run.status === 'completed').length,
      failedRunsThisWeek: recentRuns.filter((run) => run.status === 'failed').length,
      unreadWarnings: warningCount,
    },
    location: workspaceContext?.location || null,
    weather: workspaceContext?.weather || null,
    expectedMood: pulseMoodForWeather(workspaceContext?.weather),
    items: buildTodayItems({ projects, invoices, runs, notifications, tasks, todayKey, tomorrowKey }),
  }
}

function fallbackCopy(context, userName, generatedAt) {
  const firstName = cleanText(String(userName || '').split(/\s+/)[0], 40) || 'there'
  const { summary, expectedMood } = context
  const needsAttention = summary.overdueProjects + summary.overdueInvoices + summary.failedRunsThisWeek + summary.unreadWarnings
  const headline = needsAttention > 0
    ? `A few things need your eye, ${firstName}.`
    : expectedMood === 'rainy' || expectedMood === 'stormy'
      ? `A good day for focused progress, ${firstName}.`
      : expectedMood === 'clear-night' || expectedMood === 'cloudy-night'
        ? `A calm evening to close the loop, ${firstName}.`
        : expectedMood === 'sunny'
          ? `A clear day to move work forward, ${firstName}.`
          : `Your workspace is ready, ${firstName}.`
  const facts = []
  if (summary.activeProjects > 0) facts.push(`${summary.activeProjects} active project${summary.activeProjects === 1 ? '' : 's'}`)
  if (summary.dueToday > 0) facts.push(`${summary.dueToday} due today`)
  else if (summary.dueTomorrow > 0) facts.push(`${summary.dueTomorrow} due tomorrow`)
  if (summary.overdueInvoices > 0) facts.push(`${summary.overdueInvoices} overdue invoice${summary.overdueInvoices === 1 ? '' : 's'}`)
  else if (summary.completedRunsThisWeek > 0) facts.push(`${summary.completedRunsThisWeek} completed run${summary.completedRunsThisWeek === 1 ? '' : 's'} this week`)
  return {
    headline: cleanText(headline, 80),
    message: cleanText(
      facts.length > 0
        ? `Today’s view: ${facts.slice(0, 3).join(', ')}. Start with the item that creates the most breathing room.`
        : 'Nothing urgent is crowding the day. Choose one meaningful next step and give it your full attention.',
      240,
    ),
    mood: expectedMood,
    generatedAt,
    source: 'fallback',
    items: context.items,
  }
}

function parseAiPulse(content, expectedMood, generatedAt, items) {
  const json = String(content || '').match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let value
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  const headline = cleanText(value?.headline, 80)
  const message = cleanText(value?.message, 240)
  const mood = cleanText(value?.mood, 30)
  if (!headline || !message || !workspacePulseMoods.has(mood) || mood !== expectedMood) return null
  return { headline, message, mood, generatedAt, source: 'ai', items }
}

export function createWorkspacePulseService({ database, complete, now = () => new Date() }) {
  const cache = new Map()
  const refreshes = new Map()

  async function prepare(input) {
    const generatedAt = now().toISOString()
    const context = await buildPulseContext({ ...input, database, now: now() })
    return { context, fallback: fallbackCopy(context, input.userName, generatedAt) }
  }

  async function refresh(input, prepared) {
    const key = `${input.workspaceId}:${input.userId}`
    if (refreshes.has(key)) return refreshes.get(key)
    const task = (async () => {
      try {
        const current = prepared || await prepare(input)
        const result = await complete({
          systemPrompt: [
            'Write a calm, concise home-screen workspace pulse for a small-business owner.',
            'Use only the supplied facts. Do not invent work, urgency, outcomes, or weather.',
            'Return JSON only with headline, message, and mood.',
            'Headline must be at most 80 characters. Message must be at most 240 characters.',
            `Mood must be exactly "${current.context.expectedMood}". Do not use Markdown or HTML.`,
          ].join(' '),
          messages: [{
            role: 'user',
            content: JSON.stringify({
              firstName: cleanText(String(input.userName || '').split(/\s+/)[0], 40),
              location: current.context.location,
              weather: current.context.weather,
              workspace: current.context.summary,
              expectedMood: current.context.expectedMood,
            }),
          }],
        })
        const generatedAt = now().toISOString()
        const pulse = parseAiPulse(result.content, current.context.expectedMood, generatedAt, current.context.items)
        if (!pulse) return null
        cache.set(key, { pulse, expiresAt: now().getTime() + PULSE_CACHE_TTL_MS })
        return pulse
      } catch {
        return null
      }
    })().finally(() => refreshes.delete(key))
    refreshes.set(key, task)
    return task
  }

  async function get(input) {
    const key = `${input.workspaceId}:${input.userId}`
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now().getTime()) {
      return { ...cached.pulse, refreshPending: false }
    }
    const prepared = await prepare(input)
    void refresh(input, prepared)
    return { ...prepared.fallback, refreshPending: true }
  }

  return { get, refresh }
}
