// Logging utility
let lastLogEntry = null;
let lastLogMessage = null;
let lastLogEmoji = null;
let logRepeatCount = 0;

export function log(message) {
  const logsDiv = document.getElementById("logs");
  if (!logsDiv) return;

  let emoji = "📝";
  if (message.includes("✅")) emoji = "✅";
  else if (message.includes("❌")) emoji = "❌";
  else if (message.includes("⚠️")) emoji = "⚠️";
  else if (message.includes("💡")) emoji = "💡";
  else if (message.includes("🎉")) emoji = "🎉";
  else if (message.includes("⏳")) emoji = "⏳";
  else if (message.includes("🚀")) emoji = "🚀";

  if (lastLogEntry && lastLogMessage === message && lastLogEmoji === emoji) {
    logRepeatCount++;
    lastLogEntry.innerHTML = `
      <span class="text-gray-500 text-sm">[${new Date().toLocaleTimeString()}]</span>
      <span class="ml-2">${emoji} ${message}</span>
      <span class="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">${
        logRepeatCount + 1
      }</span>
    `;
    logsDiv.scrollTop = logsDiv.scrollHeight;
    return;
  }

  logRepeatCount = 0;
  const entry = document.createElement("div");
  entry.className = "log-entry rounded-lg";
  entry.innerHTML = `
    <span class="text-gray-500 text-sm">[${new Date().toLocaleTimeString()}]</span>
    <span class="ml-2">${emoji} ${message}</span>
  `;
  logsDiv.appendChild(entry);
  logsDiv.scrollTop = logsDiv.scrollHeight;

  lastLogEntry = entry;
  lastLogMessage = message;
  lastLogEmoji = emoji;
}

