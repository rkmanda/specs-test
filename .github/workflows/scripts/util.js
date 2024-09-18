// @ts-check

const { execSync } = require("child_process");

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function addLabel(github, context, core, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  core.notice(`Adding label '${name}'`);

  // TODO: Add caching in front of GH Rest API calls
  await github.rest.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    labels: [name],
  });
}

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

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function hasLabel(github, context, core, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  // TODO: Add caching in front of GH Rest API calls
  const { data: labels } = await github.rest.issues.listLabelsOnIssue({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
  });
  const labelNames = labels.map((l) => l.name);
  core.info(`Labels: ${labelNames}`);

  return labelNames.some((n) => n == name);
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function removeLabelIfExists(github, context, core, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  core.notice(`Removing label '${name}' if exists`);

  try {
    // TODO: Add caching in front of GH Rest API calls
    await github.rest.issues.removeLabel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      name: name,
    });
  } catch (error) {
    /** @type {import("@octokit/request-error").RequestError} */
    const requestError = error;

    if (requestError.status == 404) {
      // Label does not exist
    } else {
      throw error;
    }
  }
}

module.exports = {
  addLabel,
  execSyncRoot,
  getChangedSwaggerFiles,
  hasLabel,
  removeLabelIfExists,
};
