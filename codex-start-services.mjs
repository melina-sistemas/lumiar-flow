import { spawn } from "node:child_process";
import path from "node:path";

const root = "C:\\Users\\melina.abreu\\Documents\\Codex\\2026-04-20-quero-criar-um-sistema-web-interno";
const nodeExe = "C:\\Program Files\\nodejs\\node.exe";
const webDir = path.join(root, "apps", "web");
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const apiDir = root;

function launch(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

const apiPid = launch(nodeExe, ["apps\\api\\src\\server.js"], apiDir);
const webPid = launch(nodeExe, [viteBin, "--port", "3000", "--host", "0.0.0.0"], webDir);

console.log(JSON.stringify({ apiPid, webPid }));
