// @ts-check

const { execSync } = require("child_process");

/**
 * @param {string} command
 */
function execSyncRoot(command) {
  // TODO: Handle errors
  return execSync(command, {
    encoding: "utf8",
    cwd: process.env.GITHUB_WORKSPACE,
  });
}

/**
 * @param {string} [baseCommitish] Defaults to "HEAD^".
 * @param {string} [targetCommitish] Defaults to "HEAD".
 * @param {string} [diffFilter] Defaults to "d".
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

module.exports = { execSyncRoot, getChangedSwaggerFiles };
