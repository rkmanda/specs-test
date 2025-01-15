// @ts-check

const path = require("path");
const util = require("./util.js");
const { readFile } = require("fs/promises");

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context, core }) => {
  // - Adds the label "rp-service-new" if the PR represents a new resource provider service
  // - Adds the label "rp-service-existing" if the PR represents an existing resource provider service
  // - The first PR for a new resource provider service will still go thru the usual manual review process.
  // - There are 2 cases that this logic needs to factor in to determine if the PR is for a new RP service:
  //   - PR introduces a new RP namespace 
  //        Example: PR has this specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  //                 and the target branch does not have specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
  //   - PR introduces a new service underneath an existing RP namespace
  //        Example: PR has this specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/contosoGroup1/preview/2021-10-01-preview/contoso.json
  //                 and the target branch does not have specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/contosoGroup1

  if (await isExistingResourceProviderService(core)) {
    await util.addLabelIfNotExists(github, context, core, "rp-service-existing");
    await util.removeLabelIfExists(github, context, core, "rp-service-new");
  } else {
    await util.addLabelIfNotExists(github, context, core, "rp-service-new");
    await util.removeLabelIfExists(github, context, core, "rp-service-existing");
  }
};

/**
 * @param {string} file
 * @returns {Promise<boolean>} True if the spec folder exists in the target branch
 */
async function specFolderExistsInTargetBranch(file) {
  // Example1: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  // Example2: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/contosoGroup1/preview/2021-10-01-preview/contoso.json

  return await util.group(
    `specFolderExistsInTargetBranch("${file}")`,
    async () => {
      // Example1: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
      // Example2: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/contosoGroup1
      const specDir = path.dirname(path.dirname(path.dirname(file)));
      console.log(`specDir: ${specDir}`);

      const lsTree = await util.execRoot(`git ls-tree HEAD^ ${specDir}`);

      // Command "git ls-tree" returns a nonempty string if the folder exists in the target branch
      const result = Boolean(lsTree);
      console.log(`returning: ${result}`);
      return result;
    }
  );
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if PR introduces a new RP service, false if its an existing RP service
 */
async function isExistingResourceProviderService(core) {
  return await util.group(
    `isExistingResourceProviderService()`,
    async () => {
      const changedSwaggerFiles = await util.getChangedSwaggerFiles(
        core,
        "HEAD^",
        "HEAD",
        ""
      );
      const changedRmFiles = changedSwaggerFiles.filter((f) =>
        f.includes("/resource-manager/")
      );

      console.log(
        `Changed files containing path '/resource-manager/': ${changedRmFiles}`
      );

      if (changedRmFiles.length == 0) {
        console.log(
          "No changes to swagger files containing path '/resource-manager/'"
        );
        return false;
      } else {
        for (const file of changedRmFiles) {
          if (!(await specFolderExistsInTargetBranch(file))) {
            console.log(`Appears to add atleast one new Resource Provider service: ${file}`);
            return false;
          }
        }
        console.log("Appears to change an existing Resource Prvider service, but adds no new Resource Provider services");
        return true;
      }
    }
  );
}
