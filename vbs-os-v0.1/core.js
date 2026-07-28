export class NorFabric {
  constructor(registerCount = 128) {
    this.registerCount = registerCount;
    this.wires = new Uint8Array(registerCount * 6 + 256);
    this.gates = [];
    this.inputBase = 0;
    this.qBase = registerCount * 2;
    this.nqBase = registerCount * 3;
    this.derivedBase = registerCount * 4;
    this._buildLatches();
  }

  nor(a, b, out, label = "NOR") {
    this.gates.push({ a, b, out, label });
    return out;
  }

  not(a, out, label = "NOT") {
    return this.nor(a, a, out, label);
  }

  _buildLatches() {
    for (let i = 0; i < this.registerCount; i++) {
      const s = this.inputBase + i * 2;
      const r = s + 1;
      const q = this.qBase + i;
      const nq = this.nqBase + i;
      this.nor(r, nq, q, `R${i}.Q`);
      this.nor(s, q, nq, `R${i}.NQ`);
    }
  }

  settle(maxRounds = 32) {
    let rounds = 0;
    for (; rounds < maxRounds; rounds++) {
      let changed = false;
      for (const g of this.gates) {
        const next = (this.wires[g.a] || this.wires[g.b]) ? 0 : 1;
        if (this.wires[g.out] !== next) {
          this.wires[g.out] = next;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return rounds + 1;
  }

  clearInputs() {
    this.wires.fill(0, this.inputBase, this.qBase);
  }

  setRegister(index, value) {
    if (index < 0 || index >= this.registerCount) return;
    const s = this.inputBase + index * 2;
    const r = s + 1;
    this.wires[s] = value ? 1 : 0;
    this.wires[r] = value ? 0 : 1;
    this.settle();
    this.wires[s] = 0;
    this.wires[r] = 0;
    this.settle();
  }

  toggle(index) {
    this.setRegister(index, this.getRegister(index) ? 0 : 1);
  }

  getRegister(index) {
    return this.wires[this.qBase + index] ? 1 : 0;
  }

  setByte(byteIndex, value) {
    const v = value & 255;
    for (let bit = 0; bit < 8; bit++) {
      this.setRegister(byteIndex * 8 + bit, (v >> bit) & 1);
    }
  }

  getByte(byteIndex) {
    let v = 0;
    for (let bit = 0; bit < 8; bit++) v |= this.getRegister(byteIndex * 8 + bit) << bit;
    return v;
  }

  setBytes(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < Math.ceil(this.registerCount / 8); i++) {
      const v = arr[i] ?? 0;
      for (let bit = 0; bit < 8; bit++) {
        const idx = i * 8 + bit;
        if (idx < this.registerCount) {
          this.wires[this.qBase + idx] = (v >> bit) & 1;
          this.wires[this.nqBase + idx] = ((v >> bit) & 1) ? 0 : 1;
        }
      }
    }
    this.clearInputs();
    this.settle();
  }

  getBytes() {
    const out = new Uint8Array(Math.ceil(this.registerCount / 8));
    for (let i = 0; i < out.length; i++) out[i] = this.getByte(i);
    return out;
  }

  snapshot(start = 0, count = 32) {
    const bits = [];
    for (let i = start; i < Math.min(this.registerCount, start + count); i++) bits.push(this.getRegister(i));
    return bits;
  }
}

export class CapabilityPolicy {
  constructor() {
    this.grants = new Map();
  }

  install(pid, requested = []) {
    const allowed = new Set(["fabric:read", "fabric:write", "storage:local", "ipc", "touch"]);
    this.grants.set(pid, new Set(requested.filter(x => allowed.has(x))));
  }

  allows(pid, capability) {
    return this.grants.get(pid)?.has(capability) ?? false;
  }

  revoke(pid) {
    this.grants.delete(pid);
  }
}

export class IPCBus {
  constructor(trace) {
    this.queues = new Map();
    this.trace = trace;
  }

  register(pid) {
    if (!this.queues.has(pid)) this.queues.set(pid, []);
  }

  unregister(pid) {
    this.queues.delete(pid);
  }

  send(from, to, type, payload = {}) {
    if (!this.queues.has(to)) return false;
    this.queues.get(to).push({ from, to, type, payload, at: Date.now() });
    this.trace?.(`ipc ${from} → ${to}: ${type}`);
    return true;
  }

  broadcast(from, pids, type, payload = {}) {
    for (const pid of pids) if (pid !== from) this.send(from, pid, type, payload);
  }

  drain(pid, limit = 16) {
    const q = this.queues.get(pid) || [];
    return q.splice(0, limit);
  }
}

export class ProcessManager {
  constructor({ fabric, policy, ipc, trace }) {
    this.fabric = fabric;
    this.policy = policy;
    this.ipc = ipc;
    this.trace = trace;
    this.processes = new Map();
    this.nextPid = 100;
    this.runQueue = [];
    this.cursor = 0;
  }

  spawn(descriptor) {
    const pid = this.nextPid++;
    const process = {
      pid,
      appId: descriptor.id,
      name: descriptor.name,
      type: descriptor.type,
      icon: descriptor.icon || "◻",
      state: JSON.parse(JSON.stringify(descriptor.initialState || {})),
      requestedCapabilities: [...(descriptor.capabilities || [])],
      status: "running",
      ticks: 0,
      cpu: 0,
      window: { x: 40 + ((pid * 37) % 220), y: 70 + ((pid * 19) % 100), w: 420, h: 360, minimized: false },
      descriptor
    };
    this.processes.set(pid, process);
    this.runQueue.push(pid);
    this.policy.install(pid, process.requestedCapabilities);
    this.ipc.register(pid);
    this.trace?.(`spawn pid ${pid} ${process.name}`);
    return process;
  }

  kill(pid) {
    const p = this.processes.get(pid);
    if (!p) return false;
    p.status = "stopped";
    this.processes.delete(pid);
    this.runQueue = this.runQueue.filter(x => x !== pid);
    this.policy.revoke(pid);
    this.ipc.unregister(pid);
    this.trace?.(`kill pid ${pid} ${p.name}`);
    return true;
  }

  list() {
    return [...this.processes.values()];
  }

  get(pid) {
    return this.processes.get(pid);
  }

  tick() {
    if (!this.runQueue.length) return null;
    this.cursor %= this.runQueue.length;
    const pid = this.runQueue[this.cursor++];
    const p = this.processes.get(pid);
    if (!p || p.status !== "running") return null;

    p.ticks++;
    p.cpu = Math.min(99, 2 + ((p.ticks * 11 + p.pid) % 21));
    const messages = this.ipc.drain(pid);

    if (messages.length) {
      p.state.lastMessage = messages[messages.length - 1];
      p.state.messageCount = (p.state.messageCount || 0) + messages.length;
    }

    if (typeof p.descriptor.onTick === "function") {
      p.descriptor.onTick({ process: p, fabric: this.fabric, policy: this.policy, ipc: this.ipc, messages });
    }
    return p;
  }
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(v => v.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export function hexToBytes(text, byteCount = 16) {
  const clean = String(text).replace(/[^0-9a-f]/gi, "");
  if (clean.length < byteCount * 2) throw new Error(`Boot seed needs ${byteCount} bytes.`);
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
