import * as fs from 'fs';
import * as path from 'path';
import { parse as yamlParse, stringify as yamlStringify } from 'yaml';
import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPISpec } from './types';
import { SPEC_FILES, SPEC_TEMPLATE, SPEC_VERSIONS, TYK_IMAGE } from './consts';
import Docker from 'dockerode';

// Root directory of the project
const ROOT_DIR = path.resolve(process.cwd(), "../../");

/**
 * Parses input OpenAPI spec file
 * 
 * @param specFile parses the OpenAPI spec file
 * @returns parsed OpenAPI spec
 */
const parseOpenApiDocument = (specFile: string): OpenAPISpec => {
  return yamlParse(fs.readFileSync(path.resolve(ROOT_DIR, "services", specFile), "utf8"));
};

/**
 * Validates the OpenAPI spec file. If the spec file is invalid, an exception is thrown.
 * 
 * @param specFile absolute path to the OpenAPI spec file
 */
const validateSpec = async (specFile: string) => {
  await SwaggerParser.validate(specFile);
}

/**
 * Creates the Tyk definition for the given OpenAPI spec file
 * 
 * @param options contains the options for creating the Tyk definition
 */
const createTykDefinition = async (options: { tykOasSpecFile: string, tykSpecFile: string, spec: OpenAPISpec }) => {
  const { tykOasSpecFile, tykSpecFile, spec } = options;

  const tykApiGateway = spec['x-tyk-api-gateway'];
  const { info, upstream, server } = tykApiGateway;

  const docker = new Docker({});
  const stdout = fs.createWriteStream(tykSpecFile);

  const [ _, container ] = await docker.run(
    TYK_IMAGE, 
    ["import", "--create-api", `--org-id=${info.orgId}`, `--upstream-target=${upstream.url}`, "--swagger", "/tmp/swagger.json"], 
    stdout,
    {
      HostConfig: {
        Binds: [
          `${tykOasSpecFile}:/tmp/swagger.json`
        ]
      }
    }
  );

  container.remove();

  const tykSpec = JSON.parse(fs.readFileSync(tykSpecFile, "utf8"));

  if (server.listenPath.value) {
    tykSpec.proxy.listen_path = server.listenPath.value;
  }

  if (info.id) {
    tykSpec.api_id = info.id;
  }

  tykSpec.version_data.not_versioned = true;
  tykSpec.is_oas = true;

  fs.writeFileSync(tykSpecFile, JSON.stringify(tykSpec, null, 2));
};

/**
 * Main function
 */
const main = async () => {
  for (const specFile of SPEC_FILES) {
    const absoluteSpecFile = path.resolve(ROOT_DIR, "services", specFile);
    await validateSpec(absoluteSpecFile);
  }

  for (const specFile of SPEC_FILES) {
    const spec = parseOpenApiDocument(specFile);
    const tykSpecFile = path.resolve(ROOT_DIR, "tyk", `${specFile.split(".")[0]}.json`);
    const tykOasSpecFile = path.resolve(ROOT_DIR, "tyk", `${specFile.split(".")[0]}-oas.json`);
    fs.writeFileSync(tykOasSpecFile, JSON.stringify(spec, null, 2));

    await createTykDefinition({
      tykOasSpecFile: tykOasSpecFile, 
      tykSpecFile: tykSpecFile,
      spec: spec
    });
  }  
  
  for (const specVersion of SPEC_VERSIONS) {
    const specVersionName = specVersion.name;
    const specVersionTags = specVersion.tags.map(tag => `Spec${tag}`);
    const includedSchemas: string[] = [];
  
    const specVersionFile = path.resolve(ROOT_DIR, "specs", `${specVersion.name}.yaml`);
    const specVersionFileContent = JSON.parse(JSON.stringify(SPEC_TEMPLATE));
  
    for (const specFile of SPEC_FILES) {
      const spec = parseOpenApiDocument(specFile);
      
      specVersionFileContent.info.title = `${SPEC_TEMPLATE.info.title} (${specVersionName})`;
      specVersionFileContent.info.description = `${SPEC_TEMPLATE.info.description} (${specVersionName})`;
  
      for (const [path, pathContent] of Object.entries(spec.paths)) {
        for (const [method, methodContent] of Object.entries(pathContent)) {
          if (methodContent.tags && methodContent.tags.some(tag => specVersionTags.includes(tag))) {
            specVersionFileContent.paths[path] = specVersionFileContent.paths[path] || {};
            specVersionFileContent.paths[path][method] = JSON.parse(JSON.stringify(methodContent));
            Object.entries(methodContent.responses).forEach(([_responseCode, responseContent]) => {
              responseContent.content && Object.entries(responseContent.content).forEach(([_contentType, contentTypeContent]) => {
                if (contentTypeContent.schema && contentTypeContent.schema.$ref) {
                  const schemaName = contentTypeContent.schema.$ref.split("/").pop();
                  if (!includedSchemas.includes(schemaName)) {
                    includedSchemas.push(schemaName);
                    specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(spec.components.schemas[schemaName]));
                  }
                }
              });
            });
          }
        }
      }
  
      for (const [schemaName, schemaContent] of Object.entries(spec.components.schemas)) {
        if (includedSchemas.includes(schemaName)) {
          specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(schemaContent));
        }
      }
    }
  
    console.log(`Writing ${specVersionFile}`);
  
    fs.writeFileSync(specVersionFile, yamlStringify(specVersionFileContent));

    await validateSpec(specVersionFile);
  }
};

main()
  .then(() => {
    console.log("Done");
  })
  .catch(e => {
    console.error(e);
    process.exit(-1);
  });