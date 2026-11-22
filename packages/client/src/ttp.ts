import { parseArgs } from "node:util";
import { eventJson, eventLines } from "./event-list.js";
import { loadPresentation } from "./presentation-file.js";
import { resolveScript, type ResolvedScript } from "./presentation-script.js";
import { scriptText, scriptTextWithEvents } from "./script-text.js";

export interface Terminal {
  cwd: string;
  out(text: string): void;
  err(text: string): void;
}

const EXIT = { ok: 0, unreadable: 1, usage: 2 } as const;

const usage = `usage: ttp <command> [path] [options]

Reads the Script of a Presentation from its presentation.json: the one at [path], a
Presentation folder or a presentation.json file, else the first found searching up from
the current folder.

Commands:
  text [path] [--events]   print the Script Text, the Words as plain prose
  events [path] [--json]   print every Named Event in firing order

Run ttp <command> --help for more.
`;

/** A command with its one boolean option, such as `text --events`. */
interface Command {
  option: string;
  help: string;
  print(script: ResolvedScript, withOption: boolean): string;
}

const commands: Record<string, Command> = {
  text: {
    option: "events",
    help: `usage: ttp text [path] [--events]

Prints the Script Text: the Words of the Script as plain prose, with a new line where
the Script has a line break and a blank line where it has a paragraph break.

  --events   mark each Named Event as [name data] just before the Word it is anchored
             to, or at the very start for one anchored to the start of the Script
`,
    print: (script, events) => (events ? scriptTextWithEvents(script) : scriptText(script)),
  },
  events: {
    option: "json",
    help: `usage: ttp events [path] [--json]

Prints every Named Event in firing order, one per line: its Script Time as m:ss.mmm,
its name, its data as compact JSON (left out when it has none) and its anchor Word.

  --json   print them as a JSON array of {id, name, data, scriptTime}, the NamedEvent
           shape a SimulatedScript takes
`,
    print: (script, json) => (json ? eventJson(script) : eventLines(script)),
  },
};

function parse(command: Command, args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: { [command.option]: { type: "boolean" }, help: { type: "boolean", short: "h" } },
    });
  } catch (error) {
    return (error as Error).message;
  }
}

/** Runs `ttp` with `args`, writing to the terminal, and returns its exit code. */
export function ttp(args: string[], terminal: Terminal): number {
  const usageError = (message: string, help = usage) => {
    terminal.err(`ttp: ${message}\n\n${help}`);
    return EXIT.usage;
  };
  const [name, ...rest] = args;
  if (name === undefined || name === "--help" || name === "-h") {
    terminal.out(usage);
    return EXIT.ok;
  }
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) return usageError(`unknown command ${JSON.stringify(name)}`);

  const parsed = parse(command, rest);
  if (typeof parsed === "string") return usageError(parsed, command.help);
  if (parsed.values.help) {
    terminal.out(command.help);
    return EXIT.ok;
  }
  if (parsed.positionals.length > 1) return usageError(`too many arguments: ${parsed.positionals.join(" ")}`, command.help);

  const file = loadPresentation(terminal.cwd, parsed.positionals[0]);
  if (!file.ok) {
    terminal.err(`ttp: ${file.message}\n`);
    return EXIT.unreadable;
  }
  terminal.out(command.print(resolveScript(file.script), parsed.values[command.option] === true));
  return EXIT.ok;
}
