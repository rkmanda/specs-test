// @ts-check

const path = require("path");
const util = require("./util.js");
const { readFile } = require("fs/promises");

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context, core }) => {
  // If all the following conditions are true, apply label "ARMAutoSignoff".  Else, remove label.
  // - PR has label "ARMReview" - indicating this is an ARM review PR
  // - PR does *not* have label "NotReadForARMReview" - indicating this PR is ready for ARM review
  // - PR has label "ARMBestPractices" - indicating this PR follows ARM best practices
  // - PR has label "rp-existing" - indicating this PR represents incremental changes to an existing resource provider
  // - PR has label "typespec-incremental" - indicating this PR represents incremental changes to an TypeSpec implementation
  // - Authors self-attest the adherence to design best practices that are not automated.
  // - The swagger-lintdiff required check is passing for the PR
  // - If the PR has a SuppressionReviewRequired label, it must also have the Suppression-Approved label.
  
  if (
    (await util.hasLabel(github, context, "ARMReview")) &&
    !(await util.hasLabel(github, context, "NotReadyForARMReview")) &&
    (await util.hasLabel(github, context, "ARMBestPractices")) &&
    (await util.hasLabel(github, context, "typespec-incremental")) &&
    (await util.hasLabel(github, context, "rp-service-existing")) 
  ) {

    if (await util.hasLabel(github, context, "SuppressionReviewRequired"))
    {
      if (!(await util.hasLabel(github, context, "Suppression-Approved")))
      {
        await util.removeLabelIfExists(github, context, core, "ARMAutoSignedOff");
        return;
      }  
    }
    await util.addLabelIfNotExists(github, context, core, "ARMAutoSignedOff");
  } else {
    await util.removeLabelIfExists(github, context, core, "ARMAutoSignedOff");
  }
};

/**
 * @param {string} file
 * @returns {Promise<boolean>} True if the spec folder exists in the target branch
 */
async function specFolderExistsInTargetBranch(file) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  return await util.group(
    `specFolderExistsInTargetBranch("${file}")`,
    async () => {
      // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
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
 * @returns {Promise<boolean>} True if PR contains changes to existing RPs, and no new RPs
 */
async function incrementalChangesToExistingResourceProvider(core) {
  return await util.group(
    `incrementalChangesToExistingResourceProvider()`,
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
            console.log(`Appears to add a new RP: ${file}`);
            return false;
          }
        }
        console.log("Appears to change an existing RPs, but adds no new RPs");
        return true;
      }
    }
  );
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if PR contains a conversion to TypeSpec
 */
async function typespecConversion(core) {
  return await util.group(`typespecConversion()`, async () => {
    const changedSwaggerFiles = await util.getChangedSwaggerFiles(
      core,
      "HEAD^",
      "HEAD",
      "d"
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
    }

    let changedSwaggerTypeSpecGenerated = false;

    for (const file of changedRmFiles) {
      const swagger = await readFile(
        path.join(process.env.GITHUB_WORKSPACE || "", file),
        { encoding: "utf8" }
      );
      const swaggerObj = JSON.parse(swagger);
      if (swaggerObj["info"] && swaggerObj["info"]["x-typespec-generated"]) {
        console.log(`File "${file}" contains "info.x-typespec-generated"`);
        changedSwaggerTypeSpecGenerated = true;
      }
    }

    console.log(`returning: ${changedSwaggerTypeSpecGenerated}`);
    return changedSwaggerTypeSpecGenerated;
  });
}
