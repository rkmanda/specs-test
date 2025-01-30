// @ts-check
// This check detects whether TypeSpec is being introduced for the first time for a resource provider service and adds the appropriate label to the PR.

const path = require("path");
const util = require("./util.js");
const fs = require('fs');
const { readFile, writeFile, mkdtemp } = require("fs/promises");
const os = require("os");

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context, core }) => {

  // This check adds a label "typespec-new", if the PR has atleast one Open API spec that is generated from TypeSpec and there are no Open API specs generated from TypeSpec in the target branch for the same service.
  // If there are Open API specs generated from TypeSpec in the target branch for the same service, then the check adds a label "typespec-incremental".
  // If there are no Open API specs in the PR or if the Open API specs in the PR are not generated from TypeSpec, then the check adds a label "typespec-noop".
  

  // Logic to add the typespec-noop label if there are no changes to files containing path '/resource-manager/'
  const changedRmFiles = await getChangedSwaggerFilesForResouceProvider(core);
  if (changedRmFiles.length == 0) {
    console.log(
      "No changes to files containing path '/resource-manager/'"
    );
    await util.addLabelIfNotExists(github, context, core, "typespec-noop");
    await util.removeLabelIfExists(github, context, core, "typespec-new");
    await util.removeLabelIfExists(github, context, core, "typespec-incremental");
    core.setOutput("typespec-label", "typespec-noop");
    return;
  }

  // Logic to add the typespec-noop label if there are changes to files containing path '/resource-manager/' but the Open API specs are not generated from TypeSpec
  if (!await areChangesGeneratedFromTypeSpec(changedRmFiles)) {
    console.log("Changes dont contain any Open API specs that are generated from TypeSpec.");
    await util.addLabelIfNotExists(github, context, core, "typespec-noop");
    await util.removeLabelIfExists(github, context, core, "typespec-new");
    await util.removeLabelIfExists(github, context, core, "typespec-incremental");
    core.setOutput("typespec-label", "typespec-noop");
    return;
  }

  // Logic to add the typespec-new or typespec-incremental label based on whether the PR is the first time TypeSpec generated Open API spec files are being introduced for the service
  if ((await isFirstTypeSpecPRForRPService(changedRmFiles))) {
    await util.addLabelIfNotExists(github, context, core, "typespec-new");
    await util.removeLabelIfExists(github, context, core, "typespec-incremental");  
    await util.removeLabelIfExists(github, context, core, "typespec-noop");  
    core.setOutput("typespec-label", "typespec-new");
  } else {
    await util.addLabelIfNotExists(github, context, core, "typespec-incremental");
    await util.removeLabelIfExists(github, context, core, "typespec-new");  
    await util.removeLabelIfExists(github, context, core, "typespec-noop");  
    core.setOutput("typespec-label", "typespec-incremental");
  }
};

/**
 * @param {string} file
 * @returns {Promise<boolean>} True if the provided file exists in the target branch
 */
async function fileExistsInTargetBranch(file) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  return await util.group(
    `fileExistsInTargetBranch("${file}")`,
    async () => {
      // Get the service folder path from the provided file path
      // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
      const specDir = path.dirname(path.dirname(path.dirname(file)));
      console.log(`specDir: ${specDir}`);

      // Command "git ls-tree -r HEAD^ --name-only ${specDir} | grep ${file}" returns a nonempty string if a file with the name exists under the folder in the target branch
      const fileExists = await util.execRoot(`git ls-tree -r HEAD^ --name-only ${specDir} | grep ${file}`);

      const result = Boolean(fileExists);
      console.log(`returning from fileExistsInTargetBranch: ${result}`);
      return result;
    }
  );
}


/**
 * @param {string} specsDir
 * @returns {Promise<boolean>} True if the TypeSpec generated files for the same service exist in the target branch
 */
async function doTypeSpecGeneratedFilesExistInTargetBranch(specsDir) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  return await util.group(
    `doTypeSpecGeneratedFilesExistInTargetBranch("${specsDir}")`,
    async () => {
      // Get all files in the target branch under the service directory
      const filesInTargetBranch = await util.execRoot(`git ls-tree -r HEAD^ --name-only ${specsDir}`);

      // Filter files to only include *.json files
      const jsonFiles = filesInTargetBranch.split('\n').filter(file => file.endsWith('.json'));

      // Check if any of the files are generated from TypeSpec
      if (jsonFiles.length === 0) {
        console.log(`No JSON files found in target branch for service directory: ${specsDir}. Returning false`);
        return false;
      }

      // Check if any of the files are generated from TypeSpec
      for (const filePath of jsonFiles) {
        if (await isSwaggerFileGeneratedFromTypeSpec(filePath, true)) {
          console.log(`File "${filePath}" in target branch is generated from TypeSpec.`);
          return true;
        }
        else
        {
          console.log(`File "${filePath}" in target branch is not generated from TypeSpec.`);
        }
      }

      console.log(`No TypeSpec generated files found in target branch for service directory: ${specsDir}`);
      return false;
    }
  );
}

/**
 * @param {string} file
 * @param {boolean} [fromHead=false] - If true, read the file from the HEAD commit
 * @returns {Promise<boolean>} True if the provided file was generated from TypeSpec
 */
async function isSwaggerFileGeneratedFromTypeSpec(file, fromHead = false) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  return await util.group(
    `isSwaggerFileGeneratedFromTypeSpec("${file}")`,
    async () => {

      let isSwaggerTypeSpecGenerated = false;
      let swagger;
      let filePath;
      if (fromHead) {
        // Create a temporary directory
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'git-'));
        // Read the file from the HEAD commit
        swagger = await util.execRoot(`git show HEAD^:${file}`);
      } else {
        // Read the file from the current branch
        filePath = path.join(process.env.GITHUB_WORKSPACE || "", file);
        swagger = await readFile(filePath, { encoding: "utf8" });
      }
     
      const swaggerObj = JSON.parse(swagger);
      if (swaggerObj["info"] && swaggerObj["info"]["x-typespec-generated"]) {
        console.log(`File "${file}" contains "info.x-typespec-generated"`);
        isSwaggerTypeSpecGenerated = true;
      }

      console.log(`returning from isFileGeneratedFromTypeSpec: ${isSwaggerTypeSpecGenerated}`);
      return isSwaggerTypeSpecGenerated;
    }
  );
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<string[]>} Returns the list of swagger files under resource-manager folder that are changed in the PR 
 */
async function getChangedSwaggerFilesForResouceProvider(core) {
  return await util.group(`getChangedSwaggerFilesForResouceProvider()`, async () => {
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

    return changedRmFiles;
  });
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if PR contains atleast one Open API spec that is generated from TypeSpec
 */
async function areChangesGeneratedFromTypeSpec(changedRmFiles) {
  return await util.group(`areChangesGeneratedFromTypeSpec()`, async () => {
    let firstPRWithTypeSpecGeneratedFilesForService = false;
    for (const file of changedRmFiles) {
      // Check if the file is generated from TypeSpec
      console.log(`Checking if this file was generated from TypeSpec. file name: ${file}`)

      if (await isSwaggerFileGeneratedFromTypeSpec(file)) {
        console.log(`File: ${file} is generated from TypeSpec.`);
        return true;
      }
      else
      {
        console.log(`File: ${file} is not generated from TypeSpec.`);
      }
    }

    console.log(`changes dont include any Open API specs that are generated from TypeSpec.`);
    return false;
  });
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if the spec directory in the PR does not have any TypeSpec generated Open API spec files in the target branch
 */
async function isFirstTypeSpecPRForRPService(changedRmFiles) {
  return await util.group(`isFirstTypeSpecPRForRPService()`, async () => {
    const checkedDirs = new Set();

    for (const file of changedRmFiles) {
      // Get the service folder path from the provided file path
      // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
      console.log(`Processing the file ${file}`);

      const specDir = path.dirname(path.dirname(path.dirname(file)));
      console.log(`specDir: ${specDir}`);

      if (!checkedDirs.has(specDir)) {
        checkedDirs.add(specDir);
        
        if (!(await doTypeSpecGeneratedFilesExistInTargetBranch(specDir))) {
          console.log(`Appears to be the first time the open API spec file: ${file} under the folder ${specDir} is being generated from TypeSpec for this service. The PR will be subject to a manual review.`);
          return true;
        }
        else
        {
          console.log(`The service folder ${specDir} in this change already has atleast one TypeSpec generated Open API spec in the target branch.`);
        }
      }
      else
      {
        console.log(`The service folder ${specDir} has already been checked for TypeSpec generated files in the target branch. Skipping to the next file.`);
      }
    }

    console.log(`Each of the service folders in this change already have atleast one TypeSpec generated Open API spec in the target branch. Returning from isFirstTypeSpecPRForRPService: false`);
    return false;
  });
}
