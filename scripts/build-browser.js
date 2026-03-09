#!/usr/bin/env node
// Build browser-compatible versions of tagged-urn and capdag from npm packages

const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;

// Build tagged-urn for browser
function buildTaggedUrn() {
  const srcPath = require.resolve('tagged-urn');
  const src = fs.readFileSync(srcPath, 'utf8');

  // Remove the CommonJS export and wrap in IIFE with window globals
  const browserSrc = `// Tagged URN - Browser Build
// Generated from npm package tagged-urn
// Do not edit directly - run 'npm run build:browser' to regenerate

(function() {
'use strict';

${src.replace(/^module\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, '')}

// Browser globals
window.TaggedUrn = TaggedUrn;
window.TaggedUrnBuilder = TaggedUrnBuilder;
window.UrnMatcher = UrnMatcher;
window.TaggedUrnError = TaggedUrnError;
window.TaggedUrnErrorCodes = ErrorCodes;

})();
`;

  const destPath = path.join(scriptsDir, 'tagged-urn.js');
  fs.writeFileSync(destPath, browserSrc);
  console.log('Built scripts/tagged-urn.js');
}

// Build capdag for browser
function buildCapDag() {
  const srcPath = require.resolve('capdag');
  const src = fs.readFileSync(srcPath, 'utf8');

  // Remove the require statement and CommonJS export, wrap in IIFE with window globals
  // capdag expects TaggedUrn to be available from window (loaded first via script tag)
  const browserSrc = `// CapDag - Browser Build
// Generated from npm package capdag
// Do not edit directly - run 'npm run build:browser' to regenerate
// Requires tagged-urn.js to be loaded first

(function() {
'use strict';

// Get TaggedUrn from window (must be loaded before this script)
const { TaggedUrn } = window;
if (!TaggedUrn) {
  throw new Error('TaggedUrn not found. Load tagged-urn.js before capdag.js');
}

${src
  .replace(/^\/\/.*Import TaggedUrn.*\n/m, '')
  .replace(/^const\s*\{\s*TaggedUrn\s*\}\s*=\s*require\s*\(\s*['"]tagged-urn['"]\s*\)\s*;?\s*$/m, '')
  .replace(/^module\.exports\s*=\s*\{[\s\S]*?\};?\s*$/m, '')}

// Browser globals
window.CapUrn = CapUrn;
window.CapUrnBuilder = CapUrnBuilder;
window.CapMatcher = CapMatcher;
window.CapUrnError = CapUrnError;
window.CapUrnErrorCodes = ErrorCodes;
window.MediaUrn = MediaUrn;
window.MediaUrnError = MediaUrnError;
window.MediaUrnErrorCodes = MediaUrnErrorCodes;
window.Cap = Cap;
window.CapArg = CapArg;
window.ArgSource = ArgSource;
window.RegisteredBy = RegisteredBy;
window.createCap = createCap;
window.createCapWithDescription = createCapWithDescription;
window.createCapWithMetadata = createCapWithMetadata;
window.createCapWithDescriptionAndMetadata = createCapWithDescriptionAndMetadata;
window.ValidationError = ValidationError;
window.InputValidator = InputValidator;
window.OutputValidator = OutputValidator;
window.CapValidator = CapValidator;
window.validateCapArgs = validateCapArgs;
window.RESERVED_CLI_FLAGS = RESERVED_CLI_FLAGS;
window.MediaSpec = MediaSpec;
window.MediaSpecError = MediaSpecError;
window.MediaSpecErrorCodes = MediaSpecErrorCodes;
window.isBinaryCapUrn = isBinaryCapUrn;
window.isJSONCapUrn = isJSONCapUrn;
window.isStructuredCapUrn = isStructuredCapUrn;
window.resolveMediaUrn = resolveMediaUrn;
window.buildExtensionIndex = buildExtensionIndex;
window.mediaUrnsForExtension = mediaUrnsForExtension;
window.getExtensionMappings = getExtensionMappings;
window.validateNoMediaSpecRedefinition = validateNoMediaSpecRedefinition;
window.validateNoMediaSpecRedefinitionSync = validateNoMediaSpecRedefinitionSync;
window.validateNoMediaSpecDuplicates = validateNoMediaSpecDuplicates;
window.getSchemaBaseURL = getSchemaBaseURL;
window.getProfileURL = getProfileURL;
window.MEDIA_STRING = MEDIA_STRING;
window.MEDIA_INTEGER = MEDIA_INTEGER;
window.MEDIA_NUMBER = MEDIA_NUMBER;
window.MEDIA_BOOLEAN = MEDIA_BOOLEAN;
window.MEDIA_OBJECT = MEDIA_OBJECT;
window.MEDIA_STRING_ARRAY = MEDIA_STRING_ARRAY;
window.MEDIA_INTEGER_ARRAY = MEDIA_INTEGER_ARRAY;
window.MEDIA_NUMBER_ARRAY = MEDIA_NUMBER_ARRAY;
window.MEDIA_BOOLEAN_ARRAY = MEDIA_BOOLEAN_ARRAY;
window.MEDIA_OBJECT_ARRAY = MEDIA_OBJECT_ARRAY;
window.MEDIA_IDENTITY = MEDIA_IDENTITY;
window.MEDIA_VOID = MEDIA_VOID;
window.MEDIA_PNG = MEDIA_PNG;
window.MEDIA_AUDIO = MEDIA_AUDIO;
window.MEDIA_VIDEO = MEDIA_VIDEO;
window.MEDIA_AUDIO_SPEECH = MEDIA_AUDIO_SPEECH;
window.MEDIA_IMAGE_THUMBNAIL = MEDIA_IMAGE_THUMBNAIL;
window.MEDIA_PDF = MEDIA_PDF;
window.MEDIA_EPUB = MEDIA_EPUB;
window.MEDIA_MD = MEDIA_MD;
window.MEDIA_TXT = MEDIA_TXT;
window.MEDIA_RST = MEDIA_RST;
window.MEDIA_LOG = MEDIA_LOG;
window.MEDIA_HTML = MEDIA_HTML;
window.MEDIA_XML = MEDIA_XML;
window.MEDIA_JSON = MEDIA_JSON;
window.MEDIA_JSON_SCHEMA = MEDIA_JSON_SCHEMA;
window.MEDIA_YAML = MEDIA_YAML;
window.MEDIA_MODEL_SPEC = MEDIA_MODEL_SPEC;
window.MEDIA_MODEL_REPO = MEDIA_MODEL_REPO;
window.MEDIA_MODEL_DIM = MEDIA_MODEL_DIM;
window.MEDIA_DECISION = MEDIA_DECISION;
window.MEDIA_DECISION_ARRAY = MEDIA_DECISION_ARRAY;
window.MEDIA_DOWNLOAD_OUTPUT = MEDIA_DOWNLOAD_OUTPUT;
window.MEDIA_LIST_OUTPUT = MEDIA_LIST_OUTPUT;
window.MEDIA_STATUS_OUTPUT = MEDIA_STATUS_OUTPUT;
window.MEDIA_CONTENTS_OUTPUT = MEDIA_CONTENTS_OUTPUT;
window.MEDIA_AVAILABILITY_OUTPUT = MEDIA_AVAILABILITY_OUTPUT;
window.MEDIA_PATH_OUTPUT = MEDIA_PATH_OUTPUT;
window.MEDIA_EMBEDDING_VECTOR = MEDIA_EMBEDDING_VECTOR;
window.MEDIA_LLM_INFERENCE_OUTPUT = MEDIA_LLM_INFERENCE_OUTPUT;
window.CapArgumentValue = CapArgumentValue;
window.llmConversationUrn = llmConversationUrn;
window.modelAvailabilityUrn = modelAvailabilityUrn;
window.modelPathUrn = modelPathUrn;
window.CapMatrixError = CapMatrixError;
window.CapMatrix = CapMatrix;
window.BestCapSetMatch = BestCapSetMatch;
window.CompositeCapSet = CompositeCapSet;
window.CapBlock = CapBlock;
window.CapGraphEdge = CapGraphEdge;
window.CapGraphStats = CapGraphStats;
window.CapGraph = CapGraph;
window.StdinSource = StdinSource;
window.StdinSourceKind = StdinSourceKind;

})();
`;

  const destPath = path.join(scriptsDir, 'capdag.js');
  fs.writeFileSync(destPath, browserSrc);
  console.log('Built scripts/capdag.js');
}

// Run builds
buildTaggedUrn();
buildCapDag();
console.log('Browser builds complete');
