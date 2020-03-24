import cp from "child_process";
import fs from "fs";
import path from "path";
import util from "util";
import assert from "assert";
import dashdash from "dashdash";
import chokidar from "chokidar";
import chalk from "chalk";

/*
 Another nodemon wannabe
*/

import cp from "child_process";
import chokidar from "chokidar";
import path from "path";
import chalk from "chalk";

const exec = path.resolve(__dirname + "/bin/www.js");

const ignored = ["public", ".git", ".idea", "package.json", "dev-server.js", "node_modules"];

const absouluteIgnored = ignored.map(function(item) {
  return "^" + path.resolve(__dirname + "/" + item);
});

const joined = absouluteIgnored.join("|");
const rgx = new RegExp("(" + joined + ")");

console.log("\n", chalk.cyan(" => Ignored paths => "));
absouluteIgnored.forEach(function(p) {
  console.log(chalk.grey(p));
});

const watcher = chokidar.watch(__dirname, {
  ignored: rgx,
  persistent: true,
  ignoreInitial: true
});

watcher.once("ready", function() {
  console.log("\n", chalk.magenta(" => watched files => "));
  const watched = watcher.getWatched();
  Object.keys(watched).forEach(function(k) {
    const values = watched[k];
    values.forEach(function(p) {
      console.log(chalk.grey(path.resolve(k + "/" + p)));
    });
  });

  const launch = () => {
    let spawner: cp.ChildProcessWithoutNullStreams = cp.spawn("node", [exec], {
      env: Object.assign({}, process.env, {
        // your values here
      })
    });

    spawner.on("error", (err: any) => {
      console.log(" => Server error => ", err.stack || err);
    });

    spawner.stdout.setEncoding("utf8");
    spawner.stderr.setEncoding("utf8");
    spawner.stdout.pipe(process.stdout);
    spawner.stderr.pipe(process.stderr);

    return spawner;
  };

  let childProcess = launch();

  const killAndRestart = () => {
    childProcess.once("close", function() {
      childProcess.removeAllListeners();
      childProcess.unref();
      setTimeout(() => {
        childProcess = launch();
        console.log(" => New process pid => ", childProcess.pid);
      }, 300);
    });
    childProcess.kill("SIGINT");
  };

  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function(d) {
    if (String(d).trim() === "rs") {
      console.log(" => relaunching dev server");
      killAndRestart();
    }
  });

  watcher.on("add", path => {
    console.log(" => watched file added => ", path);
    console.log(" => restarting server");
    killAndRestart();
  });

  watcher.on("change", path => {
    console.log(" => watched file changed => ", path);
    console.log(" => restarting server");
    killAndRestart();
  });
});
