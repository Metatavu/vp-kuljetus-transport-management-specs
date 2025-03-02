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
  return yamlParse(fs.readFileSync(path.resolve(ROOT_DIR, "input", specFile), "utf8"));
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
 * Writes the service spec file
 *
 * @param specFile OpenAPI spec file
 */
const writeServiceSpec = async (specFile: string) => {
  const spec = { ... parseOpenApiDocument(specFile) };
  const serviceSpecFile = path.resolve(ROOT_DIR, "services", `${specFile}`);
  delete spec["x-tyk-api-gateway"];

  for (const [_path, pathContent] of Object.entries(spec.paths)) {
    for (const [_method, methodContent] of Object.entries(pathContent)) {
      methodContent.tags = methodContent.tags.filter(tag => !tag.toLowerCase().startsWith("spec"));
    }
  }

  console.log(`Writing ${serviceSpecFile}`);

  fs.writeFileSync(serviceSpecFile, yamlStringify(spec));
};

/**
 * Adds security schemes to the given OpenAPI spec version file content by given security schemes
 *
 * @param specVersionFileContent spec version file content
 * @param securitySchemes security schemes from spec version configuration
 */
const addSecuritySchemesToSpecVersionFileContent = (specVersionFileContent: any, securitySchemes: string[]) => {
  if (securitySchemes.includes("ApiKeyAuth")) {
    specVersionFileContent.security.push({ ApiKeyAuth: [] });
    specVersionFileContent.components.securitySchemes.ApiKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "X-API-Key"
    }
  }

  if (securitySchemes.includes("DriverAppApiKeyAuth")) {
    specVersionFileContent.security.push({ DriverAppApiKeyAuth: [] });
    specVersionFileContent.components.securitySchemes.DriverAppApiKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "X-DriverApp-API-Key"
    }
  }

  if (securitySchemes.includes("DataReceiverApiKeyAuth")) {
    specVersionFileContent.security.push({ DataReceiverApiKeyAuth: [] });
    specVersionFileContent.components.securitySchemes.DataReceiverApiKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "X-DataReceiver-API-Key"
    }
  }

  if (securitySchemes.includes("KeycloakApiKeyAuth")) {
    specVersionFileContent.security.push({ KeycloakApiKeyAuth: [] });
    specVersionFileContent.components.securitySchemes.KeycloakApiKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "X-Keycloak-API-Key"
    }
  }

  if (securitySchemes.includes("CronKeyAuth")) {
    specVersionFileContent.security.push({ CronKeyAuth: [] });
    specVersionFileContent.components.securitySchemes.CronKeyAuth = {
      type: "apiKey",
      in: "header",
      name: "X-CRON-Key"
    }
  }

  if (securitySchemes.includes("BearerAuth")) {
    specVersionFileContent.security.push({ BearerAuth: ["driver", "manager", "integrations"] });
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

  tykSpec.CORS = {
    ...tykSpec.CORS,
    options_passthrough: true
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

  // FIXME:
  // Object.entries(spec.paths).forEach(([path, pathContent]) => {
  //   Object.entries(pathContent).forEach(([method, methodContent]) => {
  //     if (method === "post" || method === "put" || method === "patch") {
  //       result["x-tyk-api-gateway"].middleware.operations[methodContent.operationId] = {
  //         validateRequest: {
  //           enabled: true
  //         }
  //       };
  //     }
  //   });
  // });

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
    const absoluteSpecFile = path.resolve(ROOT_DIR, "input", specFile);
    await validateSpec(absoluteSpecFile);
    await writeServiceSpec(specFile);
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
    const internal = specVersion.internal ?? false;

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
        const prefixedPath = internal ? path : `${prefix}${path}`;

        for (const [method, methodContent] of Object.entries(pathContent)) {
          if (methodContent.tags && methodContent.tags.some(tag => specVersionTags.includes(tag))) {
            for (const parameterContent of methodContent.parameters ?? []) {
              if ("$ref" in parameterContent.schema) {
                const schemaName = parameterContent.schema.$ref.split("/").pop();

                if (!includedSchemas.includes(schemaName)) {
                  includedSchemas.push(schemaName);
                  specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(spec.components.schemas[schemaName]));
                }
              }

              if ("items" in parameterContent.schema && parameterContent.schema.items.$ref) {
                const schemaName = parameterContent.schema.items.$ref.split("/").pop();

                if (!includedSchemas.includes(schemaName)) {
                  includedSchemas.push(schemaName);
                  specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(spec.components.schemas[schemaName]));
                }
              }
            }

            specVersionFileContent.paths[prefixedPath] = specVersionFileContent.paths[prefixedPath] || {};
            specVersionFileContent.paths[prefixedPath][method] = JSON.parse(JSON.stringify({
              ...methodContent,
              tags: methodContent.tags.filter(tag => !tag.toLowerCase().startsWith("spec")),
              security: methodContent.security.filter(security => specVersion.securitySchemes.includes(Object.keys(security)[0]))
            }));

            Object.entries(methodContent.responses).forEach(([_responseCode, responseContent]) => {
              responseContent.content && Object.entries(responseContent.content).forEach(([_contentType, contentTypeContent]) => {
                const { schema } = contentTypeContent;

                if (schema && "$ref" in schema) {
                  const schemaName = schema.$ref.split("/").pop();
                  if (!includedSchemas.includes(schemaName)) {
                    includedSchemas.push(schemaName);
                    specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(spec.components.schemas[schemaName]));
                  }
                } else if ("items" in schema && schema.items?.$ref) {
                  const schemaName = schema.items.$ref.split("/").pop();
                  if (!includedSchemas.includes(schemaName)) {
                    includedSchemas.push(schemaName);
                    specVersionFileContent.components.schemas[schemaName] = JSON.parse(JSON.stringify(spec.components.schemas[schemaName]));
                  }
                }
              });
            });

            methodContent.requestBody?.content && Object.entries(methodContent.requestBody.content).forEach(([_contentType, contentTypeContent]) => {
              if (contentTypeContent.schema && "$ref" in contentTypeContent.schema) {
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

      const relatedSchemas = [...Object.entries(spec.components.schemas)];

      while (relatedSchemas.length > 0) {
        const [schemaName, schemaContent] = relatedSchemas.pop();
        const { properties } = schemaContent;

        if (includedSchemas.includes(schemaName) && properties) {
          for (const property of Object.values(properties)) {
            if (property.$ref) {
              const schemaName = property.$ref.split("/").pop();
              includedSchemas.push(schemaName);

              Object.entries(spec.components.schemas)
                .filter(schemaEntry => schemaEntry[0] === schemaName)
                .forEach(schemaEntry => relatedSchemas.push(schemaEntry));
            }
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