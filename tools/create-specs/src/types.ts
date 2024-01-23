/**
 * Type for the OpenAPI spec
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  "x-tyk-api-gateway"?: {
    info: {
      name: string;
      orgId: string;
      state: {
        active: boolean;
      }
    },
    upstream: {
      url: string;
    },
    server: {
      listenPath: {
        value: string;
        strip: boolean;
      }
    }
  },
  paths: {
    [path: string]: {
      [method: string]: {
        tags?: string[];
        responses: {
          [responseCode: string]: {
            description: string;
            content?: {
              [contentType: string]: {
                schema: {
                  $ref?: string;
                };
              };
            };
          };
        };
      };
    };
  };
  components: {
    schemas: {
      [schemaName: string]: {
      };
    };
  };

}