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
        requestBody?: {
          content?: {
            [contentType: string]: {
              schema: {
                $ref?: string;
              };
            };
          };
        };
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