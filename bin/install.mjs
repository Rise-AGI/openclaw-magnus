#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as p from "@clack/prompts";

// ── helpers ──────────────────────────────────────────────────────────────────

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "inherit" });
    return true;
  } catch {
    return false;
  }
}

function runCapture(cmd, args) {
  try {
    return execFileSync(cmd, args, { stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

function openclaw(...args) {
  return run("openclaw", args);
}

function checkOpenclaw() {
  return runCapture("openclaw", ["--version"]) !== null;
}

function checkMagnusPython() {
  if (runCapture("magnus", ["--version"]) !== null) return true;
  if (runCapture("python", ["-m", "magnus", "--version"]) !== null) return true;
  if (runCapture("pip", ["show", "magnus"]) !== null) return true;
  if (runCapture("pip3", ["show", "magnus"]) !== null) return true;
  return false;
}

function checkMagnusSkill() {
  const agentsSkillPath = join(homedir(), ".agents", "skills", "magnus", "SKILL.md");
  const openclawSkillPath = join(homedir(), ".openclaw", "skills", "magnus");
  return existsSync(agentsSkillPath) || existsSync(openclawSkillPath);
}

async function fetchSkillMd() {
  const url =
    "https://gh-proxy.com/raw.githubusercontent.com/Rise-AGI/magnus/refs/heads/main/sdks/python/src/magnus/bundled/skills/magnus/SKILL.md";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching SKILL.md`);
  return resp.text();
}

function installMagnusSkill(skillContent) {
  const skillDir = join(homedir(), ".agents", "skills", "magnus");
  const skillFile = join(skillDir, "SKILL.md");
  const symlinkDir = join(homedir(), ".openclaw", "skills");
  const symlinkPath = join(symlinkDir, "magnus");

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(skillFile, skillContent, "utf8");

  mkdirSync(symlinkDir, { recursive: true });
  if (!existsSync(symlinkPath)) {
    try {
      symlinkSync(skillDir, symlinkPath);
    } catch {
      // Symlink failure is non-fatal
    }
  }
}

function installMagnusSdk() {
  if (runCapture("uv", ["--version"]) !== null) {
    return run("uv", ["tool", "install", "magnus"]);
  }
  if (runCapture("pip3", ["--version"]) !== null) {
    return run("pip3", ["install", "--upgrade", "magnus"]);
  }
  return run("pip", ["install", "--upgrade", "magnus"]);
}

// ── main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (command !== "install") {
  console.error(`Usage: openclaw-magnus install`);
  process.exit(1);
}

p.intro("OpenClaw Magnus 安装向导");

// 1. Check openclaw is available
if (!checkOpenclaw()) {
  p.cancel(
    "未找到 openclaw CLI。请先安装 OpenClaw：\n  npm install -g openclaw\n  或访问 https://openclaw.dev"
  );
  process.exit(1);
}

// 2. Install the plugin
const installSpinner = p.spinner();
installSpinner.start("正在安装 openclaw-magnus 插件…");
const installed = openclaw("plugins", "install", "openclaw-magnus");
if (!installed) {
  installSpinner.stop("插件安装失败", 1);
  p.cancel("请手动运行：openclaw plugins install openclaw-magnus");
  process.exit(1);
}
installSpinner.stop("插件安装成功");

// 3. Prompt for appSecret
const appSecret = await p.text({
  message: "请输入 App Secret（从 Magnus 人事页面创建 Agent 后获取）",
  placeholder: "your-app-secret",
  validate(value) {
    if (!value.trim()) return "App Secret 不能为空";
  },
});
if (p.isCancel(appSecret)) {
  p.cancel("已取消");
  process.exit(0);
}

// 4. Prompt for magnusUrl
const magnusUrl = await p.text({
  message: "请输入 Magnus 服务器地址",
  placeholder: "https://your-magnus-server",
  validate(value) {
    if (!value.trim()) return "Magnus 地址不能为空";
    if (!/^https?:\/\/.+/.test(value.trim())) return "请输入有效的 URL（以 http:// 或 https:// 开头）";
  },
});
if (p.isCancel(magnusUrl)) {
  p.cancel("已取消");
  process.exit(0);
}

// 5. Apply config
const configSpinner = p.spinner();
configSpinner.start("正在写入配置…");

const ok1 = openclaw("config", "set", "channels.magnus.appSecret", appSecret.trim());
const ok2 = openclaw("config", "set", "channels.magnus.magnusUrl", magnusUrl.trim());

if (!ok1 || !ok2) {
  configSpinner.stop("配置写入失败", 1);
  p.cancel(
    "请手动运行：\n" +
    `  openclaw config set channels.magnus.appSecret "${appSecret.trim()}"\n` +
    `  openclaw config set channels.magnus.magnusUrl "${magnusUrl.trim()}"`
  );
  process.exit(1);
}
configSpinner.stop("配置写入成功");

// 6. Check Magnus Python SDK
const hasMagnusSdk = checkMagnusPython();
if (!hasMagnusSdk) {
  const installSdk = await p.confirm({
    message: "未检测到 Magnus Python SDK，是否现在安装？",
    initialValue: true,
  });
  if (p.isCancel(installSdk)) { p.cancel("已取消"); process.exit(0); }

  if (installSdk) {
    const sdkSpinner = p.spinner();
    sdkSpinner.start("正在安装 Magnus Python SDK…");
    const sdkOk = installMagnusSdk();
    if (sdkOk) {
      sdkSpinner.stop("Magnus Python SDK 安装成功");
    } else {
      sdkSpinner.stop("自动安装失败", 1);
      p.log.warn("请手动安装：pip install magnus  或  uv tool install magnus");
    }
  }
} else {
  p.log.success("Magnus Python SDK 已安装");
}

// 7. Check Magnus skill
const hasMagnusSkill = checkMagnusSkill();
if (!hasMagnusSkill) {
  const installSkill = await p.confirm({
    message: "未检测到 Magnus skill，是否从官方仓库下载并安装？",
    initialValue: true,
  });
  if (p.isCancel(installSkill)) { p.cancel("已取消"); process.exit(0); }

  if (installSkill) {
    const skillSpinner = p.spinner();
    skillSpinner.start("正在下载 Magnus skill…");
    try {
      const skillContent = await fetchSkillMd();
      installMagnusSkill(skillContent);
      skillSpinner.stop("Magnus skill 安装成功（~/.agents/skills/magnus/SKILL.md）");
    } catch (err) {
      skillSpinner.stop("Skill 下载失败", 1);
      p.log.warn(`请手动安装 skill：${String(err)}`);
    }
  }
} else {
  p.log.success("Magnus skill 已安装");
}

// 8. Remind user about magnus login
p.log.info("请运行以下命令完成 Magnus 令牌配置：\n  magnus login");

p.outro("Magnus 接入配置完成！运行 openclaw start 启动机器人。");
