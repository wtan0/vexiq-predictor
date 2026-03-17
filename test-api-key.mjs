import { readFileSync } from "fs";

// Load env from .env file if present
let apiKey = process.env.ROBOTEVENTS_API_KEY;
if (!apiKey) {
  try {
    const env = readFileSync(".env", "utf-8");
    const match = env.match(/ROBOTEVENTS_API_KEY=(.+)/);
    if (match) apiKey = match[1].trim();
  } catch {}
}

if (!apiKey) {
  console.error("ROBOTEVENTS_API_KEY not set");
  process.exit(1);
}

console.log("Key present, length:", apiKey.length);

const resp = await fetch("https://www.robotevents.com/api/v2/programs?per_page=1", {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  },
});

console.log("Status:", resp.status);
const data = await resp.json();
console.log("Response:", JSON.stringify(data).slice(0, 300));

if (resp.status === 200) {
  console.log("✅ API key is valid");
} else {
  console.error("❌ API key invalid or request failed");
  process.exit(1);
}
