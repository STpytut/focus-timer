// Text for the focus streak beside today's count: "🔥 N-day streak", or an
// empty string (hidden) when there is no streak.

export function streakText(days) {
  return Number.isInteger(days) && days > 0 ? `🔥 ${days}-day streak` : '';
}
