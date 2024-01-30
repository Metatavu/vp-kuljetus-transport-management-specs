/**
 * Used OpenAPI version
 */
export const OPENAPI_VERSION = "3.0.3";

/**
 * Tyk image version
 */
export const TYK_IMAGE = "docker.tyk.io/tyk-gateway/tyk-gateway:v5.1.0";

/**
 * Template for the spec
 */
export const SPEC_TEMPLATE = {
  "openapi": OPENAPI_VERSION,
  "info": {
    "title": "Vehicle Management Services",
    "description": "Vehicle Management Services",
    "version": "1.0.0"
  },
  "paths": {},
  "components": {
    "schemas": {}
  }
};

/**
 * List of all spec files
 */
export const SPEC_VERSIONS = [
  {
    "name": "full",
    "description": "Full",
    "tags": ["App", "ManagementUI", "VehicleDataReceiver"]
  },
  {
    "name": "app",
    "description": "App",
    "tags": ["App"]
  },
  {
    "name": "management",
    "description": "Management",
    "tags": ["ManagementUI"]
  },
  {
    "name": "vehicle-data-receiver",
    "description": "Vehicle data receiver",
    "tags": ["VehicleDataReceiver"]
  }
];

// List of spec files to include
export const SPEC_FILES = ["vehicle-management-services.yaml", "work-planning-services.yaml"];
