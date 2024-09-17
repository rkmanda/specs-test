// @ts-check

const { execSync } = require("child_process");

/**
 * @param {string} [baseCommitish="HEAD^"] Defaults to "HEAD^".
 * @param {string} [targetCommitish="HEAD"] Defaults to "HEAD".
 * @param {string} [diffFilter="d"] Defaults to "d".
 * @returns {string[]}
 */
function getChangedSwaggerFiles(
  baseCommitish = "HEAD^",
  targetCommitish = "HEAD",
  diffFilter = "d"
) {
  const command =
    `pwsh -command ". ./eng/scripts/ChangedFiles-Functions.ps1; ` +
    `Get-ChangedSwaggerFiles (Get-ChangedFiles ${baseCommitish} ${targetCommitish} ${diffFilter})"`;
  var result = execSyncRoot(command);
  return result.trim().split("\n");
}

/**
 * @param {string} command
 */
function execSyncRoot(command) {
  return execSync(command, {
    encoding: "utf8",
    cwd: process.env.GITHUB_WORKSPACE,
  });
}

module.exports = { getChangedSwaggerFiles };
