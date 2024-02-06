/**
 * Used OpenAPI version
 */
export const OPENAPI_VERSION = "3.0.3";

/**
 * Tyk image version
 */
export const TYK_IMAGE = "docker.tyk.io/tyk-gateway/tyk-gateway:v5.1.0";

/**
 * User roles for bearer auth
 */
export const USER_ROLES = ["driver", "manager"];

/**
 * Template for the spec
 */
export const SPEC_TEMPLATE = {
  openapi: OPENAPI_VERSION,
  info: {
    title: "Vehicle Management Services",
    description: "Vehicle Management Services",
    version: "1.0.0"
  },
  security: <any>[],
  paths: {},
  components: {
    securitySchemes: {},
    schemas: {}
  }
};

/**
 * List of all spec files
 */
export const SPEC_VERSIONS = [
  {
    name: "full",
    description: "Full",
    tags: ["App", "ManagementUI", "VehicleDataReceiver"],
    securitySchemes: ["bearerAuth", "apiKeyAuth"]
  },
  {
    name: "app",
    description: "App",
    tags: ["App"],
    securitySchemes: ["bearerAuth"]
  },
  {
    name: "management",
    description: "Management",
    tags: ["ManagementUI"],
    securitySchemes: ["bearerAuth"]
  },
  {
    name: "vehicle-data-receiver",
    description: "Vehicle data receiver",
    tags: ["VehicleDataReceiver"],
    securitySchemes: ["apiKeyAuth"]
  }
];

// List of spec files to include
export const SPEC_FILES = [
  "vehicle-management-services.yaml",
  "work-planning-services.yaml",
  "user-management-services.yaml",
  "delivery-info-services.yaml"
];
