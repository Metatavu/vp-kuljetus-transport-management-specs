import * as fs from "fs";
import * as path from "path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPISpec, TykTrackEndpoint, TykWhitelistEntry } from "./types";
import { SPEC_FILES, SPEC_TEMPLATE, SPEC_VERSIONS, TYK_IMAGE } from "./consts";
import Docker from "dockerode";

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
 * Adds security schemes to the given OpenAPI spec version file content by given security schemes
 *
 * @param specVersionFileContent spec version file content
 * @param securitySchemes security schemes from spec version configuration
 */
const addSecuritySchemesToSpecVersionFileContent = (specVersionFileContent: any, securitySchemes: string[]) => {
  if (securitySchemes.includes("apiKeyAuth")) {
    specVersionFileContent.security.push({ ApiKeyAuth: [] });
    specVersionFileContent.components.securitySchemes.ApiKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "X-API-Key"
    }
  }

  if (securitySchemes.includes("bearerAuth")) {
    specVersionFileContent.security.push({ BearerAuth: ["driver", "manager"] });
    specVersionFileContent.components.securitySchemes.BearerAuth = {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT"
    };
  }
};

/**
 * Creates the Tyk definition for the given OpenAPI spec file
 *
 * @param options contains the options for creating the Tyk definition
 */
const createTykDefinition = async (options: { tykOasSpecFile: string, tykSpecFile: string, spec: OpenAPISpec }) => {
  const { tykOasSpecFile, tykSpecFile, spec } = options;

  const tykApiGateway = spec["x-tyk-api-gateway"];
  const { info, upstream, server } = tykApiGateway;

  const docker = new Docker({});
  const pullStream = await docker.pull(TYK_IMAGE);
  await new Promise(res => docker.modem.followProgress(pullStream, res));

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

  Object.entries(tykSpec.version_data.versions).forEach(([_, versionData]) => {
    ((versionData as any).extended_paths.white_list as TykWhitelistEntry[])
      .sort((a, b) => {
        return a.path.localeCompare(b.path);
      });

    ((versionData as any).extended_paths.track_endpoints as TykTrackEndpoint[])
      .sort((a, b) => {
        return a.method.localeCompare(b.method);
      })
      .sort((a, b) => {
        return a.path.localeCompare(b.path);
      });
  });

  fs.writeFileSync(tykSpecFile, JSON.stringify(tykSpec, null, 2));
};

/**
 * Adds Tyk OAS validation to the given OpenAPI spec. Validation is added to all POST, PUT and PATCH operations.
 *
 * @param spec original OpenAPI spec
 * @returns OpenAPI spec with Tyk OAS validation
 */
const addTykOasValidation = (spec: OpenAPISpec): OpenAPISpec => {
  const result = JSON.parse(JSON.stringify(spec)) as OpenAPISpec;

  result["x-tyk-api-gateway"].middleware = result["x-tyk-api-gateway"].middleware || {
    operations: {}
  };

  Object.entries(spec.paths).forEach(([path, pathContent]) => {
    Object.entries(pathContent).forEach(([method, methodContent]) => {
      if (method === "post" || method === "put" || method === "patch") {
        result["x-tyk-api-gateway"].middleware.operations[methodContent.operationId] = {
          validateRequest: {
            enabled: true
          }
        };
      }
    });
  });

  return result;
};

/**
 * Strips trailing slash from the given string
 *
 * @param str string to strip trailing slash from
 * @returns string without trailing slash
 */
const stripTrailingSlash = (str: string): string => {
  return str.endsWith("/") ? str.slice(0, -1) : str;
}

/**
 * Main function
 */
const main = async () => {
  const skipTyk = process.argv.includes("--skip-tyk");

  for (const specFile of SPEC_FILES) {
    const absoluteSpecFile = path.resolve(ROOT_DIR, "services", specFile);
    await validateSpec(absoluteSpecFile);
  }

  if (!skipTyk) {
    for (const specFile of SPEC_FILES) {
      const spec = parseOpenApiDocument(specFile);
      const oasSpec = addTykOasValidation(spec);
      const tykSpecFile = path.resolve(ROOT_DIR, "tyk", `${specFile.split(".")[0]}.json`);
      const tykOasSpecFile = path.resolve(ROOT_DIR, "tyk", `${specFile.split(".")[0]}-oas.json`);

      fs.writeFileSync(tykOasSpecFile, JSON.stringify(oasSpec, null, 2));

      await createTykDefinition({
        tykOasSpecFile: tykOasSpecFile,
        tykSpecFile: tykSpecFile,
        spec: spec
      });
    }
  }

  for (const specVersion of SPEC_VERSIONS) {
    const specVersionName = specVersion.name;
    const specVersionTags = specVersion.tags.map(tag => `Spec${tag}`);
    const includedSchemas: string[] = [];

    const specVersionFile = path.resolve(ROOT_DIR, "specs", `${specVersion.name}.yaml`);
    const specVersionFileContent = JSON.parse(JSON.stringify(SPEC_TEMPLATE));

    addSecuritySchemesToSpecVersionFileContent(specVersionFileContent, specVersion.securitySchemes);

    for (const specFile of SPEC_FILES) {
      const spec = parseOpenApiDocument(specFile);
      const tykApiGateway = spec["x-tyk-api-gateway"];
      const prefix = stripTrailingSlash(tykApiGateway.server.listenPath.value || "");

      specVersionFileContent.info.title = `${SPEC_TEMPLATE.info.title} (${specVersionName})`;
      specVersionFileContent.info.description = `${SPEC_TEMPLATE.info.description} (${specVersionName})`;

      for (const [path, pathContent] of Object.entries(spec.paths)) {
        const prefixedPath = `${prefix}${path}`;

        for (const [method, methodContent] of Object.entries(pathContent)) {
          if (methodContent.tags && methodContent.tags.some(tag => specVersionTags.includes(tag))) {
            specVersionFileContent.paths[prefixedPath] = specVersionFileContent.paths[prefixedPath] || {};
            specVersionFileContent.paths[prefixedPath][method] = JSON.parse(JSON.stringify({
              ...methodContent,
              tags: methodContent.tags.filter(tag => !tag.toLowerCase().startsWith("spec"))
            }));

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

            methodContent.requestBody?.content && Object.entries(methodContent.requestBody.content).forEach(([_contentType, contentTypeContent]) => {
              if (contentTypeContent.schema && contentTypeContent.schema.$ref) {
                const schemaName = contentTypeContent.schema.$ref.split("/").pop();
                if (!includedSchemas.includes(schemaName)) {
                  includedSchemas.push(schemaName);
                  specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(spec.components.schemas[schemaName]));
                }
              }
            });
          }
        }
      }

      for (const [schemaName, schemaContent] of Object.entries(spec.components.schemas)) {
        if (includedSchemas.includes(schemaName)) {
          specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(schemaContent));

          if (schemaContent.properties) {
            for (const propertyContent of Object.values(schemaContent.properties)) {
              if (propertyContent.$ref) {
                const refSchemaName = propertyContent.$ref.split("/").pop();
                specVersionFileContent.components.schemas[refSchemaName] = JSON.parse(JSON.stringify(spec.components.schemas[refSchemaName]));
              }
            }
          }
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