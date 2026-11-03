// Creates (or updates) the Interviewer and Tutor agents on ElevenLabs from the
// prompts in docs/agents.md, then writes their IDs into .env.local.
// Usage: npm run agents
import { readFileSync, writeFileSync } from "node:fs";

const ENV = ".env.local";
const env = Object.fromEntries(
  readFileSync(ENV, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const key = env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY missing in .env.local");

const blocks = [...readFileSync("docs/agents.md", "utf8").matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].trim());
const [interviewerPrompt, tutorPrompt] = blocks;

const skipTurn = { type: "system", name: "skip_turn", description: "Stay silent when the user is narrating or thinking aloud.", params: { system_tool_type: "skip_turn" } };

const agents = [
  {
    envKey: "ELEVENLABS_INTERVIEWER_AGENT_ID",
    name: "Torchbearer - Interviewer",
    prompt: interviewerPrompt,
    firstMessage: "Hi Paul, I'm Torchbearer. Go ahead and show me the task. I'll stay quiet and only ask when you pause.",
  },
  {
    envKey: "ELEVENLABS_TUTOR_AGENT_ID",
    name: "Torchbearer - Tutor",
    prompt: tutorPrompt,
    firstMessage: "Hi Maya, I'm Torchbearer. I'll guide you based on what Paul recorded, and only speak up when you pause. Start whenever you're ready.",
  },
];

async function api(method, path, body) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

let envText = readFileSync(ENV, "utf8");
for (const a of agents) {
  const body = {
    name: a.name,
    conversation_config: {
      agent: {
        first_message: a.firstMessage,
        language: "en",
        prompt: { prompt: a.prompt, llm: "gemini-2.5-flash", temperature: 0.4, built_in_tools: { skip_turn: skipTurn } },
      },
    },
  };
  const existing = env[a.envKey];
  if (existing) {
    await api("PATCH", `/v1/convai/agents/${existing}`, body);
    console.log(`updated ${a.name}: ${existing}`);
  } else {
    const { agent_id } = await api("POST", "/v1/convai/agents/create", body);
    envText = envText.replace(new RegExp(`^${a.envKey}=.*$`, "m"), `${a.envKey}=${agent_id}`);
    console.log(`created ${a.name}: ${agent_id}`);
  }
}
writeFileSync(ENV, envText);
