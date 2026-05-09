// Helper to group journal entries by date
const groupByDate = (entries: ReturnType<typeof any>) => {
  const groups: Record<string, typeof entries> = {};
  entries.forEach((j) => {
    // Re-parse the date from closed_at for grouping key
    const date = j.time.split(",")[0]; // e.g. "Mon"
    if (!groups[date]) groups[date] = [];
    groups[date].push(j);
  });
  return groups;
};