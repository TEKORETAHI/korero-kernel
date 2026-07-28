export function buildAppCatalog() {
  return [
    {
      id: "world",
      name: "World",
      type: "world",
      icon: "◆",
      capabilities: ["fabric:read", "fabric:write", "ipc", "touch", "storage:local"],
      initialState: { x: 1, y: 1, collected: [], completed: false },
      onTick({ process, fabric }) {
        process.state.heartbeat = (process.state.heartbeat || 0) + 1;
        if (process.state.completed) fabric.setRegister(96, 1);
      }
    },
    {
      id: "booking",
      name: "Booking",
      type: "booking",
      icon: "▦",
      capabilities: ["fabric:read", "fabric:write", "ipc", "touch", "storage:local"],
      initialState: { slots: [0, 0, 0, 0], changes: 0 },
      onTick({ process, fabric }) {
        const count = process.state.slots.filter(Boolean).length;
        for (let i = 0; i < 3; i++) fabric.setRegister(80 + i, (count >> i) & 1);
      }
    },
    {
      id: "course",
      name: "Course",
      type: "course",
      icon: "◫",
      capabilities: ["fabric:read", "fabric:write", "ipc", "touch", "storage:local"],
      initialState: { lesson: 0, score: 0, completed: false },
      onTick({ process, fabric }) {
        fabric.setRegister(88, process.state.completed ? 1 : 0);
      }
    },
    {
      id: "control",
      name: "Control",
      type: "control",
      icon: "⌘",
      capabilities: ["fabric:read", "fabric:write", "ipc", "touch"],
      initialState: { channels: [0, 0, 0, 0], pulse: 0 },
      onTick({ process }) {
        process.state.pulse = (process.state.pulse + 1) % 1000;
      }
    },
    {
      id: "monitor",
      name: "System Monitor",
      type: "monitor",
      icon: "◎",
      capabilities: ["fabric:read", "ipc", "touch"],
      initialState: { tab: "processes" }
    }
  ];
}
