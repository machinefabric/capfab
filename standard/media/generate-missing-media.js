// Generate missing media TOML files from a list of media URNs

const fs = require('fs');
const path = require('path');

// List of all media URNs from caps that need TOML files
const mediaUrns = [
  'media:file-path;textable',
  'media:batch-size;textable;numeric',
  'media:cache-dir;textable',
  'media:callback-enabled-flag;textable',
  'media:chunk-overlap;textable;numeric',
  'media:chunk-size;textable;numeric',
  'media:code-contextable',
  'media:coding-style;textable',
  'media:confidence-threshold;textable;numeric',
  'media:textable',
  'media:conversation-contextable',
  'media:creative-contextable',
  'media:creativity-level;textable;numeric',
  'media:decision-type;textable',
  'media:detailed-flag;textable',
  'media:device;textable',
  'media:exclude-pattern;textable',
  'media:file-path;textable',
  'media:filter-pattern;textable',
  'media:force-flag;textable',
  'media:frontmatter;textable',
  'media:genre;textable',
  'media:model-spec;textable',
  'media:file-path;textable',
  'media:include-comments-flag;textable',
  'media:include-order-indexes;textable',
  'media:include-pattern;textable',
  'media:include-tests-flag;textable',
  'media:index-range;textable',
  'media:textable',
  'media:inspection-depth;textable',
  'media:language-code;textable',
  'media:language;textable',
  'media:management-operation;textable',
  'media:max-content-length;textable;numeric',
  'media:max-context-length;textable;numeric',
  'media:max-depth;textable;numeric',
  'media:max-tokens;textable;numeric',
  'media:min-p;textable;numeric',
  'media:mlx-model-path;textable',
  'media:model-spec;textable',
  'media:model-spec;textable',
  'media:model-status;textable;record',
  'media:output-format;textable',
  'media:output-length;textable',
  'media:output-path;textable',
  'media:precision;textable',
  'media:preserve-all-data;textable',
  'media:preserve-structure-flag;textable',
  'media:programming-language;textable',
  'media:textable',
  'media:query-name;textable',
  'media:textable',
  'media:question;textable',
  'media:question;textable;list',
  'media:reasoning-contextable',
  'media:remove-boilerplate;textable',
  'media:repetition-penalty;textable;numeric',
  'media:repository;textable',
  'media:require-explanation-flag;textable',
  'media:schema-variables;textable;record',
  'media:seed;textable;numeric',
  'media:source-media-urn;textable',
  'media:stream-flag;textable',
  'media:substitutions;textable;record',
  'media:summary-contextable',
  'media:summary-focus;textable',
  'media:summary-type;textable',
  'media:system-prompt;textable',
  'media:temperature;textable;numeric',
  'media:thumbnail-height;textable;numeric',
  'media:thumbnail-width;textable;numeric',
  'media:timestamps-flag;textable',
  'media:tone;textable',
  'media:top-k;textable;numeric',
  'media:top-p;textable;numeric',
  'media:epub',
  'media:html;textable',
  'media:',
  'media:xml;textable'
];

// Helper to generate a nice title from a type name
function generateTitle(typeName) {
  return typeName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Helper to generate a description
function generateDescription(typeName, attributes) {
  const title = generateTitle(typeName);
  if (attributes.includes('numeric')) {
    return `${title} numeric value`;
  } else if (attributes.includes('flag')) {
    return `${title} boolean flag`;
  } else if (typeName.endsWith('-path')) {
    return `${title} file system path`;
  } else if (typeName.endsWith('-text')) {
    return `${title} text input`;
  } else if (typeName.endsWith('-context')) {
    return `${title} contextual information`;
  } else if (attributes.includes('sequence')) {
    return `${title} array/sequence`;
  } else if (attributes.includes('map')) {
    return `${title} object with key-value pairs`;
  } else {
    return `${title} value`;
  }
}

// Helper to get media type
function getMediaType(attributes) {
  if (attributes.includes('binary')) return 'application/octet-stream';
  if (attributes.includes('map')) return 'application/json';
  if (attributes.includes('sequence')) return 'application/json';
  return 'text/plain';
}

// Generate TOML file for each URN
for (const urn of mediaUrns) {
  const match = urn.match(/type=([^;]+);(.+)/);
  if (!match) continue;

  const typeName = match[1];
  const attributes = match[2];

  const fileName = `${typeName}.toml`;
  const filePath = path.join(__dirname, fileName);

  // Skip if already exists
  if (fs.existsSync(filePath)) {
    console.log(`SKIP: ${fileName} (already exists)`);
    continue;
  }

  const title = generateTitle(typeName);
  const description = generateDescription(typeName, attributes);
  const mediaType = getMediaType(attributes);
  const profileUri = `https://capdag.com/schema/${typeName.replace(/-/g, '_')}`;

  const content = `# ${title} media spec
urn = "${urn}"
media_type = "${mediaType}"
title = "${title}"
profile_uri = "${profileUri}"
description = "${description}"
`;

  fs.writeFileSync(filePath, content);
  console.log(`CREATE: ${fileName}`);
}

console.log('\nDone! All missing media TOML files have been created.');
