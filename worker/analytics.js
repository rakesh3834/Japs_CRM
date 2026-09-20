const dayInIndia = (value) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10);
export function dashboardAnalytics(leads, tasks, now = new Date()) {
  const today = dayInIndia(now);
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(`${today}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 13 + i);
    return { date: day.toISOString().slice(0, 10), count: 0 };
  });
  const statuses = {}; const sources = {};
  for (const lead of leads) {
    statuses[lead.status] = (statuses[lead.status] || 0) + 1;
    sources[lead.source || "Manual"] = (sources[lead.source || "Manual"] || 0) + 1;
    if (lead.created_at && Number.isFinite(Date.parse(lead.created_at))) {
      const bucket = days.find((day) => day.date === dayInIndia(lead.created_at)); if (bucket) bucket.count++;
    }
  }
  const openTasks = tasks.filter((task) => !["Done", "Cancelled"].includes(task.status));
  return { generated_at: now.toISOString(), timezone: "Asia/Kolkata", total_leads: leads.length, today_leads: days.at(-1).count, daily: days, stages: Object.entries(statuses).map(([label, count]) => ({ label, count })), sources: Object.entries(sources).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count), open_tasks: openTasks.length, overdue_tasks: openTasks.filter((task) => task.due_at && new Date(task.due_at) < now).length };
}
