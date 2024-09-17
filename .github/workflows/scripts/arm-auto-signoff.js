// @ts-check

const { getChangedSwaggerFiles } = require('./changedfiles-functions');

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context }) => {
  const changedSwaggerFiles = getChangedSwaggerFiles("HEAD^", "HEAD", "");
  console.log(changedSwaggerFiles);

  await github.rest.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request?.number,
    labels: ["ARMAutoSignoff"],
  });
};
