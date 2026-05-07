import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_GAME_SECONDS = 12 * 60;
const DEFAULT_SHOT_SECONDS = 24;
const DEFAULT_TIMEOUTS = 5;
const HOTKEY_STORAGE_KEY = "basketball-scoreboard-hotkeys-v4";
const RESERVED_HORN_HOTKEY = "Space";

const ACTION_DEFINITIONS = [
  { id: "quarterPrev", label: "Previous Quarter", category: "Quarter" },
  { id: "quarterNext", label: "Next Quarter", category: "Quarter" },
  { id: "clockStart", label: "Start Clock", category: "Game Clock" },
  { id: "clockPause", label: "Pause Clock", category: "Game Clock" },
  { id: "clockReset", label: "Reset Game Clock", category: "Game Clock" },
  { id: "shot24", label: "Shot Clock 24", category: "Shot Clock" },
  { id: "shot14", label: "Shot Clock 14", category: "Shot Clock" },
  { id: "shot0", label: "Shot Clock 0", category: "Shot Clock" },
  { id: "homeScorePlus1", label: "Home +1", category: "Home Team" },
  { id: "homeScorePlus2", label: "Home +2", category: "Home Team" },
  { id: "homeScorePlus3", label: "Home +3", category: "Home Team" },
  { id: "homeScoreMinus1", label: "Home -1", category: "Home Team" },
  { id: "homeScoreMinus2", label: "Home -2", category: "Home Team" },
  { id: "homeScoreMinus3", label: "Home -3", category: "Home Team" },
  { id: "homeFoulMinus", label: "Home Foul -", category: "Home Team" },
  { id: "homeFoulPlus", label: "Home Foul +", category: "Home Team" },
  { id: "homeTimeoutUse", label: "Home Use Timeout", category: "Home Team" },
  { id: "homeTimeoutAdd", label: "Home Add Timeout", category: "Home Team" },
  { id: "awayScorePlus1", label: "Away +1", category: "Away Team" },
  { id: "awayScorePlus2", label: "Away +2", category: "Away Team" },
  { id: "awayScorePlus3", label: "Away +3", category: "Away Team" },
  { id: "awayScoreMinus1", label: "Away -1", category: "Away Team" },
  { id: "awayScoreMinus2", label: "Away -2", category: "Away Team" },
  { id: "awayScoreMinus3", label: "Away -3", category: "Away Team" },
  { id: "awayFoulMinus", label: "Away Foul -", category: "Away Team" },
  { id: "awayFoulPlus", label: "Away Foul +", category: "Away Team" },
  { id: "awayTimeoutUse", label: "Away Use Timeout", category: "Away Team" },
  { id: "awayTimeoutAdd", label: "Away Add Timeout", category: "Away Team" },
  { id: "customTimeSet", label: "Set Custom Time", category: "Game Actions" },
  { id: "resetShotClock", label: "Reset Shot Clock", category: "Game Actions" },
  { id: "endQuarter", label: "End Quarter", category: "Game Actions" },
  { id: "resetEverything", label: "Reset Everything", category: "Game Actions" },
] as const;

type ActionDefinition = (typeof ACTION_DEFINITIONS)[number];
type ActionId = ActionDefinition["id"];
type HotkeyMap = Partial<Record<ActionId, string>>;
type TeamSide = "home" | "away";

type Team = {
  name: string;
  score: number;
  fouls: number;
  timeouts: number;
};

type KeyCombo = {
  id: string;
  label: string;
};

type HornGraph = {
  context: AudioContext;
  input: GainNode;
  filter: BiquadFilterNode;
  master: GainNode;
};

const DEFAULT_HOTKEYS: HotkeyMap = {
  quarterPrev: "ArrowLeft",
  quarterNext: "ArrowRight",
  clockStart: "Enter",
  clockPause: "KeyP",
  clockReset: "Ctrl+KeyR",
  shot24: "KeyZ",
  shot14: "KeyX",
  shot0: "KeyC",
  homeScorePlus1: "KeyQ",
  homeScorePlus2: "KeyW",
  homeScorePlus3: "KeyE",
  homeScoreMinus1: "KeyA",
  homeScoreMinus2: "KeyS",
  homeScoreMinus3: "KeyD",
  awayScorePlus1: "KeyU",
  awayScorePlus2: "KeyI",
  awayScorePlus3: "KeyO",
  awayScoreMinus1: "KeyJ",
  awayScoreMinus2: "KeyK",
  awayScoreMinus3: "KeyL",
  resetShotClock: "KeyM",
  endQuarter: "KeyN",
  resetEverything: "Ctrl+Shift+KeyR",
};

const createTeam = (name: string): Team => ({
  name,
  score: 0,
  fouls: 0,
  timeouts: DEFAULT_TIMEOUTS,
});

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const formatClock = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
};

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

const codeToLabel = (code: string) => {
  const labels: Record<string, string> = {
    Space: "Space",
    Enter: "Enter",
    Escape: "Esc",
    Backspace: "Backspace",
    Tab: "Tab",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Backquote: "`",
  };

  if (labels[code]) return labels[code];
  if (code.startsWith("Key")) return code.replace("Key", "");
  if (code.startsWith("Digit")) return code.replace("Digit", "");
  if (code.startsWith("Numpad")) return `Num ${code.replace("Numpad", "")}`;

  return code;
};

const comboToLabel = (combo?: string | null) => {
  if (!combo) return "Unassigned";

  return combo
    .split("+")
    .map((part) => {
      if (["Ctrl", "Alt", "Shift", "Meta"].includes(part)) return part;
      return codeToLabel(part);
    })
    .join(" + ");
};

const readComboFromEvent = (event: KeyboardEvent): KeyCombo | null => {
  const modifierOnlyCodes = new Set([
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
  ]);

  if (modifierOnlyCodes.has(event.code)) return null;

  const parts: string[] = [];

  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  parts.push(event.code);

  const id = parts.join("+");

  return {
    id,
    label: comboToLabel(id),
  };
};

const loadStoredHotkeys = (): HotkeyMap => {
  if (typeof window === "undefined") return DEFAULT_HOTKEYS;

  try {
    const saved = window.localStorage.getItem(HOTKEY_STORAGE_KEY);

    if (!saved) return DEFAULT_HOTKEYS;

    const parsed = JSON.parse(saved) as HotkeyMap;

    return {
      ...DEFAULT_HOTKEYS,
      ...parsed,
    };
  } catch {
    return DEFAULT_HOTKEYS;
  }
};

function App() {
  const [home, setHome] = useState<Team>(() => createTeam("HOME"));
  const [away, setAway] = useState<Team>(() => createTeam("AWAY"));
  const [quarter, setQuarter] = useState(1);
  const [gameSeconds, setGameSeconds] = useState(DEFAULT_GAME_SECONDS);
  const [shotSeconds, setShotSeconds] = useState(DEFAULT_SHOT_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [customMinutes, setCustomMinutes] = useState("12");
  const [customSeconds, setCustomSeconds] = useState("00");
  const [isHornActive, setIsHornActive] = useState(false);
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => loadStoredHotkeys());
  const [recordingActionId, setRecordingActionId] = useState<ActionId | null>(null);
  const [hotkeyNotice, setHotkeyNotice] = useState(
    "Click Change, then press your desired key combination."
  );

  const hornGraphRef = useRef<HornGraph | null>(null);
  const hornOscillatorsRef = useRef<OscillatorNode[]>([]);
  const hornRunningRef = useRef(false);
  const spacePressedRef = useRef(false);
  const hasPlayedGameEndHornRef = useRef(false);
  const hasPlayedShotEndHornRef = useRef(false);

  const createHornGraph = useCallback((): HornGraph | null => {
    if (hornGraphRef.current) {
      return hornGraphRef.current;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    const context = new AudioContextClass();

    const input = context.createGain();
    const filter = context.createBiquadFilter();
    const master = context.createGain();

    input.gain.value = 0;

    filter.type = "lowpass";
    filter.frequency.value = 3200;
    filter.Q.value = 1.1;

    master.gain.value = 0.95;

    input.connect(filter);
    filter.connect(master);
    master.connect(context.destination);

    const graph: HornGraph = {
      context,
      input,
      filter,
      master,
    };

    hornGraphRef.current = graph;

    return graph;
  }, []);

  const startHorn = useCallback(async () => {
    if (hornRunningRef.current) return;

    const graph = createHornGraph();

    if (!graph) return;

    if (graph.context.state === "suspended") {
      await graph.context.resume().catch(() => undefined);
    }

    hornRunningRef.current = true;
    setIsHornActive(true);

    const now = graph.context.currentTime;

    graph.input.gain.cancelScheduledValues(now);
    graph.input.gain.setValueAtTime(0.0001, now);
    graph.input.gain.exponentialRampToValueAtTime(0.9, now + 0.035);

    const osc1 = graph.context.createOscillator();
    const osc2 = graph.context.createOscillator();
    const osc3 = graph.context.createOscillator();

    osc1.type = "sawtooth";
    osc2.type = "square";
    osc3.type = "sawtooth";

    osc1.frequency.setValueAtTime(120, now);
    osc2.frequency.setValueAtTime(240, now);
    osc3.frequency.setValueAtTime(180, now);

    osc1.detune.setValueAtTime(-8, now);
    osc2.detune.setValueAtTime(6, now);
    osc3.detune.setValueAtTime(3, now);

    osc1.connect(graph.input);
    osc2.connect(graph.input);
    osc3.connect(graph.input);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    hornOscillatorsRef.current = [osc1, osc2, osc3];
  }, [createHornGraph]);

  const stopHorn = useCallback(() => {
    if (!hornRunningRef.current) return;

    const graph = hornGraphRef.current;

    if (!graph) return;

    hornRunningRef.current = false;
    setIsHornActive(false);

    const now = graph.context.currentTime;

    graph.input.gain.cancelScheduledValues(now);
    graph.input.gain.setTargetAtTime(0.0001, now, 0.03);

    hornOscillatorsRef.current.forEach((oscillator) => {
      try {
        oscillator.stop(now + 0.08);
      } catch {
        // Ignore if already stopped.
      }
    });

    window.setTimeout(() => {
      hornOscillatorsRef.current.forEach((oscillator) => {
        try {
          oscillator.disconnect();
        } catch {
          // Ignore if already disconnected.
        }
      });

      hornOscillatorsRef.current = [];
    }, 300);
  }, []);

  const playHornOnce = useCallback(async () => {
    const graph = createHornGraph();

    if (!graph) return;

    if (graph.context.state === "suspended") {
      await graph.context.resume().catch(() => undefined);
    }

    const now = graph.context.currentTime;
    const oneShotGain = graph.context.createGain();

    oneShotGain.gain.setValueAtTime(0.0001, now);
    oneShotGain.gain.exponentialRampToValueAtTime(0.86, now + 0.025);
    oneShotGain.gain.setTargetAtTime(0.0001, now + 0.28, 0.035);

    const osc1 = graph.context.createOscillator();
    const osc2 = graph.context.createOscillator();
    const osc3 = graph.context.createOscillator();

    osc1.type = "sawtooth";
    osc2.type = "square";
    osc3.type = "sawtooth";

    osc1.frequency.setValueAtTime(120, now);
    osc2.frequency.setValueAtTime(240, now);
    osc3.frequency.setValueAtTime(180, now);

    osc1.detune.setValueAtTime(-8, now);
    osc2.detune.setValueAtTime(6, now);
    osc3.detune.setValueAtTime(3, now);

    osc1.connect(oneShotGain);
    osc2.connect(oneShotGain);
    osc3.connect(oneShotGain);

    oneShotGain.connect(graph.filter);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    osc1.stop(now + 0.42);
    osc2.stop(now + 0.42);
    osc3.stop(now + 0.42);

    window.setTimeout(() => {
      try {
        osc1.disconnect();
        osc2.disconnect();
        osc3.disconnect();
        oneShotGain.disconnect();
      } catch {
        // Ignore cleanup errors.
      }
    }, 700);
  }, [createHornGraph]);

  useEffect(() => {
    return () => {
      stopHorn();
      void hornGraphRef.current?.context.close();
    };
  }, [stopHorn]);

  useEffect(() => {
    window.localStorage.setItem(HOTKEY_STORAGE_KEY, JSON.stringify(hotkeys));
  }, [hotkeys]);

  const updateTeam = useCallback((side: TeamSide, updater: (team: Team) => Team) => {
    if (side === "home") {
      setHome((team) => updater(team));
    } else {
      setAway((team) => updater(team));
    }
  }, []);

  const setTeamName = useCallback(
    (side: TeamSide, name: string) => {
      updateTeam(side, (team) => ({
        ...team,
        name: name.toUpperCase(),
      }));
    },
    [updateTeam]
  );

  const adjustScore = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        score: Math.max(0, team.score + amount),
      }));
    },
    [updateTeam]
  );

  const adjustFouls = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        fouls: Math.max(0, team.fouls + amount),
      }));
    },
    [updateTeam]
  );

  const adjustTimeouts = useCallback(
    (side: TeamSide, amount: number) => {
      updateTeam(side, (team) => ({
        ...team,
        timeouts: Math.max(0, team.timeouts + amount),
      }));
    },
    [updateTeam]
  );

  const resetGameClock = useCallback(() => {
    setIsRunning(false);
    setGameSeconds(DEFAULT_GAME_SECONDS);
    setCustomMinutes("12");
    setCustomSeconds("00");
  }, []);

  const applyCustomTime = useCallback(() => {
    const minutes = clamp(Number(customMinutes) || 0, 0, 99);
    const seconds = clamp(Number(customSeconds) || 0, 0, 59);

    setIsRunning(false);
    setGameSeconds(minutes * 60 + seconds);
    setCustomMinutes(minutes.toString());
    setCustomSeconds(seconds.toString().padStart(2, "0"));
  }, [customMinutes, customSeconds]);

  const endQuarter = useCallback(() => {
    setIsRunning(false);
    setGameSeconds(DEFAULT_GAME_SECONDS);
    setShotSeconds(DEFAULT_SHOT_SECONDS);
    setQuarter((current) => Math.min(4, current + 1));
  }, []);

  const resetEverything = useCallback(() => {
    const shouldReset = window.confirm("Reset the entire scoreboard?");

    if (!shouldReset) return;

    setIsRunning(false);
    setHome(createTeam("HOME"));
    setAway(createTeam("AWAY"));
    setQuarter(1);
    setGameSeconds(DEFAULT_GAME_SECONDS);
    setShotSeconds(DEFAULT_SHOT_SECONDS);
    setCustomMinutes("12");
    setCustomSeconds("00");
    stopHorn();
  }, [stopHorn]);

  const executeAction = useCallback(
    (actionId: ActionId) => {
      switch (actionId) {
        case "quarterPrev":
          setQuarter((current) => Math.max(1, current - 1));
          break;

        case "quarterNext":
          setQuarter((current) => Math.min(4, current + 1));
          break;

        case "clockStart":
          if (gameSeconds > 0) setIsRunning(true);
          break;

        case "clockPause":
          setIsRunning(false);
          break;

        case "clockReset":
          resetGameClock();
          break;

        case "shot24":
          setShotSeconds(24);
          break;

        case "shot14":
          setShotSeconds(14);
          break;

        case "shot0":
          setShotSeconds(0);
          break;

        case "homeScorePlus1":
          adjustScore("home", 1);
          break;

        case "homeScorePlus2":
          adjustScore("home", 2);
          break;

        case "homeScorePlus3":
          adjustScore("home", 3);
          break;

        case "homeScoreMinus1":
          adjustScore("home", -1);
          break;

        case "homeScoreMinus2":
          adjustScore("home", -2);
          break;

        case "homeScoreMinus3":
          adjustScore("home", -3);
          break;

        case "homeFoulMinus":
          adjustFouls("home", -1);
          break;

        case "homeFoulPlus":
          adjustFouls("home", 1);
          break;

        case "homeTimeoutUse":
          adjustTimeouts("home", -1);
          break;

        case "homeTimeoutAdd":
          adjustTimeouts("home", 1);
          break;

        case "awayScorePlus1":
          adjustScore("away", 1);
          break;

        case "awayScorePlus2":
          adjustScore("away", 2);
          break;

        case "awayScorePlus3":
          adjustScore("away", 3);
          break;

        case "awayScoreMinus1":
          adjustScore("away", -1);
          break;

        case "awayScoreMinus2":
          adjustScore("away", -2);
          break;

        case "awayScoreMinus3":
          adjustScore("away", -3);
          break;

        case "awayFoulMinus":
          adjustFouls("away", -1);
          break;

        case "awayFoulPlus":
          adjustFouls("away", 1);
          break;

        case "awayTimeoutUse":
          adjustTimeouts("away", -1);
          break;

        case "awayTimeoutAdd":
          adjustTimeouts("away", 1);
          break;

        case "customTimeSet":
          applyCustomTime();
          break;

        case "resetShotClock":
          setShotSeconds(DEFAULT_SHOT_SECONDS);
          break;

        case "endQuarter":
          endQuarter();
          break;

        case "resetEverything":
          resetEverything();
          break;
      }
    },
    [
      adjustFouls,
      adjustScore,
      adjustTimeouts,
      applyCustomTime,
      endQuarter,
      gameSeconds,
      resetEverything,
      resetGameClock,
    ]
  );

  const assignHotkey = useCallback((actionId: ActionId, combo: KeyCombo) => {
    const action = ACTION_DEFINITIONS.find((item) => item.id === actionId);

    if (combo.id === RESERVED_HORN_HOTKEY) {
      setHotkeyNotice("Space is reserved for the long horn only.");
      setRecordingActionId(null);
      return;
    }

    setHotkeys((current) => {
      const next: HotkeyMap = { ...current };

      ACTION_DEFINITIONS.forEach((item) => {
        if (next[item.id] === combo.id && item.id !== actionId) {
          delete next[item.id];
        }
      });

      next[actionId] = combo.id;

      return next;
    });

    setHotkeyNotice(`${action?.label ?? "Action"} hotkey set to ${combo.label}.`);
    setRecordingActionId(null);
  }, []);

  const clearHotkey = useCallback((actionId: ActionId) => {
    const action = ACTION_DEFINITIONS.find((item) => item.id === actionId);

    setHotkeys((current) => {
      const next = { ...current };
      delete next[actionId];
      return next;
    });

    setHotkeyNotice(`${action?.label ?? "Action"} hotkey cleared.`);
  }, []);

  const resetHotkeys = useCallback(() => {
    setHotkeys(DEFAULT_HOTKEYS);
    setHotkeyNotice("Hotkeys restored to the default layout.");
  }, []);

  const hotkeyLookup = useMemo(() => {
    const lookup = new Map<string, ActionId>();

    ACTION_DEFINITIONS.forEach((action) => {
      const combo = hotkeys[action.id];

      if (combo) {
        lookup.set(combo, action.id);
      }
    });

    return lookup;
  }, [hotkeys]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (recordingActionId) {
        const combo = readComboFromEvent(event);

        if (!combo) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        assignHotkey(recordingActionId, combo);
        return;
      }

      if (event.code === RESERVED_HORN_HOTKEY && !isTypingTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        if (spacePressedRef.current || event.repeat) return;

        spacePressedRef.current = true;
        void startHorn();
        return;
      }

      if (isTypingTarget(event.target) || event.repeat) return;

      const combo = readComboFromEvent(event);

      if (!combo) return;

      const actionId = hotkeyLookup.get(combo.id);

      if (!actionId) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      executeAction(actionId);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== RESERVED_HORN_HOTKEY || isTypingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      spacePressedRef.current = false;
      stopHorn();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [assignHotkey, executeAction, hotkeyLookup, recordingActionId, startHorn, stopHorn]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(() => {
      setGameSeconds((current) => {
        if (current <= 1) {
          if (!hasPlayedGameEndHornRef.current) {
            hasPlayedGameEndHornRef.current = true;
            void playHornOnce();
          }

          setIsRunning(false);
          return 0;
        }

        return current - 1;
      });

      setShotSeconds((current) => {
        if (current <= 1) {
          if (!hasPlayedShotEndHornRef.current) {
            hasPlayedShotEndHornRef.current = true;
            void playHornOnce();
          }

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, playHornOnce]);

  useEffect(() => {
    if (gameSeconds > 0) {
      hasPlayedGameEndHornRef.current = false;
    }
  }, [gameSeconds]);

  useEffect(() => {
    if (shotSeconds > 0) {
      hasPlayedShotEndHornRef.current = false;
    }
  }, [shotSeconds]);

  const leadingTeam = useMemo(() => {
    if (home.score === away.score) return "TIE GAME";

    return home.score > away.score ? `${home.name} LEADS` : `${away.name} LEADS`;
  }, [away.name, away.score, home.name, home.score]);

  const actionsByCategory = useMemo(() => {
    return ACTION_DEFINITIONS.reduce<Record<string, ActionDefinition[]>>((groups, action) => {
      groups[action.category] = groups[action.category] ?? [];
      groups[action.category].push(action);
      return groups;
    }, {});
  }, []);

  const ActionButton = ({
    actionId,
    children,
    className = "",
    disabled = false,
  }: {
    actionId: ActionId;
    children: ReactNode;
    className?: string;
    disabled?: boolean;
  }) => {
    const hotkey = hotkeys[actionId];

    return (
      <button
        className={`action-button ${className}`}
        onClick={() => executeAction(actionId)}
        disabled={disabled}
      >
        <span>{children}</span>
        {hotkey ? <kbd>{comboToLabel(hotkey)}</kbd> : null}
      </button>
    );
  };

  const renderTeamPanel = (side: TeamSide, team: Team) => {
    const isHome = side === "home";
    const prefix = isHome ? "home" : "away";

    return (
      <section className={`team-card ${isHome ? "home-card" : "away-card"}`}>
        <input
          className="team-name-input"
          aria-label={`${isHome ? "Home" : "Away"} team name`}
          value={team.name}
          maxLength={18}
          onChange={(event) => setTeamName(side, event.target.value)}
        />

        <div className="score-display" aria-label={`${team.name} score`}>
          {team.score}
        </div>

        <div className="score-buttons" aria-label={`${team.name} score controls`}>
          <ActionButton actionId={`${prefix}ScorePlus1` as ActionId}>+1</ActionButton>
          <ActionButton actionId={`${prefix}ScorePlus2` as ActionId}>+2</ActionButton>
          <ActionButton actionId={`${prefix}ScorePlus3` as ActionId}>+3</ActionButton>

          <ActionButton actionId={`${prefix}ScoreMinus1` as ActionId} className="danger">
            -1
          </ActionButton>

          <ActionButton actionId={`${prefix}ScoreMinus2` as ActionId} className="danger">
            -2
          </ActionButton>

          <ActionButton actionId={`${prefix}ScoreMinus3` as ActionId} className="danger">
            -3
          </ActionButton>
        </div>

        <div className="team-stat-grid">
          <div className="stat-card">
            <span>Fouls</span>
            <strong>{team.fouls}</strong>

            <div className="mini-controls">
              <ActionButton actionId={`${prefix}FoulMinus` as ActionId}>-</ActionButton>
              <ActionButton actionId={`${prefix}FoulPlus` as ActionId}>+</ActionButton>
            </div>
          </div>

          <div className="stat-card">
            <span>Timeouts</span>
            <strong>{team.timeouts}</strong>

            <div className="mini-controls">
              <ActionButton actionId={`${prefix}TimeoutUse` as ActionId}>Use</ActionButton>
              <ActionButton actionId={`${prefix}TimeoutAdd` as ActionId}>Add</ActionButton>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <main className="scoreboard-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Basketball Scoreboard</p>
          <h1>Game Control Center</h1>
        </div>

        <div className={`status-pill ${isRunning ? "live" : "paused"}`}>
          {isRunning ? "LIVE" : "PAUSED"}
        </div>
      </header>

      <section className="center-board">
        <div className="quarter-box">
          <span>Quarter</span>
          <strong>Q{quarter}</strong>

          <div className="quarter-controls">
            <ActionButton actionId="quarterPrev">Prev</ActionButton>
            <ActionButton actionId="quarterNext">Next</ActionButton>
          </div>
        </div>

        <div className="clock-box">
          <span>Game Clock</span>

          <strong className={gameSeconds <= 10 ? "critical" : ""}>
            {formatClock(gameSeconds)}
          </strong>

          <div className="clock-controls">
            <ActionButton actionId="clockStart" className="primary" disabled={gameSeconds === 0}>
              Start
            </ActionButton>

            <ActionButton actionId="clockPause">Pause</ActionButton>
            <ActionButton actionId="clockReset">Reset</ActionButton>
          </div>
        </div>

        <div className="shot-box">
          <span>Shot Clock</span>
          <strong className={shotSeconds <= 5 ? "critical" : ""}>{shotSeconds}</strong>

          <div className="shot-controls">
            <ActionButton actionId="shot24">24</ActionButton>
            <ActionButton actionId="shot14">14</ActionButton>
            <ActionButton actionId="shot0">0</ActionButton>
          </div>
        </div>
      </section>

      <p className="lead-indicator">{leadingTeam}</p>

      <section className="teams-layout">
        {renderTeamPanel("home", home)}
        {renderTeamPanel("away", away)}
      </section>

      <section className="control-desk">
        <div className="custom-time-card">
          <h2>Custom Game Clock</h2>

          <div className="custom-time-inputs">
            <label>
              <span>Minutes</span>
              <input
                type="number"
                min="0"
                max="99"
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
              />
            </label>

            <label>
              <span>Seconds</span>
              <input
                type="number"
                min="0"
                max="59"
                value={customSeconds}
                onChange={(event) => setCustomSeconds(event.target.value)}
              />
            </label>

            <ActionButton actionId="customTimeSet">Set Time</ActionButton>
          </div>
        </div>

        <div className="horn-card">
          <h2>Horn / Buzzer</h2>

          <div className="horn-buttons">
            <button
              className={`horn-button long ${isHornActive ? "active" : ""}`}
              type="button"
              onMouseDown={() => void startHorn()}
              onMouseUp={stopHorn}
              onMouseLeave={stopHorn}
              onTouchStart={(event) => {
                event.preventDefault();
                void startHorn();
              }}
              onTouchEnd={stopHorn}
              onTouchCancel={stopHorn}
            >
              {isHornActive ? "BUZZING..." : "LONG HORN"}
              <kbd>Hold / Space</kbd>
            </button>
          </div>
        </div>

        <div className="game-actions-card">
          <h2>Game Actions</h2>

          <div className="game-actions">
            <ActionButton actionId="resetShotClock">Reset Shot Clock</ActionButton>
            <ActionButton actionId="endQuarter">End Quarter</ActionButton>

            <ActionButton actionId="resetEverything" className="reset-button">
              Reset Everything
            </ActionButton>
          </div>
        </div>
      </section>

      <section className="hotkeys-card">
        <details open>
          <summary>
            <span>Custom Hotkeys</span>
            <small>Long Horn is fixed to Space</small>
          </summary>

          <div className="hotkey-toolbar">
            <p>{recordingActionId ? "Press the new key combination now." : hotkeyNotice}</p>
            <button onClick={resetHotkeys}>Restore Default Hotkeys</button>
          </div>

          <div className="hotkey-groups">
            {Object.keys(actionsByCategory).map((category) => {
              const actions = actionsByCategory[category];

              return (
                <div className="hotkey-group" key={category}>
                  <h3>{category}</h3>

                  <div className="hotkey-list">
                    {actions.map((action) => {
                      const isRecording = recordingActionId === action.id;

                      return (
                        <div className="hotkey-row" key={action.id}>
                          <span>{action.label}</span>

                          <kbd>{isRecording ? "Press key..." : comboToLabel(hotkeys[action.id])}</kbd>

                          <div>
                            <button
                              className={isRecording ? "recording" : ""}
                              onClick={() => {
                                setRecordingActionId(action.id);
                                setHotkeyNotice(
                                  `${action.label}: press any key combination. Space is reserved for the long horn.`
                                );
                              }}
                            >
                              {isRecording ? "Listening" : "Change"}
                            </button>

                            <button onClick={() => clearHotkey(action.id)}>Clear</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </section>
    </main>
  );
}

export default App;