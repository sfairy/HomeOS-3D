import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const EARCON = "homeos/frontend/src/composables/voice/useEarcon.ts";
const PALETTE = "homeos/frontend/src/components/widgets/agent/AgentChatPalette.vue";
const COMPANION = "homeos/frontend/src/components/shell/AgentCompanion.vue";
const COMPANION_SPEECH = "homeos/frontend/src/components/shell/agent-companion/useCompanionSpeech.ts";
const COMPANION_WAKE = "homeos/frontend/src/components/shell/agent-companion/useCompanionWake.ts";

test("earcon 用 Web Audio 合成，不依赖音频静态资源", () => {
  const source = read(EARCON);
  assert.match(source, /createOscillator/);
  assert.match(source, /createGain/);
  // 自动播放策略：出声前必须先 resume
  assert.match(source, /ctx\.state !== 'suspended'/);
  // 静默失败：音效不许把主流程变成错误
  assert.match(source, /logger\.debug\('播放音效失败'/);
});

test("earcon 跟随 voice.ttsEnabled 开关", () => {
  const source = read(EARCON);
  assert.match(source, /ttsEnabled !== false/);
});

test("对话面板在结果与失败两条路径都出声", () => {
  const source = read(PALETTE);
  assert.match(source, /import \{ playEarcon \} from '@\/composables\/voice\/useEarcon'/);
  assert.match(source, /void playEarcon\(result\?\.earcon\)/);
  assert.match(source, /void playEarcon\('error'\)/);
});

test("悬浮伴侣在问完一轮后出声", () => {
  const source = read(COMPANION_SPEECH);
  assert.match(source, /playEarcon\(answer\.earcon\)/);
  const chat = read("homeos/frontend/src/components/shell/agent-companion/useCompanionChat.ts");
  // 失败路径也要有反馈，否则用户只能等到超时
  assert.match(chat, /earcon: 'error'/);
});

test("伙伴接入唤醒词，且只在可见 / 未录音时监听", () => {
  const companion = read(COMPANION);
  assert.match(companion, /useCompanionWake\(\{/);
  assert.match(companion, /onCommand: \(cmd\) => void handleVoiceResult\(cmd\)/);

  const wake = read(COMPANION_WAKE);
  assert.match(wake, /interactionMode === 'wake'/);
  assert.match(wake, /wakeWordEnabled === true/);
  assert.match(wake, /if \(!options\.visible\.value\) return false/);
  assert.match(wake, /configEpoch\.value/);
  assert.match(wake, /if \(active\) start\(\)/);
});
