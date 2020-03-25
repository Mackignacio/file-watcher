import cp from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import assert from "assert";
import dashdash from "dashdash";
import chokidar from "chokidar";
import chalk from "chalk";

const appName = "fileWatcher";

const cwd = process.cwd();

const options = [
  {
    name: "version",
    type: "bool",
    help: "Print tool version and exit.",
  },
  {
    names: ["help", "h"],
    type: "bool",
    help: "Print the help information and exit.",
  },
  {
    names: ["verbosity", "v"],
    type: "integer",
    help: "Verbosity level => {1, 2, or 3}; the higher, the more verbose; default is 2.",
  },
  {
    names: ["process-args"],
    type: "string",
    help: "These args are directly passed to your running process, your should surround with quotes like so: " + '--process-args="--foo bar --baz bam".',
  },
  {
    names: ["process-log-path", "log"],
    type: "string",
    help: "Instead of logging your process stdout/stderr to the terminal, it will send stdout/stderr to this log file.",
  },
  {
    names: ["restart-upon-change", "restart-upon-changes", "ruc"],
    type: "bool",
    help: `${appName} will restart your process upon file changes.`,
  },
  {
    names: ["restart-upon-addition", "restart-upon-additions", "rua"],
    type: "bool",
    help: `${appName} will restart your process upon file additions.`,
  },
  {
    names: ["restart-upon-unlink", "restart-upon-unlinks", "ruu"],
    type: "bool",
    help: `${appName} will restart your process upon file deletions/unlinking.`,
  },
  {
    names: ["exec"],
    type: "string",
    help: "Relative or absolute path of the file you wish to execute (and re-execute on changes).",
  },
  {
    names: ["include"],
    type: "arrayOfString",
    help: "Include these paths (array of regex and/or strings).",
  },
  {
    names: ["exclude"],
    type: "arrayOfString",
    help: "Exclude these paths (array of regex and/or strings).",
  },
  {
    names: ["signal", "s"],
    type: "string",
    help: 'The --signal option is one of {"SIGINT","SIGTERM","SIGKILL"}.',
  },
];

const parser = dashdash.createParser({ options: options });

const parseOptions = (parser: any) => {
  try {
    return parser.parse(process.argv);
  } catch (e) {
    console.error(`[${appName}]: error: %s`, e.message);
    process.exit(1);
  }
};

const opts = parseOptions(parser);

if (opts.help) {
  const help = parser.help({ includeEnv: true }).trimRight();
  console.log("\n");
  console.log("usage: fileWatcher [OPTIONS]\n\n" + "options:\n" + help + "\n\n");
  process.exit(0);
}

if (opts._args.length > 0) {
  throw new Error(" => [fileWatcher] => You supplied too many arguments (should be zero) => " + chalk.bgCyan.black.bold(JSON.stringify(opts._args)));
}
