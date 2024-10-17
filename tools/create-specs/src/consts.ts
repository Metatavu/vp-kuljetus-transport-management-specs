/**
 * Used OpenAPI version
 */
export const OPENAPI_VERSION = "3.0.3";

/**
 * Tyk image version
 */
export const TYK_IMAGE = "docker.io/tykio/tyk-gateway:v5.1";

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
    tags: ["App", "ManagementUI", "VehicleDataReceiver", "Auth"],
    securitySchemes: ["BearerAuth", "ApiKeyAuth"]
  },
  {
    name: "app",
    description: "App",
    tags: ["App"],
    securitySchemes: ["BearerAuth"]
  },
  {
    name: "management",
    description: "Management",
    tags: ["ManagementUI"],
    securitySchemes: ["BearerAuth"]
  },
  {
    name: "vehicle-data-receiver",
    description: "Vehicle data receiver",
    tags: ["VehicleDataReceiver"],
    securitySchemes: ["ApiKeyAuth"]
  },
  {
    name: "auth",
    description: "Auth",
    tags: ["Auth"],
    securitySchemes: ["ApiKeyAuth"]
  }
];

// List of spec files to include
export const SPEC_FILES = [
  "vehicle-management-services.yaml",
  "work-planning-services.yaml",
  "user-management-services.yaml",
  "delivery-info-services.yaml"
];
