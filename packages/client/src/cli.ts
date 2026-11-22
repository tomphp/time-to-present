#!/usr/bin/env node
import { ttp } from "./ttp.js";

process.exitCode = ttp(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
