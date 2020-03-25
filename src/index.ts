import cp from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import assert from "assert";
import dashdash from "dashdash";
import chokidar from "chokidar";
import chalk from "chalk";

const appName = "fileWatcher";

const options = [
  {
    name: "version",
    type: "bool",
    help: "Print tool version and exit."
  },
  {
    names: ["help", "h"],
    type: "bool",
    help: "Print the help information and exit."
  },
  {
    names: ["verbosity", "v"],
    type: "integer",
    help: "Verbosity level => {1, 2, or 3}; the higher, the more verbose; default is 2."
  },
  {
    names: ["process-args"],
    type: "string",
    help: "These args are directly passed to your running process, your should surround with quotes like so: " + '--process-args="--foo bar --baz bam".'
  },
  {
    names: ["process-log-path", "log"],
    type: "string",
    help: "Instead of logging your process stdout/stderr to the terminal, it will send stdout/stderr to this log file."
  },
  {
    names: ["restart-upon-change", "restart-upon-changes", "ruc"],
    type: "bool",
    help: `${appName} will restart your process upon file changes.`
  },
  {
    names: ["restart-upon-addition", "restart-upon-additions", "rua"],
    type: "bool",
    help: `${appName} will restart your process upon file additions.`
  },
  {
    names: ["restart-upon-unlink", "restart-upon-unlinks", "ruu"],
    type: "bool",
    help: `${appName} will restart your process upon file deletions/unlinking.`
  },
  {
    names: ["exec"],
    type: "string",
    help: "Relative or absolute path of the file you wish to execute (and re-execute on changes)."
  },
  {
    names: ["include"],
    type: "arrayOfString",
    help: "Include these paths (array of regex and/or strings)."
  },
  {
    names: ["exclude"],
    type: "arrayOfString",
    help: "Exclude these paths (array of regex and/or strings)."
  },
  {
    names: ["signal", "s"],
    type: "string",
    help: 'The --signal option is one of {"SIGINT","SIGTERM","SIGKILL"}.'
  }
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

const findSubRoot = (pathStr: string, subPath: string): string => {
  if (subPath === pathStr) {
    return null;
  } else {
    return findRootDir(subPath);
  }
};

const findRootDir = (pathStr: string): string => {
  const possiblePkgDotJsonPath = path.resolve(String(pathStr) + "/package.json");

  try {
    fs.statSync(possiblePkgDotJsonPath).isFile();
    return pathStr;
  } catch (err) {
    const subPath = path.resolve(String(pathStr) + "/../");
    return findSubRoot(pathStr, subPath);
  }
};

const cwd = process.cwd();

const checkProjectRoot = (projRoot: string, opts: any) => {
  if (!projRoot) {
    throw new Error("Could not find project root given cwd => " + cwd);
  } else {
    if (opts.verbosity > 1) {
      console.log("\n");
      console.log(chalk.cyan.bold.underline(" => fileWatcher considers the following to be your project root => "), chalk.cyan('"' + projRoot + '"'));
    }
  }
};

const projectRoot = findRootDir(cwd);
checkProjectRoot(projectRoot, opts);

const getAbsolutePath = (pathStr: string, projectRoot: string): string => {
  return path.isAbsolute(pathStr) ? pathStr : path.resolve(projectRoot + "/" + pathStr);
};

const defaults = {
  verbosity: 2,
  signal: "SIGKILL",
  processArgs: [],
  restartUponChange: true,
  restartUponAddition: false,
  restartUponUnlink: false,
  include: projectRoot,
  exclude: [/node_modules/, /public/, /bower_components/, /.git/, /.idea/, /package.json/, /test/]
};

const checkWatcherConfig = (projectRoot: string) => {
  try {
    const watcherConfig = require(projectRoot + "/fileWatcher.conf.js");
    if (watcherConfig.processLogPath) {
      watcherConfig.processLogPath = getAbsolutePath(watcherConfig.processLogPath, projectRoot);
    }

    if (watcherConfig.exec) {
      watcherConfig.exec = getAbsolutePath(watcherConfig.exec, projectRoot);
    }
    return watcherConfig;
  } catch (err) {
    return {};
  }
};

const fileWatcherConfig = checkWatcherConfig(projectRoot);

const buildOverrideOptions = (opts: any, rootDir: string) => {
  let overrideOpts: any;
  if (opts.exec) {
    overrideOpts.exec = getAbsolutePath(opts.exec, rootDir);
  } else if (!fileWatcherConfig.exec) {
    throw new Error(
      ' => fileWatcher needs an "exec" file to run!\nYou can specify one with "exec" in your ' +
        'fileWatcher.conf.js file or you can pass one at the command line with the "--exec" option'
    );
  }

  if (opts.process_log_path) {
    overrideOpts.processLogPath = getAbsolutePath(opts.process_log_path, rootDir);
  }

  if (opts.signal) {
    overrideOpts.signal = String(opts.signal).trim();
    assert(
      ["SIGINT", "SIGTERM", "SIGKILL"].indexOf(String(overrideOpts.signal).trim()) > -1,
      ' => Value passed as "signal" ' + 'option needs to be one of {"SIGINT","SIGTERM","SIGKILL"},\nyou passed => "' + overrideOpts.signal + '".'
    );
  }

  if (opts.include) {
    overrideOpts.include = opts.include;
  }

  if (opts.exclude) {
    overrideOpts.exclude = opts.exclude;
  }

  if (opts.process_args) {
    if (Array.isArray(opts.process_args)) {
      overrideOpts.processArgs = opts.process_args;
    } else if (typeof opts.process_args === "string") {
      overrideOpts.processArgs = String(opts.process_args)
        .trim()
        .split(/\s+/);
    } else {
      throw new Error(' => "processArgs" needs to be either an array or string.');
    }
  }

  if ("restart_upon_change" in opts) {
    overrideOpts.restartUponChange = opts.restart_upon_change;
  }

  if ("restart_upon_addition" in opts) {
    overrideOpts.restartUponAddition = opts.restart_upon_addition;
  }

  if ("restart_upon_unlink" in opts) {
    overrideOpts.restartUponUnlink = opts.restart_upon_unlink;
  }

  if (opts.verbosity) {
    overrideOpts.verbosity = opts.verbosity;
  }
};

const override = buildOverrideOptions(opts, projectRoot);
const watcherConfig = Object.assign(defaults, fileWatcherConfig, override);

let success = false;

const getStream = (config: any, force: boolean = false) => {
  if (force || success) {
    return fs.createWriteStream(config.processLogPath, { autoClose: true }).once("error", function(err) {
      console.error("\n");
      console.error(chalk.red.bold(err.message));
      console.log(
        ' => You may have accidentally used a path for "exec" or "processLogPath" that begins with "/" => \n' +
          ' if your relative path begins with "/" then you should remove that.'
      );
      throw err;
    });
  }
};

let stream: fs.WriteStream;

if (watcherConfig.processLogPath) {
  try {
    stream = getStream(watcherConfig, true);
    success = true;
    if (watcherConfig.verbosity > 1) {
      console.log(" => Your process stdout/stderr will be sent to the log file at path =>", "\n", watcherConfig.processLogPath);
    }
  } catch (err) {
    console.error(err.message);
    console.log(
      ' => You may have accidentally used an absolute path for "exec" or "processLogPath",\n' +
        'if your relative path begins with "/" then you should remove that.'
    );
  }
}

const checkExec = (config: any) => {
  try {
    if (!fs.statSync(config.exec).isFile()) {
      throw ' => "exec" option value is not a file';
    }
  } catch (err) {
    throw err;
  }
};

const checkVerbosity = (verbosity: number) => {
  if (verbosity > 1) {
    const message = `=> Here is your combined fileWatcher configuration given (1) fileWatcher defaults (2) fileWatcher.conf.js and (3) your command line arguments => `;
    console.log("\n");
    console.log(chalk.green.bold(message));
    console.log(chalk.green(util.inspect(watcherConfig)));
    return true;
  }
  return false;
};

const checkExclude = (isVerbose: boolean, exclude: string[]) => {
  if (isVerbose) {
    console.log("\n", chalk.cyan(" => fileWatcher will ignore paths that match any of the following => "));
    exclude.forEach(message => {
      console.log("=> ", chalk.grey(message));
    });
  }
};

checkExec(watcherConfig);

const flatten = <T>(array: T[]): T[] => array.reduce((a: any, b: any) => a.concat(b), []);

const isVerbose = checkVerbosity(watcherConfig.verbosity);
const exclude = flatten<string>(watcherConfig.exclude);

checkExclude(isVerbose, exclude);

const joined = exclude.join("|");
const ignored = new RegExp("(" + joined + ")");
const include = flatten<string>(watcherConfig.include);
const watcher = chokidar.watch(include, { ignored, persistent: true, ignoreInitial: true });

const launch = (first: boolean, watcherConfig: any, stream?: fs.WriteStream) => {
  const { verbosity, exec, processArgs } = watcherConfig;
  if (first && verbosity > 1) {
    console.log(chalk.cyan(" => [fileWatcher] => fileWatcher is now starting your process...and will restart " + "your process upon file changes."), "\n");
    console.log(
      ' => [fileWatcher] => Your process will be launced with the following command => "' +
        watcherConfig.exec +
        " " +
        watcherConfig.processArgs.join(" ") +
        '"',
      "\n"
    );
  }

  if (!first) {
    console.log(chalk.black.bold(" => [fileWatcher] => fileWatcher is re-starting your process..."));
  }

  stream = getStream(watcherConfig);

  const childProcess: cp.ChildProcessWithoutNullStreams = cp.spawn(exec, processArgs);

  if (verbosity > 1 && first) {
    console.log(" => [fileWatcher] => Your process is running with pid => ", childProcess.pid);
  }

  if (verbosity > 1 && first && !stream) {
    console.log(" => [fileWatcher] => What follows is the stdout/stderr of your process => ", "\n");
  }

  return { childProcess, stream, bool: false };
};

const childProcessHandler = (childProcess: cp.ChildProcessWithoutNullStreams) => {
  childProcess.on("error", (err: any) => {
    console.log(" => Server error => ", err.stack || err);
  });

  childProcess.once("close", (code: number) => {
    if (!childProcess.killed) {
      console.log(
        chalk.magenta.bold(` => [fileWatcher] => looks like your process crashed (with code ${code}),\n 
        ...waiting for file changes before restarting.`)
      );
    }
  });

  childProcess.stdout.setEncoding("utf8");
  childProcess.stderr.setEncoding("utf8");
  childProcess.stdout.pipe(stream || process.stdout, { end: true });
  childProcess.stderr.pipe(stream || process.stderr, { end: true });
  childProcess.stderr.on("data", d => {
    if (String(d).match(/error/i)) {
      const stck = String(d)
        .split("\n")
        .filter((s, index) => {
          return index < 3 || (!String(s).match(/\/node_modules\//) && String(s).match(/\//));
        });
      const joined = stck.join("\n");
      console.error("\n");
      console.error(chalk.bgRed.white(" => captured stderr from your process => "));
      console.error(chalk.red.bold(joined));
      console.log("\n");
    }
  });
};

watcher.once("ready", () => {});
