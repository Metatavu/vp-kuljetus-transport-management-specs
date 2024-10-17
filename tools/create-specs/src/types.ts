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
  security: {
    [schemeName: string]: string[]
  }[],
  "x-tyk-api-gateway": {
    info: {
      id: string;
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
    },
    middleware?: {
      operations: {
        [operationId: string]: {
          validateRequest?: {
            enabled?: boolean;
          }
        }
      }
    }
  },
  paths: {
    [path: string]: {
      [method: string]: {
        operationId: string;
        tags?: string[];
        security?: {
          [scheme: string]: string[]
        }[];
        parameters?: {
            name: string;
            in: "query" | "path";
            schema:
              | { $ref?: string; }
              | { items?: { $ref?: string; }; };
        }[];
        requestBody?: {
          content?: {
            [contentType: string]: {
              schema:
                | { $ref?: string; }
                | { items?: { $ref?: string; }; };
            };
          };
        };
        responses: {
          [responseCode: string]: {
            description: string;
            content?: {
              [contentType: string]: {
                schema:
                  | { $ref?: string; }
                  | { items?: { $ref?: string; }; };
              };
            };
          };
        };
      };
    };
  };
  components: {
    securitySchemes?: {
      [schemeName: string]: Record<string, string>;
    },
    schemas: {
      [schemaName: string]: {
        properties?: {
          [propertyName: string]: {
            $ref?: string;
          }
        };
      };
    };
  };

}

/**
 * Tyk version track endpoint interface
 */
export interface TykTrackEndpoint {
  path: string;
  method: string;
};

/**
 * Tyk version white list entry interface
 */
export interface TykWhitelistEntry {
  path: string;
}