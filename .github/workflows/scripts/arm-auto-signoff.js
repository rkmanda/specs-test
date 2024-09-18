// @ts-check

const path = require("path");
const { execSyncRoot, getChangedSwaggerFiles } = require("./util.js");

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context, core }) => {
  // If all the following conditions are true, apply label "ARMAutoSignoff".  Else, remove label.
  // - PR has label "ARMReview"
  // - PR represents incremental changes to an existing resource provider
  //   - The first PR for a new resource provider will still go thru the usual manual review process.
  // - All required checks are passing
  // - No swagger lintdiff suppressions are applied to the PR
  //   - If any suppressions are applied to these PRs, they will go thru a manual approval process because applying suppressions indicates that some of the mandatory guidelines are attempted to be violated.
  // - Authors self-attest the adherence to design best practices that are not automated.
  // - Not a conversion to TypeSpec

  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }


  const changedSwaggerFiles = getChangedSwaggerFiles("HEAD^", "HEAD", "");
  const changedRmFiles = changedSwaggerFiles.filter((f) =>
    f.includes("/resource-manager/")
  );

  // PR represents incremental changes to an existing resource provider
  if (changedRmFiles.length == 0) {
    return;
  }
  if (changedRmFiles.some((f) => !specFolderExistsInTargetBranch(f))) {
    return;
  }

  if (await hasLabel(github, context, "ARMReview")) {
    await addLabel(github, context, "ARMAutoSignedOff");
  }
  else {
    await removeLabel(github, context, "ARMAutoSignedOff");
  }
};

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {string} name
 */
async function hasLabel(github, context, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  // TODO: Add caching in front of GH Rest API calls
  const { data: labels } = await github.rest.issues.listLabelsOnIssue({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
  });
  return labels.some(l => l.name == name)
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {string} name
 */
async function addLabel(github, context, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  // TODO: Add caching in front of GH Rest API calls
  return await github.rest.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    labels: [name],
  });
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {string} name
 */
async function removeLabel(github, context, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  // TODO: Add caching in front of GH Rest API calls
  return await github.rest.issues.removeLabel({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    name: name,
  });
}

/**
 * @param {string} file
 * @returns {boolean} Returns true if the spec folder exists in the target branch
 */
function specFolderExistsInTargetBranch(file) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json

  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
  const specDir = path.dirname(path.dirname(path.dirname(file)));

  // Command "git ls-tree" returns a nonempty string if the folder exists in the target branch
  return Boolean(execSyncRoot(`git ls-tree HEAD^ ${specDir}`));
}
